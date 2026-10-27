// Admin → Tee times → a time: tap an open space to add a member or a guest, then confirm. With S.addTo (a booking I'm
// on, from its details): the same screen adds players to that booking instead (a fourth player, say).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast, parseHcp, fmtHcp, goBack } from '../ui.js'
import { isoDate, nextDays, dayMonth, longDay, hhmm, fromIso } from '../dates.js'
import { nextFreeNote } from '../release.js'
import { pickerGroups } from '../friend-link.js'
import { scanPeople } from '../scan-people.js'

export async function load() {
  const date = S.addTo ? fromIso(S.addTo.date) : S.reqMode ? fromIso(S.reqDate) : nextDays(S.day + 1)[S.day] // the day picked on the tee sheet (or for a request)
  const [sheet, me, members, friends, points] = await Promise.all([api.getTeeSheet(isoDate(date)), api.getMe(), api.getMembers(), api.getFriends(), api.getGuestPoints()])
  return { date, slot: sheet.find(s => (S.addTo ? s.time === S.addTo.time : s.id === S.slotId)), me, members, friends, points }
}

const back = () => { S.guests = []; S.gmodal = false; S.addTo = null; S.matchHold = null; return goBack(() => { S.aview = 'tee'; return render() }) } // to the tee sheet, or a match you came from

const sub = m => [m.gui && 'GUI ' + m.gui, m.hcp != null && 'HCP ' + fmtHcp(m.hcp)].filter(Boolean).join(' · ')

