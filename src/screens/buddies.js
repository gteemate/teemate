// Friends: my friends (favourites first, then my club, then other clubs' contact cards from friend links), and
// Find members to add club friends. Star the ones you play with most: they come first when picking players.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast } from '../ui.js'

export async function load() {
  const [members, buddies, me, friends] = await Promise.all([api.getMembers(), api.getBuddies(), api.getMe(), api.getFriends()])
  return { members: members.filter(m => m.id !== me.id), buddies, friends }
}

const star = (on, attr, name) => `<button class="star${on ? ' on' : ''}" ${attr} aria-pressed="${on}" aria-label="${on ? 'Unstar' : 'Star'} ${esc(name)}">${on ? '★' : '☆'}</button>`

export function draw({ members, buddies, friends }) {
  const total = buddies.length + friends.contacts.length
  header('Friends', `<b>${total}</b> friend${total === 1 ? '' : 's'}`)
  const fav = new Set(friends.buddies.filter(b => b.favourite).map(b => b.id))
  const q = S.q.trim().toLowerCase().replace(/[\s']/g, '').replace(/^gui/, '')
  const mine = members.filter(m => buddies.includes(m.id))
  const res = q ? members.filter(m => m.name.toLowerCase().replace(/[\s']/g, '').includes(q) || (m.gui || '').includes(q)) : []
  const row = m => {
    const on = buddies.includes(m.id)
    return `<div class="lrow"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>${m.gui ? 'GUI ' + m.gui : 'No GUI number'}</small></span><span style="display:flex;gap:12px;align-items:center">${S.bseg === 'mine' ? star(fav.has(m.id), `data-fm="${m.id}"`, m.name) : ''}<span class="hcp">${m.hcp}<small>HCP</small></span>${S.bseg === 'find' ? `<button class="add${on ? ' on' : ''}" data-b="${m.id}">${on ? 'Added' : 'Add'}</button>` : `<button class="x" data-b="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>`}</span></div>`
  }
  let body
  const crow = c => `<div class="lrow linkrow" data-c="${c.id}" role="button" tabindex="0" aria-label="${esc(c.name)}: open their card"><span class="av gst">${ini(c.name)}</span><span class="who"><strong>${esc(c.name)}</strong><small>${esc(c.club ?? 'Another club')}${c.gui ? ' · GUI ' + esc(c.gui) : ''}</small></span><span style="display:flex;gap:12px;align-items:center">${star(c.favourite, `data-fc="${c.id}"`, c.name)}<span class="hcp">${esc(c.hcp ?? '–')}<small>HI</small></span></span></div>`
  const favM = mine.filter(m => fav.has(m.id)), favC = friends.contacts.filter(c => c.favourite)
  const sec = (title, html) => (html ? `<span class="kicker">${title}</span><div class="card list">${html}</div>` : '')
  if (S.bseg === 'mine') body = total
    ? sec('Favourites', favM.map(row).join('') + favC.map(crow).join(''))
      + sec('Your club', mine.filter(m => !fav.has(m.id)).map(row).join(''))
      + sec('Other clubs', friends.contacts.filter(c => !c.favourite).map(crow).join(''))
      + '<span class="hint">Star the friends you play with most: they come first when you pick players. Friends from other clubs come from their TeeMate link (Account → Share).</span>'
    : '<div class="empty-state">No friends yet. Switch to Find members to add club members, or open a friend’s TeeMate link.</div>'
  else body = !q ? '<div class="empty-state">Search by name or GUI number.<br>Try “Walsh” or “10845519”.</div>' : res.length ? `<div class="card list">${res.map(row).join('')}</div>` : `<div class="empty-state">No member matches “${esc(S.q)}”. Check the GUI number on their handicap card.</div>`
  const back = S.bfrom === 'players' ? '<button class="primary" id="backPick">Back to choosing players</button>' : S.bfrom === 'book' ? '<button class="primary" id="backBook">Back to booking</button>' : ''
  $('main').innerHTML = `<div class="screen">
    <div class="seg" role="group"><button data-s="mine" aria-pressed="${S.bseg === 'mine'}">Friends</button><button data-s="find" aria-pressed="${S.bseg === 'find'}">Find members</button></div>
    ${S.bseg === 'find' ? `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="q" type="search" placeholder="Name or GUI number" value="${esc(S.q)}" autocomplete="off"></div>` : ''}
    ${body}${back}</div>`

  document.querySelectorAll('[data-s]').forEach(b => (b.onclick = () => { S.bseg = b.dataset.s; render() }))
  document.querySelectorAll('[data-b]').forEach(b => (b.onclick = async () => {
    const id = +b.dataset.b, m = members.find(x => x.id === id)
    if (buddies.includes(id)) {
      await api.removeBuddy(id)
      S.picked = S.picked.filter(x => x !== id)
      if (S.pickTmp) S.pickTmp = S.pickTmp.filter(x => x !== id)
      toast(`Removed ${m.name}`)
    } else {
      await api.addBuddy(id)
      toast(`${m.name} added to buddies`)
    }
    keepScroll(render)
  }))
  document.querySelectorAll('[data-fm],[data-fc]').forEach(b => (b.onclick = async e => {
    e.stopPropagation() // not the row's own tap
    const on = b.getAttribute('aria-pressed') !== 'true'
    try { await api.setFriendFavourite(b.dataset.fm ? { memberId: +b.dataset.fm } : { contactId: +b.dataset.fc }, on) } catch (err) { toast(err.message); return }
    keepScroll(render)
  }))
  document.querySelectorAll('[data-c]').forEach(b => {
    b.onclick = () => contactSheet(friends.contacts.find(c => c.id === +b.dataset.c))
    b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); b.click() } }
  })
  const qi = $('q')
  if (qi) {
    qi.oninput = () => { S.q = qi.value; S.qCaret = qi.selectionStart; render() }
    if (S.qCaret != null) { qi.focus(); qi.setSelectionRange(S.qCaret, S.qCaret); S.qCaret = null }
  }
  const bp = $('backPick')
  if (bp) bp.onclick = async () => { S.bfrom = null; S.tab = 'scores'; await render(); top0() }
  const bb = $('backBook')
  if (bb) bb.onclick = async () => { S.bfrom = null; S.aview = 'book'; await render(); top0() }
}

// A friend from another club: their card, and Remove (tap again).
function contactSheet(c) {
  const when = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="ct">
    <span class="kicker">${esc(c.club ?? 'Another club')}</span>
    <h4 id="ct">${esc(c.name)}</h4>
    <span class="hint">Handicap index <b>${esc(c.hcp ?? '–')}</b> · ${c.gui ? `GUI ${esc(c.gui)}` : 'GUI not added'}${when ? ` · updated ${when}` : ''}</span>
    <span class="hint">Book them in as a guest: they’re listed when you add players to a booking. Open their latest link to update their handicap.</span>
    <div class="gm-btns"><button type="button" class="ghost" id="ct-close">Close</button><button class="ghost accremove" id="ct-rm">Remove</button></div>
  </div></div>`
  const close = () => { $('modal').innerHTML = '' }
  $('ct-close').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('ct-rm').onclick = async () => {
    const b = $('ct-rm')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; return }
    b.disabled = true
    try { await api.removeContact(c.id) } catch (err) { toast(err.message); b.disabled = false; return }
    close(); toast(`${c.name} removed`); keepScroll(render)
  }
}
