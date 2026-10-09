import { must, sb } from './client.js'

/* ---------- Events set up in advance ---------- */

const EVENT_COLS = 'id, name, team_a, team_b, club, everyone, start_date, days, style, fmt, players, team, matches, weeks, best_of, league_teams, captain_pool, self_entry, creator:created_by(id, name)'
const toEvent = e => ({
  id: e.id, name: e.name, A: e.team_a, B: e.team_b, club: e.club, everyone: e.everyone, startDate: e.start_date, days: e.days,
  style: e.style, fmt: e.fmt, players: e.players, team: e.team, matches: e.matches, createdBy: e.creator,
  weeks: e.weeks, bestOf: e.best_of, teams: e.league_teams, captainPool: e.captain_pool ?? [], // leagues
  selfEntry: !!e.self_entry, // members can enter themselves (club competitions)
})

/** Events I can see: club events, ones I set up, and ones I'm playing in (RLS decides). */
export async function getEvents() {
  return must(await sb.from('events').select(EVENT_COLS).order('start_date')).map(toEvent)
}

/** Create (no id) or update an event. Returns its id. */
export async function saveEvent(e) {
  const row = {
    name: e.name, team_a: e.A, team_b: e.B, club: !!e.club, everyone: !!e.everyone, start_date: e.startDate, days: e.days,
    style: e.style, fmt: e.fmt, players: e.players, team: e.team, matches: e.matches,
    weeks: e.weeks ?? null, best_of: e.bestOf ?? null, league_teams: e.teams ?? null, captain_pool: e.captainPool ?? [], self_entry: !!e.club && !!e.selfEntry,
  }
  if (e.id) {
    const rows = must(await sb.from('events').update(row).eq('id', e.id).select('id'))
    if (!rows.length) throw new Error('This event can’t be changed now. It has started, or it isn’t yours.')
    return e.id
  }
  return must(await sb.from('events').insert(row).select('id').single()).id
}

export async function deleteEvent(id) {
  const rows = must(await sb.from('events').delete().eq('id', id).select('id'))
  if (!rows.length) throw new Error('This event can’t be deleted now. It has started, or it isn’t yours.')
}

/** Everyone's cards on some dates (for scoring events): [{ date, lineup, scores, done }]. */
export async function getCardsOn(dates) {
  return must(await sb.from('rounds').select('date, lineup, scores, done, updated_at').in('date', dates).order('updated_at'))
}

/* ---------- Leagues ---------- */

/** League entries: [{ eventId, week, memberId, roundId }] (only leagues I can see). */
export async function getLeagueEntries(eventIds) {
  if (!eventIds.length) return []
  return must(await sb.from('league_entries').select('event_id, week, member_id, round_id').in('event_id', eventIds))
    .map(r => ({ eventId: r.event_id, week: r.week, memberId: r.member_id, roundId: r.round_id }))
}

/** Cards by id: { [id]: { lineup, scores, done } } */
export async function getCardsById(ids) {
  if (!ids.length) return {}
  return Object.fromEntries(must(await sb.from('rounds').select('id, lineup, scores, done').in('id', ids)).map(r => [r.id, r]))
}

/** Enter players on my card into a league this week (before the first hole is saved). Returns the week. */
export async function enterLeague(roundId, eventId, memberIds) {
  return must(await sb.rpc('enter_league', { p_round: roundId, p_event: eventId, p_members: memberIds }))
}

export async function leaveLeague(roundId, eventId, memberIds) {
  must(await sb.rpc('leave_league', { p_round: roundId, p_event: eventId, p_members: memberIds }))
}

/** Enter a club competition open for entry, until the day it starts. */
export async function enterEvent(id) {
  must(await sb.rpc('enter_event', { p_id: id }))
}

/** Withdraw from a club competition open for entry, until the day it starts. */
export async function withdrawEvent(id) {
  must(await sb.rpc('withdraw_event', { p_id: id }))
}
