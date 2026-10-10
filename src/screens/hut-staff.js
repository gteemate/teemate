// Hut screen (hut staff and admins): today's orders, oldest first. Mark them Ready, then Collected, or Cancel with
// a reason (the player sees it). Refreshes itself every 15 seconds while it's open.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { hhmm } from '../dates.js'
import { nextStatuses, penceText } from '../hut.js'

export async function load() {
  const [hut, orders] = await Promise.all([api.getHut(), api.hutOrdersToday()])
  return { hut, orders }
}

const LABEL = { ready: 'Ready', collected: 'Collected', cancelled: 'Cancel' }
const STATUS = { sent: 'New', ready: 'Ready: waiting to be collected', collected: 'Collected', cancelled: 'Cancelled' }
const ago = t => { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60e3)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago` }

let timer = null
function keepFresh() {
  clearInterval(timer)
  timer = setInterval(() => { if (!$('hutstaff') || $('modal').innerHTML) { if (!$('hutstaff')) clearInterval(timer); return } keepScroll(render) }, 15e3)
}

export function draw({ hut, orders }) {
  header('Halfway hut orders', hut.on ? 'Ordering is on' : 'Ordering is off: no new orders (finish any still waiting)')
  const waiting = orders.filter(o => o.status === 'sent' || o.status === 'ready'), done = orders.filter(o => !waiting.includes(o))
  const card = o => `<div class="card hutord ${o.status}">
    <div class="hutord-top"><b>${esc(o.memberName)}${o.time != null ? ` · ${hhmm(o.time)} tee time` : ''}</b><span class="hint">${ago(o.createdAt)}</span></div>
    <span class="hint">${STATUS[o.status]}</span>
    <ul class="hutitems">${o.items.map(i => `<li><b class="num">${i.qty}</b> × ${esc(i.name)}</li>`).join('')}</ul>
    ${o.note ? `<span class="hutnote">“${esc(o.note)}”</span>` : ''}
    ${o.status === 'cancelled' && o.cancelNote ? `<span class="hint">${esc(o.cancelNote)}</span>` : ''}
    <div class="hutord-top"><b class="num">${penceText(o.totalPence)}</b><span class="bk-btns">${nextStatuses(o.status).map(s => `<button class="${s === 'cancelled' ? 'ghost' : 'primary'} sm" data-o="${o.id}" data-to="${s}">${LABEL[s]}</button>`).join('')}</span></div>
  </div>`
  $('main').innerHTML = `<div class="screen" id="hutstaff">
    ${waiting.length ? waiting.map(card).join('') : '<div class="empty-state">No orders waiting.</div>'}
    ${done.length ? `<details class="hutdone"><summary>Done today (${done.length})</summary>${done.slice().reverse().map(card).join('')}</details>` : ''}
    <span class="hint">Updates every 15 seconds. Players pay when they collect.</span>
  </div>`
  document.querySelectorAll('[data-o]').forEach(b => (b.onclick = async () => {
    const id = +b.dataset.o, to = b.dataset.to
    if (to === 'cancelled') return cancelSheet(orders.find(o => o.id === id))
    b.disabled = true
    try { await api.setHutOrderStatus(id, to) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render)
    toast(to === 'ready' ? 'Marked ready: the player has been told' : 'Collected')
  }))
  keepFresh()
}

function cancelSheet(o) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="hc-form" novalidate aria-labelledby="hc-t">
    <h4 id="hc-t">Cancel ${esc(o.memberName)}’s order?</h4>
    <label for="hc-why">Reason (the player sees it)</label><input id="hc-why" maxlength="200" autocomplete="off" placeholder="e.g. Sorry, out of bacon">
    <p class="gerr" id="hc-err" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="hc-keep">Keep it</button><button type="submit" class="primary">Cancel order</button></div>
  </form></div>`
  setTimeout(() => $('hc-why')?.focus(), 30)
  const close = () => { $('modal').innerHTML = '' }
  $('hc-keep').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('hc-form').onsubmit = async e => {
    e.preventDefault()
    const why = $('hc-why').value.trim()
    if (!why) { $('hc-err').textContent = 'Give a reason, so the player knows.'; return }
    try { await api.setHutOrderStatus(o.id, 'cancelled', why) } catch (err) { $('hc-err').textContent = err.message; return }
    close(); await keepScroll(render); toast('Order cancelled')
  }
}
