import { must, sb, forgetMe } from './client.js'

/* ---------- Sign-up competitions (season competitions members put their names down for) ---------- */

const toComp = c => ({ id: c.id, name: c.name, category: c.category, kind: c.kind, closesOn: c.closes_on, notes: c.notes, open: c.open,
  drawPublished: !!c.draw_published, roundDeadlines: c.round_deadlines ?? [], maxEntries: c.max_entries ?? null, createdBy: c.created_by ?? null })

/** { comps: [{ id, name, category, kind, closesOn, notes, open }], entries: [{ compId, memberId, partnerId }] }
 *  Members see open competitions and their own entries; admins see everything. A published draw's entries come with
 *  getKnockout. */
export async function getSignups() {
  const [c, e] = await Promise.all([sb.from('signup_comps').select('id, name, category, kind, closes_on, notes, open, draw_published, round_deadlines, max_entries, created_by').order('id'),
    sb.from('signup_entries').select('id, comp_id, member_id, partner_id, created_at').order('created_at')])
  return { comps: must(c).map(toComp), entries: must(e).map(x => ({ id: x.id, compId: x.comp_id, memberId: x.member_id, partnerId: x.partner_id })) }
}
/** How many have entered each competition I can see: { [compId]: count } (for places left; not who). */
export async function getSignupCounts() { return must(await sb.rpc('signup_counts')) }

/** Enter (partnerId for pairs, else null). The server checks eligibility, the closing date and double entries. */
export async function enterSignup(compId, partnerId = null) { must(await sb.rpc('enter_signup', { p_comp: compId, p_partner: partnerId })) }
/** Withdraw me (and my partner, for pairs) until entries close. */
export async function withdrawSignup(compId) { must(await sb.rpc('withdraw_signup', { p_comp: compId })) }

/** The section I play in: 'men' | 'ladies' | null. */
export async function setMyPlaysIn(p) { must(await sb.rpc('set_my_plays_in', { p })); forgetMe() }
/** Admins: correct a member's section. */
export async function adminSetPlaysIn(memberId, p) { must(await sb.rpc('admin_set_plays_in', { p_member: memberId, p })) }

/** Admins: add (no id) or change a competition. */
export async function saveSignup(c) {
  const row = { name: c.name.trim(), category: c.category, kind: c.kind, closes_on: c.closesOn || null, notes: c.notes?.trim() || null, open: !!c.open,
    max_entries: c.maxEntries ? +c.maxEntries : null }
  if (c.id) must(await sb.from('signup_comps').update(row).eq('id', c.id).select('id'))
  else must(await sb.from('signup_comps').insert(row))
}
export async function deleteSignup(id) { must(await sb.from('signup_comps').delete().eq('id', id)) }

/* ---------- Knockout draw ---------- */

const toMatch = m => ({ id: m.id, round: m.round, slot: m.slot, aEntry: m.a_entry, bEntry: m.b_entry, winnerEntry: m.winner_entry, result: m.result,
  status: m.status, reportedEntry: m.reported_entry, roundId: m.round_id ?? null })

/** A competition's draw: { matches: [...], entries: [{ id, memberId, partnerId }] } (players see it once published). */
export async function getKnockout(compId) {
  const [m, e] = await Promise.all([sb.from('ko_matches').select('id, round, slot, a_entry, b_entry, winner_entry, result, status, reported_entry, round_id').eq('comp_id', compId).order('round').order('slot'),
    sb.rpc('ko_entries', { p_comp: compId })])
  return { matches: must(m).map(toMatch), entries: must(e) }
}
/** A knockout a member sets up: entries [[memberId]] (singles) or [[a, b]] (pairs); drawn and published at once. → its id */
export async function createMemberKnockout(name, kind, entries, deadlines) {
  return must(await sb.rpc('create_member_knockout', { p_name: name, p_kind: kind, p_entries: entries, p_deadlines: deadlines }))
}
export async function deleteMemberKnockout(compId) { must(await sb.rpc('delete_member_knockout', { p_comp: compId })) }
export async function makeDraw(compId) { must(await sb.rpc('admin_make_draw', { p_comp: compId })) }
export async function swapDraw(compId, x, y) { must(await sb.rpc('admin_swap_draw', { p_comp: compId, p_x: x, p_y: y })) }
export async function setRoundDeadlines(compId, dates) { must(await sb.rpc('admin_set_round_deadlines', { p_comp: compId, p_dates: dates })) }
export async function publishDraw(compId) { must(await sb.rpc('admin_publish_draw', { p_comp: compId })) }
/** Link my scorecard to my match (Score this match). */
export async function linkKoCard(matchId, roundId) { must(await sb.rpc('ko_link_card', { p_match: matchId, p_round: roundId })) }
export async function reportKoResult(matchId, winnerEntry, result) { must(await sb.rpc('report_ko_result', { p_match: matchId, p_winner: winnerEntry, p_result: result })) }
export async function confirmKoResult(matchId) { must(await sb.rpc('confirm_ko_result', { p_match: matchId })) }
export async function disputeKoResult(matchId) { must(await sb.rpc('dispute_ko_result', { p_match: matchId })) }
export async function adminSetKoResult(matchId, winnerEntry, result) { must(await sb.rpc('admin_set_ko_result', { p_match: matchId, p_winner: winnerEntry, p_result: result })) }
