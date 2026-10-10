// Club admin → Sign-up competitions: the season competitions members put their names down for. Add or change one
// (name, Men's / Ladies' / Mixed / Open, Singles / Pairs, entries close, notes, open), see and share who has
// entered, and delete. Hidden ones (not open) members don't see.
import * as api from '../api.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { toAdmin } from './nav.js'
import { eventDates } from '../dates.js'

const CAT = { men: 'Men’s', ladies: 'Ladies’', mixed: 'Mixed', open: 'Open' }

export async function load() {
  const [signups, members] = await Promise.all([api.getSignups(), api.getMembers()])
  return { ...signups, members }
}

export function draw({ comps, entries, members }) {
  header('Sign-up competitions', 'Season competitions members enter in advance', toAdmin)
  const count = id => entries.filter(e => e.compId === id).length
  $('main').innerHTML = `<div class="screen">
    <span class="hint">Members see a competition under Competitions → Events once it’s open and has an entries close date. Men’s ones show to men, Ladies’ to ladies; a Mixed pair is one of each.</span>
    <div class="card list">${comps.map(c => `<div class="lrow linkrow hutrow" data-sc="${c.id}" role="button" tabindex="0"><span class="who"><strong>${esc(c.name)}</strong>
      <small>${CAT[c.category]} · ${c.kind === 'pairs' ? 'Pairs' : 'Singles'} · ${c.open && c.closesOn ? `Open: entries close ${eventDates(c.closesOn, 1)}` : 'Hidden'}</small></span>
      <b class="num">${count(c.id)} <small>${c.kind === 'pairs' ? 'pairs' : 'entered'}</small></b></div>`).join('') || '<div class="empty-state">None yet.</div>'}</div>
    <button class="ghost dashed" id="sc-add">+ Add a competition</button>
  </div>`
  document.querySelectorAll('[data-sc]').forEach(r => {
    r.onclick = () => sheet(comps.find(c => c.id === +r.dataset.sc), entries, members)
    r.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); r.click() } }
  })
  $('sc-add').onclick = () => sheet(null, entries, members)
}

function sheet(c, entries, members) {
  const name = id => members.find(m => m.id === id)?.name ?? 'Former member'
  const list = c ? entries.filter(e => e.compId === c.id).map(e => (e.partnerId ? `${name(e.memberId)} & ${name(e.partnerId)}` : name(e.memberId))) : []
  const v = c ?? { name: '', category: 'men', kind: 'singles', closesOn: '', notes: '', open: false }
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="sc-form" novalidate aria-labelledby="sct">
    <h4 id="sct">${c ? esc(c.name) : 'Add a competition'}</h4>
    <label for="sc-name">Name</label><input id="sc-name" maxlength="60" autocomplete="off" placeholder="e.g. Men’s Match Play" value="${esc(v.name)}">
    <label for="sc-cat">Who can enter</label><select id="sc-cat" class="plainsel">${Object.entries(CAT).map(([k, n]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${n}${k === 'mixed' ? ' (a pair is one man and one lady)' : k === 'open' ? ' (anyone)' : ''}</option>`).join('')}</select>
    <label for="sc-kind">Entries are</label><select id="sc-kind" class="plainsel"><option value="singles" ${v.kind === 'singles' ? 'selected' : ''}>Singles</option><option value="pairs" ${v.kind === 'pairs' ? 'selected' : ''}>Pairs</option></select>
    <label for="sc-close">Entries close</label><input id="sc-close" type="date" class="plainsel" value="${v.closesOn ?? ''}">
    <label for="sc-notes">Notes <span class="opt">optional · e.g. £5 entry, first round by 15 Nov</span></label><input id="sc-notes" maxlength="300" autocomplete="off" value="${esc(v.notes ?? '')}">
    <div class="actrow"><span class="who"><strong>Open for entries</strong><small>Members see it under Events</small></span><button type="button" class="switch" role="switch" id="sc-open" aria-checked="${!!v.open}" aria-label="Open for entries"><span></span></button></div>
    <p class="gerr" id="sc-err" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="sc-cancel">Cancel</button><button type="submit" class="primary">${c ? 'Save' : 'Add'}</button></div>
    ${c ? `<span class="kicker">Entered (${list.length})</span><div class="card list">${list.map(n => `<div class="lrow hutrow"><span class="who"><strong>${esc(n)}</strong></span><span></span></div>`).join('') || '<div class="empty-state">Nobody yet.</div>'}</div>
      ${list.length ? '<button type="button" class="ghost" id="sc-share">Share the entry list</button>' : ''}
      <button type="button" class="ghost accremove" id="sc-del">Delete competition</button>` : ''}
  </form></div>`
  let open = !!v.open
  const close = () => { $('modal').innerHTML = '' }
  $('sc-cancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('sc-open').onclick = () => { open = !open; $('sc-open').setAttribute('aria-checked', open) }
  $('sc-form').onsubmit = async e => {
    e.preventDefault()
    const row = { id: c?.id, name: $('sc-name').value, category: $('sc-cat').value, kind: $('sc-kind').value, closesOn: $('sc-close').value, notes: $('sc-notes').value, open }
    const err = !row.name.trim() ? 'Give it a name.' : open && !row.closesOn ? 'Set when entries close before opening it.' : ''
    if (err) { $('sc-err').textContent = err; return }
    try { await api.saveSignup(row) } catch (er) { $('sc-err').textContent = er.message; return }
    close(); await keepScroll(render); toast(`${row.name.trim()} saved`)
  }
  if ($('sc-share')) $('sc-share').onclick = async () => {
    const text = `${c.name}: ${list.length} ${c.kind === 'pairs' ? 'pairs' : 'entries'}\n${list.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
    try { if (navigator.share) await navigator.share({ title: c.name, text }); else { await navigator.clipboard.writeText(text); toast('Entry list copied') } } catch { /* closed the share sheet */ }
  }
  if ($('sc-del')) $('sc-del').onclick = async () => {
    const b = $('sc-del')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = list.length ? `Tap again: delete it and its ${list.length} entr${list.length === 1 ? 'y' : 'ies'}` : 'Tap again to delete'; return }
    try { await api.deleteSignup(c.id) } catch (er) { toast(er.message); return }
    close(); await keepScroll(render); toast(`${c.name} deleted`)
  }
}
