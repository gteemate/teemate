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
