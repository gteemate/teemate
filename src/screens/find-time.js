// Find a time (a knockout match, S.ftMatch): suggest days with Morning / Afternoon / Evening up to the play-by date, and
// a grid of who can do which (each player taps their own column: ✓, ✕, blank). When everyone can do one, Book a tee
// time opens the tee sheet on that day with the others ready to add, as Book this match does.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast, top0, goBack } from '../ui.js'
import { fromIso, longDay, isoDate, addDaysIso, nextDays } from '../dates.js'

const PARTS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']]
const gone = part => { const h = new Date().getHours(); return (part === 'morning' && h >= 12) || (part === 'afternoon' && h >= 17) }
const MAX = 6
let sending = false

export async function load() {
  const [grid, me] = await Promise.all([api.getMatchTimes(S.ftMatch), api.getMe()])
  if (S.ftPick == null) S.ftPick = grid.times.length ? null : [] // nothing suggested yet: start by suggesting
  return { grid, me }
}

const back = () => { S.ftPick = null; return goBack(async () => { S.aview = 'ko'; S.koComp = S.ftComp ?? S.koComp; await render(); top0() }) }
const first = n => n.split(' ')[0]
const dayLabel = iso => longDay(fromIso(iso))
const partLabel = p => PARTS.find(x => x[0] === p)?.[1] ?? p

export function draw({ grid, me }) {
  const { match: m, players, times } = grid
  S.ftComp = m.compId
  const others = players.filter(p => p.id !== me.id)
  header('Find a time', `${esc(m.compName)} · play by ${dayLabel(m.by)}`, back)
  if (S.ftPick) return drawSuggest(grid, me, others)
  const agreed = times.find(t => t.id === grid.agreed)
  const answered = p => times.some(t => t.answers[p.id] != null)
  const cell = (t, p) => {
    const a = t.answers[p.id], cls = a === true ? 'y' : a === false ? 'n' : ''
    return `<td><button class="tick ${cls}" ${p.id === me.id ? `data-t="${t.id}"` : 'disabled'} aria-label="${esc(p.name)}, ${dayLabel(t.day)} ${t.part}: ${a === true ? 'can' : a === false ? 'can’t' : 'not answered'}">${a === true ? '✓' : a === false ? '✕' : '·'}</button></td>`
  }
  $('main').innerHTML = `<div class="screen">
    ${agreed ? `<div class="card ftcard ftagreed"><b>Everyone can do ${dayLabel(agreed.day)} · ${agreed.part}</b>
      <span class="hint">Book a tee time that ${agreed.part}: the tee sheet opens on that day with ${esc(others.map(p => first(p.name)).join(' and '))} ready to add.</span>
      <button class="primary" id="ft-book">Book a tee time · ${dayLabel(agreed.day)}</button></div>` : ''}
    <div class="card ftcard"><b>Who can do which?</b>
      ${times.length ? `<div class="ftwrap"><table class="ftgrid"><thead><tr><th></th>${players.map(p => `<th class="${p.id === me.id ? 'me' : ''}">${p.id === me.id ? 'You' : esc(first(p.name))}</th>`).join('')}</tr></thead>
        <tbody>${times.map(t => `<tr data-row="${t.id}" class="${t.id === grid.agreed ? 'all' : ''}"><td>${dayLabel(t.day)}<small>${partLabel(t.part)}</small></td>${players.map(p => cell(t, p)).join('')}</tr>`).join('')}</tbody></table></div>
        <span class="hint">${players.filter(answered).length} of ${players.length} have answered. Tap your column: ✓ you can, again for ✕, again to clear.</span>`
        : '<span class="hint">No days suggested yet.</span>'}
      <button class="ghost" id="ft-more">Suggest other days</button></div>
    <p class="hint">Nothing agreed a week before ${dayLabel(m.by)}? Everyone gets a reminder.</p></div>`
  document.querySelectorAll('[data-t]').forEach(b => (b.onclick = async () => {
    const t = times.find(x => x.id === +b.dataset.t), cur = t.answers[me.id]
    const next = cur === true ? false : cur === false ? null : true
    b.disabled = true
    let r
    try { r = await api.answerMatchTime(t.id, next) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render)
    if (r.agreed && !agreed) toast('Everyone can make it: book a tee time')
  }))
  $('ft-more').onclick = () => { S.ftPick = []; keepScroll(render) }
  if ($('ft-book')) $('ft-book').onclick = () => book(m, me, others, agreed)
}

