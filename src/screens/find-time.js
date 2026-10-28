// Find a time (a knockout match, S.ftMatch): suggest days with Morning / Afternoon / Evening up to the play-by date, and
// a grid of who can do which (each player ticks their own column ✓, ✕ or blank, plus their partner's "the same" in pairs,
// and a message to the others (each player's last 2 show, as a short conversation), then Confirm saves the lot). When everyone can do one, Book a tee
// time opens the tee sheet on that day with the others ready to add, as Book this match does;
// when everyone can do several, tapping one of their rows picks which (S.ftChosen, the first by default).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, redraw, toast, top0, goBack } from '../ui.js'
import { fromIso, longDay, isoDate, addDaysIso, nextDays, hhmm } from '../dates.js'

const PARTS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']]
const gone = part => { const h = new Date().getHours(); return (part === 'morning' && h >= 12) || (part === 'afternoon' && h >= 17) }
const MAX = 6
let sending = false

export async function load() {
  const [grid, me, bookings] = await Promise.all([api.getMatchTimes(S.ftMatch), api.getMe(), api.getMyBookings()])
  // Booked already: all the players on one booking up to the play-by date
  const today = isoDate(new Date())
  const booked = bookings.find(b => b.date >= today && b.date <= grid.match.by && grid.players.every(p => b.people.some(x => x.memberId === p.id))) ?? null
  if (S.ftPick == null) S.ftPick = grid.times.length || booked ? null : [] // nothing suggested yet: start by suggesting
  return { grid, me, booked }
}

// Leaving with ticks not confirmed: say so once; Back again leaves (and drops them).
const back = () => {
  if (S.ftDraft?.dirty && !S.ftDraft.warned) { S.ftDraft.warned = true; toast('You haven’t confirmed your answers'); return }
  S.ftPick = null; S.ftDraft = null; S.ftChosen = null
  return goBack(async () => { S.aview = 'ko'; S.koComp = S.ftComp ?? S.koComp; await render(); top0() })
}
const first = n => n.split(' ')[0]
const dayLabel = iso => longDay(fromIso(iso))
const partLabel = p => PARTS.find(x => x[0] === p)?.[1] ?? p
const cycle = v => (v === true ? false : v === false ? null : true) // ✓, ✕, blank
const mark = v => (v === true ? '✓' : v === false ? '✕' : '·')

