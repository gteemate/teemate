// Club admin → Sign-up competitions: the season competitions members put their names down for. Add or change one
// (name, Men's / Ladies' / Mixed / Open, Singles / Pairs, entries close, notes, open), see and share who has
// entered, and delete. Hidden ones (not open) members don't see. From the club office, one competition opens on its
// own page (S.signupOnly; 'new' to add one): its settings and entries, and Back, Save or Cancel go to the office.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast, top0 } from '../ui.js'
import { toAdmin } from './nav.js'
import { eventDates } from '../dates.js'
import { azList, wireAz } from '../az.js'

const CAT = { men: 'Men’s', ladies: 'Ladies’', mixed: 'Mixed', open: 'Open' }

export async function load() {
  const [signups, members] = await Promise.all([api.getSignups(), api.getMembers()])
  const open = S.signupNew; S.signupNew = false // from Club events → + New knockout competition: the add form, open
  return { ...signups, members, open, only: S.signupOnly ?? null }
}

export function draw({ comps, entries, members, open, only }) {
  const one = only === 'new' ? null : only != null && comps.find(c => c.id === only)
  if (one || only === 'new') { // from the office: just this competition (or a new one), as a page, and back to the office
    const back = async (pick = null) => { S.signupOnly = null; S.aview = 'office'; if (pick) S.oComp = pick; await render(); top0() }
    header(one ? one.name : 'New sign-up competition', 'Entries and settings', () => back())
    sheet(one || null, entries, members, back)
    return
  }
  header('Sign-up competitions', 'Season competitions members enter in advance', toAdmin)
  const count = id => entries.filter(e => e.compId === id).length
  $('main').innerHTML = `<div class="screen">
    <span class="hint">Members see a competition under Competitions → Events once it’s open and has an entries close date. Men’s ones show to men, Ladies’ to ladies; a Mixed pair is one of each.</span>
    <div class="card list">${comps.map(c => `<div class="lrow linkrow hutrow" data-sc="${c.id}" role="button" tabindex="0"><span class="who"><strong>${esc(c.name)}</strong>
      <small>${CAT[c.category]} · ${c.kind === 'pairs' ? 'Pairs' : 'Singles'} · ${c.open && c.closesOn ? `Open: entries close ${eventDates(c.closesOn, 1)}` : 'Hidden'}</small></span>
      <b class="num">${count(c.id)}${c.maxEntries ? ` / ${c.maxEntries}` : ''} <small>${c.kind === 'pairs' ? 'pairs' : 'entered'}</small></b></div>`).join('') || '<div class="empty-state">None yet.</div>'}</div>
    <button class="ghost dashed" id="sc-add">+ Add a competition</button>
  </div>`
  document.querySelectorAll('[data-sc]').forEach(r => {
    r.onclick = () => sheet(comps.find(c => c.id === +r.dataset.sc), entries, members)
    r.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); r.click() } }
  })
  $('sc-add').onclick = () => sheet(null, entries, members)
  if (open) sheet(null, entries, members)
}

