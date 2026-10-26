// Four-ball team match play over a season: match days the organiser adds (any number of matches each, four-balls
// and singles), points adding up to one season score. Plain functions, tested in season.test.js.
import { addDaysIso, fromIso, eventLastDay, eventDates } from './dates.js'

/** How a singles is played in a season of each format (four-balls play the format itself). */
export const SINGLES_FMT = { bbl: 'kos', bbstab: 'sm2', bbscr: 'sc2' }

/** A singles: one player a side ({ a: [x], b: [y] }); a four-ball is two a side. */
export const isSingles = m => m.a.length === 1

/** The days that play: for a season, the days with matches (in order); for a one-off, every day. */
export function matchDays(e) {
  if (!e.season) return Array.from({ length: e.days }, (_, i) => i + 1)
  return Object.entries(e.matches ?? {}).filter(([, list]) => list.length).map(([d]) => +d).sort((x, y) => x - y)
}

/** The date of day d (day 1 is the start date), and back: the day number of a date (0 before the start). */
export const dayDate = (e, d) => addDaysIso(e.startDate, d - 1)
export const dayOfDate = (e, iso) => (iso < e.startDate ? 0 : Math.round((fromIso(iso) - fromIso(e.startDate)) / 864e5) + 1)

/** The season's last day. */
export const seasonEnd = e => eventLastDay(e)

const inDay = (e, d) => (e.matches?.[d] ?? []).flatMap(m => [...m.a, ...m.b])

/**
 * Has match day d started: a card counted for it has a hole saved. (An event that counts every card: any card that
 * day with one of its players on it.) dayCards: { [day]: cards }, entries: [{ day, memberId, roundId }].
 */
export function dayStarted(e, d, dayCards, entries) {
  const ids = inDay(e, d)
  const counts = c => (e.entryRequired
    ? entries.some(x => x.day === d && x.roundId === c.id)
    : c.lineup.some(x => ids.includes(x.m)))
  return (dayCards[d] ?? []).some(c => counts(c) && c.done.some(Boolean))
}

/** Players in a match on a past match day, or on today's once it has started: they can't be taken out. */
export function playedIds(e, dayCards, entries, todayIso) {
  const today = dayOfDate(e, todayIso)
  return new Set(matchDays(e).filter(d => d < today || (d === today && dayStarted(e, d, dayCards, entries))).flatMap(d => inDay(e, d)))
}

const shuffle = (list, rand) => list.map(x => [rand(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1])

/**
 * Draw a match day: four-balls while both sides have two to spare, then a 3-ball (two from one side against one from
 * the other) if that's possible, then a singles from one left on each side. Anyone left over sits out.
 */
export function drawDay(aIds, bIds, rand = Math.random) {
  const a = shuffle(aIds, rand), b = shuffle(bIds, rand), out = []
  while (a.length >= 2 && b.length >= 2) out.push({ a: a.splice(0, 2), b: b.splice(0, 2) })
  if (a.length >= 2 && b.length) out.push({ a: a.splice(0, 2), b: b.splice(0, 1) })
  else if (b.length >= 2 && a.length) out.push({ a: a.splice(0, 1), b: b.splice(0, 2) })
  if (a.length && b.length) out.push({ a: a.splice(0, 1), b: b.splice(0, 1) })
  return out
}

/** Who can change an event: admins any time; its organiser before a one-off's first day, or until a season ends. */
export const canChange = (e, me, todayIso) => !!me.admin || (e.createdBy?.id === me.id && (e.season ? seasonEnd(e) >= todayIso : e.startDate > todayIso))

/** When an event is on, for its card: a season's end, or a one-off's dates. */
export const eventWhen = e => (e.season ? `Season · ends ${eventDates(seasonEnd(e), 1)}` : eventDates(e.startDate, e.days))
