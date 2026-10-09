import { must, myId, sb, todayIso } from './client.js'

/* ---------- Player events (one group challenges others) ---------- */

/**
 * Player events I'm part of, from today on (RLS: only players in the event and admins see them).
 * [{ id, date, style, format, teamNames, status, createdBy: { id, name }, cancelNote, cancelledBy,
 *    proposerSlot, proposedBy: { id, name }   (the group and member whose version is on the table),
 *    players: [{ id, name, memberId, guest, slot, team }],
 *    groups: [{ slot, time, host, answer, answeredBy: { id, name } | null }] }]   groups in tee-time order
 */
export async function getMyPlayerEvents() {
  const rows = must(await sb.from('player_events')
    .select('id, date, style, format, team_names, players, status, cancel_note, cancelled_by, proposer_slot, proposer:proposed_by(id, name), creator:created_by(id, name), player_event_groups(slot_id, host, answer, answerer:answered_by(id, name), tee:slot_id(start_time))')
    .gte('date', todayIso()).order('created_at', { ascending: false }))
  const meId = await myId()
  return rows
    .filter(e => e.players.some(p => p.memberId === meId)) // admins can see all; the Scores tab shows mine
    .map(e => ({
      id: e.id, date: e.date, style: e.style, format: e.format, teamNames: e.team_names, players: e.players, status: e.status, cancelNote: e.cancel_note, cancelledBy: e.cancelled_by,
      proposerSlot: e.proposer_slot, proposedBy: e.proposer ?? e.creator, // whose version is on the table
      createdBy: e.creator,
      groups: e.player_event_groups
        .map(g => ({ slot: g.slot_id, time: g.tee.start_time, host: g.host, answer: g.answer, answeredBy: g.answerer }))
        .sort((a, b) => a.time - b.time),
    }))
}

/**
 * Propose an event from my tee time to other groups the same day.
 * teamNames: { A, B } (ryder/teams) or { "<slot id>": name } (fourball, optional).
 * teams (ryder/teams): { bookingPlayerId: 'A' | 'B' }.
 */
export async function proposePlayerEvent({ hostSlot, invited, style, format, teamNames = {}, teams = {} }) {
  return must(await sb.rpc('create_player_event', { p_host_slot: hostSlot, p_invited: invited, p_style: style, p_format: format, p_team_names: teamNames, p_teams: teams }))
}

/** Suggest a different game and/or teams for an event I've been asked to answer. Everyone else then answers it. */
export async function counterPlayerEvent(id, { style, format, teamNames = {}, teams = {} }) {
  must(await sb.rpc('counter_player_event', { p_id: id, p_style: style, p_format: format, p_team_names: teamNames, p_teams: teams }))
}

export async function answerPlayerEvent(id, accept) {
  must(await sb.rpc('respond_player_event', { p_id: id, p_accept: accept }))
}

export async function cancelPlayerEvent(id) {
  must(await sb.rpc('cancel_player_event', { p_id: id }))
}
