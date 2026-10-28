// Club office → Members: people asking to join at the top, then everyone (search by name or email, or pick
// a surname letter). A member opens as their own page (S.oMember): name and email, and their guests this year
// counted (a guest can come 6 times a year; names that may be the same person are flagged, to merge or keep
// apart); under Additional info, which section they play in, admin and halfway hut staff, and reset login,
// remove access or delete. Handicaps and scores belong to the player app.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, redraw, toast, fmtHcp } from '../ui.js'
import { summary, forgetSummary, panel } from './shell.js'
import { readHandicaps } from '../handicap-csv.js'
import { fold } from '../fold.js'
import { likelySame, GUEST_VISITS } from '../guest-counts.js'
import { longDay, fromIso } from '../dates.js'

export async function load() {
  const [s, access, members, points, me, notSame] = await Promise.all([summary(), api.getAccessList(), api.getMembers(), api.getGuestPoints(), api.getMe(), api.getGuestNotSame()])
  const by = new Map(members.map(m => [m.id, m]))
  const list = access.filter(m => !m.office).map(m => ({ ...m, playsIn: by.get(m.id)?.playsIn ?? null, hutStaff: !!by.get(m.id)?.hutStaff,
    used: points.members.find(p => p.id === m.id)?.used ?? 0, guests: points.members.find(p => p.id === m.id)?.guests ?? [] }))
  return { joins: s.joins, list, allowance: points.allowance, me, notSame }
}

const AZ = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const initial = name => (name.trim().split(/\s+/).pop()[0] || '').toUpperCase() // by surname

const status = m => (!m.email ? 'No access' : m.signedIn ? 'Signed in' : 'Approved: not signed in yet')