export function draw({ date, slot: s, me, members, friends, points }) {
  if (!s) { back(); return }
  const add = !!S.addTo // adding to a booking I'm on: I'm already on the time
  const hold = !add && !S.reqMode ? S.matchHold : null // a club singles match: the other places are held for it
  const free = s.capacity - s.players.length - (s.held ?? 0), max = add ? free : hold ? 1 : free - 1, fee = s.twilight ? 25 : 0, cost = points.cost
  header(add ? `Add to ${hhmm(s.time)}` : S.reqMode ? `Request ${hhmm(s.time)}` : hhmm(s.time), `${longDay(date)} · 1st tee`, back)
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

  let slots = add ? '' : `<div class="pslot filled"><span class="av">${ini(me.name)}</span><span class="who"><strong>${esc(me.name)} (you)</strong><small>${esc(sub(me))}</small></span><span></span></div>`
  S.picked.forEach(id => { const m = byId(id); slots += `<div class="pslot filled"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>${esc(sub(m))}</small></span>${hold ? '<span></span>' : `<button class="x" data-rm="${id}" aria-label="Remove ${esc(m.name)}">×</button>`}</div>` }) // a held match's opponent stays
  S.guests.forEach((g, n) => { slots += `<div class="pslot filled guest"><span class="av gst">${ini(g.name)}</span><span class="who"><strong>${esc(g.name)} <span class="pill tag">Guest</span></strong><small>${[g.club, g.gui && 'GUI ' + g.gui, g.hcp != null ? 'HCP ' + fmtHcp(g.hcp) : 'handicap later'].filter(Boolean).map(esc).join(' · ')}</small></span><span class="gright"><span class="ptag">−${cost} pts</span><button class="x" data-rg="${n}" aria-label="Remove guest ${esc(g.name)}">×</button></span></div>` })
  if (hold) for (let k = 2; k < s.capacity; k++) slots += `<div class="pslot held"><span class="av empty">⛳</span><span class="who"><strong>Held for your ${esc(hold.label)}</strong><small>Nobody else can book this place</small></span><span></span></div>`
  else for (let k = (add ? 0 : 1) + used; k < free; k++) slots += '<button class="pslot open" data-open><span class="av empty">+</span><span class="who"><strong>Open space</strong><small>Tap to add a player or guest</small></span><span class="chev">›</span></button>'
  s.players.forEach(p => (slots += `<div class="pslot other"><span class="av other">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.memberId === me.id ? ' (you)' : ''}</strong><small>Already booked</small></span><span></span></div>`))

  $('main').innerHTML = `<div class="screen">
    <div class="card summary"><div><span>Date</span><b>${dayMonth(date)}</b></div><div><span>Tee</span><b>${hhmm(s.time)}</b></div><div><span>Spaces</span><b>${free} / ${s.capacity}</b></div></div>
    <h3>Your group</h3><div class="players">${slots}</div>
    ${max === 0 ? `<div class="hint">Only one space left, so this one's just you.</div>` : ''}
    <div class="card ptsbox"><div class="ptsrow"><span><b>Guest points</b><small>${points.allowance} a year · resets 1 Jan</small></span><span class="ptsnum">${after}<small> left</small></span></div>${bar(after, points.allowance)}
      <span class="hint">${S.guests.length ? `This booking uses ${cost * S.guests.length} of your ${left} points.` : left < cost ? "You don't have enough guest points left for this course." : `You have ${left} points left this year.`}</span></div>
  ${S.reqMode ? `<div class="card evsec"><label for="rq-why">Why do you need this time?</label><textarea id="rq-why" class="plainsel" rows="3" maxlength="500" placeholder="e.g. Visitors flying in from Boston for one weekend">${esc(S.reqReason)}</textarea>
    <span class="hint">An admin approves (it’s booked for you straight away) or declines with a note. Nothing is held while you wait.</span></div>` : ''}
  </div>
  <div class="cta"><div class="tot">${add ? `${used} to add` : `${1 + used} player${used ? 's' : ''}`}<b>${fee ? `€${fee * (1 + S.picked.length)}` : "Members' time"}</b></div><button class="primary" id="confirm">${hold ? `Book ${esc(hold.label)}` : add ? 'Add to booking' : S.reqMode ? 'Send request' : 'Confirm booking'}</button></div>`

  const taken = new Set([me.id, ...S.picked, ...s.players.map(p => p.memberId)])
  if (S.gmodal === 'pick') pickSheet(members, friends, taken, canGuest, points, left, max)
  else if (S.gmodal) guestForm(points, after)
  document.querySelectorAll('[data-open]').forEach(b => (b.onclick = () => { S.gmodal = 'pick'; keepScroll(render) }))
  document.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { S.picked = S.picked.filter(x => x !== +b.dataset.rm); keepScroll(render) }))
  document.querySelectorAll('[data-rg]').forEach(b => (b.onclick = () => { S.guests.splice(+b.dataset.rg, 1); keepScroll(render) }))
  if ($('rq-why')) $('rq-why').oninput = e => { S.reqReason = e.target.value } // kept while players are added
  $('confirm').onclick = async () => {
    const btn = $('confirm') // kept: re-enabled after a refusal (don't rely on the click event once the server has answered)
    if (add) {
      if (!used) { toast('Add a player or guest first'); return }
      btn.disabled = true
      const names = [...S.picked.map(id => byId(id).name), ...S.guests.map(g => g.name)]
      try {
        await api.addToBooking(S.addTo.id, { memberIds: S.picked, guests: S.guests })
      } catch (err) { toast(err.message); await keepScroll(render); return }
      Object.assign(S, { addTo: null, picked: [], guests: [], aview: 'mine', navReset: true })
      await render()
      top0()
      toast(`${names.join(', ')} added to your ${hhmm(s.time)} booking`)
      return
    }
    if (S.reqMode) {
      if (!S.reqReason.trim()) { toast('Say why you need this time'); $('rq-why').focus(); return }
      btn.disabled = true
      try {
        await api.requestTeeTime({ slotId: s.id, memberIds: S.picked, guests: S.guests, reason: S.reqReason })
      } catch (err) { toast(err.message); btn.disabled = false; return }
      Object.assign(S, { guests: [], picked: [], reqMode: false, reqReason: '', aview: 'mine', navReset: true }) // done: back goes Home
      await render()
      top0()
      toast('Request sent. The answer will show in Booking.')
      return
    }
    btn.disabled = true
    try {
      S.lastBooking = hold ? await api.bookClubMatch({ slotId: s.id, opponent: hold.opp, kind: hold.kind, ref: hold.ref })
        : await api.bookTeeTime({ slotId: s.id, memberIds: S.picked, guests: S.guests })
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
    S.matchHold = null
    S.matchPart = null
    S.filter = 'all' // a match's "4 spaces" filter doesn't stay on the tee sheet
    S.aview = 'booked'
    S.navReset = true // done: back goes Home from here
    await render()
    top0()
  }
}

export const bar = (left, allowance) => `<span class="pbar"><i style="width:${Math.max(0, (left / allowance) * 100).toFixed(1)}%" class="${left <= 6 ? 'low' : ''}"></i></span>`

// Tapping an open space: favourites first, then your friends (club, then other clubs: they come in as guests,
// with the guest form filled in), search everyone, or add a guest.
function pickSheet(members, friends, taken, canGuest, points, left, max) {
  const guestNames = new Set(S.guests.map(g => g.name.trim().toLowerCase().replace(/\s+/g, ' ')))
  const row = r => r.kind === 'member'
    ? `<button class="brow" data-add="${r.m.id}"><span class="av">${ini(r.m.name)}</span><span class="who"><strong>${esc(r.m.name)}</strong><small>${esc(sub(r.m))}</small></span><span class="chev">+</span></button>`
    : `<button class="brow" data-addc="${r.c.id}" ${r.disabled ? 'disabled' : ''}><span class="av gst">${ini(r.c.name)}</span><span class="who"><strong>${esc(r.c.name)}</strong><small>${esc(r.c.club ?? 'Another club')} · guest${r.disabled ? ' · not enough guest points' : ` · ${points.cost} points`}</small></span><span class="chev">+</span></button>`
  const list = q => {
    const groups = pickerGroups({ members, friends, taken, guestNames, q, canGuest })
    if (groups.length) return groups.map(g => `<div class="hint">${g.title}</div>${g.rows.map(row).join('')}`).join('')
    return q.trim() ? '<div class="empty-state">No members match.</div>' : '<div class="empty-state">Search for a member above.</div>'
  }
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="ptitle">
    <h4 id="ptitle">Add to your group</h4>
    <button class="primary scanbtn" id="pscan">Scan their QR code</button>
    <button class="ghost guestbtn" id="addG" ${canGuest ? '' : 'disabled'}>+ Add a guest <small>${canGuest ? `${points.cost} points` : left < points.cost ? 'not enough guest points' : ''}</small></button>
    <label for="pq">Find a member</label><input id="pq" type="search" autocomplete="off" placeholder="Type a name">
    <div class="pick picklist" id="plist">${list('')}</div>
    <div class="gm-btns"><button type="button" class="ghost" id="pcancel">Cancel</button></div>
  </div></div>`
  const close = () => { S.gmodal = false; keepScroll(render) }
  const wire = () => {
    document.querySelectorAll('[data-add]').forEach(b => (b.onclick = () => { S.picked = [...S.picked, +b.dataset.add]; close() }))
    document.querySelectorAll('[data-addc]').forEach(b => (b.onclick = () => {
      const c = friends.contacts.find(x => x.id === +b.dataset.addc)
      S.guestPrefill = { name: c.name, club: c.club ?? '', gui: c.gui ?? '', hcp: c.hcp ?? '' }
      S.gmodal = true; keepScroll(render)
    }))
  }
  wire()
  $('pq').oninput = e => { $('plist').innerHTML = list(e.target.value); wire() }
  $('addG').onclick = () => { S.guestPrefill = null; S.gmodal = true; keepScroll(render) }
  $('pcancel').onclick = close
  // Scan their QR (the one on their Account card), one after another until the group is full: a club member joins the
  // group, a TeeMate player from another club joins as a guest (their details filled in). Each is kept as a friend.
  $('pscan').onclick = () => scanPeople(members, async p => {
    const room = () => max - S.picked.length - S.guests.length
    const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (p.member) {
      const m = p.member
      if (taken.has(m.id) || S.picked.includes(m.id)) { toast(`${m.name} is already in your group`); return room() > 0 }
      S.picked = [...S.picked, m.id]
      if (!friends.buddies.some(b => b.id === m.id)) api.addBuddy(m.id).catch(() => {})
      toast(`${m.name} added`)
    } else {
      const c = p.card
      if (S.guests.some(g => norm(g.name) === norm(c.name))) { toast(`${c.name} is already in your group`); return room() > 0 }
      if (left - points.cost * S.guests.length < points.cost) { toast(`Not enough guest points to bring ${c.name}`); return false }
      const hcp = c.hcp == null ? null : parseHcp(c.hcp)
      S.guests.push({ name: c.name, club: c.club ?? '', gui: c.gui ?? '', hcp: Number.isNaN(hcp) ? null : hcp })
      if (!friends.contacts.some(x => norm(x.name) === norm(c.name))) api.saveContact(c).catch(() => {})
      toast(`${c.name} added as a guest`)
    }
    const more = room() > 0
    if (!more) S.gmodal = false
    await keepScroll(render)
    return more
  })
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
}

