// Club office → Members: people asking to join at the top, then everyone (search by name or email). A member opens
// in a side panel: name, email (their sign-in), which section they play in, admin and halfway hut staff, guest
// points used, and reset login, remove access or delete. Handicaps and scores belong to the player app.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast } from '../ui.js'
import { summary, forgetSummary, panel } from './shell.js'

export async function load() {
  const [s, access, members, points, me] = await Promise.all([summary(), api.getAccessList(), api.getMembers(), api.getGuestPoints(), api.getMe()])
  const by = new Map(members.map(m => [m.id, m]))
  const list = access.filter(m => !m.office).map(m => ({ ...m, playsIn: by.get(m.id)?.playsIn ?? null, hutStaff: !!by.get(m.id)?.hutStaff,
    used: points.members.find(p => p.id === m.id)?.used ?? 0 }))
  return { joins: s.joins, list, allowance: points.allowance, me }
}

const status = m => (!m.email ? 'No access' : m.signedIn ? 'Signed in' : 'Approved: not signed in yet')

export function draw({ joins, list, allowance, me }) {
  const withAccess = list.filter(m => m.email).length
  header('Members', `<b>${list.length}</b> members · ${withAccess} can sign in${joins.length ? ` · <b>${joins.length}</b> asking to join` : ''}`)
  const q = (S.oQ ?? '').trim().toLowerCase()
  const shown = q ? list.filter(m => m.name.toLowerCase().includes(q) || (m.email || '').includes(q)) : list
  $('main').innerHTML = `<div class="screen office">
    <div class="obar"><div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="o-q" type="search" placeholder="Search by name or email" value="${esc(S.oQ ?? '')}" autocomplete="off"></div>
      <button class="primary sm" id="o-add">Add a member</button></div>
    ${joins.length ? `<h3>Asking to join</h3><div class="card olist">${joins.map(r => `<div class="orow"><span class="av">${esc(ini(r.name))}</span><span class="ot"><b>${esc(r.name)}</b><span>${esc(r.email)} · asked ${new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
      <span class="oacts"><button class="ghost sm" data-o-refuse="${r.id}">Refuse</button><button class="primary sm" data-o-letin="${r.id}">Let in</button></span></div>`).join('')}</div>` : ''}
    <h3>Members</h3>
    <div class="card olist">${shown.map(m => `<button class="orow obtn" data-o-m="${m.id}"><span class="av">${esc(ini(m.name))}</span><span class="ot"><b>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</b><span>${m.email ? esc(m.email) : 'No email'} · ${status(m)}</span></span>
      <span class="otags">${m.admin ? '<span class="pill gold">Admin</span>' : ''}${m.hutStaff ? '<span class="pill">Hut staff</span>' : ''}<span class="pill ghosty">Guest points ${allowance - m.used} of ${allowance}</span></span></button>`).join('') || '<div class="empty-state">No member matches.</div>'}</div>
  </div>`

  const done = async msg => { forgetSummary(); $('modal').innerHTML = ''; await keepScroll(render); toast(msg) }
  const qi = $('o-q')
  qi.oninput = () => { S.oQ = qi.value; const p = qi.selectionStart; render().then(() => { const n = $('o-q'); n.focus(); n.setSelectionRange(p, p) }) }
  document.querySelectorAll('[data-o-letin]').forEach(b => (b.onclick = async () => {
    const r = joins.find(x => x.id === +b.dataset.oLetin)
    b.disabled = true
    try { await api.saveMember({ name: r.name, email: r.email, hcp: 54, admin: false }) } catch (err) { toast(err.message); b.disabled = false; return }
    done(`${r.name} can sign in now`)
  }))
  document.querySelectorAll('[data-o-refuse]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return }
    const r = joins.find(x => x.id === +b.dataset.oRefuse)
    await api.declineRequest(r.id)
    done(`${r.name}’s request refused`)
  }))
  $('o-add').onclick = () => addSheet(done)
  document.querySelectorAll('[data-o-m]').forEach(b => (b.onclick = () => memberSheet(list.find(m => m.id === +b.dataset.oM), me, allowance, done)))
}

