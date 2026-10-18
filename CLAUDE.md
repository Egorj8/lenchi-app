# CLAUDE.md — правила работы над Lenchi Studio

Читается автоматически в начале каждой сессии. Что за проект — `project.md`, план — `PLAN.md`.
Технические правила Expo — в `AGENTS.md` (сверяться с документацией версии SDK, `npx expo install` вместо `npm install`).

## Общение
- Пользователь — не программист. Отвечать по-русски, простыми словами, с пошаговыми инструкциями для его действий.
- Перед большим этапом — коротко план; после — что сделано, как проверено и **что не проверено**.
- Решения, которые пользователь уже принял, не переспрашивать (см. «Принятые решения» в `project.md`).

## Обязательная проверка перед отправкой APK пользователю
1. `npx tsc --noEmit`, `npm test`, `npx expo-doctor` — без ошибок.
2. Собрать APK: `EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest build -p android --profile preview --non-interactive --no-wait`.
3. **Поставить готовый APK на эмулятор как обычное обновление** и пройти затронутые экраны. Только потом давать ссылку.
   Пользователь уже получал APK, который зависал на загрузке, — это и есть причина правила.
4. Убедиться, что `versionCode` вырос (в выводе сборки «Incremented versionCode from N to N+1»).
   Номер сборки виден в приложении: «Ещё» → внизу «версия X (сборка N)».

## Известные ловушки (уже наступали)
- **versionCode.** До сборки 2 все APK имели versionCode = 1, и телефон не обновлял приложение. В `eas.json` у профиля `preview` стоит `autoIncrement: true` — не убирать.
- **SQLiteProvider `onInit`** передавать как есть, без обёртки-стрелки (`src/db/provider.tsx`). Иначе база переоткрывается по кругу и приложение навсегда висит на индикаторе загрузки. В браузере это не проявляется.
- **Веб-версия** использует sql.js + IndexedDB (`src/db/provider.web.tsx`), а не expo-sqlite (нет OPFS в части Safari). `withExclusiveTransactionAsync` на вебе нет. `Alert.alert` в браузере не работает — использовать `showAlert` из `src/utils/dialog.ts`.
- **Логику, которую тестируем, держать без React Native** (как `src/utils/freeSlots.ts`, `calendar.ts`, `phone.ts`, `personal.ts`). Тесты Node не могут импортировать `expo-*`/`react-native`.
- **Схема БД:** миграции в `src/db/schema.ts` (`DATABASE_VERSION`, сейчас 4). Удаление «мягкое» (`deleted_at`), читать через представления `live_clients`, `live_appointments`, `live_events`. Новые таблицы добавлять в `TABLES` в `src/db/backup.ts`.
- **Expo SDK 57** (а не 58) — из-за старого Expo Go на телефоне пользователя. Для APK это не важно; переход на 58 — в `PLAN.md`.

## Android-эмулятор (на этом компьютере)
- Всё в `%LOCALAPPDATA%\Android`: `jdk`, `Sdk`, образ Android 11, AVD `lenchi` (Pixel 4). Драйвер ускорения AEHD установлен.
- Запуск: `"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd lenchi -no-boot-anim -no-audio` (грузится ~80 с, ждать `getprop sys.boot_completed` = 1).
- adb: `"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"`. В Git Bash перед командами с путями устройства ставить `export MSYS_NO_PATHCONV=1`, иначе `/sdcard/...` превращается в путь Windows.
- Установка APK **как обновления** (как на телефоне): `adb install <file>.apk` без `-r -d`; при одинаковом versionCode проверить, что версия в «Ещё» сменилась.
- Системное окно выбора файлов (DocumentsUI) не реагирует на `adb shell input tap` по файлам — выбирать клавиатурой: несколько `keyevent 61` (Tab), затем `keyevent 66` (Enter).
- Компьютер слабый (i5-3230M, 2 ядра): эмулятор заметно его грузит.

## Команды
```bash
npm test                    # тесты логики и базы (sql.js), tests/*.test.mts
npx tsc --noEmit            # типы
npx expo start              # разработка (Expo Go, SDK 57)
npx expo export -p web && npx eas-cli@latest deploy --prod   # веб-версия (сейчас отложена)
git push                    # https://github.com/Egorj8/lenchi-app (ветка main)
```
- Коммиты — по-русски, с описанием «что и зачем»; в конце `Co-Authored-By`.