export function draw({ joins, list, allowance, me, notSame = [] }) {
  const open = S.oMember != null && list.find(m => m.id === S.oMember)
  if (open) return memberPage(open, me, allowance, notSame.filter(p => p.memberId === open.id))
  S.oMember = null
  const withAccess = list.filter(m => m.email).length
  header('Members', `<b>${list.length}</b> members · ${withAccess} can sign in${joins.length ? ` · <b>${joins.length}</b> asking to join` : ''}`)
  const q = fold((S.oQ ?? '').trim()) // accents ignored
  const none = list.filter(m => allowance - m.used <= 0) // no guest points left this year
  const pool = S.oNoPoints ? none : list
  const matched = q ? pool.filter(m => fold(m.name).includes(q) || (m.email || '').includes(q)) : pool
  const has = new Set(matched.map(m => initial(m.name)))
  const az = S.oAZ && has.has(S.oAZ) ? S.oAZ : ''
  const shown = az ? matched.filter(m => initial(m.name) === az) : matched
  $('main').innerHTML = `<div class="screen office">
    <div class="obar"><div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="o-q" type="search" placeholder="Search by name or email" value="${esc(S.oQ ?? '')}" autocomplete="off"></div>
      <button class="ghost sm" id="o-nopts" aria-pressed="${!!S.oNoPoints}">No points left (${none.length})</button>
      <button class="ghost sm" id="o-hcp">Update handicaps</button>
      <button class="primary sm" id="o-add">Add a member</button></div>
    ${joins.length ? `<h3>Asking to join</h3><div class="card olist">${joins.map(r => `<div class="orow"><span class="av">${esc(ini(r.name))}</span><span class="ot"><b>${esc(r.name)}</b><span>${esc(r.email)} · asked ${new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
      <span class="oacts"><button class="ghost sm" data-o-refuse="${r.id}">Refuse</button><button class="primary sm" data-o-letin="${r.id}">Let in</button></span></div>`).join('')}</div>` : ''}
    <h3>${S.oNoPoints ? 'Members with no guest points left' : 'Members'}${az ? ` · surname ${az}` : ''}</h3>
    <div class="oaz" role="group" aria-label="Surname starts with"><button data-o-az="" aria-pressed="${!az}">All</button>${AZ.map(l => `<button data-o-az="${l}" aria-pressed="${az === l}" ${has.has(l) ? '' : 'disabled'}>${l}</button>`).join('')}</div>
    <div class="card olist">${shown.map(m => `<button class="orow obtn" data-o-m="${m.id}"><span class="av">${esc(ini(m.name))}</span><span class="ot"><b>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</b><span>${m.email ? esc(m.email) : 'No email'} · ${status(m)}</span></span>
      <span class="otags">${m.admin ? '<span class="pill gold">Admin</span>' : ''}${m.hutStaff ? '<span class="pill">Hut staff</span>' : ''}<span class="pill ghosty">Guest points ${allowance - m.used} of ${allowance}</span></span></button>`).join('') || '<div class="empty-state">No member matches.</div>'}</div>
  </div>`

  const done = async msg => { forgetSummary(); $('modal').innerHTML = ''; await keepScroll(render); toast(msg) }
  document.querySelectorAll('[data-o-az]').forEach(b => (b.onclick = () => { S.oAZ = b.dataset.oAz; keepScroll(redraw) }))
  // Update handicaps: a CSV exported from the club's own system (which has Golf Ireland's). Shows what changes first.
  $('o-hcp').onclick = () => {
    const close = panel(`<h4>Update handicaps</h4>
      <p class="hint">Export members’ handicap indexes from the club’s system as a CSV file, then choose it here. Members are matched by GUI number, or by name. Nothing changes until you confirm.</p>
      <label class="primary filebtn" for="o-hfile">Choose a CSV file</label><input id="o-hfile" type="file" accept=".csv,text/csv,text/plain" hidden>
      <div id="o-hout"></div>`)
    $('o-hfile').onchange = async e => {
      const file = e.target.files?.[0]
      if (!file) return
      const r = readHandicaps(await file.text(), list)
      const out = $('o-hout')
      if (r.error) { out.innerHTML = `<p class="gerr" role="alert">${esc(r.error)}</p>`; return }
      const n = r.changes.length, show = h => (h == null ? '–' : fmtHcp(h))
      out.innerHTML = `<p><b>${n ? `${n} handicap${n === 1 ? '' : 's'} to update` : 'No handicaps to update'}</b>${r.same ? ` · ${r.same} already up to date` : ''}</p>
        ${n ? `<div class="card olist hchg">${r.changes.map(c => `<div class="orow"><span class="ot"><b>${esc(c.name)}</b></span><span class="num">${show(c.from)} → <b>${show(c.to)}</b></span></div>`).join('')}</div>` : ''}
        ${r.unmatched.length ? `<p class="hint">Not found (${r.unmatched.length}): ${esc(r.unmatched.join(', '))}</p>` : ''}
        ${r.problems.length ? `<p class="hint owarn">Not used: ${esc(r.problems.join('; '))}</p>` : ''}
        ${n ? `<div class="gm-btns"><button class="primary" id="o-hgo">Update ${n} handicap${n === 1 ? '' : 's'}</button></div>` : ''}`
      if ($('o-hgo')) $('o-hgo').onclick = async () => {
        const btn = $('o-hgo')
        if (btn.disabled) return
        btn.disabled = true
        try { await api.setHandicaps(r.changes.map(c => ({ id: c.id, hcp: c.to }))) } catch (err) { toast(err.message); btn.disabled = false; return }
        close(); await keepScroll(render); toast(`${n} handicap${n === 1 ? '' : 's'} updated`)
      }
    }
  }
  $('o-nopts').onclick = () => { S.oNoPoints = !S.oNoPoints; keepScroll(redraw) } // filter: members with no guest points left
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
  document.querySelectorAll('[data-o-m]').forEach(b => (b.onclick = async () => { S.oMember = +b.dataset.oM; S.oMemberMore = false; await render(); window.scrollTo?.(0, 0) }))
}

