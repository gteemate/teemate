// Scores → Play an event with other groups: pick one or more groups booked the same day, then set
// the style, format and teams in a pop-up and send the invitations.
// The same pop-up suggests changes to an invitation (S.pe.counter = the event): same groups,
// starting from what's on the table.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, toast, top0 } from '../ui.js'
import { EVENT_STYLES, EVENT_FORMATS } from '../games.js'
import { fromIso, isoDate, longDay, hhmm, today } from '../dates.js'

export const freshDraft = (date = null) => ({ date, host: null, invited: [], style: 'fourball', format: 'best2', names: { A: 'Blues', B: 'Reds' }, teams: {}, sheet: false })

/** A draft for suggesting changes to event e, starting from its current game and teams. */
export function counterDraft(e) {
  const groups = e.groups.map(g => ({ id: g.slot, time: g.time, players: e.players.filter(p => p.slot === g.slot) }))
  const pick = e.style !== 'fourball'
  return {
    ...freshDraft(e.date), counter: e, groups, sheet: true, style: e.style, format: e.format,
    names: pick ? { A: e.teamNames.A, B: e.teamNames.B } : { A: 'Blues', B: 'Reds' },
    teams: pick ? Object.fromEntries(e.players.map(p => [p.id, p.team])) : {},
  }
}

export async function load() {
  S.pe ??= freshDraft()
  if (S.pe.counter) return { me: await api.getMe() }
  const [me, bookings] = await Promise.all([api.getMe(), api.getMyBookings()])
  const dates = [...new Set(bookings.map(b => b.date))].sort()
  const d = S.pe.date && dates.includes(S.pe.date) ? S.pe.date : dates[0]
  const sheet = d ? await api.getTeeSheet(d) : []
  return { me, dates, date: d, sheet }
}

const back = async () => { S.sview = 'card'; S.pe = null; await render(); top0() }
// Redraw keeping the page and the pop-up scrolled where they were.
async function redraw() {
  const page = (matchMedia('(max-width:460px)').matches ? document.scrollingElement : $('main')).scrollTop, sh = $('pesheet')?.scrollTop
  await render()
  ;(matchMedia('(max-width:460px)').matches ? document.scrollingElement : $('main')).scrollTop = page
  if (sh != null && $('pesheet')) $('pesheet').scrollTop = sh
}

