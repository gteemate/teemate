// Add friend: where a shared friend link (QR or message) opens. Shows the sender's card; a member of this club
// goes into your friends (bookable), anyone else is saved as a contact card. Opened signed out, it shows the card
// and Sign in to save; the link is kept on the phone (pending) and this page comes back after sign-in.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, render, toast, top0 } from '../ui.js'
import { readFriendLink, addFriendAction } from '../friend-link.js'
import { fromIso, MN } from '../dates.js'

const KEY = 'teemate.pendingFriend'
export const pendingFriend = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export const setPendingFriend = hash => { try { localStorage.setItem(KEY, hash) } catch { /* no storage: it still works this visit */ } }
const clearPending = () => { try { localStorage.removeItem(KEY) } catch { /* no storage */ } }

/** Signed out: just the card. Signed in: what I already have, to choose the button. */
export async function load() {
  S.friendHash = pendingFriend() ?? S.friendHash
  const card = readFriendLink(S.friendHash)
  const session = await api.getSession()
  if (!card || !session) return { card, me: null }
  const [me, members, buddies, friends] = await Promise.all([api.getMe(), api.getMembers(), api.getBuddies(), api.getFriends()])
  return { card, me, members, buddies, contacts: friends.contacts }
}

const shared = d => { if (!d) return ''; const x = fromIso(d); return `Shared ${x.getDate()} ${MN[x.getMonth()]} ${x.getFullYear()}` }
const toFriends = async () => { S.friendHash = null; S.tab = 'home'; S.aview = 'buddies'; S.bseg = 'mine'; S.bfrom = null; await render(); top0() }

export function draw({ card, me, members = [], buddies = [], contacts = [] }) {
  header('Add friend', card ? 'From a TeeMate link' : '', me ? () => { S.friendHash = null; S.aview = 'home'; render() } : undefined)
  if (!card) {
    clearPending()
    $('main').innerHTML = `<div class="screen"><div class="empty-state">This link isn’t complete. Ask them to share it again.</div>
      ${me ? '' : '<button class="primary" id="fr-in">Open TeeMate</button>'}</div>`
    if ($('fr-in')) $('fr-in').onclick = () => { S.friendHash = null; render() }
    return
  }
  const a = addFriendAction(card, { me, members, buddies, contacts })
  if (me) clearPending() // shown signed in: done with the link
  const BTN = {
    signin: '<button class="primary" id="fr-go">Sign in to save</button><span class="hint">You’ll come straight back here after signing in.</span>',
    self: '<div class="empty-state">This is your card.</div>',
    add: '<button class="primary" id="fr-go">Add to friends</button><span class="hint">A member of your club: you can book them in.</span>',
    already: '<div class="empty-state">Already in your friends.</div>',
    save: '<button class="primary" id="fr-go">Save contact</button><span class="hint">From another club: saved to your friends. Book them in as a guest.</span>',
    update: `<button class="primary" id="fr-go">Update contact</button><span class="hint">You saved them before${a.contact?.hcp !== card.hcp ? `: handicap ${esc(a.contact?.hcp ?? '–')} → ${esc(card.hcp ?? '–')}` : ''}.</span>`,
    same: '<div class="empty-state">Already saved in your friends.</div>',
  }
  $('main').innerHTML = `<div class="screen">
    <div class="sharecard">
      <span class="av big">${ini(card.name)}</span>
      <div class="sc-nm">${esc(card.name)}</div>${card.club ? `<div class="sc-cl">${esc(card.club)}</div>` : ''}
      <div class="sc-fx"><span>Handicap index <b class="num">${esc(card.hcp ?? '–')}</b></span><span>${card.gui ? `GUI <b class="num">${esc(card.gui)}</b>` : 'GUI not added'}</span></div>
      <div class="sc-up">${shared(card.sharedOn)}</div>
    </div>
    ${BTN[a.kind]}
    ${['self', 'already', 'same'].includes(a.kind) ? '<button class="ghost" id="fr-list">See your friends</button>' : ''}
  </div>`
  if ($('fr-list')) $('fr-list').onclick = toFriends
  const go = $('fr-go')
  if (!go) return
  go.onclick = async () => {
    if (a.kind === 'signin') { S.loginMode = 'signin'; return render() }
    go.disabled = true
    try {
      if (a.kind === 'add') await api.addBuddy(a.memberId)
      else await api.saveContact(card, a.kind === 'update' ? a.contact.id : null)
    } catch (err) { toast(err.message); go.disabled = false; return }
    toast(a.kind === 'add' ? `${card.name} added to your friends` : a.kind === 'update' ? 'Contact updated' : 'Contact saved to your friends')
    await toFriends()
  }
}