export function draw({ grid, me, booked }) {
  const { match: m, players, times } = grid
  S.ftComp = m.compId
  const others = players.filter(p => p.id !== me.id)
  header('Find a time', `${esc(m.compName)} · play by ${dayLabel(m.by)}`, back)
  if (S.ftPick) return drawSuggest(grid, me, others)
  // My partner in a pairs match: the other player on my side (the players come side by side: A, A's partner, B, B's partner).
  const i = players.findIndex(p => p.id === me.id), partner = players.length === 4 ? players[i ^ 1] : null
  // What I've ticked on screen, saved only by Confirm.
  if (S.ftDraft?.match !== m.id) S.ftDraft = { match: m.id, mine: Object.fromEntries(times.map(t => [t.id, t.answers[me.id] ?? null])), same: false, note: '', dirty: false } // note: a new message
  const d = S.ftDraft
  const shown = (t, p) => (p.id === me.id ? d.mine[t.id] : partner && p.id === partner.id && d.same ? d.mine[t.id] : t.answers[p.id] ?? null)
  const all = t => players.every(p => t.answers[p.id] === true)
  const ok = booked ? [] : times.filter(all) // booked: nothing left to book
  const agreed = ok.find(t => t.id === S.ftChosen) ?? ok[0] ?? null
  const answered = p => times.some(t => t.answers[p.id] != null)
  const byName = id => first(players.find(p => p.id === id)?.name ?? 'someone')
  const cell = (t, p) => {
    const a = shown(t, p), cls = a === true ? 'y' : a === false ? 'n' : ''
    return `<td><button class="fttick ${cls}" data-tt="${t.id}" data-p="${p.id}" ${p.id === me.id ? `data-t="${t.id}"` : 'aria-disabled="true"'} aria-label="${esc(p.name)}, ${dayLabel(t.day)} ${t.part}: ${a === true ? 'can' : a === false ? 'can’t' : 'not answered'}">${mark(a)}</button></td>`
  }
  const head = p => p.id === me.id ? 'You' : `${esc(first(p.name))}${grid.answeredBy?.[p.id] && grid.answeredBy[p.id] !== me.id ? `<small>answered by ${esc(byName(grid.answeredBy[p.id]))}</small>` : grid.answeredBy?.[p.id] === me.id ? '<small>answered by you</small>' : ''}`
  // The conversation: each player's last 2 messages, oldest first
  const notes = (grid.messages ?? []).filter(x => players.some(p => p.id === x.by)).map(x => `<span><b>${x.by === me.id ? 'You' : esc(byName(x.by))}:</b> ${esc(x.note)}</span>`).join('')
  $('main').innerHTML = `<div class="screen">
    ${booked ? `<div class="card ftcard ftagreed"><b>Booked: ${dayLabel(booked.date)} ${hhmm(booked.time)}</b><span class="hint">Everyone in the match is on it.</span><button class="ghost" id="ft-seebk">See the booking</button></div>` : ''}
    ${agreed && ok.length > 1 ? `<div class="card ftcard ftagreed"><b>Everyone can do ${ok.length} times</b>
      <span class="hint">Tap the one that suits best below. Booking ${dayLabel(agreed.day)} · ${agreed.part}: the tee sheet opens on that day with ${esc(others.map(p => first(p.name)).join(' and '))} ready to add.</span>
      <button class="primary" id="ft-book">Book a tee time · ${dayLabel(agreed.day)}</button></div>` : ''}
    ${agreed && ok.length === 1 ? `<div class="card ftcard ftagreed"><b>Everyone can do ${dayLabel(agreed.day)} · ${agreed.part}</b>
      <span class="hint">Book a tee time that ${agreed.part}: the tee sheet opens on that day with ${esc(others.map(p => first(p.name)).join(' and '))} ready to add.</span>
      <button class="primary" id="ft-book">Book a tee time · ${dayLabel(agreed.day)}</button></div>` : ''}
    <div class="card ftcard"><b>Who can do which?</b>
      ${times.length ? `<div class="ftwrap"><table class="ftgrid"><thead><tr><th></th>${players.map(p => `<th class="${p.id === me.id ? 'me' : ''}">${head(p)}</th>`).join('')}</tr></thead>
        <tbody>${times.map(t => `<tr data-row="${t.id}" class="${t === agreed ? 'all' : ok.includes(t) ? 'ok' : ''}"><td>${ok.length > 1 && ok.includes(t)
          ? `<button class="ftpick" data-pick="${t.id}" aria-pressed="${t === agreed}">${dayLabel(t.day)}<small>${partLabel(t.part)}${t === agreed ? ' · chosen' : ''}</small></button>`
          : `${dayLabel(t.day)}<small>${partLabel(t.part)}</small>`}</td>${players.map(p => cell(t, p)).join('')}</tr>`).join('')}</tbody></table></div>
        <span class="hint">${players.filter(answered).length} of ${players.length} have answered. Tap your column: ✓ you can, again for ✕, again to clear.</span>
        ${partner ? `<button type="button" class="ftsame" id="ft-same" role="checkbox" aria-checked="${d.same}"><span class="box">${d.same ? '✓' : ''}</span>${esc(first(partner.name))} can do the same</button>` : ''}`
        : '<span class="hint">No days suggested yet.</span>'}
      ${notes ? `<div class="ftnotes">${notes}</div>` : ''}
      <label for="ft-note" class="hint">${notes ? 'Add a message' : 'Anything else?'}</label>
      <input id="ft-note" class="plainsel" maxlength="120" autocomplete="off" placeholder="${notes ? 'e.g. 16:20 suits me' : 'e.g. any weekday after 5pm'}" value="${esc(d.note)}">
      <button class="primary" id="ft-confirm" ${sending ? 'disabled' : ''}>Confirm my answers</button>
      <button class="ghost" id="ft-more">Suggest other days</button></div>
    <p class="hint">Nothing agreed a week before ${dayLabel(m.by)}? Everyone gets a reminder.</p></div>`
  const dirty = () => { d.dirty = true; d.warned = false }
  document.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => { d.mine[b.dataset.t] = cycle(d.mine[b.dataset.t]); dirty(); keepScroll(redraw) }))
  // several agreed: tap anywhere on one of their rows (bar my own ticks) to choose it
  if (ok.length > 1) document.querySelectorAll('tr.ok, tr.all').forEach(r => (r.onclick = e => { if (e.target.closest('[data-t]')) return; S.ftChosen = +r.dataset.row; keepScroll(redraw) }))
  if ($('ft-same')) $('ft-same').onclick = () => { d.same = !d.same; dirty(); keepScroll(redraw) }
  $('ft-note').oninput = e => { d.note = e.target.value; dirty() }
  $('ft-confirm').onclick = async () => {
    if (sending) return
    sending = true
    $('ft-confirm').disabled = true
    const answers = Object.fromEntries(times.map(t => [t.id, d.mine[t.id] ?? null]))
    const note = d.note.trim() || null // a new message (nothing typed: none)
    let r
    try { r = await api.confirmMatchTimes(m.id, answers, partner && d.same ? answers : null, note) } catch (err) { toast(err.message); return } finally { sending = false; if ($('ft-confirm')) $('ft-confirm').disabled = false }
    S.ftDraft = null
    await keepScroll(render)
    toast(r.agreed && !agreed ? 'Everyone can make it: book a tee time' : 'Your answers are in')
  }
  $('ft-more').onclick = () => { S.ftPick = []; keepScroll(render) }
  if ($('ft-seebk')) $('ft-seebk').onclick = async () => { S.ftDraft = null; S.aview = 'mine'; await render(); top0() }
  if ($('ft-book')) $('ft-book').onclick = () => book(m, me, others, agreed)
}

