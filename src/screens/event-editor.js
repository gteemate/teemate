// Admin → Events → New/Edit: set up an event in advance in five steps:
// details, players, teams, draw (Ryder Cup), review. Scores come from players' own cards on the day.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, top0, render, toast, fmtHcp } from '../ui.js'
import { addDaysIso, eventDates, isoDate, today } from '../dates.js'

export const EVENT_TYPES = {
  ryder: { name: 'Ryder Cup', desc: 'Two teams. Pairs play better-ball matches, 1 point each.', formats: [['bbl', 'Better ball · off the low'], ['bbstab', 'Better ball · Stableford'], ['bbscr', 'Better ball · scratch']] },
  teams: { name: 'Team Stableford', desc: 'Two teams. Everyone’s Stableford points count for their team.', formats: [['teamstab', 'Team Stableford']] },
  individual: { name: 'Individual', desc: 'A leaderboard of everyone: Stableford or net.', formats: [['stab', 'Stableford'], ['net', 'Net strokeplay']] },
}
export const eventFormat = e => EVENT_TYPES[e.style].formats.find(f => f[0] === e.fmt)?.[1] ?? ''

const STEPS = { 1: 'Details', 2: 'Players', 3: 'Teams', 4: 'Draw', 5: 'Review' }
const stepsFor = style => (style === 'ryder' ? [1, 2, 3, 4, 5] : style === 'teams' ? [1, 2, 3, 5] : [1, 2, 5])

export async function load() {
  const [events, members, me] = await Promise.all([api.getEvents(), api.getMembers(), api.getMe()])
  if (!S.ev) {
    const e = S.evId && events.find(x => x.id === S.evId)
    S.ev = e ? structuredClone(e) : {
      name: '', startDate: addDaysIso(isoDate(today()), 1), days: 1, style: 'ryder', fmt: 'bbl', club: false,
      players: [me.id], team: {}, matches: {}, A: { name: 'Blues', col: '#19335A' }, B: { name: 'Reds', col: '#762A43' },
    }
  }
  return { members, me }
}

const leave = async () => { S.ev = null; S.evQ = ''; S.evSwap = null; S.aview = 'events'; await render(); top0() }
const teamOf = (ev, id) => ev.team[id]
const sideIds = (ev, t) => ev.players.filter(id => teamOf(ev, id) === t)

/** What's wrong with the event at a step ('' if fine). */
function problem(ev, step) {
  if (step === 1) {
    if (!ev.name.trim()) return 'Give the event a name.'
    if (!ev.startDate || ev.startDate < isoDate(today())) return 'Pick a first day from today on.'
  }
  if (step === 2) {
    if (ev.players.length < 2) return 'Pick at least two players.'
    if (ev.style === 'ryder' && ev.players.length % 4) return `Ryder Cup needs a multiple of 4 players (pairs v pairs). You have ${ev.players.length}.`
    if (ev.style === 'teams' && ev.players.length % 2) return `Two equal teams need an even number of players. You have ${ev.players.length}.`
  }
  if (step === 3) {
    const a = sideIds(ev, 'A').length, b = sideIds(ev, 'B').length
    if (a + b !== ev.players.length) return 'Put everyone on a team.'
    if (a !== b) return `The teams need the same number of players (${a} v ${b}).`
    if (!ev.A.name.trim() || !ev.B.name.trim()) return 'Give both teams a name.'
  }
  if (step === 4) {
    for (let d = 1; d <= ev.days; d++) if (!(ev.matches[d] ?? []).length) return `Draw the matches for day ${d}.`
  }
  return ''
}

// Snake order by handicap (A B B A …) keeps the teams' average index close.
function autoBalance(ev, members) {
  const hcp = id => members.find(m => m.id === id)?.hcp ?? 54
  ev.team = {}
  ;[...ev.players].sort((x, y) => hcp(x) - hcp(y)).forEach((id, n) => (ev.team[id] = [0, 3].includes(n % 4) ? 'A' : 'B'))
  ev.matches = {}
}
const shuffle = xs => xs.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1])
function draw1(ev, d) {
  const a = shuffle(sideIds(ev, 'A')), b = shuffle(sideIds(ev, 'B'))
  ev.matches[d] = Array.from({ length: a.length / 2 }, (_, k) => ({ a: [a[2 * k], a[2 * k + 1]], b: [b[2 * k], b[2 * k + 1]] }))
}

