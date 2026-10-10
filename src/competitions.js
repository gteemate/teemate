// Competitions: the Entered and History lists, from data the api already returns (Events: signups.js).
//   entered  — club competitions, leagues and players' events I'm in that are on or coming up, and today's
//              accepted matches; on now first
//            (match invitations to answer first, and players' events I set up)
//   history  — finished competitions I was in, newest first
import { eventLastDay, leagueWeek } from './dates.js'
import { needsMyAnswer } from './home-today.js'

const kindOf = e => (e.style === 'league' ? 'league' : 'event')
const item = (e, date) => ({ kind: kindOf(e), e, running: e.startDate <= date,
  ...(e.style === 'league' ? { week: Math.max(1, leagueWeek(e, date)), weeks: e.weeks } : {}) })

export function competitionLists({ me, events, playerEvents, date }) {
  const mine = e => e.players.includes(me.id)
  // A league whose knockout finish hasn't started yet stays live (its organiser starts it from the league's board).
  const waitingKo = e => e.style === 'league' && e.koTop && !e.koComp
  const live = events.filter(e => eventLastDay(e) >= date || waitingKo(e))
  const entered = [
    ...live.filter(mine).map(e => item(e, date)),
    ...playerEvents.filter(e => e.date === date && e.status === 'accepted').map(e => ({ kind: 'match', e, running: true })),
  ].sort((a, b) => (b.running - a.running) || ((a.e.startDate ?? a.e.date) < (b.e.startDate ?? b.e.date) ? -1 : 1))
  const byPlayers = e => !e.club && e.style !== 'league'
  // Match invitations to answer come first; then what I'm in; then players' events I set up but don't play in.
  const all = [
    ...playerEvents.filter(e => needsMyAnswer(e, me)).map(e => ({ kind: 'invite', e })),
    ...entered,
    ...live.filter(e => byPlayers(e) && !mine(e) && e.createdBy?.id === me.id).map(e => item(e, date)),
  ]
  const history = events.filter(e => eventLastDay(e) < date && !waitingKo(e) && mine(e))
    .sort((a, b) => (eventLastDay(a) < eventLastDay(b) ? 1 : -1)).map(e => item(e, date))
  return { entered: all, history } // Events: sign-up competitions (signups.js); club competitions on the day are joined from Scoring round?
}
