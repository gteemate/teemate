// Drawn matches in an event (pairs v pairs, by day): which one is mine, and where its four players stand on that
// day's tee sheet (for Book this match / Add the rest / Start scoring). Plain functions, tested in match.test.js.

/** My match on an event day → { no (from 1), a: ids, b: ids }, or null if I'm not drawn that day. */
export function myMatch(event, day, meId) {
  const list = event.matches?.[day] ?? []
  const k = list.findIndex(m => m.a.includes(meId) || m.b.includes(meId))
  return k < 0 ? null : { no: k + 1, a: list[k].a, b: list[k].b }
}

/**
 * Where the match's players are booked that day (sheet = [{ id, time, capacity, players: [{ memberId }] }]):
 * none (nobody), together (all in one tee time), partial (I'm booked with room for the ones not booked anywhere),
 * busy (only I'm booked, on a full tee time with others: book the match at another time), or split (anything else; clash = the first one booked in a tee time other than mine, and when).
 */
export function matchBooking(ids, sheet, meId) {
  const at = id => sheet.find(s => s.players.some(p => p.memberId === id))
  const booked = ids.filter(at)
  if (!booked.length) return { kind: 'none' }
  const all = at(ids[0])
  if (booked.length === ids.length && ids.every(id => at(id) === all)) return { kind: 'together', slot: all }
  const mine = at(meId)
  const elsewhere = booked.find(id => at(id) !== mine)
  const missing = ids.filter(id => !at(id))
  if (mine && elsewhere == null && mine.capacity - mine.players.length >= missing.length) return { kind: 'partial', slot: mine, missing }
  // I'm on a tee time with other people and none of the match is booked: book the match at another time.
  if (mine && booked.length === 1) return { kind: 'busy', slot: mine }
  const c = elsewhere ?? booked[0]
  return { kind: 'split', ...(elsewhere != null ? { clash: { id: c, time: at(c).time } } : {}) }
}
