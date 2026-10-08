// Admin → Members & access (admins only): add members, give or remove access by email,
// and set committee and admin rights.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast } from '../ui.js'
import { toAdmin } from './nav.js'

export async function load() {
  const [list, me] = await Promise.all([api.getAccessList(), api.getMe()])
  return { list, me }
}

const status = m => (!m.email ? 'No access' : m.signedIn ? 'Signed in' : 'Invited')

export function draw({ list, me }) {
  const withAccess = list.filter(m => m.email), signedIn = list.filter(m => m.signedIn)
  header('Members & access', `<b>${withAccess.length}</b> with access · ${signedIn.length} signed in`, () => { S.accEdit = null; S.accQ = ''; toAdmin() })
  const q = S.accQ.trim().toLowerCase()
  const shown = q ? list.filter(m => m.name.toLowerCase().includes(q) || (m.email || '').includes(q) || (m.gui || '').includes(q)) : list
  $('main').innerHTML = `<div class="screen">
    <div class="hint">Only the emails here can sign in. Anyone else asking for a sign-in link is turned away.</div>
    <button class="primary" id="addm">+ Add member</button>
    <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="accq" type="search" placeholder="Name, email or GUI" value="${esc(S.accQ)}" autocomplete="off"></div>
    <div class="card list">${shown.map(m => `<button class="lrow accrow" data-m="${m.id}"><span class="av">${ini(m.name)}</span>
      <span class="who"><strong>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}${m.admin ? ' <span class="pill tag">Admin</span>' : ''}${m.committee ? ' <span class="pill tag">Committee</span>' : ''}</strong><small>${m.email ? esc(m.email) : 'No email · can’t sign in'}</small></span>
      <span class="accst ${m.signedIn ? 'on' : m.email ? 'inv' : ''}">${status(m)}</span></button>`).join('') || '<div class="empty-state">No one matches.</div>'}</div>
  </div>`

  $('addm').onclick = () => { S.accEdit = 'new'; S.accConfirm = false; keepScroll(render) }
  document.querySelectorAll('[data-m]').forEach(b => (b.onclick = () => { S.accEdit = +b.dataset.m; S.accConfirm = false; keepScroll(render) }))
  const qi = $('accq')
  qi.oninput = () => { S.accQ = qi.value; const p = qi.selectionStart; render().then(() => { const n = $('accq'); n.focus(); n.setSelectionRange(p, p) }) }

  if (S.accEdit != null) editSheet(S.accEdit === 'new' ? { name: '', email: '', gui: '', hcp: 54, committee: false, admin: false } : list.find(m => m.id === S.accEdit), me)
}

function editSheet(m, me) {
  const isNew = m.id == null, self = m.id === me.id
  const sw = (id, on, label, sub, dis) => `<div class="actrow"><span class="who"><strong>${label}</strong><small>${sub}</small></span><button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}" ${dis ? 'disabled' : ''}><span></span></button></div>`
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="mform" novalidate aria-labelledby="mtitle">
    <h4 id="mtitle">${isNew ? 'Add member' : esc(m.name)}</h4>
    <label for="m-name">Full name</label><input id="m-name" autocomplete="off" value="${esc(m.name)}" placeholder="e.g. Paul Hughes">
    <label for="m-email">Email <span class="opt">gives them access</span></label><input id="m-email" type="email" inputmode="email" autocomplete="off" value="${esc(m.email || '')}" placeholder="Leave blank for no access" ${self ? 'readonly' : ''}>
    <div class="tnames"><div><label for="m-gui">GUI number <span class="opt">optional</span></label><input id="m-gui" inputmode="numeric" autocomplete="off" value="${esc(m.gui || '')}"></div>
      <div><label for="m-hcp">Handicap index</label><input id="m-hcp" inputmode="decimal" autocomplete="off" value="${m.hcp}"></div></div>
    ${sw('m-com', m.committee, 'Committee', 'Can set pins, games and events')}
    ${sw('m-adm', m.admin, 'Admin', self ? 'You can’t remove your own admin rights' : 'Can give and remove access', self)}
    <p class="gerr" id="merr" role="alert"></p>
    ${!isNew && m.email && !self ? `<button type="button" class="ghost accremove" id="mrem">${S.accConfirm ? `Tap again to remove ${esc(m.name.split(' ')[0])}’s access` : 'Remove access'}</button>` : ''}
    <div class="gm-btns"><button type="button" class="ghost" id="mcancel">Cancel</button><button type="submit" class="primary" id="msave">${isNew ? 'Add member' : 'Save'}</button></div>
  </form></div>`
  if (isNew) setTimeout(() => $('m-name')?.focus(), 30)
  const close = () => { S.accEdit = null; S.accConfirm = false; keepScroll(render) }
  $('mcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  ;['m-com', 'm-adm'].forEach(id => ($(id).onclick = e => e.currentTarget.setAttribute('aria-checked', e.currentTarget.getAttribute('aria-checked') !== 'true')))

  const save = async (changes, done) => {
    const hcp = Number(String($('m-hcp').value).replace(/^\+/, '-').replace(',', '.'))
    const next = {
      id: m.id, name: $('m-name').value, email: $('m-email').value, gui: $('m-gui').value.replace(/\s/g, ''),
      hcp: Number.isFinite(hcp) ? hcp : NaN,
      committee: $('m-com').getAttribute('aria-checked') === 'true', admin: $('m-adm').getAttribute('aria-checked') === 'true', ...changes,
    }
    if (!next.name.trim()) { $('merr').textContent = 'Enter a name.'; return }
    if (Number.isNaN(next.hcp)) { $('merr').textContent = 'Handicap index should be a number, e.g. 12.4 (or +2 for a plus handicap).'; return }
    $('msave').disabled = true
    try {
      await api.saveMember(next)
    } catch (err) {
      $('merr').textContent = err.message
      $('msave').disabled = false
      return
    }
    S.accEdit = null
    S.accConfirm = false
    await keepScroll(render)
    toast(done(next))
  }
  $('mform').onsubmit = e => {
    e.preventDefault()
    const hadAccess = !!m.email
    save({}, n => (isNew ? (n.email ? `${n.name.trim()} added. They can sign in now` : `${n.name.trim()} added without access`)
      : !hadAccess && n.email.trim() ? `${n.name.trim()} can sign in now` : hadAccess && !n.email.trim() ? `${n.name.trim()}’s access removed` : 'Saved'))
  }
  const rem = $('mrem')
  if (rem) rem.onclick = () => {
    if (!S.accConfirm) { S.accConfirm = true; rem.textContent = `Tap again to remove ${m.name.split(' ')[0]}’s access`; return }
    save({ email: '' }, n => `${n.name.trim()}’s access removed`)
  }
}
