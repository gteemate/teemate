// Which competition a card counts for, and so which holes it plays: the scorecard and Home's Scoring tile both ask.
// A card ticked for (or counting for) an event plays that day's or league week's open holes; a card for a knockout
// match plays its round's. Anything else: all 18 (null).
import * as api from '../api.js'
import { eventLastDay } from '../dates.js'
import { roundBoard } from '../round.js'

/** → { board (the round's Leaderboard tab, or null), holes (open-holes.js spec), leagues, entries } */
export async function cardHoles(round, t, { playerEvents, allEvents } = {}) {
  if (!round) return { board: null, holes: null, leagues: [], entries: [] }
  ;[playerEvents, allEvents] = await Promise.all([playerEvents ?? api.getMyPlayerEvents(), allEvents ?? api.getEvents()])
  const onCard = e => round.lineup.some(x => e.players.includes(x.m))
  // Leagues running this week that someone on this card plays in.
  const leagues = allEvents.filter(e => e.style === 'league' && e.startDate <= t && eventLastDay(e) >= t && onCard(e))
  const entries = await api.getLeagueEntries(leagues.map(e => e.id))
  if (!round.id) return { board: null, holes: null, leagues, entries }
  const onToday = allEvents.filter(e => e.style !== 'league' && e.startDate <= t && eventLastDay(e) >= t && onCard(e))
  const eventEntries = await api.getEventEntries(onToday.map(e => e.id))
  const board = roundBoard({ cardId: round.id, lineup: round.lineup, events: allEvents, leagueEntries: entries, eventEntries, playerEvents, date: t })
  let holes = board?.holes ?? null
  if (holes == null) { // a knockout match's card: its round's holes
    const ko = await api.getKoMatchOfCard(round.id)
    if (ko) holes = (await api.getSignups()).comps.find(c => c.id === ko.compId)?.roundHoles?.[ko.round] ?? null
  }
  return { board, holes, leagues, entries }
}
