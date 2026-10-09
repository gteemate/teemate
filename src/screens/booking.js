// Admin → Tee times → a time: tap an open space to add a member or a guest, then confirm.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast, parseHcp, fmtHcp } from '../ui.js'
import { isoDate, nextDays, dayMonth, longDay, hhmm } from '../dates.js'
import { nextFreeNote } from '../release.js'

export async function load() {
  const date = nextDays(S.day + 1)[S.day] // the day picked on Book tee times
  const [sheet, me, members, buddies, points] = await Promise.all([api.getTeeSheet(isoDate(date)), api.getMe(), api.getMembers(), api.getBuddies(), api.getGuestPoints()])
  return { date, slot: sheet.find(s => s.id === S.slotId), me, members, buddies, points }
}

const back = () => { S.aview = 'tee'; S.guests = []; S.gmodal = false; render() }

const sub = m => [m.gui && 'GUI ' + m.gui, m.hcp != null && 'HCP ' + fmtHcp(m.hcp)].filter(Boolean).join(' · ')

export function draw({ date, slot: s, me, members, buddies, points }) {
  if (!s) { back(); return }
  const free = s.capacity - s.players.length, max = free - 1, fee = s.twilight ? 25 : 0, cost = points.cost
  header(hhmm(s.time), `${longDay(date)} · 1st tee`, back)
  if (free <= 0) { // someone else took the last space while this screen was open
    $('main').innerHTML = `<div class="done"><div class="flagmark">⛳</div><h4>This time is now full</h4>
      <p>${s.players.map(p => esc(p.name)).join(', ')}</p><button class="primary" id="other">Pick another time</button></div>`
    $('other').onclick = back
    return
  }
  const byId = id => members.find(m => m.id === id)
  const used = S.picked.length + S.guests.length
  const left = points.allowance - points.mine.reduce((t, x) => t + x.points, 0), after = left - cost * S.guests.length
  const canGuest = used < max && after >= cost

  let slots = `<div class="pslot filled"><span class="av">${ini(me.name)}</span><span class="who"><strong>${esc(me.name)} (you)</strong><small>${esc(sub(me))}</small></span><span></span></div>`
  S.picked.forEach(id => { const m = byId(id); slots += `<div class="pslot filled"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>${esc(sub(m))}</small></span><button class="x" data-rm="${id}" aria-label="Remove ${esc(m.name)}">×</button></div>` })
  S.guests.forEach((g, n) => { slots += `<div class="pslot filled guest"><span class="av gst">${ini(g.name)}</span><span class="who"><strong>${esc(g.name)} <span class="pill tag">Guest</span></strong><small>${[g.club, g.gui && 'GUI ' + g.gui, g.hcp != null ? 'HCP ' + fmtHcp(g.hcp) : 'handicap later'].filter(Boolean).map(esc).join(' · ')}</small></span><span class="gright"><span class="ptag">−${cost} pts</span><button class="x" data-rg="${n}" aria-label="Remove guest ${esc(g.name)}">×</button></span></div>` })
  for (let k = 1 + used; k < free; k++) slots += '<button class="pslot open" data-open><span class="av empty">+</span><span class="who"><strong>Open space</strong><small>Tap to add a player or guest</small></span><span class="chev">›</span></button>'
  s.players.forEach(p => (slots += `<div class="pslot other"><span class="av other">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}</strong><small>Already booked</small></span><span></span></div>`))

  $('main').innerHTML = `<div class="screen">
    <div class="card summary"><div><span>Date</span><b>${dayMonth(date)}</b></div><div><span>Tee</span><b>${hhmm(s.time)}</b></div><div><span>Spaces</span><b>${free} / ${s.capacity}</b></div></div>
    <h3>Your group</h3><div class="players">${slots}</div>
    ${max === 0 ? `<div class="hint">Only one space left, so this one's just you.</div>` : ''}
    <div class="card ptsbox"><div class="ptsrow"><span><b>Guest points</b><small>${points.allowance} a year · resets 1 Jan</small></span><span class="ptsnum">${after}<small> left</small></span></div>${bar(after, points.allowance)}
      <span class="hint">${S.guests.length ? `This booking uses ${cost * S.guests.length} of your ${left} points.` : left < cost ? "You don't have enough guest points left for this course." : `You have ${left} points left this year.`}</span></div>
  </div>
  <div class="cta"><div class="tot">${1 + used} player${used ? 's' : ''}<b>${fee ? `€${fee * (1 + S.picked.length)}` : "Members' time"}</b></div><button class="primary" id="confirm">Confirm booking</button></div>`

  const taken = new Set([me.id, ...S.picked, ...s.players.map(p => p.memberId)])
  if (S.gmodal === 'pick') pickSheet(members.filter(m => !taken.has(m.id)), buddies, canGuest, points, left)
  else if (S.gmodal) guestForm(points, after)
  document.querySelectorAll('[data-open]').forEach(b => (b.onclick = () => { S.gmodal = 'pick'; keepScroll(render) }))
  document.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { S.picked = S.picked.filter(x => x !== +b.dataset.rm); keepScroll(render) }))
  document.querySelectorAll('[data-rg]').forEach(b => (b.onclick = () => { S.guests.splice(+b.dataset.rg, 1); keepScroll(render) }))
  $('confirm').onclick = async e => {
    e.target.disabled = true
    try {
      S.lastBooking = await api.bookTeeTime({ slotId: s.id, memberIds: S.picked, guests: S.guests })
    } catch (err) {
      let msg = err.message
      if (/just been taken/.test(msg)) { // lost it in a rush: say where there's still room
        const fresh = await api.getTeeSheet(isoDate(date)).catch(() => null)
        if (fresh) msg += ` ${nextFreeNote(fresh.filter(x => x.id !== s.id), s.time, 1 + S.picked.length + S.guests.length)}`
      }
      toast(msg)
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

// Tapping an open space: your buddies first, search everyone, or add a guest.
function pickSheet(choices, buddies, canGuest, points, left) {
  const row = m => `<button class="brow" data-add="${m.id}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>${esc(sub(m))}</small></span><span class="chev">+</span></button>`
  const mine = choices.filter(m => buddies.includes(m.id))
  const list = q => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return mine.length ? `<div class="hint">Your playing partners</div>${mine.map(row).join('')}` : '<div class="empty-state">Search for a member above.</div>'
    const hits = choices.filter(m => words.every(w => m.name.toLowerCase().includes(w))).slice(0, 30)
    return hits.length ? hits.map(row).join('') : '<div class="empty-state">No members match.</div>'
  }
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="ptitle">
    <h4 id="ptitle">Add to your group</h4>
    <button class="ghost guestbtn" id="addG" ${canGuest ? '' : 'disabled'}>+ Add a guest <small>${canGuest ? `${points.cost} points` : left < points.cost ? 'not enough guest points' : ''}</small></button>
    <label for="pq">Find a member</label><input id="pq" type="search" autocomplete="off" placeholder="Type a name">
    <div class="pick picklist" id="plist">${list('')}</div>
    <div class="gm-btns"><button type="button" class="ghost" id="pcancel">Cancel</button></div>
  </div></div>`
  const close = () => { S.gmodal = false; keepScroll(render) }
  const wire = () => document.querySelectorAll('[data-add]').forEach(b => (b.onclick = () => { S.picked = [...S.picked, +b.dataset.add]; close() }))
  wire()
  $('pq').oninput = e => { $('plist').innerHTML = list(e.target.value); wire() }
  $('addG').onclick = () => { S.gmodal = true; keepScroll(render) }
  $('pcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
}

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