function guestForm(points, after) {
  const pre = S.guestPrefill ?? {} // a friend from another club: their details, ready to check
  S.guestPrefill = null
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="gform" novalidate aria-labelledby="gtitle">
    <h4 id="gtitle">Add a guest</h4>
    <label for="g-name">Full name</label><input id="g-name" autocomplete="off" placeholder="e.g. Paul Hughes" value="${esc(pre.name ?? '')}">
    <label for="g-club">Home club <span class="opt">optional</span></label><input id="g-club" autocomplete="off" value="${esc(pre.club ?? '')}" placeholder="Leave blank if not a club member">
    <label for="g-gui">GUI number <span class="opt">optional</span></label><input id="g-gui" inputmode="numeric" autocomplete="off" value="${esc(pre.gui ?? '')}" placeholder="On their handicap card, if they have one">
    <label for="g-hcp">Handicap index <span class="opt">optional · you can set it later on the scorecard</span></label><input id="g-hcp" inputmode="decimal" autocomplete="off" value="${esc(pre.hcp ?? '')}" placeholder="e.g. 18.4, or +2">
    <p class="gerr" id="gerr" role="alert"></p>
    <div class="gcost"><span>Uses <b>${points.cost} points</b> on the ${esc(points.course)}</span><span>${after} → <b>${after - points.cost}</b> left</span></div>
    <div class="gm-btns"><button type="button" class="ghost" id="gcancel">Cancel</button><button type="submit" class="primary">Add guest</button></div>
  </form></div>`
  setTimeout(() => $(pre.name ? 'g-hcp' : 'g-name')?.focus(), 30)
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