// The competition's settings and entries: a pop-up over the list, or (with leave) the whole page.
function sheet(c, entries, members, leave = null) {
  const name = id => members.find(m => m.id === id)?.name ?? 'Former member'
  const rows = c ? entries.filter(e => e.compId === c.id) : [], label = e => (e.partnerId ? `${name(e.memberId)} & ${name(e.partnerId)}` : name(e.memberId))
  const list = rows.map(label), az = azList(rows, e => name(e.memberId), `sc${c?.id}`) // over 25: by the (first) player's surname
  const v = c ?? { name: '', category: 'men', kind: 'singles', closesOn: '', notes: '', open: false }
  const form = `<form class="${leave ? 'card evsec' : 'sheet'}" id="sc-form" novalidate aria-labelledby="sct">
    <h4 id="sct">${c ? esc(c.name) : 'Add a competition'}</h4>
    <label for="sc-name">Name</label><input id="sc-name" maxlength="60" autocomplete="off" placeholder="e.g. Men’s Match Play" value="${esc(v.name)}">
    <label for="sc-cat">Who can enter</label><select id="sc-cat" class="plainsel">${Object.entries(CAT).map(([k, n]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${n}${k === 'mixed' ? ' (a pair is one man and one lady)' : k === 'open' ? ' (anyone)' : ''}</option>`).join('')}</select>
    <label for="sc-kind">Entries are</label><select id="sc-kind" class="plainsel"><option value="singles" ${v.kind === 'singles' ? 'selected' : ''}>Singles</option><option value="pairs" ${v.kind === 'pairs' ? 'selected' : ''}>Pairs</option></select>
    <label for="sc-close">Entries close</label><input id="sc-close" type="date" class="plainsel" value="${v.closesOn ?? ''}">
    <label for="sc-max">Maximum entries <span class="opt">optional · first come, first served</span></label><input id="sc-max" inputmode="numeric" autocomplete="off" placeholder="e.g. 32" value="${v.maxEntries ?? ''}">
    <label for="sc-notes">Notes <span class="opt">optional · e.g. £5 entry, first round by 15 Nov</span></label><input id="sc-notes" maxlength="300" autocomplete="off" value="${esc(v.notes ?? '')}">
    <div class="actrow"><span class="who"><strong>Open for entries</strong><small>Members see it under Events</small></span><button type="button" class="switch" role="switch" id="sc-open" aria-checked="${!!v.open}" aria-label="Open for entries"><span></span></button></div>
    <p class="gerr" id="sc-err" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="sc-cancel">Cancel</button><button type="submit" class="primary">${c ? 'Save' : 'Add'}</button></div>
    ${c ? `<span class="kicker">Entered (${list.length})</span>${az.bar}<div class="card list">${az.shown.map(label).map(n => `<div class="lrow hutrow"><span class="who"><strong>${esc(n)}</strong></span><span></span></div>`).join('') || '<div class="empty-state">Nobody yet.</div>'}</div>
      ${list.length ? '<button type="button" class="ghost" id="sc-share">Share the entry list</button>' : ''}
      <button type="button" class="primary" id="sc-draw">${c.drawPublished ? 'The draw' : 'Make or see the draw'}</button>
      <button type="button" class="ghost accremove" id="sc-del">Delete competition</button>` : ''}
  </form>`
  if (leave) $('main').innerHTML = `<div class="screen">${form}</div>`
  else $('modal').innerHTML = `<div class="overlay" id="ovl">${form}</div>`
  wireAz(() => sheet(c, entries, members, leave))
  let open = !!v.open
  const close = () => { $('modal').innerHTML = '' }
  $('sc-cancel').onclick = leave ? () => leave() : close
  if ($('ovl')) $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('sc-open').onclick = () => { open = !open; $('sc-open').setAttribute('aria-checked', open) }
  $('sc-form').onsubmit = async e => {
    e.preventDefault()
    const max = $('sc-max').value.trim()
    const row = { id: c?.id, name: $('sc-name').value, category: $('sc-cat').value, kind: $('sc-kind').value, closesOn: $('sc-close').value, notes: $('sc-notes').value, open, maxEntries: max ? +max : null }
    const err = !row.name.trim() ? 'Give it a name.' : open && !row.closesOn ? 'Set when entries close before opening it.' : max && !(+max >= 2) ? 'Maximum entries is a number, 2 or more.' : ''
    if (err) { $('sc-err').textContent = err; return }
    try { await api.saveSignup(row) } catch (er) { $('sc-err').textContent = er.message; return }
    if (leave) { await leave(c ? `s:${c.id}` : null); toast(`${row.name.trim()} saved`); return }
    close(); await keepScroll(render); toast(`${row.name.trim()} saved`)
  }
  if ($('sc-share')) $('sc-share').onclick = async () => {
    const text = `${c.name}: ${list.length} ${c.kind === 'pairs' ? 'pairs' : 'entries'}\n${list.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
    try { if (navigator.share) await navigator.share({ title: c.name, text }); else { await navigator.clipboard.writeText(text); toast('Entry list copied') } } catch { /* closed the share sheet */ }
  }
  if ($('sc-draw')) $('sc-draw').onclick = async () => { close(); Object.assign(S, { koComp: c.id, koRound: null, koFrom: 'signups', aview: 'ko' }); await render() }
  if ($('sc-del')) $('sc-del').onclick = async () => {
    const b = $('sc-del')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = list.length ? `Tap again: delete it and its ${list.length} entr${list.length === 1 ? 'y' : 'ies'}` : 'Tap again to delete'; return }
    try { await api.deleteSignup(c.id) } catch (er) { toast(er.message); return }
    if (leave) { await leave(); toast(`${c.name} deleted`); return }
    close(); await keepScroll(render); toast(`${c.name} deleted`)
  }
}
