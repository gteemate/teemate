// A round: what "Scoring round?" offers when a card starts, and (Task 10) whether the round has a leaderboard.
import { eventLastDay, leagueWeek, addDaysIso } from './dates.js'
import { myMatch } from './match.js'
import { dayOfDate } from './season.js'
import { matchType } from './match-scoring.js'
import { holesFor } from './open-holes.js'

/**
 * Competitions this card could count for today:
 *   [{ kind: 'league', e, players, week, needsMarker } | { kind: 'event', e, players, day, needsMarker } | { kind: 'event', e, players, day, match, auto }
 *    | { kind: 'join', e, players: [me], day, needsMarker }]   (join: a club competition on today I can enter as I start)
 * Leagues running this week, for the card's players in them who haven't counted a round this week; events on today
 * that count only ticked cards (entryRequired), for the card's players in them. Both need someone else on the card
 * to mark it (anyone, guests too). An event with drawn matches is offered only when all four of my match are on the
 * card, ticked already (the other side marks you, so no marker).
 */
export function countsForOptions({ lineup, events, leagueEntries, date, meId }) {
  const onCard = lineup.filter(x => x.m != null).map(x => x.m)
  const marked = lineup.length >= 2
  const out = []
  for (const e of events) {
    if (e.startDate > date || eventLastDay(e) < date) continue
    const inIt = onCard.filter(m => e.players.includes(m))
    // A club competition on today, open for entry (no draw), that I'm not in: join it as I start (enter_event_today).
    const drawn = Object.values(e.matches ?? {}).some(d => d.length)
    if (e.club && e.selfEntry && !drawn && e.style !== 'league' && meId != null && !e.players.includes(meId)) {
      if (marked) out.push({ kind: 'join', e, players: [meId], day: Array.from({ length: e.days }, (_, i) => addDaysIso(e.startDate, i)).indexOf(date) + 1, needsMarker: true })
      continue
    }
    if (!inIt.length) continue
    if (e.style === 'league') {
      const week = leagueWeek(e, date)
      const players = inIt.filter(m => !leagueEntries.some(x => x.eventId === e.id && x.week === week && x.memberId === m))
      if (players.length && marked) out.push({ kind: 'league', e, players, week, needsMarker: true })
    } else if (e.entryRequired) {
      const day = dayOfDate(e, date)
      if (e.season || Object.keys(e.matches ?? {}).length) { // a season counts only on a match day of mine
        const mine = myMatch(e, day, meId), four = mine ? [...mine.a, ...mine.b] : []
        if (mine && four.every(m => onCard.includes(m))) out.push({ kind: 'event', e, players: four, day, match: mine.no, auto: true })
        // A singles or a 3-ball can be played on different cards: count mine, marked by someone else on my card.
        else if (mine && matchType(mine) !== 'four' && marked) out.push({ kind: 'event', e, players: [meId], day, match: mine.no, needsMarker: true })
      } else if (marked) out.push({ kind: 'event', e, players: inIt, day, needsMarker: true })
    }
  }
  return out
}

/** Who can mark my card: everyone else on it, guests too ({ m } / { g } lineup entries). */
export const markerChoices = (lineup, meId) => lineup.filter(x => x.m !== meId)

/**
 * The Leaderboard tab in a round: { view: 'evboard' | 'pevent', id, holes } for the competition this card counts for (holes: its
 * open holes that day or league week, open-holes.js), or
 * null for a general round (no tab). A league or event this card was ticked for; else an accepted match today with
 * someone on the card; else an older event that counts every card, on today, with someone on the card in it.
 */
export function roundBoard({ cardId, lineup, events, leagueEntries, eventEntries, playerEvents, date }) {
  const onCard = lineup.filter(x => x.m != null).map(x => x.m)
  const ticked = [...leagueEntries, ...eventEntries].find(x => x.roundId === cardId)
  const on = (e, d) => (e ? holesFor(e, d ?? dayOfDate(e, date)) : null)
  if (ticked) return { view: 'evboard', id: ticked.eventId, name: events.find(e => e.id === ticked.eventId)?.name, holes: on(events.find(e => e.id === ticked.eventId), ticked.week ?? ticked.day) }
  const match = playerEvents.find(e => e.date === date && e.status === 'accepted' && e.players.some(p => onCard.includes(p.memberId)))
  if (match) return { view: 'pevent', id: match.id, name: 'Your match', holes: null }
  const auto = events.find(e => e.style !== 'league' && !e.entryRequired && e.startDate <= date && eventLastDay(e) >= date && e.players.some(m => onCard.includes(m)))
  return auto ? { view: 'evboard', id: auto.id, name: auto.name, holes: on(auto) } : null
}
