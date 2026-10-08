// Admin → Members & access (admins only): access requests, add members, approve or remove
// access by email, and set admin rights.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast } from '../ui.js'
import { toAdmin } from './nav.js'

export async function load() {
  const [list, me, requests] = await Promise.all([api.getAccessList(), api.getMe(), api.getAccessRequests()])
  return { list, me, requests }
}

// signedIn = they've created their account (a login exists)
const status = m => (!m.email ? 'No access' : m.signedIn ? 'Has account' : 'Approved')

export function draw({ list, me, requests }) {
  const withAccess = list.filter(m => m.email), signedIn = list.filter(m => m.signedIn)
  header('Members & access', `<b>${withAccess.length}</b> approved · ${signedIn.length} with accounts`, () => { S.accEdit = null; S.accQ = ''; toAdmin() })
  const q = S.accQ.trim().toLowerCase()
  const shown = q ? list.filter(m => m.name.toLowerCase().includes(q) || (m.email || '').includes(q) || (m.gui || '').includes(q)) : list
  $('main').innerHTML = `<div class="screen">
    <div class="hint">Only approved emails can create an account. Once approved, they tap “Create your account” on the sign-in screen and choose a password.</div>
    <h3>Access requests${requests.length ? ` <span class="pill">${requests.length}</span>` : ''}</h3>
    ${requests.length ? `<div class="card list">${requests.map(r => `<div class="reqrow"><span class="av">${ini(r.name)}</span>
      <span class="who"><strong>${esc(r.name)}</strong><small>${new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></span>
      <span class="reqbtns"><button class="ghost" data-dec="${r.id}">Decline</button><button class="primary" data-apr="${r.id}">Approve</button></span></div>`).join('')}</div>`
      : '<div class="card empty-state">No one is waiting. Anyone not approved can tap “Request access” on the sign-in screen, and their name appears here.</div>'}
    <h3>Members</h3>
    <button class="primary" id="addm">+ Add member</button>
    <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="accq" type="search" placeholder="Name, email or GUI" value="${esc(S.accQ)}" autocomplete="off"></div>
    <div class="card list">${shown.map(m => `<button class="lrow accrow" data-m="${m.id}"><span class="av">${ini(m.name)}</span>
      <span class="who"><strong>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}${m.admin ? ' <span class="pill tag">Admin</span>' : ''}</strong><small>${m.email ? esc(m.email) : 'No email · can’t sign in'}</small></span>
      <span class="accst ${m.signedIn ? 'on' : m.email ? 'inv' : ''}">${status(m)}</span></button>`).join('') || '<div class="empty-state">No one matches.</div>'}</div>
  </div>`

  $('addm').onclick = () => { S.accEdit = 'new'; S.accPrefill = null; S.accConfirm = false; keepScroll(render) }
  // Approve opens the add-member form filled in from the request; saving it clears the request.
  document.querySelectorAll('[data-apr]').forEach(b => (b.onclick = () => {
    const r = requests.find(x => x.id === +b.dataset.apr)
    S.accEdit = 'new'; S.accPrefill = { name: r.name, email: r.email }; S.accConfirm = false
    keepScroll(render)
  }))
  document.querySelectorAll('[data-dec]').forEach(b => (b.onclick = async () => {
    const r = requests.find(x => x.id === +b.dataset.dec)
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return }
    await api.declineRequest(r.id)
    await keepScroll(render)
    toast(`${r.name}’s request declined`)
  }))
  document.querySelectorAll('[data-m]').forEach(b => (b.onclick = () => { S.accEdit = +b.dataset.m; S.accConfirm = false; keepScroll(render) }))
  const qi = $('accq')
  qi.oninput = () => { S.accQ = qi.value; const p = qi.selectionStart; render().then(() => { const n = $('accq'); n.focus(); n.setSelectionRange(p, p) }) }

  if (S.accEdit != null) editSheet(S.accEdit === 'new' ? { name: '', email: '', gui: '', hcp: 54, admin: false, ...S.accPrefill } : list.find(m => m.id === S.accEdit), me)
}

