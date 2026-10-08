// Admin → Tee times → a time: choose buddies and guests, then confirm.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast, parseHcp, fmtHcp } from '../ui.js'
import { isoDate, nextDays, dayMonth, longDay, hhmm } from '../dates.js'

export async function load() {
  const date = nextDays(7)[S.day]
  const [sheet, me, members, buddies, points] = await Promise.all([api.getTeeSheet(isoDate(date)), api.getMe(), api.getMembers(), api.getBuddies(), api.getGuestPoints()])
  return { date, slot: sheet.find(s => s.id === S.slotId), me, myB: members.filter(m => buddies.includes(m.id)), points }
}

const back = () => { S.aview = 'tee'; S.guests = []; S.gmodal = false; render() }

export function draw({ date, slot: s, me, myB, points }) {
  if (!s) { back(); return }
  const free = s.capacity - s.players.length, max = free - 1, fee = s.twilight ? 25 : 0, cost = points.cost
  header(hhmm(s.time), `${longDay(date)} · 1st tee`, back)
  if (free <= 0) { // someone else took the last space while this screen was open
    $('main').innerHTML = `<div class="done"><div class="flagmark">⛳</div><h4>This time is now full</h4>
      <p>${s.players.map(p => esc(p.name)).join(', ')}</p><button class="primary" id="other">Pick another time</button></div>`
    $('other').onclick = back
    return
  }
  const byId = id => myB.find(m => m.id === id)
  const used = S.picked.length + S.guests.length
  const left = points.allowance - points.mine.reduce((t, x) => t + x.points, 0), after = left - cost * S.guests.length
  const canGuest = used < max && after >= cost

  let slots = `<div class="pslot filled"><span class="av">${ini(me.name)}</span><span class="who"><strong>${esc(me.name)} (you)</strong><small>GUI ${me.gui} · HCP ${me.hcp}</small></span><span></span></div>`
  S.picked.forEach(id => { const m = byId(id); slots += `<div class="pslot filled"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>GUI ${m.gui} · HCP ${m.hcp}</small></span><button class="x" data-rm="${id}" aria-label="Remove ${esc(m.name)}">×</button></div>` })
  S.guests.forEach((g, n) => { slots += `<div class="pslot filled guest"><span class="av gst">${ini(g.name)}</span><span class="who"><strong>${esc(g.name)} <span class="pill tag">Guest</span></strong><small>${[g.club, g.gui && 'GUI ' + g.gui, g.hcp != null ? 'HCP ' + fmtHcp(g.hcp) : 'handicap later'].filter(Boolean).map(esc).join(' · ')}</small></span><span class="gright"><span class="ptag">−${cost} pts</span><button class="x" data-rg="${n}" aria-label="Remove guest ${esc(g.name)}">×</button></span></div>` })
  for (let k = 1 + used; k < free; k++) slots += '<div class="pslot"><span class="av empty">+</span><span class="who"><strong style="color:var(--muted);font-weight:600">Open space</strong><small>Pick a buddy or add a guest</small></span><span></span></div>'
  s.players.forEach(p => (slots += `<div class="pslot other"><span class="av other">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}</strong><small>Already booked</small></span><span></span></div>`))

  $('main').innerHTML = `<div class="screen">
    <div class="card summary"><div><span>Date</span><b>${dayMonth(date)}</b></div><div><span>Tee</span><b>${hhmm(s.time)}</b></div><div><span>Spaces</span><b>${free} / ${s.capacity}</b></div></div>
    <h3>Your group</h3><div class="players">${slots}</div>
    <h3>Playing with</h3><div class="hint">${max === 0 ? "Only one space left, so this one's just you." : `Choose up to ${max} from your buddies, or add a guest.`}</div>
    <div class="pick">${myB.length ? myB.map(m => { const on = S.picked.includes(m.id), dis = !on && used >= max; return `<button class="brow" data-p="${m.id}" aria-pressed="${on}" ${dis ? 'disabled' : ''}><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>GUI ${m.gui} · HCP ${m.hcp}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('') : '<div class="empty-state">Your buddies list is empty.</div>'}</div>
    <div class="bk-btns"><button class="ghost" id="goBud">+ Find buddies</button><button class="ghost guestbtn" id="addG" ${canGuest ? '' : 'disabled'}>+ Add guest</button></div>
    <div class="card ptsbox"><div class="ptsrow"><span><b>Guest points</b><small>${points.allowance} a year · resets 1 Jan</small></span><span class="ptsnum">${after}<small> left</small></span></div>${bar(after, points.allowance)}
      <span class="hint">${S.guests.length ? `This booking uses ${cost * S.guests.length} of your ${left} points.` : left < cost ? "You don't have enough guest points left for this course." : `You have ${left} points left this year.`}</span></div>
  </div>
  <div class="cta"><div class="tot">${1 + used} player${used ? 's' : ''}<b>${fee ? `€${fee * (1 + S.picked.length)}` : "Members' time"}</b></div><button class="primary" id="confirm">Confirm booking</button></div>`

  if (S.gmodal) guestForm(points, after)
  document.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => { const id = +b.dataset.p; S.picked = S.picked.includes(id) ? S.picked.filter(x => x !== id) : [...S.picked, id]; keepScroll(render) }))
  document.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { S.picked = S.picked.filter(x => x !== +b.dataset.rm); keepScroll(render) }))
  document.querySelectorAll('[data-rg]').forEach(b => (b.onclick = () => { S.guests.splice(+b.dataset.rg, 1); keepScroll(render) }))
  $('goBud').onclick = async () => { S.aview = 'buddies'; S.bseg = 'find'; S.bfrom = 'book'; await render(); top0() }
  $('addG').onclick = () => { S.gmodal = true; keepScroll(render) }
  $('confirm').onclick = async e => {
    e.target.disabled = true
    try {
      S.lastBooking = await api.bookTeeTime({ slotId: s.id, memberIds: S.picked, guests: S.guests })
    } catch (err) {
      toast(err.message)
      await keepScroll(render) // show the latest spaces and points
      return
    }
    S.guests = []
    S.picked = []
    S.aview = 'booked'
    await render()
    top0()
  }
}

export const bar = (left, allowance) => `<span class="pbar"><i style="width:${Math.max(0, (left / allowance) * 100).toFixed(1)}%" class="${left <= 6 ? 'low' : ''}"></i></span>`

function guestForm(points, after) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="gform" novalidate aria-labelledby="gtitle">
    <h4 id="gtitle">Add a guest</h4>
    <label for="g-name">Full name</label><input id="g-name" autocomplete="off" placeholder="e.g. Paul Hughes">
    <label for="g-club">Home club <span class="opt">optional</span></label><input id="g-club" autocomplete="off" placeholder="Leave blank if not a club member">
    <label for="g-gui">GUI number <span class="opt">optional</span></label><input id="g-gui" inputmode="numeric" autocomplete="off" placeholder="On their handicap card, if they have one">
    <label for="g-hcp">Handicap index <span class="opt">optional · you can set it later on the scorecard</span></label><input id="g-hcp" inputmode="decimal" autocomplete="off" placeholder="e.g. 18.4, or +2">
    <p class="gerr" id="gerr" role="alert"></p>
    <div class="gcost"><span>Uses <b>${points.cost} points</b> on the ${esc(points.course)}</span><span>${after} → <b>${after - points.cost}</b> left</span></div>
    <div class="gm-btns"><button type="button" class="ghost" id="gcancel">Cancel</button><button type="submit" class="primary">Add guest</button></div>
  </form></div>`
  setTimeout(() => $('g-name')?.focus(), 30)
  const close = () => { S.gmodal = false; keepScroll(render) }
  $('gcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('gform').onsubmit = e => {
    e.preventDefault()
    const name = $('g-name').value.trim(), club = $('g-club').value.trim(), gui = $('g-gui').value.replace(/\s/g, ''), hcp = parseHcp($('g-hcp').value)
    const err = !name ? "Enter your guest's name." : gui && !/^\d{6,10}$/.test(gui) ? 'GUI numbers are 6–10 digits. Check their handicap card, or leave it blank.'
      : Number.isNaN(hcp) ? 'Handicap index should be between +10 and 54, e.g. 18.4. Or leave it blank for now.' : ''
    if (err) { $('gerr').textContent = err; return }
    S.guests.push({ name, club, gui, hcp })
    S.gmodal = false
    keepScroll(render)
    toast(`${name} added · ${points.cost} points`)
  }
}
