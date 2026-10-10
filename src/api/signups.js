import { must, sb, forgetMe } from './client.js'

/* ---------- Sign-up competitions (season competitions members put their names down for) ---------- */

const toComp = c => ({ id: c.id, name: c.name, category: c.category, kind: c.kind, closesOn: c.closes_on, notes: c.notes, open: c.open })

/** { comps: [{ id, name, category, kind, closesOn, notes, open }], entries: [{ compId, memberId, partnerId }] }
 *  Members see open competitions and their own entries; admins see everything. */
export async function getSignups() {
  const [c, e] = await Promise.all([sb.from('signup_comps').select('id, name, category, kind, closes_on, notes, open').order('id'),
    sb.from('signup_entries').select('comp_id, member_id, partner_id, created_at').order('created_at')])
  return { comps: must(c).map(toComp), entries: must(e).map(x => ({ compId: x.comp_id, memberId: x.member_id, partnerId: x.partner_id })) }
}
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
  const row = { name: c.name.trim(), category: c.category, kind: c.kind, closes_on: c.closesOn || null, notes: c.notes?.trim() || null, open: !!c.open }
  if (c.id) must(await sb.from('signup_comps').update(row).eq('id', c.id).select('id'))
  else must(await sb.from('signup_comps').insert(row))
}
export async function deleteSignup(id) { must(await sb.from('signup_comps').delete().eq('id', id)) }