function editSheet(m, me) {
  const isNew = m.id == null, self = m.id === me.id
  const sw = (id, on, label, sub, dis) => `<div class="actrow"><span class="who"><strong>${label}</strong><small>${sub}</small></span><button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}" ${dis ? 'disabled' : ''}><span></span></button></div>`
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="mform" novalidate aria-labelledby="mtitle">
    <h4 id="mtitle">${isNew ? (S.accPrefill ? 'Approve access' : 'Add member') : esc(m.name)}</h4>
    <label for="m-name">Full name</label><input id="m-name" autocomplete="off" value="${esc(m.name)}" placeholder="e.g. Paul Hughes">
    <label for="m-email">Email <span class="opt">approves them to sign in</span></label><input id="m-email" type="email" inputmode="email" autocomplete="off" value="${esc(m.email || '')}" placeholder="Leave blank for no access" ${self ? 'readonly' : ''}>
    <div class="tnames"><div><label for="m-gui">GUI number <span class="opt">optional</span></label><input id="m-gui" inputmode="numeric" autocomplete="off" value="${esc(m.gui || '')}"></div>
      <div><label for="m-hcp">Handicap index</label><input id="m-hcp" inputmode="decimal" autocomplete="off" value="${m.hcp}"></div></div>
    ${sw('m-adm', m.admin, 'Admin', self ? 'You can’t remove your own admin rights' : 'Can approve access, run club events, set pins and games', self)}
    <p class="gerr" id="merr" role="alert"></p>
    ${!isNew && m.signedIn && !self ? '<button type="button" class="ghost" id="mreset">Reset login</button><span class="hint">For a forgotten password: deletes their login (scores and bookings stay) so they can create a new password.</span>' : ''}
    ${!isNew && m.email && !self ? `<button type="button" class="ghost accremove" id="mrem">${S.accConfirm ? `Tap again to remove ${esc(m.name.split(' ')[0])}’s access` : 'Remove access'}</button>` : ''}
    <div class="gm-btns"><button type="button" class="ghost" id="mcancel">Cancel</button><button type="submit" class="primary" id="msave">${isNew ? (S.accPrefill ? 'Approve' : 'Add member') : 'Save'}</button></div>
  </form></div>`
  if (isNew) setTimeout(() => $('m-name')?.focus(), 30)
  const close = () => { S.accEdit = null; S.accPrefill = null; S.accConfirm = false; keepScroll(render) }
  $('mcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  ;['m-adm'].forEach(id => ($(id).onclick = e => e.currentTarget.setAttribute('aria-checked', e.currentTarget.getAttribute('aria-checked') !== 'true')))

  const save = async (changes, done) => {
    const hcp = Number(String($('m-hcp').value).replace(/^\+/, '-').replace(',', '.'))
    const next = {
      id: m.id, name: $('m-name').value, email: $('m-email').value, gui: $('m-gui').value.replace(/\s/g, ''),
      hcp: Number.isFinite(hcp) ? hcp : NaN,
      admin: $('m-adm').getAttribute('aria-checked') === 'true', ...changes,
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
    S.accPrefill = null
    S.accConfirm = false
    await keepScroll(render)
    toast(done(next))
  }
  $('mform').onsubmit = e => {
    e.preventDefault()
    const hadAccess = !!m.email
    save({}, n => (isNew ? (n.email ? `${n.name.trim()} approved. They can create their account now` : `${n.name.trim()} added without access`)
      : !hadAccess && n.email.trim() ? `${n.name.trim()} approved. They can create their account now` : hadAccess && !n.email.trim() ? `${n.name.trim()}’s access removed` : 'Saved'))
  }
  const reset = $('mreset')
  if (reset) reset.onclick = async () => {
    if (reset.dataset.armed !== '1') { reset.dataset.armed = '1'; reset.textContent = `Tap again to reset ${m.name.split(' ')[0]}’s login`; return }
    reset.disabled = true
    try {
      await api.resetLogin(m.id)
    } catch (err) {
      $('merr').textContent = err.message
      reset.disabled = false
      return
    }
    S.accEdit = null
    await keepScroll(render)
    toast(`${m.name}’s login reset. They can create a new password`)
  }
  const rem = $('mrem')
  if (rem) rem.onclick = () => {
    if (!S.accConfirm) { S.accConfirm = true; rem.textContent = `Tap again to remove ${m.name.split(' ')[0]}’s access`; return }
    save({ email: '' }, n => `${n.name.trim()}’s access removed`)
  }
}
