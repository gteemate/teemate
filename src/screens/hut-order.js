// Halfway hut (player): order hot food ahead (it's what takes the time; pay when you collect), see what drinks and
// snacks the hut has (bought there), and today's orders with how they're getting on.
// Reached from the "Halfway hut is open" alert after hole 8, or Account → Halfway hut while the hut is on.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast, top0 } from '../ui.js'
import { menuSections, orderTotal, penceText, orderable } from '../hut.js'

export async function load() {
  const [hut, orders, card] = await Promise.all([api.getHut(), api.myHutOrders(), api.getCurrentRound()])
  return { hut, orders, card }
}

const STATUS = { sent: 'Sent to the hut', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled' }
const itemsText = o => o.items.map(i => (i.qty > 1 ? `${i.qty} × ${esc(i.name)}` : esc(i.name))).join(', ')
const ago = t => { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60e3)); return m < 1 ? 'just now' : `${m} min ago` }

export function draw({ hut, orders, card }) {
  const live = card && card.done.some(Boolean) && !card.submitted?.[card.game]
  // From the scorecard's "would you like to order?": back to the scorecard. From anywhere else (Account): back the way
  // you came. (Always going to the scorecard during a round made a loop: its back led here again.)
  const toCard = live && S.hutFrom === 'card'
  const back = async () => { S.hutPicks = {}; S.hutNote = ''; S.hutFrom = null; if (toCard) { S.tab = 'scores'; S.sview = 'card' } else S.aview = 'account'; await render(); top0() }
  header('Halfway hut', hut.on ? 'Pay when you collect at the hut' : 'Not taking orders just now', back, toCard ? 'Scorecard' : 'Back')
  const picks = (S.hutPicks ??= {})
  const total = orderTotal(hut.menu, picks), count = Object.values(picks).reduce((t, q) => t + q, 0)
  const row = i => { const q = picks[i.id] ?? 0; return `<div class="lrow hutrow"><span class="who"><strong>${esc(i.name)}</strong><small>${penceText(i.pricePence)}</small></span>
    <span class="stepper"><button type="button" data-minus="${i.id}" aria-label="One less ${esc(i.name)}" ${q ? '' : 'disabled'}>−</button><b class="num" aria-live="polite">${q}</b><button type="button" data-plus="${i.id}" aria-label="One more ${esc(i.name)}" ${q >= 20 ? 'disabled' : ''}>+</button></span></div>` }
  const orderRow = o => `<div class="card hutord ${o.status}"><div class="hutord-top"><b>${STATUS[o.status]}</b><span class="hint">${ago(o.createdAt)}</span></div>
    <span>${itemsText(o)} · <b class="num">${penceText(o.totalPence)}</b></span>${o.note ? `<span class="hint">“${esc(o.note)}”</span>` : ''}
    ${o.status === 'cancelled' && o.cancelNote ? `<span class="hint">${esc(o.cancelNote)}</span>` : ''}
    ${o.status === 'sent' ? `<button class="linkbtn" data-cancel="${o.id}">Cancel order</button>` : ''}</div>`
  const sections = menuSections(hut.menu)
  const food = sections.filter(s => s.items.some(orderable)).flatMap(s => s.items), atHut = sections.filter(s => !s.items.some(orderable))
  $('main').innerHTML = `<div class="screen">
    ${orders.length ? `<span class="kicker">Your orders today</span>${orders.map(orderRow).join('')}` : ''}
    ${hut.on ? (sections.length ? `${food.length ? `<span class="kicker">Hot food · order now, ready when you get there</span><div class="card list">${food.map(row).join('')}</div>` : '<div class="empty-state">No hot food on today.</div>'}
      ${food.length ? `<label for="hut-note" class="kicker">Anything else?</label><textarea id="hut-note" class="plainsel" rows="2" maxlength="200" placeholder="e.g. no onions, extra ketchup">${esc(S.hutNote ?? '')}</textarea>` : ''}
      ${atHut.map(s => `<span class="kicker">${s.section} · at the hut</span><div class="card list">${s.items.map(i => `<div class="lrow hutrow"><span class="who"><strong>${esc(i.name)}</strong></span><b class="num">${penceText(i.pricePence)}</b></div>`).join('')}</div>`).join('')}
      ` : '<div class="empty-state">Nothing on the menu just now.</div>')
      : '<div class="empty-state">The halfway hut isn’t taking orders just now.</div>'}
  </div>
  ${hut.on && food.length ? `<div class="cta"><div class="tot">${count ? `${count} item${count === 1 ? '' : 's'}` : 'Nothing yet'}<b>${penceText(total)}</b></div><button class="primary" id="hut-send" ${count ? '' : 'disabled'}>Send order</button></div>` : ''}`

  const step = (id, d) => { const q = Math.max(0, Math.min(20, (picks[id] ?? 0) + d)); if (q) picks[id] = q; else delete picks[id]; keepScroll(render) }
  document.querySelectorAll('[data-plus]').forEach(b => (b.onclick = () => step(+b.dataset.plus, 1)))
  document.querySelectorAll('[data-minus]').forEach(b => (b.onclick = () => step(+b.dataset.minus, -1)))
  if ($('hut-note')) $('hut-note').oninput = e => { S.hutNote = e.target.value }
  document.querySelectorAll('[data-cancel]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to cancel'; return }
    b.disabled = true
    try { await api.cancelMyHutOrder(+b.dataset.cancel) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render); toast('Order cancelled')
  }))
  const send = $('hut-send')
  if (send) send.onclick = async () => {
    send.disabled = true // no double orders on a slow signal
    try { await api.placeHutOrder(picks, S.hutNote, live ? card.id : null) } catch (err) { toast(err.message); send.disabled = false; return }
    toast('Order sent to the hut. Pay when you collect.')
    await back()
  }
}
