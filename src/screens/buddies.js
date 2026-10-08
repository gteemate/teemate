// Admin → Buddies: my playing partners, and search to add more.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast } from '../ui.js'
import { toAdmin } from './nav.js'

export async function load() {
  const [members, buddies, me] = await Promise.all([api.getMembers(), api.getBuddies(), api.getMe()])
  return { members: members.filter(m => m.id !== me.id), buddies }
}

export function draw({ members, buddies }) {
  header('Buddies', `<b>${buddies.length}</b> playing partners`, toAdmin)
  const q = S.q.trim().toLowerCase().replace(/[\s']/g, '').replace(/^gui/, '')
  const mine = members.filter(m => buddies.includes(m.id))
  const res = q ? members.filter(m => m.name.toLowerCase().replace(/[\s']/g, '').includes(q) || m.gui.includes(q)) : []
  const row = m => {
    const on = buddies.includes(m.id)
    return `<div class="lrow"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>GUI ${m.gui}</small></span><span style="display:flex;gap:12px;align-items:center"><span class="hcp">${m.hcp}<small>HCP</small></span>${S.bseg === 'find' ? `<button class="add${on ? ' on' : ''}" data-b="${m.id}">${on ? 'Added' : 'Add'}</button>` : `<button class="x" data-b="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>`}</span></div>`
  }
  let body
  if (S.bseg === 'mine') body = mine.length ? `<div class="card list">${mine.map(row).join('')}</div>` : '<div class="empty-state">No buddies yet. Switch to Find members to add some.</div>'
  else body = !q ? '<div class="empty-state">Search by name or GUI number.<br>Try “Walsh” or “10845519”.</div>' : res.length ? `<div class="card list">${res.map(row).join('')}</div>` : `<div class="empty-state">No member matches “${esc(S.q)}”. Check the GUI number on their handicap card.</div>`
  const back = S.bfrom === 'players' ? '<button class="primary" id="backPick">Back to choosing players</button>' : S.bfrom === 'book' ? '<button class="primary" id="backBook">Back to booking</button>' : ''
  $('main').innerHTML = `<div class="screen">
    <div class="seg" role="group"><button data-s="mine" aria-pressed="${S.bseg === 'mine'}">My buddies</button><button data-s="find" aria-pressed="${S.bseg === 'find'}">Find members</button></div>
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
