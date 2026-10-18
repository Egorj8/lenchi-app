-- =====================================================================
-- Lenchi Studio — облако для онлайн-записи (Supabase / Postgres)
--
-- Запускать целиком в Supabase → SQL Editor. Скрипт можно запускать
-- повторно: таблицы не пересоздаются, функции обновляются.
--
-- Устройство:
--   * Таблицы закрыты (RLS без политик) — напрямую их не читает никто,
--     кроме владельца проекта. Всё идёт через функции ниже.
--   * Страница записи (ключ publishable / anon) может только:
--       public_busy    — занятые промежутки (без имён и телефонов),
--       public_config  — услуги и график мастера,
--       create_request — оставить заявку.
--   * Приложение мастера вызывает master_* с «ключом мастера».
--     В облаке хранится только sha256 этого ключа (таблица master_key).
--   * Время — по Турции: дата + минуты от полуночи.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Таблицы ----------

-- занятое время из календаря приложения (записи, личные дела «занята»)
create table if not exists public.busy (
  day       date not null,
  start_min int  not null,
  end_min   int  not null
);
create index if not exists busy_day_idx on public.busy (day);

-- заявки клиенток со страницы записи
create table if not exists public.requests (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day        date not null,
  start_min  int  not null,
  duration   int  not null,
  services   jsonb not null default '[]'::jsonb,  -- [{id, name, price, min}]
  price      int  not null default 0,
  name       text not null,
  phone      text not null,
  channel    text not null default 'wa',           -- wa | tg
  comment    text not null default '',
  first_time boolean not null default false,
  status     text not null default 'new'
             check (status in ('new', 'accepted', 'declined', 'cancelled')),
  handled_at timestamptz
);
create index if not exists requests_day_idx on public.requests (day);
create index if not exists requests_created_idx on public.requests (created_at);

-- услуги и график для страницы записи (одна строка)
create table if not exists public.config (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- отпечаток ключа мастера (одна строка)
create table if not exists public.master_key (
  id       int primary key default 1 check (id = 1),
  key_hash text not null
);

alter table public.busy       enable row level security;
alter table public.requests   enable row level security;
alter table public.config     enable row level security;
alter table public.master_key enable row level security;
revoke all on public.busy, public.requests, public.config, public.master_key from anon, authenticated;

-- ---------- Служебное ----------

create or replace function public.is_master(p_key text)
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.master_key
    where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  );
$$;

-- ---------- Для страницы записи ----------

create or replace function public.public_busy(p_from date, p_to date)
returns table (day date, start_min int, end_min int)
language sql stable security definer
set search_path = public
as $$
  select b.day, b.start_min, b.end_min
    from public.busy b
   where b.day between p_from and least(p_to, p_from + 90)
  union all
  select r.day, r.start_min, r.start_min + r.duration
    from public.requests r
   where r.status in ('new', 'accepted')
     and r.day between p_from and least(p_to, p_from + 90);
$$;

create or replace function public.public_config()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select data from public.config where id = 1;
$$;

create or replace function public.create_request(
  p_day date, p_start int, p_duration int, p_services jsonb, p_price int,
  p_name text, p_phone text, p_channel text, p_comment text, p_first boolean
)
returns bigint
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_now   timestamp := now() at time zone 'Europe/Istanbul';
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id    bigint;
begin
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 60 then raise exception 'bad_name'; end if;
  if length(v_digits) not between 9 and 15 or length(p_phone) > 30 then raise exception 'bad_phone'; end if;
  if coalesce(p_channel, '') not in ('wa', 'tg') then raise exception 'bad_channel'; end if;
  if length(coalesce(p_comment, '')) > 500 then raise exception 'bad_comment'; end if;
  if p_duration is null or p_duration not between 15 and 600
     or p_start is null or p_start < 0 or p_start + p_duration > 1440 then raise exception 'bad_time'; end if;
  if p_day is null or p_day < v_now::date or p_day > v_now::date + 90 then raise exception 'bad_day'; end if;
  if p_day = v_now::date
     and p_start < extract(hour from v_now)::int * 60 + extract(minute from v_now)::int + 60 then raise exception 'too_late'; end if;
  if jsonb_typeof(p_services) is distinct from 'array'
     or jsonb_array_length(p_services) not between 1 and 10
     or length(p_services::text) > 3000 then raise exception 'bad_services'; end if;

  -- антиспам
  if (select count(*) from public.requests where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'try_later';
  end if;
  if (select count(*) from public.requests
       where status = 'new' and regexp_replace(phone, '\D', '', 'g') = v_digits) >= 3 then
    raise exception 'too_many';
  end if;

  -- две клиентки не должны занять одно время одновременно
  perform pg_advisory_xact_lock(hashtext('day:' || p_day::text));
  if exists (select 1 from public.public_busy(p_day, p_day) b
              where p_start < b.end_min and p_start + p_duration > b.start_min) then
    raise exception 'slot_taken';
  end if;

  insert into public.requests (day, start_min, duration, services, price, name, phone, channel, comment, first_time)
  values (p_day, p_start, p_duration, p_services, greatest(coalesce(p_price, 0), 0),
          trim(p_name), trim(p_phone), p_channel, trim(coalesce(p_comment, '')), coalesce(p_first, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Для приложения мастера ----------

create or replace function public.master_check(p_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_master(p_key);
$$;

-- заменить занятое время на промежутке дат: p_items = [{day, start_min, end_min}]
create or replace function public.master_sync_busy(p_key text, p_from date, p_to date, p_items jsonb)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.is_master(p_key) then raise exception 'forbidden'; end if;
  delete from public.busy where day between p_from and p_to;
  insert into public.busy (day, start_min, end_min)
  select x.day, x.start_min, x.end_min
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(day date, start_min int, end_min int)
   where x.day between p_from and p_to and x.end_min > x.start_min;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.master_requests(p_key text, p_days int default 60)
returns setof public.requests
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_master(p_key) then raise exception 'forbidden'; end if;
  return query
    select * from public.requests
     where created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 60), 1), 365))
     order by created_at desc;
end;
$$;

create or replace function public.master_set_status(p_key text, p_id bigint, p_status text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_master(p_key) then raise exception 'forbidden'; end if;
  if p_status not in ('new', 'accepted', 'declined', 'cancelled') then raise exception 'bad_status'; end if;
  update public.requests
     set status = p_status,
         handled_at = case when p_status = 'new' then null else now() end
   where id = p_id;
end;
$$;

create or replace function public.master_set_config(p_key text, p_data jsonb)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_master(p_key) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text) > 20000 then raise exception 'bad_config'; end if;
  insert into public.config (id, data, updated_at) values (1, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end;
$$;

-- ---------- Права ----------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.public_busy(date, date),
  public.public_config(),
  public.create_request(date, int, int, jsonb, int, text, text, text, text, boolean),
  public.master_check(text),
  public.master_sync_busy(text, date, date, jsonb),
  public.master_requests(text, int),
  public.master_set_status(text, bigint, text),
  public.master_set_config(text, jsonb)
to anon, authenticated;

notify pgrst, 'reload schema';

-- Ключ мастера задаётся отдельно (только отпечаток, сам ключ — у мастера):
--   insert into public.master_key (id, key_hash) values (1, '<sha256 ключа>')
--   on conflict (id) do update set key_hash = excluded.key_hash;