function addSheet(done) {
  panel(`<h4>Add a member</h4>
    <label for="o-name">Full name</label><input id="o-name" autocomplete="off" placeholder="e.g. Paul Hughes">
    <label for="o-email">Email <span class="opt">lets them sign in</span></label><input id="o-email" type="email" inputmode="email" autocomplete="off" placeholder="Leave blank for no access yet">
    <p class="gerr" id="o-err" role="alert"></p><div class="gm-btns"><button class="primary" id="o-save">Add member</button></div>`, null, { small: true })
  $('o-name').focus()
  $('o-save').onclick = async () => {
    const name = $('o-name').value.trim(), email = $('o-email').value.trim()
    if (!name) { $('o-err').textContent = 'Enter a name.'; return }
    $('o-save').disabled = true
    try { await api.saveMember({ name, email, hcp: 54, admin: false }) } catch (err) { $('o-err').textContent = err.message; $('o-save').disabled = false; return }
    done(email ? `${name} added. They can sign in now` : `${name} added without access`)
  }
}

function memberPage(m, me, allowance, notSame) {
  const self = m.id === me.id, first = m.name.split(' ')[0]
  const sw = (id, on, label, sub, dis) => `<div class="actrow"><span class="who"><strong>${label}</strong><small>${sub}</small></span><button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}" ${dis ? 'disabled' : ''}><span></span></button></div>`
  // Their guests this year, counted (a guest can come GUEST_VISITS times), and names that may be the same person.
  const groups = likelySame(m.guests ?? [], notSame), inGroup = new Set(groups.flatMap(g => g.names))
  const keep = g => [...g.names].sort((a, b) => b.length - a.length)[0] // merge under the fullest name
  const visits = (m.guests ?? []).reduce((t, g) => t + g.times, 0), left = allowance - m.used
  const flags = groups.map((g, i) => `<div class="oflag" role="note"><b>May be the same person: ${g.times} of ${GUEST_VISITS} together</b>
      <span>${g.names.map(n => `${esc(n)} (${m.guests.find(x => x.guest === n).times})`).join(' and ')}. A guest can come ${GUEST_VISITS} times a year.</span>
      <span class="oacts"><button class="primary sm" data-o-merge="${i}">Same person: merge as ${esc(keep(g))}</button><button class="ghost sm" data-o-apart="${i}">Different people</button></span></div>`).join('')
  const rows = (m.guests ?? []).map(g => `<tr><td><b>${esc(g.guest)}</b>${inGroup.has(g.guest) ? '<span class="oflagged"> · may be the same person</span>' : ''}</td><td>${g.club ? esc(g.club) : '–'}</td><td>${longDay(fromIso(g.last))}</td>
      <td class="n"><span class="pill${g.times >= GUEST_VISITS - 1 || inGroup.has(g.guest) ? ' amber' : ''}">${g.times} of ${GUEST_VISITS}</span></td></tr>`).join('')
  header(esc(m.name), `${status(m)}${m.hcp != null ? ` · HCP ${fmtHcp(m.hcp)}` : ''}${m.email ? ` · ${esc(m.email)}` : ''}`)
  $('main').innerHTML = `<div class="screen office">
    <button class="linkbtn oback" id="o-mback">‹ Members</button>
    <div class="omember">
      <section class="card" aria-label="Details">
        <label for="o-name">Full name</label><input id="o-name" autocomplete="off" value="${esc(m.name)}">
        <label for="o-email">Email <span class="opt">their sign-in</span></label><input id="o-email" type="email" inputmode="email" autocomplete="off" value="${esc(m.email || '')}" placeholder="Blank: no access" ${self ? 'readonly' : ''}>
        <p class="gerr" id="o-err" role="alert"></p>
        <button class="primary" id="o-save">Save</button>
        <details class="omore" id="o-more" ${S.oMemberMore ? 'open' : ''}><summary>Additional info</summary>
          <label for="o-plays">Plays in</label><select id="o-plays" class="plainsel"><option value="" ${!m.playsIn ? 'selected' : ''}>Not set</option><option value="men" ${m.playsIn === 'men' ? 'selected' : ''}>Men’s competitions</option><option value="ladies" ${m.playsIn === 'ladies' ? 'selected' : ''}>Ladies’ competitions</option></select>
          ${sw('o-adm', m.admin, 'Admin', self ? 'You can’t remove your own admin rights' : 'Can open the club office', self)}
          ${sw('o-hut', m.hutStaff, 'Halfway hut staff', 'Sees today’s food orders and marks them ready')}
          ${!self && m.signedIn ? '<button class="ghost" id="o-reset">Reset login</button><span class="hint">For a forgotten password: they create a new one. Scores and bookings stay.</span>' : ''}
          ${!self ? `<div class="gm-btns">${m.email ? '<button class="ghost accremove" id="o-rem">Remove access</button>' : ''}<button class="ghost accremove" id="o-del">Delete member</button></div><span class="hint">Delete takes them out completely, with their bookings, guest points and the scorecards they started.</span>` : ''}
        </details>
      </section>
      <section class="card" aria-label="Guests this year">
        <div class="ohead2"><h3>Guests this year</h3><span class="hint"><b>${left}</b> of ${allowance} points left</span></div>
        <div class="obarpts" aria-hidden="true"><i style="width:${allowance ? Math.round(100 * Math.max(0, left) / allowance) : 0}%"></i></div>
        ${flags}
        ${rows ? `<div class="otablewrap"><table class="otable"><thead><tr><th>Guest</th><th>Home club</th><th>Last visit</th><th class="n">Visits</th></tr></thead><tbody>${rows}</tbody></table></div>
          <span class="hint">${visits} visit${visits === 1 ? '' : 's'} · ${m.used} points used · a guest can come ${GUEST_VISITS} times a year</span>` : '<p class="hint">No guests this year.</p>'}
      </section>
    </div>
  </div>`
  const done = async (msg, gone = false) => { forgetSummary(); if (gone) S.oMember = null; await keepScroll(render); toast(msg) }
  $('o-mback').onclick = async () => { S.oMember = null; await render(); window.scrollTo?.(0, 0) }
  $('o-more').addEventListener('toggle', e => { S.oMemberMore = e.currentTarget.open })
  document.querySelectorAll('[data-o-merge]').forEach(b => (b.onclick = async () => {
    const g = groups[+b.dataset.oMerge], to = keep(g)
    b.disabled = true
    try { for (const n of g.names.filter(n => n !== to)) await api.officeMergeGuests(m.id, n, to) } catch (e) { toast(e.message); b.disabled = false; return }
    done(`Merged as ${to}: ${g.times} of ${GUEST_VISITS} this year`)
  }))
  document.querySelectorAll('[data-o-apart]').forEach(b => (b.onclick = async () => {
    const g = groups[+b.dataset.oApart]
    b.disabled = true
    try { for (let i = 0; i < g.names.length; i++) for (let j = i + 1; j < g.names.length; j++) await api.officeGuestsNotSame(m.id, g.names[i], g.names[j]) } catch (e) { toast(e.message); b.disabled = false; return }
    done('Kept apart: they won’t be flagged again')
  }))
  ;['o-adm', 'o-hut'].forEach(id => ($(id).onclick = e => e.currentTarget.setAttribute('aria-checked', e.currentTarget.getAttribute('aria-checked') !== 'true')))
  const on = id => $(id).getAttribute('aria-checked') === 'true'
  const err = e => { $('o-err').textContent = e.message }
  const save = async (email, msg) => {
    const name = $('o-name').value.trim()
    if (!name) { $('o-err').textContent = 'Enter a name.'; return }
    $('o-save').disabled = true
    try {
      // Only what changed is sent, so a refused change leaves the rest as it was (nothing half-saved).
      if (name !== m.name || email !== (m.email ?? '') || on('o-adm') !== !!m.admin) await api.saveMember({ id: m.id, name, email, gui: m.gui ?? '', hcp: m.hcp, admin: on('o-adm') })
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
    done(`${m.name} deleted`, true)
  })
}
