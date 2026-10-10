import { MEMBER_COLS, forgetMe, must, myId, sb, toMember } from './client.js'

/* ---------- Members and buddies ---------- */

/** Everyone who plays: the club office login is left out. */
export async function getMembers() {
  return must(await sb.from('members').select(MEMBER_COLS).eq('office', false).order('id')).map(toMember)
}

export async function getBuddies() {
  return must(await sb.from('buddies').select('buddy_id')).map(r => r.buddy_id)
}

export async function addBuddy(id) {
  must(await sb.from('buddies').upsert({ member_id: await myId(), buddy_id: id }, { ignoreDuplicates: true }))
}

export async function removeBuddy(id) {
  must(await sb.from('buddies').delete().eq('buddy_id', id))
}

/* ---------- Friends: club friends (buddies) with favourites, and contact cards from other clubs ---------- */

const CONTACT_COLS = 'id, name, club, hcp, gui, shared_on, favourite, updated_at'
const toContact = c => ({ id: c.id, name: c.name, club: c.club, hcp: c.hcp, gui: c.gui, sharedOn: c.shared_on, favourite: c.favourite, updatedAt: c.updated_at })

/** { buddies: [{ id, favourite }], contacts: [{ id, name, club, hcp, gui, sharedOn, favourite, updatedAt }] } — mine only. */
export async function getFriends() {
  const [b, c] = await Promise.all([sb.from('buddies').select('buddy_id, favourite'), sb.from('friend_contacts').select(CONTACT_COLS).order('name')])
  return { buddies: must(b).map(r => ({ id: r.buddy_id, favourite: r.favourite })), contacts: must(c).map(toContact) }
}

/** Save a contact card from a friend link ({ name, club, hcp, gui, sharedOn }); with id, update that one. */
export async function saveContact(card, id = null) {
  const row = { name: card.name.slice(0, 80), club: card.club?.slice(0, 80) ?? null, hcp: card.hcp?.slice(0, 8) ?? null, gui: card.gui?.slice(0, 20) ?? null,
    shared_on: card.sharedOn ?? null, updated_at: new Date().toISOString() }
  if (id) must(await sb.from('friend_contacts').update(row).eq('id', id))
  else must(await sb.from('friend_contacts').insert({ ...row, owner: await myId() }))
}

export async function removeContact(id) {
  must(await sb.from('friend_contacts').delete().eq('id', id))
}

/** Star or unstar a friend: { memberId } (club friend) or { contactId } (other club). */
export async function setFriendFavourite({ memberId, contactId }, on) {
  if (memberId != null) must(await sb.from('buddies').update({ favourite: on }).eq('buddy_id', memberId))
  else must(await sb.from('friend_contacts').update({ favourite: on }).eq('id', contactId))
}

/* ---------- Access (admins only) ---------- */

/** Everyone, with email and whether they've created an account: [{ id, name, gui, hcp, email, admin, office, signedIn }] */
export async function getAccessList() {
  return must(await sb.rpc('admin_list_members')).map(m => ({ ...m, hcp: Number(m.hcp) }))
}

/**
 * Add (no id) or update a member. An email approves them to create an account; a blank email
 * removes access (and deletes their login). Returns the member id.
 */
export async function saveMember(m) {
  const id = must(await sb.rpc('admin_save_member', {
    p_id: m.id ?? null, p_name: m.name, p_email: m.email ?? '', p_gui: m.gui ?? '',
    p_hcp: m.hcp, p_admin: !!m.admin,
  }))
  forgetMe() // in case I edited myself
  return id
}

/** The club office login's email ('' to remove the login). Admins only. */
export async function setOfficeLogin(email) {
  must(await sb.rpc('admin_set_office_login', { p_email: email ?? '' }))
}

/** My favourite members (ids), for Members & access. */
export async function getFavourites() {
  return must(await sb.from('member_favourites').select('fav_id')).map(r => r.fav_id)
}

export async function setFavourite(id, on) {
  if (on) must(await sb.from('member_favourites').upsert({ member_id: await myId(), fav_id: id }, { ignoreDuplicates: true }))
  else must(await sb.from('member_favourites').delete().eq('fav_id', id))
}

/** People who asked for access: [{ id, name, email, createdAt }], oldest first. Admins only. */
export async function getAccessRequests() {
  return must(await sb.from('access_requests').select('id, name, email, created_at').order('created_at'))
    .map(r => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at }))
}

export async function declineRequest(id) {
  must(await sb.rpc('admin_decline_request', { p_id: id }))
}

/** Leave your name for an admin to approve. Works before signing in. */
export async function requestAccess(email, name) {
  must(await sb.rpc('request_access', { p_email: email, p_name: name }))
}

/** Delete a member completely (admins): their login, bookings, guest points and the cards they created go too. */
export async function deleteMember(id) {
  must(await sb.rpc('admin_delete_member', { p_id: id }))
}

/** Delete a member's login (e.g. forgotten password) but keep their email approved. */
export async function resetLogin(id) {
  must(await sb.rpc('admin_reset_login', { p_id: id }))
}
