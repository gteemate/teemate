// Club admin → Tee time requests: members asking for a day not open yet. Approve books it straight away as the
// member (every booking check; if it's refused the reason shows and the request keeps waiting); Decline needs a note.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { fromIso, longDay, hhmm } from '../dates.js'
import { requestStatus } from '../requests.js'

export async function load() {
  const [requests, members] = await Promise.all([api.getTeeTimeRequests(), api.getMembers()])
  const waiting = requests.filter(r => r.status === 'pending')
  const sheets = Object.fromEntries(await Promise.all([...new Set(waiting.map(r => r.date))].map(async d => [d, await api.getTeeSheet(d)])))
  const room = r => { const s = sheets[r.date]?.find(x => x.id === r.slotId); return s ? s.capacity - s.players.length : 0 }
  return { waiting: waiting.map(r => ({ ...r, room: room(r) })), answered: requests.filter(r => r.status !== 'pending').slice(0, 20), members }
}

export function draw({ waiting, answered, members }) {
  header('Tee time requests', waiting.length ? `<b>${waiting.length}</b> waiting` : 'Nothing waiting')
  const name = id => members.find(m => m.id === id)?.name ?? 'A member'
  const who = r => [r.member?.name ?? name(r.memberId), ...r.memberIds.map(name), ...r.guests.map(g => `${g.name} (guest)`)]
  const need = r => 1 + r.memberIds.length + r.guests.length
  const decline = S.trqDecline // the request being declined (note box open)
  $('main').innerHTML = `<div class="screen">
    ${waiting.length ? waiting.map(r => `<div class="card comp${r.room >= need(r) ? '' : ' short'}">
      <span class="row"><span class="ct">${esc(r.member?.name ?? name(r.memberId))}</span><span class="pill">${longDay(fromIso(r.date))} · ${hhmm(r.time)}</span></span>
      <span class="sub">${esc(who(r).join(', '))}</span>
      <span class="why">“${esc(r.reason)}”</span>
      <span class="rqst ${r.room >= need(r) ? 'ok' : 'no'}">${r.room >= need(r) ? `${r.room} space${r.room === 1 ? '' : 's'} free for ${need(r)}` : r.room ? `Only ${r.room} space${r.room === 1 ? '' : 's'} left for ${need(r)}` : 'That time is now full'}</span>
      ${decline === r.id ? `<label for="trq-note">Note for ${esc((r.member?.name ?? 'the member').split(' ')[0])}</label><textarea id="trq-note" class="plainsel" rows="2" maxlength="300" placeholder="e.g. Medal that morning. Try 12:00?"></textarea>
        <div class="bk-btns"><button class="ghost" data-trq-back>Back</button><button class="primary" data-trq-dec="${r.id}">Decline</button></div>`
      : `<div class="bk-btns"><button class="ghost" data-trq-no="${r.id}">Decline</button><button class="primary" data-trq-yes="${r.id}">Approve and book</button></div>`}
    </div>`).join('') : '<div class="empty-state">No requests waiting. When a member asks for a tee time on a day that isn’t open yet, it shows here.</div>'}
    ${answered.length ? `<h3>Answered</h3>${answered.map(r => `<div class="card comp"><span class="row"><span>${esc(r.member?.name ?? name(r.memberId))}</span><span class="sub">${longDay(fromIso(r.date))} · ${hhmm(r.time)}</span></span><span class="rqst">${esc(requestStatus(r).text)}</span></div>`).join('')}` : ''}
  </div>`
  document.querySelectorAll('[data-trq-yes]').forEach(b => (b.onclick = async () => {
    b.disabled = true
    try { await api.decideTeeTimeRequest(+b.dataset.trqYes, true) } catch (err) { toast(err.message); b.disabled = false; return } // e.g. full, 2-hour rule, guest points
    await keepScroll(render); toast('Approved and booked')
  }))
  document.querySelectorAll('[data-trq-no]').forEach(b => (b.onclick = () => { S.trqDecline = +b.dataset.trqNo; keepScroll(render) }))
  document.querySelectorAll('[data-trq-back]').forEach(b => (b.onclick = () => { S.trqDecline = null; keepScroll(render) }))
  document.querySelectorAll('[data-trq-dec]').forEach(b => (b.onclick = async () => {
    const note = $('trq-note').value.trim()
    if (!note) { toast('Add a note saying why'); $('trq-note').focus(); return }
    b.disabled = true
    try { await api.decideTeeTimeRequest(+b.dataset.trqDec, false, note) } catch (err) { toast(err.message); b.disabled = false; return }
    S.trqDecline = null; await keepScroll(render); toast('Declined. They’ll see your note.')
  }))
  if ($('trq-note')) $('trq-note').focus()
}
