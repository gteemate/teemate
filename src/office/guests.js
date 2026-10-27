// Club office → Guests: check in guests who weren't booked in the app (they just turned up, or the club doesn't book
// in TeeMate yet). Staff scan the member's card (the QR on their Account card) or find them by name, then hand the
// iPad over: the member sees only their points, the cost and the guest boxes (the office menu is hidden), taps Done,
// and hands it back; staff check it and tap Charge. Today's check-ins (with Remove) are on the Today page, staff only.
import * as api from '../api.js'
import { $, esc, ini, header, keepScroll, render, redraw, toast } from '../ui.js'
import { openScanner } from '../scan-qr.js'
import { memberFromCard } from '../member-card.js'
import { fold } from '../fold.js'

// the member being checked in: { id, name, cardName (from a scan, else null), guests: [{ name, club }], step: 'member' | 'staff' }
let cur = null
let find = ''
let sending = false // a charge on its way: Charge and Back wait, so slow wifi can't charge twice

export async function load() {
  const [members, points] = await Promise.all([api.getMembers(), api.getGuestPoints()])
  return { members, points }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export function draw({ members, points }) {
  const left = id => points.allowance - (points.members.find(m => m.id === id)?.used ?? 0)
  const cost = points.cost
  $('app').classList.toggle('kiosk', !!cur) // handed to the member (and back): no office menu
  if (!cur) {
    header('Guests', 'Check in guests who weren’t booked in the app')
    const q = fold(find.trim())
    const found = q.length < 2 ? [] : members.filter(m => fold(m.name).includes(q)).slice(0, 8)
    $('main').innerHTML = `<div class="screen office">
      <button class="primary ci-scan" id="ci-scan">Scan a member’s card</button>
      <label for="ci-find">Find a member by name</label>
      <input id="ci-find" type="search" class="plainsel" autocomplete="off" placeholder="Type a name" value="${esc(find)}">
      ${found.length ? `<div class="card list">${found.map(m => `<button class="lrow ci-m" data-ci-m="${m.id}"><span class="av">${esc(ini(m.name))}</span><span class="who"><strong>${esc(m.name)}</strong><small>${left(m.id)} points left</small></span><span class="chev">›</span></button>`).join('')}</div>` : ''}
      <p class="hint">Then hand the iPad to the member to add their guests. It comes back to you to charge.</p></div>`
    const pick = m => { cur = { ...m, guests: [{ name: '', club: '' }], step: 'member' }; find = ''; render() }
    $('ci-scan').onclick = () => {
      openScanner({
        onText: text => {
          const m = memberFromCard(text, members)
          if (!m) { toast('That isn’t a TeeMate member card.'); return }
          pick(m)
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
      pick({ id: m.id, name: m.name, cardName: null })
    }))
    return
  }
  const n = cur.guests.length, has = left(cur.id)
  if (cur.step === 'handback') { // the member cancelled: nothing charged; staff take it from here
    header('Nothing charged', '')
    $('main').innerHTML = `<div class="screen office ci-kiosk"><div class="card empty-state"><b>Please hand the iPad back to the club.</b><br>No guests were added.</div>
      <button class="ghost" id="ci-staff">Staff: back to Guests</button></div>`
    $('ci-staff').onclick = () => { cur = null; render() }
    return
  }
  if (cur.step === 'member') { // the member's turn: their points, the cost, their guests
    header(`Hello ${cur.name.split(' ')[0]}`, 'Add your guests, then hand back to the club')
    $('main').innerHTML = `<div class="screen office ci-kiosk">
      <div class="card ci-who"><span class="av">${esc(ini(cur.name))}</span><span class="who"><strong>${esc(cur.name)}</strong><small>${has} points left this year · Each guest is ${plural(cost, 'point')}</small></span></div>
      <h3>Your guests</h3>
      ${cur.guests.map((g, i) => `<div class="card ci-g"><label for="ci-n${i}">Guest ${i + 1}’s name</label><input id="ci-n${i}" class="plainsel" autocomplete="off" autocapitalize="words" maxlength="100" value="${esc(g.name)}">
        <label for="ci-c${i}">Their club <span class="hint">optional</span></label><input id="ci-c${i}" class="plainsel" autocomplete="off" autocapitalize="words" maxlength="100" value="${esc(g.club)}"></div>`).join('')}
      ${n < 3 ? '<button class="ghost dashed" id="ci-add">+ Add another guest</button>' : ''}
      <p class="hint">${plural(n * cost, 'point')} for ${plural(n, 'guest')} · ${has - n * cost} left after</p>
      <div class="gm-btns"><button type="button" class="ghost" id="ci-cancel">Cancel</button><button class="primary" id="ci-done">Done: hand back to the club</button></div></div>`
    cur.guests.forEach((g, i) => {
      $(`ci-n${i}`).oninput = e => { g.name = e.target.value }
      $(`ci-c${i}`).oninput = e => { g.club = e.target.value }
    })
    if ($('ci-add')) $('ci-add').onclick = () => { cur.guests.push({ name: '', club: '' }); render().then(() => $(`ci-n${cur.guests.length - 1}`)?.focus()) }
    $('ci-cancel').onclick = () => { cur.step = 'handback'; render() } // not straight to the office: the member may still have the iPad
    $('ci-done').onclick = () => {
      if (cur.guests.some(g => !g.name.trim())) { toast('Add the guest’s name.'); return }
      cur.step = 'staff'; render()
    }
    return
  }
  // Back with the staff: check what the member entered, then charge (or send it back to them).
  header('Check and charge', `${esc(cur.name)} · ${has} points left`)
  $('main').innerHTML = `<div class="screen office ci-kiosk">
    <div class="card list">${cur.guests.map(g => `<div class="lrow"><span class="av gst">${esc(ini(g.name))}</span><span class="who"><strong>${esc(g.name.trim())}</strong><small>${g.club.trim() ? esc(g.club.trim()) : 'No home club'}</small></span><span class="hcp">${cost}<small>pts</small></span></div>`).join('')}</div>
    <p class="hint">Guests of ${esc(cur.name)} · ${has - n * cost} points left after</p>
    <div class="gm-btns"><button type="button" class="ghost" id="ci-back"${sending ? ' disabled' : ''}>Back to the member</button><button class="primary" id="ci-go"${sending ? ' disabled' : ''}>${sending ? 'Charging…' : `Charge ${plural(n * cost, 'point')} · ${plural(n, 'guest')}`}</button></div></div>`
  $('ci-back').onclick = () => { cur.step = 'member'; render() }
  $('ci-go').onclick = async () => {
    const btn = $('ci-go')
    if (sending) return
    const who = cur
    const busy = on => { // also kept through any redraw while it's sending (see above)
      sending = on
      btn.disabled = on; btn.textContent = on ? 'Charging…' : `Charge ${plural(who.guests.length * cost, 'point')} · ${plural(who.guests.length, 'guest')}`
      if ($('ci-back')) $('ci-back').disabled = on
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

/** Today's office check-ins, for the staff's Today page: each with Remove (points back). */
export function checkedInToday(charges) {
  return `<h3>Guests checked in today</h3>${charges.length
    ? `<div class="card list">${charges.map(c => `<div class="lrow rmrow"><span class="av gst">${esc(ini(c.guest))}</span><span class="who"><strong>${esc(c.guest)}</strong><small>Guest of ${esc(c.memberName)}${c.club ? ` · ${esc(c.club)}` : ''}</small></span><span class="hcp">${c.points}<small>pts</small></span><button type="button" class="ghost rmbtn" data-ci-rm="${c.id}">Remove</button></div>`).join('')}</div>`
    : '<div class="card empty-state">No guests checked in at the office today.</div>'}`
}
export function bindCheckedIn(charges) {
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
