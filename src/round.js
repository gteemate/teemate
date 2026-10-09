// A round: what "Scoring round?" offers when a card starts, and (Task 10) whether the round has a leaderboard.
import { eventLastDay, leagueWeek, addDaysIso } from './dates.js'

/**
 * Competitions this card could count for today: [{ kind: 'league', e, players, week } | { kind: 'event', e, players, day }].
 * Leagues running this week, for the card's players in them who haven't counted a round this week; events on today
 * that count only ticked cards (entryRequired), for the card's players in them.
 */
export function countsForOptions({ lineup, events, leagueEntries, date }) {
  const onCard = lineup.filter(x => x.m != null).map(x => x.m)
  const out = []
  for (const e of events) {
    const inIt = onCard.filter(m => e.players.includes(m))
    if (!inIt.length || e.startDate > date || eventLastDay(e) < date) continue
    if (e.style === 'league') {
      const week = leagueWeek(e, date)
      const players = inIt.filter(m => !leagueEntries.some(x => x.eventId === e.id && x.week === week && x.memberId === m))
      if (players.length) out.push({ kind: 'league', e, players, week })
    } else if (e.entryRequired) {
      const day = Array.from({ length: e.days }, (_, i) => addDaysIso(e.startDate, i)).indexOf(date) + 1
      out.push({ kind: 'event', e, players: inIt, day })
    }
  }
  return out
}

/**
 * The Leaderboard tab in a round: { view: 'evboard' | 'pevent', id } for the competition this card counts for, or
 * null for a general round (no tab). A league or event this card was ticked for; else an accepted match today with
 * someone on the card; else an older event that counts every card, on today, with someone on the card in it.
 */
export function roundBoard({ cardId, lineup, events, leagueEntries, eventEntries, playerEvents, date }) {
  const onCard = lineup.filter(x => x.m != null).map(x => x.m)
  const ticked = [...leagueEntries, ...eventEntries].find(x => x.roundId === cardId)
  if (ticked) return { view: 'evboard', id: ticked.eventId }
  const match = playerEvents.find(e => e.date === date && e.status === 'accepted' && e.players.some(p => onCard.includes(p.memberId)))
  if (match) return { view: 'pevent', id: match.id }
  const auto = events.find(e => e.style !== 'league' && !e.entryRequired && e.startDate <= date && eventLastDay(e) >= date && e.players.some(m => onCard.includes(m)))
  return auto ? { view: 'evboard', id: auto.id } : null
}