export function draw({ members, me }) {
  const ev = S.ev, steps = stepsFor(ev.style)
  if (!steps.includes(S.evStep)) S.evStep = steps[0]
  const step = S.evStep, idx = steps.indexOf(step)
  const byId = id => members.find(m => m.id === id)
  const name = id => byId(id)?.name ?? '?'
  header(ev.id ? 'Edit event' : 'New event', STEPS[step], async () => { if (idx > 0) { S.evStep = steps[idx - 1]; keepScroll(render) } else leave() })
  const wiz = `<div class="wiz">${steps.map((s, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div>`
  let body = ''

  if (step === 1) {
    body = `<div class="card evsec"><h4>Event</h4>
        <label for="ev-name">Name</label><input id="ev-name" value="${esc(ev.name)}" maxlength="60" placeholder="e.g. Saturday Fourball Cup">
        <div class="tnames"><div><label for="ev-date">First day</label><input id="ev-date" type="date" value="${ev.startDate}" min="${isoDate(today())}"></div>
          <div><label>Days</label><div class="daychips">${[1, 2, 3].map(n => `<button data-days="${n}" aria-pressed="${ev.days === n}">${n}</button>`).join('')}</div></div></div>
        <span class="hint">${ev.startDate ? eventDates(ev.startDate, ev.days) : ''}${ev.days > 1 ? '. Points add up across the days.' : ''}</span></div>
      <h3>Format</h3>
      <div class="games">${Object.entries(EVENT_TYPES).map(([k, t]) => `<button class="gamecard" role="radio" aria-checked="${ev.style === k}" data-style="${k}"><span class="radio"></span><span class="who"><strong>${t.name}</strong><small>${t.desc}</small></span></button>`).join('')}</div>
      ${EVENT_TYPES[ev.style].formats.length > 1 ? `<div class="card evsec"><label for="ev-fmt">${ev.style === 'ryder' ? 'Match format' : 'Scoring'}</label><select id="ev-fmt" class="plainsel">${EVENT_TYPES[ev.style].formats.map(([k, n]) => `<option value="${k}" ${ev.fmt === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${me.admin ? `<div class="card evsec"><div class="actrow"><span class="who"><strong>Club event</strong><small>Everyone in the club sees it on the Leaderboard</small></span><button class="switch" role="switch" aria-checked="${ev.club}" id="ev-club" aria-label="Club event"><span></span></button></div>
        <span class="hint">${ev.club ? 'Everyone in the club will see this event.' : 'Only the players in it will see this event.'}</span></div>` : '<div class="hint">Only the players you pick will see this event.</div>'}`
  } else if (step === 2) {
    const q = (S.evQ || '').trim().toLowerCase()
    const list = members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q))
    body = `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="ev-q" type="search" placeholder="Name or GUI number" value="${esc(S.evQ || '')}" autocomplete="off"></div>
      <div class="hint"><b class="count">${ev.players.length} picked</b>${ev.style === 'ryder' ? ' · Ryder Cup needs a multiple of 4 (pairs v pairs)' : ev.style === 'teams' ? ' · an even number for two equal teams' : ''}. Members only.</div>
      <div class="pick">${list.map(m => { const on = ev.players.includes(m.id); return `<button class="brow" data-pick="${m.id}" aria-pressed="${on}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</strong><small>Index ${fmtHcp(m.hcp)}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
  } else if (step === 3) {
    const avg = ids => (ids.length ? (ids.reduce((t, id) => t + (byId(id)?.hcp ?? 0), 0) / ids.length).toFixed(1) : '–')
    const A = sideIds(ev, 'A'), B = sideIds(ev, 'B')
    body = `<div class="card evsec"><div class="tnames">
        <div><label for="ev-an">Team name</label><div class="trowin"><input id="ev-an" value="${esc(ev.A.name)}" maxlength="24"><input type="color" id="ev-ac" value="${ev.A.col}" aria-label="Colour"></div></div>
        <div><label for="ev-bn">Team name</label><div class="trowin"><input id="ev-bn" value="${esc(ev.B.name)}" maxlength="24"><input type="color" id="ev-bc" value="${ev.B.col}" aria-label="Colour"></div></div></div></div>
      <div class="tcards"><div style="background:${ev.A.col}"><small>${esc(ev.A.name)}</small><b>${A.length}</b><small>avg index ${avg(A)}</small></div><div style="background:${ev.B.col}"><small>${esc(ev.B.name)}</small><b>${B.length}</b><small>avg index ${avg(B)}</small></div></div>
      <div class="bk-btns"><button class="ghost" id="ev-bal">Auto-balance by handicap</button><button class="ghost" id="ev-shuf">Shuffle</button></div>
      <div class="card evsec"><div class="tlist">${ev.players.map(id => `<div class="trow"><span class="who"><strong>${esc(name(id))}</strong><small>Index ${fmtHcp(byId(id)?.hcp)}</small></span><span class="tseg"><button data-tm="${id}" data-t="A" aria-pressed="${teamOf(ev, id) === 'A'}" style="--tc:${ev.A.col}">${esc(ev.A.name)}</button><button data-tm="${id}" data-t="B" aria-pressed="${teamOf(ev, id) === 'B'}" style="--tc:${ev.B.col}">${esc(ev.B.name)}</button></span></div>`).join('')}</div></div>`
  } else if (step === 4) {
    const sw = S.evSwap
    const who = (d, id) => `<button class="swapname${sw && sw.d === d && sw.id === id ? ' on' : ''}" data-sw="${d}:${id}">${esc(sur(name(id)))}</button>`
    body = `<div class="hint">Each match is a four-ball. Players book a tee time together as usual; the board scores each match from their cards. Tap two players on the same team to swap them.</div>
      ${Array.from({ length: ev.days }, (_, i) => i + 1).map(d => `<div class="card evsec"><div class="pinhead"><h4 style="font-size:20px">Day ${d} · ${eventDates(addDaysIso(ev.startDate, d - 1), 1)}</h4><button class="linkbtn" data-draw="${d}">${(ev.matches[d] ?? []).length ? 'Redraw' : 'Draw matches'}</button></div>
        ${(ev.matches[d] ?? []).map((m, k) => `<div class="matchedit"><span style="color:${ev.A.col}">${who(d, m.a[0])} &amp; ${who(d, m.a[1])}</span><span class="v">v</span><span class="r" style="color:${ev.B.col}">${who(d, m.b[0])} &amp; ${who(d, m.b[1])}</span></div>`).join('') || '<span class="hint">Not drawn yet.</span>'}</div>`).join('')}`
  } else {
    const A = sideIds(ev, 'A'), B = sideIds(ev, 'B')
    body = `<div class="card evsec"><h4>${esc(ev.name)}</h4><div class="sumgrid">
        <span>When</span><b>${eventDates(ev.startDate, ev.days)}${ev.days > 1 ? ` (${ev.days} days)` : ''}</b>
        <span>Format</span><b>${EVENT_TYPES[ev.style].name}${ev.style !== 'teams' ? ` · ${eventFormat(ev)}` : ''}</b>
        <span>Players</span><b>${ev.players.length} members</b>
        ${ev.style !== 'individual' ? `<span>Teams</span><b>${esc(ev.A.name)} ${A.length} · ${esc(ev.B.name)} ${B.length}</b>` : ''}
        ${ev.style === 'ryder' ? `<span>Matches</span><b>${Object.values(ev.matches).flat().length} · 1 point each</b>` : ''}
        <span>Who sees it</span><b>${ev.club ? 'Everyone in the club' : 'Only these players'}</b>
        <span>Scoring</span><b>Live from each player’s own card</b></div></div>
      <div class="hint">Players see it on their Leaderboard tab on the day${ev.days > 1 ? 's' : ''}. ${me.admin ? 'As an admin you can change it any time.' : 'You can change it until the first day.'}</div>
      ${ev.id ? '<button class="ghost accremove" id="ev-del">Delete event</button>' : ''}`
  }

  const last = idx === steps.length - 1
  $('main').innerHTML = `<div class="screen">${wiz}${body}<p class="gerr" id="ev-err" role="alert"></p></div>
    <div class="cta"><button class="primary" id="ev-next">${last ? (ev.id ? 'Save changes' : 'Save event') : `Next: ${STEPS[steps[idx + 1]].toLowerCase()}`}</button></div>`

  const redraw = () => keepScroll(render)
  const read = () => {
    if ($('ev-name')) { ev.name = $('ev-name').value; ev.startDate = $('ev-date').value; if ($('ev-fmt')) ev.fmt = $('ev-fmt').value }
    if ($('ev-an')) { ev.A = { name: $('ev-an').value, col: $('ev-ac').value }; ev.B = { name: $('ev-bn').value, col: $('ev-bc').value } }
  }
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f }
  document.querySelectorAll('[data-days]').forEach(b => (b.onclick = () => { read(); ev.days = +b.dataset.days; ev.matches = {}; redraw() }))
  document.querySelectorAll('[data-style]').forEach(b => (b.onclick = () => { read(); ev.style = b.dataset.style; ev.fmt = EVENT_TYPES[ev.style].formats[0][0]; redraw() }))
  if ($('ev-date')) $('ev-date').onchange = () => { read(); redraw() }
  on('ev-club', () => { read(); ev.club = !ev.club; redraw() })
  const qi = $('ev-q')
  if (qi) qi.oninput = () => { S.evQ = qi.value; const p = qi.selectionStart; render().then(() => { const n = $('ev-q'); n.focus(); n.setSelectionRange(p, p) }) }
  document.querySelectorAll('[data-pick]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.pick
    ev.players = ev.players.includes(id) ? ev.players.filter(x => x !== id) : [...ev.players, id]
    delete ev.team[id]
    ev.matches = {}
    redraw()
  }))
  document.querySelectorAll('[data-tm]').forEach(b => (b.onclick = () => { read(); ev.team[+b.dataset.tm] = b.dataset.t; ev.matches = {}; redraw() }))
  ;['ev-an', 'ev-bn', 'ev-ac', 'ev-bc'].forEach(id => { if ($(id)) $(id).onchange = () => { read(); redraw() } })
  on('ev-bal', () => { read(); autoBalance(ev, members); redraw() })
  on('ev-shuf', () => { read(); ev.team = {}; shuffle(ev.players).forEach((id, n) => (ev.team[id] = n % 2 ? 'B' : 'A')); ev.matches = {}; redraw() })
  document.querySelectorAll('[data-draw]').forEach(b => (b.onclick = () => { draw1(ev, +b.dataset.draw); S.evSwap = null; redraw() }))
  document.querySelectorAll('[data-sw]').forEach(b => (b.onclick = () => {
    const [d, id] = b.dataset.sw.split(':').map(Number), sw = S.evSwap
    if (!sw || sw.d !== d) { S.evSwap = { d, id }; return redraw() }
    if (sw.id !== id && teamOf(ev, sw.id) === teamOf(ev, id)) {
      for (const m of ev.matches[d]) for (const side of ['a', 'b']) m[side] = m[side].map(x => (x === id ? sw.id : x === sw.id ? id : x))
    }
    S.evSwap = null
    redraw()
  }))
  on('ev-del', async () => {
    const b = $('ev-del')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete this event'; return }
    try { await api.deleteEvent(ev.id) } catch (e) { $('ev-err').textContent = e.message; return }
    await leave()
    toast('Event deleted')
  })
  $('ev-next').onclick = async () => {
    read()
    const p = problem(ev, step)
    if (p) { $('ev-err').textContent = p; return }
    if (step === 3 && ev.style === 'ryder') for (let d = 1; d <= ev.days; d++) if (!(ev.matches[d] ?? []).length) draw1(ev, d) // start with a draw
    if (!last) { S.evStep = steps[idx + 1]; S.evSwap = null; await render(); top0(); return }
    if (ev.style !== 'ryder') ev.matches = {}
    if (ev.style === 'individual') ev.team = {}
    $('ev-next').disabled = true
    try { await api.saveEvent(ev) } catch (e) { $('ev-err').textContent = e.message; $('ev-next').disabled = false; return }
    const saved = ev.name
    await leave()
    toast(`${saved} saved`)
  }
}
