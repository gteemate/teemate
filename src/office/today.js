// Club office → Today: everything waiting for a decision (people asking to join, tee time requests for days not
// open yet, disputed knockout results), then today at a glance and what's coming up.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast, top0 } from '../ui.js'
import { eventDates, eventLastDay, fromIso, hhmm, isoDate, longDay, today, addDaysIso } from '../dates.js'
import { entryName, roundName } from '../knockout.js'
import { summary, forgetSummary, clubComp, clubEvent, panel } from './shell.js'
import { confirmLine, noteSheet, reviewSheet } from '../paper/review.js'

export async function load() {
  const date = isoDate(today())
  const [s, sheet, hut, pins, events, signups, members, paper] = await Promise.all([summary(), api.getTeeSheet(date), api.getHut(), api.getPins(), api.getEvents(), api.getSignups(), api.getMembers(),
    api.getPaperConfirms().catch(() => [])])
  const orders = hut.on ? await api.hutOrdersToday() : []
  return { ...s, date, sheet: sheet ?? [], hut, orders, pinsToday: pins.date === date, events, signups, members, paper: paper.filter(c => c.confirmer == null) } // left for the office
}

export function draw({ joins, treqs, disputes, date, sheet, hut, orders, pinsToday, events, signups, members, paper = [] }) {
  const n = joins.length + treqs.length + disputes.length + paper.length
  header(longDay(fromIso(date)), n ? `<b>${n}</b> thing${n === 1 ? '' : 's'} waiting for you` : 'Nothing waiting for you')
  const name = id => members.find(m => m.id === id)?.name ?? 'A member'
  const booked = sheet.filter(s => s.players.length), players = sheet.reduce((t, s) => t + s.players.length, 0), guests = sheet.reduce((t, s) => t + s.players.filter(p => p.guest).length, 0)
  const soon = addDaysIso(date, 14)
  const coming = [
    ...events.filter(e => clubEvent(e) && e.startDate <= soon && eventLastDay(e) >= date)
      .map(e => ({ when: e.startDate <= date ? date : e.startDate, live: e.startDate <= date, html: `<b>${esc(e.name)}</b><span>${e.startDate <= date ? 'On now' : eventDates(e.startDate, 1)}${e.style === 'league' ? ` · ${e.weeks}-week league` : ''}</span>` })),
    ...signups.comps.filter(c => clubComp(c) && c.open && c.closesOn && c.closesOn >= date && c.closesOn <= soon)
      .map(c => ({ when: c.closesOn, live: false, html: `<b>${esc(c.name)}: entries close</b><span>${eventDates(c.closesOn, 1)} · ${signups.entries.filter(e => e.compId === c.id).length}${c.maxEntries ? ` of ${c.maxEntries}` : ''} entered</span>` })),
  ].sort((a, b) => a.when.localeCompare(b.when))

  const who = r => [r.member?.name ?? name(r.memberId), ...r.memberIds.map(name), ...r.guests.map(g => `${g.name} (guest)`)]
  $('main').innerHTML = `<div class="screen office">
    <div class="ostats">
      <div class="card ostat"><span>Tee times booked</span><b>${booked.length}<small> / ${sheet.length}</small></b><small>${sheet.length - booked.length} still free</small></div>
      <div class="card ostat"><span>Players out today</span><b>${players}</b><small>${guests ? `${guests} guest${guests === 1 ? '' : 's'}` : 'No guests'}</small></div>
      <div class="card ostat"><span>Halfway hut</span><b>${hut.on ? orders.length : 'Off'}</b><small>${hut.on ? `order${orders.length === 1 ? '' : 's'} so far` : 'Not taking orders'}</small></div>
      <div class="card ostat${pinsToday ? '' : ' warn'}"><span>Pins</span><b>${pinsToday ? 'Set' : 'Not set'}</b>${pinsToday ? '<small>Today’s flags are out</small>' : '<button class="linkbtn" id="o-pins">Set today’s flags</button>'}</div>
    </div>
    <h3>Needs you</h3>
    ${n ? `<div class="card olist">
      ${joins.map(r => `<div class="orow"><span class="av">${esc(ini(r.name))}</span><span class="ot"><b>${esc(r.name)} is asking to join</b><span>${esc(r.email)}</span></span>
        <span class="oacts"><button class="ghost sm" data-o-refuse="${r.id}">Refuse</button><button class="primary sm" data-o-letin="${r.id}">Let in</button></span></div>`).join('')}
      ${treqs.map(r => `<div class="orow"><span class="oic">📨</span><span class="ot"><b>${esc(r.member?.name ?? name(r.memberId))}: ${longDay(fromIso(r.date))} at ${hhmm(r.time)}</b><span>${esc(who(r).join(', '))} · “${esc(r.reason)}”</span></span>
        <span class="oacts"><button class="ghost sm" data-o-decline="${r.id}">Decline</button><button class="primary sm" data-o-book="${r.id}">Book it</button></span></div>`).join('')}
      ${paper.map(c => { const l = confirmLine(c, members); return `<div class="orow"><span class="oic">📷</span><span class="ot"><b>Score to confirm: ${esc(l.byName)} · ${l.gross}</b><span>Out ${l.out} · In ${l.in} · read from their paper card. Check it against the card handed in.</span></span>
        <span class="oacts"><button class="ghost sm" data-o-plook="${c.id}">See the card</button><button class="ghost sm" data-o-pback="${c.id}">Not right</button><button class="primary sm" data-o-pconf="${c.id}">Confirm</button></span></div>` }).join('')}
      ${disputes.map(d => `<div class="orow"><span class="oic">⚠️</span><span class="ot"><b>${esc(d.comp.name)}: ${esc(entryName(d.match.aEntry, d.entries, members))} v ${esc(entryName(d.match.bEntry, d.entries, members))}</b><span>${roundName(d.match.round, d.rounds)} · the result was questioned</span></span>
        <span class="oacts"><button class="primary sm" data-o-ko="${d.comp.id}">Set the result</button></span></div>`).join('')}
    </div>` : '<div class="card empty-state">All done. Nothing needs you right now.</div>'}
    <h3>Coming up</h3>
    ${coming.length ? `<div class="card olist">${coming.map(c => `<div class="orow"><span class="oic">🏆</span><span class="ot">${c.html}</span>${c.live ? '<span class="pill live">Live</span>' : ''}</div>`).join('')}</div>` : '<div class="card empty-state">No club competitions in the next two weeks.</div>'}
  </div>`

  const done = async msg => { forgetSummary(); await keepScroll(render); toast(msg) }
  if ($('o-pins')) $('o-pins').onclick = async () => { S.aview = 'pins'; await render(); top0() }
  // Paper scores left for the office: confirm against the card handed in, or send back with a note.
  const pc = id => paper.find(c => c.id === +id)
  const confirmP = async id => { try { await api.confirmPaperScore(+id) } catch (err) { toast(err.message); return } await keepScroll(render); toast('Score confirmed') }
  const backP = id => async note => { await api.sendBackPaperScore(+id, note); await keepScroll(render); toast('Sent back to the player') }
  document.querySelectorAll('[data-o-pconf]').forEach(b => (b.onclick = () => confirmP(b.dataset.oPconf)))
  document.querySelectorAll('[data-o-pback]').forEach(b => (b.onclick = () => noteSheet(backP(b.dataset.oPback))))
  document.querySelectorAll('[data-o-plook]').forEach(b => (b.onclick = () => reviewSheet(pc(b.dataset.oPlook), members, { confirm: () => confirmP(b.dataset.oPlook), back: backP(b.dataset.oPlook) })))
  document.querySelectorAll('[data-o-letin]').forEach(b => (b.onclick = async () => {
    const r = joins.find(x => x.id === +b.dataset.oLetin)
    b.disabled = true
    try { await api.saveMember({ name: r.name, email: r.email, hcp: 54, admin: false }) } catch (err) { toast(err.message); b.disabled = false; return }
    done(`${r.name} can sign in now`)
  }))
  document.querySelectorAll('[data-o-refuse]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return }
    const r = joins.find(x => x.id === +b.dataset.oRefuse)
    await api.declineRequest(r.id)
    done(`${r.name}’s request refused`)
  }))
  document.querySelectorAll('[data-o-book]').forEach(b => (b.onclick = async () => {
    b.disabled = true
    try { await api.decideTeeTimeRequest(+b.dataset.oBook, true) } catch (err) { toast(err.message); b.disabled = false; return } // e.g. full, guest points
    done('Booked: they’ll see it in their bookings')
  }))
  document.querySelectorAll('[data-o-decline]').forEach(b => (b.onclick = () => declineSheet(treqs.find(r => r.id === +b.dataset.oDecline), name, done)))
  document.querySelectorAll('[data-o-ko]').forEach(b => (b.onclick = async () => { Object.assign(S, { koComp: +b.dataset.oKo, koRound: null, koFrom: 'office', aview: 'ko' }); await render(); top0() }))
}

/** Declining needs a note for the member. Shared with the Tee sheet page. */
export function declineSheet(r, name, done) {
  const close = panel(`<h4>Decline the request</h4><p class="hint">${esc(r.member?.name ?? name(r.memberId))} · ${longDay(fromIso(r.date))} at ${hhmm(r.time)}</p>
    <label for="o-note">Note for ${esc((r.member?.name ?? name(r.memberId)).split(' ')[0])}</label><textarea id="o-note" class="plainsel" rows="3" maxlength="300" placeholder="e.g. Medal that morning. Try 12:00?"></textarea>
    <p class="gerr" id="o-err" role="alert"></p><div class="gm-btns"><button class="primary" id="o-dec">Decline</button></div>`)
  $('o-note').focus()
  $('o-dec').onclick = async () => {
    const note = $('o-note').value.trim()
    if (!note) { $('o-err').textContent = 'Add a note saying why.'; return }
    $('o-dec').disabled = true
    try { await api.decideTeeTimeRequest(r.id, false, note) } catch (err) { $('o-err').textContent = err.message; $('o-dec').disabled = false; return }
    close(); done('Declined. They’ll see your note.')
  }
}