function addSheet(done) {
  panel(`<h4>Add a member</h4>
    <label for="o-name">Full name</label><input id="o-name" autocomplete="off" placeholder="e.g. Paul Hughes">
    <label for="o-email">Email <span class="opt">lets them sign in</span></label><input id="o-email" type="email" inputmode="email" autocomplete="off" placeholder="Leave blank for no access yet">
    <p class="gerr" id="o-err" role="alert"></p><div class="gm-btns"><button class="primary" id="o-save">Add member</button></div>`)
  $('o-name').focus()
  $('o-save').onclick = async () => {
    const name = $('o-name').value.trim(), email = $('o-email').value.trim()
    if (!name) { $('o-err').textContent = 'Enter a name.'; return }
    $('o-save').disabled = true
    try { await api.saveMember({ name, email, hcp: 54, admin: false }) } catch (err) { $('o-err').textContent = err.message; $('o-save').disabled = false; return }
    done(email ? `${name} added. They can sign in now` : `${name} added without access`)
  }
}

function memberSheet(m, me, allowance, done) {
  const self = m.id === me.id, first = m.name.split(' ')[0]
  const sw = (id, on, label, sub, dis) => `<div class="actrow"><span class="who"><strong>${label}</strong><small>${sub}</small></span><button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}" ${dis ? 'disabled' : ''}><span></span></button></div>`
  panel(`<h4>${esc(m.name)}</h4><p class="hint">${status(m)} · guest points ${allowance - m.used} of ${allowance} left this year</p>
    <label for="o-name">Full name</label><input id="o-name" autocomplete="off" value="${esc(m.name)}">
    <label for="o-email">Email <span class="opt">their sign-in</span></label><input id="o-email" type="email" inputmode="email" autocomplete="off" value="${esc(m.email || '')}" placeholder="Blank: no access" ${self ? 'readonly' : ''}>
    <label for="o-plays">Plays in</label><select id="o-plays" class="plainsel"><option value="" ${!m.playsIn ? 'selected' : ''}>Not set</option><option value="men" ${m.playsIn === 'men' ? 'selected' : ''}>Men’s competitions</option><option value="ladies" ${m.playsIn === 'ladies' ? 'selected' : ''}>Ladies’ competitions</option></select>
    ${sw('o-adm', m.admin, 'Admin', self ? 'You can’t remove your own admin rights' : 'Can open the club office', self)}
    ${sw('o-hut', m.hutStaff, 'Halfway hut staff', 'Sees today’s food orders and marks them ready')}
    <p class="gerr" id="o-err" role="alert"></p>
    <div class="gm-btns"><button class="primary" id="o-save">Save</button></div>
    ${!self && m.signedIn ? '<button class="ghost" id="o-reset">Reset login</button><span class="hint">For a forgotten password: they create a new one. Scores and bookings stay.</span>' : ''}
    ${!self && m.email ? '<button class="ghost accremove" id="o-rem">Remove access</button>' : ''}
    ${!self ? '<button class="ghost accremove" id="o-del">Delete member</button><span class="hint">Deletes them completely, with their bookings, guest points and the scorecards they started.</span>' : ''}`)
  ;['o-adm', 'o-hut'].forEach(id => ($(id).onclick = e => e.currentTarget.setAttribute('aria-checked', e.currentTarget.getAttribute('aria-checked') !== 'true')))
  const on = id => $(id).getAttribute('aria-checked') === 'true'
  const err = e => { $('o-err').textContent = e.message }
  const save = async (email, msg) => {
    const name = $('o-name').value.trim()
    if (!name) { $('o-err').textContent = 'Enter a name.'; return }
    $('o-save').disabled = true
    try {
      await api.saveMember({ id: m.id, name, email, gui: m.gui ?? '', hcp: m.hcp, admin: on('o-adm') })
      if (on('o-hut') !== m.hutStaff) await api.setHutStaff(m.id, on('o-hut'))
      const plays = $('o-plays').value || null
      if (plays !== m.playsIn) await api.adminSetPlaysIn(m.id, plays)
    } catch (e) { err(e); $('o-save').disabled = false; return }
    done(msg)
  }
  $('o-save').onclick = () => save($('o-email').value.trim(), !m.email && $('o-email').value.trim() ? `${first} can sign in now` : 'Saved')
  const arm = (b, text, go) => (b.onclick = () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = text; return } go() })
  if ($('o-rem')) arm($('o-rem'), `Tap again to remove ${first}’s access`, () => save('', `${first}’s access removed`))
  if ($('o-reset')) arm($('o-reset'), `Tap again to reset ${first}’s login`, async () => {
    try { await api.resetLogin(m.id) } catch (e) { err(e); return }
    done(`${first}’s login reset. They can create a new password`)
  })
  if ($('o-del')) arm($('o-del'), `Tap again to delete ${first}`, async () => {
    try { await api.deleteMember(m.id) } catch (e) { err(e); return }
    done(`${m.name} deleted`)
  })
}
