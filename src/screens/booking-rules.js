// Account → Club admin → Booking rules: when tee times open for booking (e.g. 8pm, 8 days before).
// The database enforces it (members can't book a day before it opens; admins can).
import * as api from '../api.js'
import { $, render, header, toast } from '../ui.js'
import { isoDate, today, addDaysIso } from '../dates.js'
import { opensAt, openLabel, timeLabel } from '../release.js'
import { toAdmin } from './nav.js'

let draft // unsaved changes while on this screen

export async function load() {
  const rules = await api.getBookingRules()
  draft = { time: rules.time, days: rules.days, weekendsOnly: rules.weekendsOnly }
  return { rules }
}

const long = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/** The next Saturday that hasn't opened yet, as an example of the rule. */
function example(rules) {
  let d = isoDate(today())
  for (let i = 0; i < 30; i++, d = addDaysIso(d, 1)) {
    const at = opensAt(d, rules)
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 6 && at && at > new Date()) return `${long(d)} ${openLabel(d, rules).replace(/^Opens/, 'opens')}`
  }
  return ''
}

export function draw() {
  header('Booking rules', 'When tee times open for booking', toAdmin)
  const d = draft
  $('main').innerHTML = `<div class="screen">
    <div class="card evsec">
      <label for="br-time">Release time</label><span class="hint">UK time. Tee times open at this time on the release day.</span>
      <input type="time" id="br-time" class="plainsel" value="${d.time}" step="300">
      <div class="gedit"><span class="hint">Days ahead</span><span class="stepper sm"><button data-dd="-1" aria-label="Fewer days" ${d.days <= 1 ? 'disabled' : ''}>−</button><output>${d.days}</output><button data-dd="1" aria-label="More days" ${d.days >= 13 ? 'disabled' : ''}>+</button></span></div>
      <span class="hint">Applies to</span>
      <div class="seg" role="group" aria-label="Applies to"><button data-we="0" aria-pressed="${!d.weekendsOnly}">Every day</button><button data-we="1" aria-pressed="${d.weekendsOnly}">Weekends only</button></div>
      ${d.weekendsOnly ? '<span class="hint">Weekday tee times can be booked any time ahead.</span>' : ''}
      <p class="brx"><b>${example(d)}.</b></p>
      <p class="gerr" id="brerr" role="alert"></p>
      <button class="primary" id="br-save">Save for everyone</button>
    </div>
    <div class="hint">Members can’t book a day before it opens. Admins can, for competitions and society days.</div>
  </div>`
  const redraw = () => draw()
  $('br-time').onchange = e => { if (/^\d\d:\d\d$/.test(e.target.value)) { d.time = e.target.value; redraw() } }
  document.querySelectorAll('[data-dd]').forEach(b => (b.onclick = () => { d.days = Math.max(1, Math.min(13, d.days + +b.dataset.dd)); redraw() }))
  document.querySelectorAll('[data-we]').forEach(b => (b.onclick = () => { d.weekendsOnly = b.dataset.we === '1'; redraw() }))
  $('br-save').onclick = async () => {
    $('br-save').disabled = true
    try {
      await api.setBookingRules(d)
    } catch (err) {
      $('brerr').textContent = err.message
      $('br-save').disabled = false
      return
    }
    await render()
    toast(`Booking rules saved: ${timeLabel(d.time)}, ${d.days} day${d.days === 1 ? '' : 's'} before${d.weekendsOnly ? ', weekends only' : ''}`)
  }
}