// Suggesting: each day up to the play-by date, Morning / Afternoon / Evening to tick (up to 6); ones already suggested aren't offered.
function drawSuggest(grid, me, others) {
  const { match: m, times } = grid, today = isoDate(new Date())
  const days = []
  for (let d = today; d <= m.by && days.length < 42; d = addDaysIso(d, 1)) days.push(d)
  const taken = new Set(times.map(t => `${t.day}|${t.part}`)), pick = S.ftPick, n = pick.length
  if (!days.length) { // the play-by date has passed: nothing to suggest
    $('main').innerHTML = `<div class="screen"><div class="card ftcard"><b>The play-by date has passed</b><span class="hint">${esc(m.compName)} had to be played by ${dayLabel(m.by)}. Have a word with the competition secretary, or book it straight away.</span></div></div>`
    return
  }
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
export async function book(m, me, others, agreed) {
  const rules = await api.getBookingRules(), days = nextDays(rules.days + 1).map(isoDate), i = days.indexOf(agreed.day)
  const ids = others.map(p => p.id)
  const hold = m.club && m.kind === 'singles' && i >= 0 ? { kind: 'ko', ref: m.compId, opp: ids[0], label: `${m.compName} match` } : null
  Object.assign(S, { ftPick: null, ftDraft: null, ftChosen: null, tab: 'home', aview: 'tee', matchPick: ids, matchHold: hold, matchPart: agreed.part, matchName: m.compName, filter: hold || ids.length >= 2 ? '4' : '2',
    reqMode: i < 0, ...(i < 0 ? { reqDate: agreed.day, reqReason: `${m.compName} match` } : { day: i }) })
  await render(); top0()
}
