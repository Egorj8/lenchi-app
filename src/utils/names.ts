/** Как обращаться к клиентке в сообщениях: «обращение» из карточки, иначе первое слово имени */
export function callName(name: string | null | undefined, call?: string | null) {
  return call?.trim() || (name ?? '').trim().split(/\s+/)[0] || '';
}
