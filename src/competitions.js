// Competitions: the four lists behind its tabs, from data the api already returns.
//   entered  — club competitions, leagues and players' events I'm in that are on or coming up, and today's
//              accepted matches; on now first
//   open     — club competitions open for entry (members enter themselves) that haven't started
//   events   — invitations my group has to answer, then events set up by players that I'm in or made
//   history  — finished competitions I was in, newest first
import { eventLastDay, leagueWeek } from './dates.js'
import { needsMyAnswer } from './home-today.js'

const kindOf = e => (e.style === 'league' ? 'league' : 'event')
const item = (e, date) => ({ kind: kindOf(e), e, running: e.startDate <= date,
  ...(e.style === 'league' ? { week: Math.max(1, leagueWeek(e, date)), weeks: e.weeks } : {}) })

export function competitionLists({ me, events, playerEvents, date }) {
  const mine = e => e.players.includes(me.id)
  const live = events.filter(e => eventLastDay(e) >= date)
  const entered = [
    ...live.filter(mine).map(e => item(e, date)),
    ...playerEvents.filter(e => e.date === date && e.status === 'accepted').map(e => ({ kind: 'match', e, running: true })),
  ].sort((a, b) => (b.running - a.running) || ((a.e.startDate ?? a.e.date) < (b.e.startDate ?? b.e.date) ? -1 : 1))
  const open = live.filter(e => e.club && e.selfEntry && e.startDate > date && !mine(e)).map(e => item(e, date))
  const byPlayers = e => !e.club && e.style !== 'league'
  const evs = [
    ...playerEvents.filter(e => needsMyAnswer(e, me)).map(e => ({ kind: 'invite', e })),
    ...live.filter(e => byPlayers(e) && (mine(e) || e.createdBy?.id === me.id)).map(e => item(e, date)),
  ]
  const history = events.filter(e => eventLastDay(e) < date && mine(e))
    .sort((a, b) => (eventLastDay(a) < eventLastDay(b) ? 1 : -1)).map(e => item(e, date))
  return { entered, open, events: evs, history }
}
