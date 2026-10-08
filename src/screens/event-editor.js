// Admin → Events → an event: details, who's playing, teams, and the match draw. Every change saves.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, top0, render, toast } from '../ui.js'
import { hhmm } from '../dates.js'

const FORMATS = ['Better ball · off the low', 'Better ball · Stableford', 'Better ball · scratch']

export async function load() {
  const [events, members, me] = await Promise.all([api.getEvents(), api.getMembers(), api.getMe()])
  return { e: events.find(x => x.id === S.evId), members, me }
}

const avgIdx = (ids, byId) => (ids.length ? (ids.reduce((t, id) => t + byId(id).hcp, 0) / ids.length).toFixed(1) : '–')
const shuffle = xs => xs.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1])

export function draw({ e, members, me }) {
  const byId = id => members.find(m => m.id === id)
  const sel = e.players, teamIds = t => sel.filter(id => e.team[id] === t), A = teamIds('A'), B = teamIds('B'), un = sel.filter(id => !e.team[id])
  header('Event', esc(e.name), async () => { S.aview = 'events'; await render(); top0() })
  const evenOK = A.length === B.length && A.length >= 2 && A.length % 2 === 0 && !un.length
  const playerRows = S.evStep === 1
    ? members.map(p => { const on = sel.includes(p.id); return `<button class="brow" data-pl="${p.id}" aria-pressed="${on}"><span class="av">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</strong><small>Index ${p.hcp}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')
    : sel.map(id => { const p = byId(id), t = e.team[id]; return `<div class="trow"><span class="who"><strong>${esc(p.name)}</strong><small>${p.hcp}</small></span><span class="tseg"><button data-tm="${id}" data-t="A" aria-pressed="${t === 'A'}" style="--tc:${e.A.col}">${esc(e.A.name)}</button><button data-tm="${id}" data-t="B" aria-pressed="${t === 'B'}" style="--tc:${e.B.col}">${esc(e.B.name)}</button></span></div>` }).join('') || '<div class="empty-state">Pick who\'s playing first.</div>'
  const names = ids => ids.map(id => esc(sur(byId(id).name))).join(' & ')

  $('main').innerHTML = `<div class="screen">
   <div class="card evsec"><h4>Event</h4>
     <label for="ev-name">Name</label><input id="ev-name" value="${esc(e.name)}">
     <div class="tnames"><div><label for="ev-a">Team A name</label><div class="trowin"><input id="ev-a" value="${esc(e.A.name)}"><input type="color" id="ev-ac" value="${e.A.col}" aria-label="Team A colour"></div></div>
       <div><label for="ev-b">Team B name</label><div class="trowin"><input id="ev-b" value="${esc(e.B.name)}"><input type="color" id="ev-bc" value="${e.B.col}" aria-label="Team B colour"></div></div></div>
     <div class="tnames"><div><label for="ev-days">Days</label><select id="ev-days" class="plainsel">${[1, 2, 3].map(n => `<option ${n === e.days ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
       <div><label for="ev-fmt">Match format</label><select id="ev-fmt" class="plainsel">${FORMATS.map(f => `<option ${f === e.format ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>
     <div class="actrow"><span class="who"><strong>Active event</strong><small>Shown on the Leaderboard tab</small></span><button class="switch" role="switch" aria-checked="${e.active}" id="ev-act" aria-label="Active event"><span></span></button></div>
     <button class="primary" id="ev-save" style="align-self:flex-start;padding:13px 22px">Save event</button></div>
   <div class="card evsec"><div class="pinhead"><h4>Players</h4>${evenOK ? '<span class="okpill">Teams ✓</span>' : ''}</div>
     <span class="hint">${sel.length} playing${A.length || B.length ? ` · ${A.length} v ${B.length}` : ''}</span>
     <div class="steps"><button data-st="1" aria-pressed="${S.evStep === 1}">1 · Who's playing${sel.length ? ' ✓' : ''}</button><button data-st="2" aria-pressed="${S.evStep === 2}">2 · Teams</button></div>
     ${S.evStep === 2 ? `<div class="tcards"><div style="background:${e.A.col}"><small>${esc(e.A.name)}</small><b>${A.length}</b><small>avg index ${avgIdx(A, byId)}</small></div><div style="background:${e.B.col}"><small>${esc(e.B.name)}</small><b>${B.length}</b><small>avg index ${avgIdx(B, byId)}</small></div></div>
       <div class="bk-btns"><button class="ghost" id="ev-bal">Auto-balance</button><button class="primary" id="ev-tsave">Save teams</button></div>
       ${un.length ? `<div class="hint">${un.length} player${un.length > 1 ? 's' : ''} still to put on a team.</div>` : ''}` : ''}
     <div class="${S.evStep === 1 ? 'pick' : 'tlist'}">${playerRows}</div>
     ${S.evStep === 1 ? `<button class="primary" id="ev-next" ${sel.length < 4 ? 'disabled' : ''}>Next: pick teams</button>` : ''}</div>
   <div class="card evsec"><h4>Matches</h4><span class="hint">${esc(e.format)} · 1 point a match, ½ for a half.</span>
     ${evenOK ? [...Array(e.days)].map((_, d) => { const ms = e.matches[d + 1] || []; return `<div class="dayblk"><div class="pinhead"><b>Day ${d + 1}</b><button class="linkbtn" data-draw="${d + 1}">${ms.length ? 'Redraw' : 'Draw matches'}</button></div>
       ${ms.length ? ms.map(m => `<div class="mrow"><span class="hint">${m.tee}</span><span style="color:${e.A.col}">${names(m.a)}</span><span class="hint">v</span><span style="color:${e.B.col}">${names(m.b)}</span></div>`).join('') : '<span class="hint">Not drawn yet.</span>'}</div>` }).join('')
     : '<div class="hint">Teams need the same number of players, in twos, before matches can be drawn.</div>'}</div>
  </div>`

  // Read the form fields into the event, save it, and redraw.
  const readFields = () => {
    e.name = $('ev-name').value.trim() || e.name
    e.A.name = $('ev-a').value.trim() || e.A.name
    e.B.name = $('ev-b').value.trim() || e.B.name
    e.A.col = $('ev-ac').value
    e.B.col = $('ev-bc').value
    e.days = +$('ev-days').value
    e.format = $('ev-fmt').value
  }
  const save = async (change, msg) => {
    readFields()
    change?.()
    await api.saveEvent(e)
    await keepScroll(render)
    if (msg) toast(typeof msg === 'function' ? msg() : msg)
  }
  ;['ev-ac', 'ev-bc', 'ev-days', 'ev-fmt'].forEach(id => ($(id).onchange = () => save()))
  $('ev-act').onclick = () => save(() => (e.active = !e.active), () => (e.active ? `${e.name} is on the Leaderboard tab` : 'Event hidden from the Leaderboard'))
  $('ev-save').onclick = () => save(null, 'Event saved')
  document.querySelectorAll('[data-st]').forEach(b => (b.onclick = () => save(() => (S.evStep = +b.dataset.st))))
  document.querySelectorAll('[data-pl]').forEach(b => (b.onclick = () => save(() => {
    const id = +b.dataset.pl
    if (sel.includes(id)) { e.players = sel.filter(x => x !== id); delete e.team[id] } else e.players = [...sel, id]
  })))
  document.querySelectorAll('[data-tm]').forEach(b => (b.onclick = () => save(() => (e.team[+b.dataset.tm] = b.dataset.t))))
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f }
  on('ev-next', () => save(() => (S.evStep = 2)))
  // Snake order by index (A B B A …) keeps the teams' average index close.
  on('ev-bal', () => save(() => {
    ;[...sel].sort((a, b) => byId(a).hcp - byId(b).hcp).forEach((id, n) => (e.team[id] = [0, 3].includes(n % 4) ? 'A' : 'B'))
    e.matches = {}
  }, 'Teams balanced by index'))
  on('ev-tsave', () => save(null, evenOK ? 'Teams saved' : "Saved. Teams aren't even yet"))
  document.querySelectorAll('[data-draw]').forEach(b => (b.onclick = () => {
    const d = +b.dataset.draw
    save(() => {
      const a = shuffle(A), bb = shuffle(B)
      e.matches[d] = [...Array(a.length / 2)].map((_, k) => ({ a: [a[2 * k], a[2 * k + 1]], b: [bb[2 * k], bb[2 * k + 1]], tee: hhmm(12 * 60 + 10 * k), res: { st: 'ns' } }))
    }, `Day ${d} matches drawn`)
  }))
}