// Suggesting: each day up to the play-by date, Morning / Afternoon / Evening to tick (up to 6); ones already suggested aren't offered.
function drawSuggest(grid, me, others) {
  const { match: m, times } = grid, today = isoDate(new Date())
  const days = []
  for (let d = today; d <= m.by && days.length < 42; d = addDaysIso(d, 1)) days.push(d)
  const taken = new Set(times.map(t => `${t.day}|${t.part}`)), pick = S.ftPick, n = pick.length
  $('main').innerHTML = `<div class="screen">
    <div class="card ftcard"><b>When suits you?</b><span class="hint">Pick up to ${MAX}, up to ${dayLabel(m.by)}. ${esc(others.map(p => first(p.name)).join(', '))} tick the ones they can do.</span>
      <div class="ftdays">${days.map(d => `<div class="ftday"><span class="ftd">${dayLabel(d).replace(' ', '<small>')}</small></span><div class="ftparts">${PARTS.map(([k, l]) => {
        const key = `${d}|${k}`
        if (taken.has(key)) return '<span class="ftgone">Suggested</span>'
        if (d === today && gone(k)) return '<span class="ftgone">Gone</span>' // today's morning after midday, afternoon after 5pm
        const on = pick.includes(key)
        return `<button aria-pressed="${on}" data-k="${key}" ${!on && n >= MAX ? 'disabled' : ''}>${l}</button>`
      }).join('')}</div></div>`).join('')}</div>
      <span class="hint">${n} of ${MAX} picked</span>
      <div class="gm-btns"><button type="button" class="ghost" id="ft-cancel">Cancel</button><button class="primary" id="ft-send" ${n ? '' : 'disabled'}>Send to ${esc(others.map(p => first(p.name)).join(' and '))}</button></div></div></div>`
  document.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => {
    const k = b.dataset.k
    S.ftPick = pick.includes(k) ? pick.filter(x => x !== k) : [...pick, k]
    keepScroll(render)
  }))
  $('ft-cancel').onclick = () => { if (times.length) { S.ftPick = null; keepScroll(render) } else back() }
  $('ft-send').onclick = async () => {
    if (sending) return
    sending = true
    $('ft-send').disabled = true
    try {
      await api.suggestMatchTimes(m.id, pick.map(k => { const [day, part] = k.split('|'); return { day, part } }))
    } catch (err) { toast(err.message); $('ft-send').disabled = false; return } finally { sending = false }
    S.ftPick = null
    await render(); top0()
    toast(`Sent: ${others.map(p => first(p.name)).join(' and ')} ${others.length === 1 ? 'is' : 'are'} told in the app`)
  }
}

// Book a tee time on the agreed day: the tee sheet with the other players ready to add (a club singles match holds the
// four-ball), as Book this match does; a day not open for booking yet becomes a request.
async function book(m, me, others, agreed) {
  const rules = await api.getBookingRules(), days = nextDays(rules.days + 1).map(isoDate), i = days.indexOf(agreed.day)
  const ids = others.map(p => p.id)
  const hold = m.club && m.kind === 'singles' && i >= 0 ? { kind: 'ko', ref: m.compId, opp: ids[0], label: `${m.compName} match` } : null
  Object.assign(S, { ftPick: null, tab: 'home', aview: 'tee', matchPick: ids, matchHold: hold, filter: hold || ids.length >= 2 ? '4' : '2',
    reqMode: i < 0, ...(i < 0 ? { reqDate: agreed.day, reqReason: `${m.compName} match` } : { day: i }) })
  await render(); top0()
}