export function draw({ me, dates, date, sheet }) {
  if (S.pe.counter) return drawCounter(me)
  header('Play an event', 'Challenge other groups on your day', back)
  if (!date) {
    $('main').innerHTML = '<div class="screen"><div class="empty-state">Book a tee time first. Then you can challenge other groups playing the same day.</div></div>'
    return
  }
  const pe = S.pe
  pe.date = date
  const mine = sheet.filter(s => s.players.some(p => p.memberId === me.id))
  if (!mine.some(s => s.id === pe.host)) pe.host = mine[0]?.id
  const others = sheet.filter(s => s.id !== pe.host && s.players.length >= 2 && s.players.some(p => p.memberId))
  pe.invited = pe.invited.filter(id => others.some(s => s.id === id))
  const host = sheet.find(s => s.id === pe.host)
  const chosen = [host, ...pe.invited.map(id => sheet.find(s => s.id === id))].filter(Boolean).sort((a, b) => a.time - b.time)
  const names = s => s.players.map(p => esc(p.memberId === me.id ? 'You' : p.name) + (p.guest ? ' (guest)' : '')).join(', ')

  $('main').innerHTML = `<div class="screen">
    ${dates.length > 1 ? `<div class="tabs-pill" role="group" aria-label="Day">${dates.map(d => `<button data-day="${d}" aria-pressed="${d === date}">${d === isoDate(today()) ? 'Today' : longDay(fromIso(d))}</button>`).join('')}</div>` : `<div class="hint">${longDay(fromIso(date))}</div>`}
    <h3>Your group</h3>
    ${mine.map(s => `<button class="card evrow" data-host="${s.id}" aria-pressed="${s.id === pe.host}"><span class="who"><strong>${hhmm(s.time)} · ${s.players.length} players</strong><small>${names(s)}</small></span>${mine.length > 1 ? `<span class="check">${s.id === pe.host ? '✓' : ''}</span>` : ''}</button>`).join('')}
    <h3>Groups to challenge</h3><div class="hint">Pick one or more. Each needs at least two players, including a member to accept.</div>
    ${others.length ? `<div class="pick">${others.map(s => { const on = pe.invited.includes(s.id); return `<button class="brow grouprow" data-inv="${s.id}" aria-pressed="${on}"><span class="who"><strong><span class="gtime">${hhmm(s.time)}</span> · ${s.players.length} players</strong><small>${names(s)}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
      : '<div class="empty-state">No other groups with a member are booked that day yet.</div>'}
  </div>
  <div class="cta"><button class="primary" id="pe-setup" ${pe.invited.length ? '' : 'disabled'}>${pe.invited.length ? `Set up event with ${pe.invited.length} group${pe.invited.length > 1 ? 's' : ''}` : 'Pick groups to challenge'}</button></div>`

  document.querySelectorAll('[data-day]').forEach(x => (x.onclick = () => { S.pe = freshDraft(x.dataset.day); redraw() }))
  document.querySelectorAll('[data-host]').forEach(x => (x.onclick = () => { pe.host = +x.dataset.host; pe.invited = []; pe.teams = {}; redraw() }))
  document.querySelectorAll('[data-inv]').forEach(x => (x.onclick = () => {
    const id = +x.dataset.inv
    pe.invited = pe.invited.includes(id) ? pe.invited.filter(i => i !== id) : [...pe.invited, id]
    pe.teams = {}
    redraw()
  }))
  $('pe-setup').onclick = () => { pe.sheet = true; redraw() }
  if (pe.sheet && host && pe.invited.length) optionsSheet(pe, chosen, me)
}

// Suggesting changes: the event's groups are fixed, so it's just the pop-up over a short page.
function drawCounter(me) {
  const pe = S.pe
  header('Suggest changes', pe.groups.map(g => hhmm(g.time)).join(' v '), back)
  $('main').innerHTML = `<div class="screen"><div class="hint">Change the game or teams, then send it back. Every other group then answers your version.</div>
    <button class="primary" id="pe-reopen">Choose the game and teams</button></div>`
  $('pe-reopen').onclick = () => { pe.sheet = true; redraw() }
  if (pe.sheet) optionsSheet(pe, pe.groups, me)
}

function optionsSheet(pe, groups, me) {
  const full = groups.every(s => s.players.length === 4)
  const two = groups.length === 2
  if (pe.style === 'ryder' && !full) pe.style = 'fourball'
  const formats = EVENT_FORMATS[pe.style].filter(f => f.k !== 'bestball' || two)
  if (!formats.some(f => f.k === pe.format)) pe.format = formats[0].k
  const pick = pe.style === 'ryder' || pe.style === 'teams'
  const players = groups.flatMap(s => s.players)
  // Starting teams: Four-ball team match play puts the first two in each four-ball on A; own teams alternate.
  if (pick) players.forEach((p, i) => { pe.teams[p.id] ??= pe.style === 'ryder' ? (groups.find(s => s.players.includes(p)).players.indexOf(p) < 2 ? 'A' : 'B') : (i % 2 ? 'B' : 'A') })
  const nA = ps => ps.filter(p => pe.teams[p.id] === 'A').length
  const problem = !pick ? ''
    : pe.style === 'ryder' ? (groups.some(s => nA(s.players) !== 2) ? 'Each four-ball needs two players on each team.' : '')
    : nA(players) * 2 !== players.length ? `The teams need the same number of players (${nA(players)} v ${players.length - nA(players)}).` : ''
  const nameOf = p => esc(p.memberId === me.id ? 'You' : p.name)
  const styleNote = k => (k === 'ryder' && !full ? 'Needs every group to be a full four-ball' : k === 'fourball' ? (groups.length > 2 ? 'Each group is its own team, ranked in a table.' : 'Your group against theirs.') : EVENT_STYLES[k].desc)

  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet pesheet" id="pesheet" role="dialog" aria-labelledby="pst">
    <h4 id="pst">${pe.counter ? 'Suggest changes' : `Event with ${groups.map(s => hhmm(s.time)).join(', ')}`}</h4>
    <span class="gm-lbl">Team style</span>
    <div class="games" role="radiogroup">${Object.entries(EVENT_STYLES).map(([k, s]) => `<button class="gamecard sm" role="radio" aria-checked="${pe.style === k}" data-style="${k}" ${k === 'ryder' && !full ? 'disabled' : ''}><span class="radio"></span><span class="who"><strong>${s.name}</strong><small>${styleNote(k)}</small></span></button>`).join('')}</div>
    <span class="gm-lbl">Format</span>
    <div class="games" role="radiogroup">${formats.map(f => `<button class="gamecard sm" role="radio" aria-checked="${pe.format === f.k}" data-fmt="${f.k}"><span class="radio"></span><span class="who"><strong>${f.name}</strong><small>${f.desc}</small></span></button>`).join('')}</div>
    ${pick ? `<span class="gm-lbl">Teams</span>
      <div class="tnames"><div><label for="pe-na">Team name</label><input id="pe-na" value="${esc(pe.names.A)}" maxlength="30"></div><div><label for="pe-nb">Team name</label><input id="pe-nb" value="${esc(pe.names.B)}" maxlength="30"></div></div>
      ${groups.map(s => `<div class="pegroup"><div class="pinhead"><b>${hhmm(s.time)}</b><span class="hint">${nA(s.players)} v ${s.players.length - nA(s.players)}</span></div>
        ${s.players.map(p => `<div class="trow"><span class="who"><strong>${nameOf(p)}</strong><small>${p.guest ? 'Guest' : 'Member'}</small></span><span class="tseg"><button data-tm="${p.id}" data-t="A" aria-pressed="${pe.teams[p.id] === 'A'}" style="--tc:var(--green)">${esc(pe.names.A || 'A')}</button><button data-tm="${p.id}" data-t="B" aria-pressed="${pe.teams[p.id] === 'B'}" style="--tc:var(--loss)">${esc(pe.names.B || 'B')}</button></span></div>`).join('')}</div>`).join('')}`
      : `<span class="gm-lbl">Teams</span><div class="hint">No picking needed: each group plays as a team${groups.length > 2 ? ', ranked in a table' : ''}.</div>`}
    <p class="gerr" id="pe-err" role="alert">${problem}</p>
    <div class="gm-btns"><button class="ghost" id="pe-close">Back</button><button class="primary" id="pe-send" ${problem ? 'disabled' : ''}>${pe.counter ? 'Send suggested changes' : `Send invitation${groups.length > 2 ? 's' : ''}`}</button></div>
  </div></div>`

  const readNames = () => { if ($('pe-na')) pe.names = { A: $('pe-na').value, B: $('pe-nb').value } }
  $('pe-close').onclick = () => { readNames(); pe.sheet = false; redraw() }
  $('ovl').onclick = ev => { if (ev.target.id === 'ovl') { readNames(); pe.sheet = false; redraw() } }
  document.querySelectorAll('[data-style]').forEach(x => (x.onclick = () => { readNames(); pe.style = x.dataset.style; pe.teams = {}; redraw() }))
  document.querySelectorAll('[data-fmt]').forEach(x => (x.onclick = () => { readNames(); pe.format = x.dataset.fmt; redraw() }))
  document.querySelectorAll('[data-tm]').forEach(x => (x.onclick = () => { readNames(); pe.teams[+x.dataset.tm] = x.dataset.t; redraw() }))
  ;['pe-na', 'pe-nb'].forEach(id => { if ($(id)) $(id).onchange = () => { readNames(); redraw() } })
  $('pe-send').onclick = async () => {
    readNames()
    $('pe-send').disabled = true
    const setup = { style: pe.style, format: pe.format, teamNames: pick ? pe.names : {}, teams: pick ? Object.fromEntries(players.map(p => [p.id, pe.teams[p.id]])) : {} }
    try {
      if (pe.counter) await api.counterPlayerEvent(pe.counter.id, setup)
      else await api.proposePlayerEvent({ hostSlot: pe.host, invited: pe.invited, ...setup })
    } catch (err) {
      $('pe-err').textContent = err.message
      $('pe-send').disabled = false
      return
    }
    const n = pe.invited.length, counter = !!pe.counter
    $('modal').innerHTML = ''
    await back()
    toast(counter ? 'Changes sent. The other groups can accept them' : n > 1 ? `Invitations sent to ${n} groups` : 'Invitation sent')
  }
}
