// Club office → Guests: check in guests who weren't booked in the app (they just turned up, or the club doesn't book
// in TeeMate yet). Scan the member's card (the QR on their Account card) or find them by name, add up to 3 guests,
// and their guest points are charged. Today's check-ins can be removed again (points back).
import * as api from '../api.js'
import { $, esc, ini, header, keepScroll, render, redraw, toast } from '../ui.js'
import { openScanner } from '../scan-qr.js'
import { memberFromCard } from '../member-card.js'

let cur = null // the member being checked in: { id, name, cardName (from a scan, else null), guests: [{ name, club }] }
let find = ''
let sending = false // a charge on its way: Charge, Cancel and Add wait, so slow wifi can't charge twice

export async function load() {
  const [members, points, charges] = await Promise.all([api.getMembers(), api.getGuestPoints(), api.getGuestChargesToday()])
  return { members, points, charges }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export function draw({ members, points, charges }) {
  header('Guests', 'Check in guests who weren’t booked in the app')
  const left = id => points.allowance - (points.members.find(m => m.id === id)?.used ?? 0)
  const cost = points.cost
  const q = find.trim().toLowerCase()
  const found = q.length < 2 ? [] : members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8)
  const today = `<h3>Checked in today</h3>${charges.length
    ? `<div class="card list">${charges.map(c => `<div class="lrow rmrow"><span class="av gst">${ini(c.guest)}</span><span class="who"><strong>${esc(c.guest)}</strong><small>Guest of ${esc(c.memberName)}${c.club ? ` · ${esc(c.club)}` : ''}</small></span><span class="hcp">${c.points}<small>pts</small></span><button type="button" class="ghost rmbtn" data-ci-rm="${c.id}">Remove</button></div>`).join('')}</div>`
    : '<div class="card empty-state">No guests checked in at the office today.</div>'}`
  if (!cur) {
    $('main').innerHTML = `<div class="screen office">
      <button class="primary ci-scan" id="ci-scan">Scan a member’s card</button>
      <label for="ci-find">Find a member by name</label>
      <input id="ci-find" type="search" class="plainsel" autocomplete="off" placeholder="Type a name" value="${esc(find)}">
      ${found.length ? `<div class="card list">${found.map(m => `<button class="lrow ci-m" data-ci-m="${m.id}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>${left(m.id)} points left</small></span><span class="chev">›</span></button>`).join('')}</div>` : ''}
      ${today}</div>`
    $('ci-scan').onclick = () => {
      openScanner({
        onText: text => {
          const m = memberFromCard(text, members)
          if (!m) { toast('That isn’t a TeeMate member card.'); return }
          cur = { ...m, guests: [{ name: '', club: '' }] }; find = ''; render()
        },
        onError: msg => toast(msg),
      })
    }
    $('ci-find').oninput = e => { // filter what's already loaded: no trip to the server per letter, and the keyboard stays up
      find = e.target.value
      Promise.resolve(redraw()).then(() => { const i = $('ci-find'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length) })
    }
    document.querySelectorAll('[data-ci-m]').forEach(b => (b.onclick = () => {
      const m = members.find(x => x.id === +b.dataset.ciM)
      cur = { id: m.id, name: m.name, cardName: null, guests: [{ name: '', club: '' }] }; find = ''; render()
    }))
  } else {
    const n = cur.guests.length
    $('main').innerHTML = `<div class="screen office">
      <div class="card ci-who"><span class="av">${ini(cur.name)}</span><span class="who"><strong>${esc(cur.name)}</strong><small>${left(cur.id)} points left this year</small></span></div>
      <h3>Guests</h3>
      ${cur.guests.map((g, i) => `<div class="card ci-g"><label for="ci-n${i}">Guest ${i + 1}’s name</label><input id="ci-n${i}" class="plainsel" autocomplete="off" maxlength="100" value="${esc(g.name)}">
        <label for="ci-c${i}">Their club <span class="hint">optional</span></label><input id="ci-c${i}" class="plainsel" autocomplete="off" maxlength="100" value="${esc(g.club)}"></div>`).join('')}
      ${n < 3 ? `<button class="ghost dashed" id="ci-add"${sending ? ' disabled' : ''}>+ Add another guest</button>` : ''}
      <div class="gm-btns"><button type="button" class="ghost" id="ci-cancel"${sending ? ' disabled' : ''}>Cancel</button><button class="primary" id="ci-go"${sending ? ' disabled' : ''}>${sending ? 'Charging…' : `Charge ${plural(n * cost, 'point')} · ${plural(n, 'guest')}`}</button></div>
      ${today}</div>`
    cur.guests.forEach((g, i) => {
      $(`ci-n${i}`).oninput = e => { g.name = e.target.value }
      $(`ci-c${i}`).oninput = e => { g.club = e.target.value }
    })
    if ($('ci-add')) $('ci-add').onclick = () => { cur.guests.push({ name: '', club: '' }); render().then(() => $(`ci-n${cur.guests.length - 1}`)?.focus()) }
    $('ci-cancel').onclick = () => { cur = null; render() }
    $('ci-go').onclick = async () => {
      const btn = $('ci-go')
      if (sending) return
      if (cur.guests.some(g => !g.name.trim())) { toast('Add the guest’s name.'); return }
      const who = cur
      const busy = on => { // also kept through any redraw while it's sending (see draw)
        sending = on
        btn.disabled = on; btn.textContent = on ? 'Charging…' : `Charge ${plural(who.guests.length * cost, 'point')} · ${plural(who.guests.length, 'guest')}`
        for (const id of ['ci-cancel', 'ci-add']) if ($(id)) $(id).disabled = on
      }
      busy(true)
      let r
      try {
        r = await api.chargeGuests(who.id, who.cardName, who.guests.map(g => ({ name: g.name.trim(), club: g.club.trim() || undefined })))
      } catch (err) {
        busy(false); toast(err.message); return
      }
      sending = false
      if (cur === who) cur = null
      await render()
      toast(`${plural(r.charged, 'point')} charged to ${who.name} · ${r.pointsLeft} left`)
    }
  }
  document.querySelectorAll('[data-ci-rm]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return } // a second tap, so a slip doesn't undo a check-in
    b.disabled = true
    const c = charges.find(x => x.id === +b.dataset.ciRm)
    let r
    try { r = await api.removeGuestCharge(c.id) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render)
    toast(`${c.guest} removed · ${plural(r.pointsBack, 'point')} back to ${c.memberName}`)
  }))
}
