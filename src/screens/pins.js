// Admin → Pins: set today's pin positions and publish them to the Course tab.
// Each hole reads like a sentence: "Flag is 3 yds from [back] and 1 yd from [right]".
import * as api from '../api.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { flagOf, FLAGCOL, FLAGNAME, pinDistances, pinFrom } from '../course-art.js'
import { today } from '../dates.js'
import { toAdmin } from './nav.js'

let draft // edits in progress, kept until published or you leave via Back
let widthOpen = null // hole whose green width is being edited

export async function load() {
  const [course, sheet] = await Promise.all([api.getCourse(), api.getPins(today())])
  draft ??= structuredClone(sheet.pins)
  return { course, sheet }
}

// The number shown is measured from whichever edge the admin picked.
const shownDepth = (p, h) => pinDistances(h, p)[p.depthRef === 'back' ? 'back' : 'front']
const shownSide = (p, h) => pinDistances(h, p)[p.sideRef === 'right' ? 'right' : 'left']
const yd = n => `yd${n === 1 ? '' : 's'}`

export function draw({ course, sheet }) {
  header('Pins', `Today · set ${esc(sheet.setAt)} by ${esc(sheet.setBy)}`, () => { draft = null; widthOpen = null; toAdmin() })
  const seg = (hole, kind, a, b, cur) => `<span class="lcr pinseg" role="group">${[a, b].map(x => `<button data-ref="${hole}" data-kind="${kind}" data-v="${x}" aria-pressed="${cur === x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</span>`
  const step = (hole, kind, v) => `<span class="stepper sm"><button data-step="${hole}" data-kind="${kind}" data-d="-1" aria-label="Closer">−</button><output>${v}</output><button data-step="${hole}" data-kind="${kind}" data-d="1" aria-label="Further">+</button></span>`
  $('main').innerHTML = `<div class="screen">
   <div class="hint">For each hole, how far the flag is from the front or back of the green, and from the left or right edge (looking from the fairway). Yards. The flag colour follows: red front third, white middle, blue back.</div>
   <div class="card list">${course.holes.map((h, i) => {
     const p = draft[i], f = flagOf(p.yardsOn, h.greenDepth), dv = shownDepth(p, h), sv = shownSide(p, h)
     return `<div class="pinrow"><div class="t"><strong>${h.n} · ${esc(h.name)}</strong><span class="hint"><i class="fl" style="background:${FLAGCOL[f]}"></i>${FLAGNAME[f]}</span></div>
       <div class="pinline"><span class="hint">Flag is</span>${step(i, 'depth', dv)}<span class="hint">${yd(dv)} from</span>${seg(i, 'depth', 'front', 'back', p.depthRef)}</div>
       <div class="pinline"><span class="hint">and</span>${step(i, 'side', sv)}<span class="hint">${yd(sv)} from</span>${seg(i, 'side', 'left', 'right', p.sideRef)}</div>
       <div class="pinfoot"><span class="hint">Green ${h.greenDepth} deep × ${h.greenWidth} wide${h.greenWidthEstimated ? ' (width estimated)' : ''}</span><button class="linkbtn" data-w="${h.n}">${widthOpen === h.n ? 'Cancel' : 'Correct width'}</button></div>
       ${widthOpen === h.n ? `<div class="gedit"><span class="hint">Green width (yds)</span><span class="stepper sm"><button data-wd="-1" aria-label="Narrower">−</button><output id="wv">${h.greenWidth}</output><button data-wd="1" aria-label="Wider">+</button></span><button class="primary" id="wsave" style="flex:0 0 auto;padding:8px 14px">Save</button></div>` : ''}
     </div>`
   }).join('')}</div></div>
   <div class="cta"><button class="primary" id="pub">Publish pins to members</button></div>`

  document.querySelectorAll('[data-ref]').forEach(b => (b.onclick = () => {
    const p = draft[+b.dataset.ref]
    p[b.dataset.kind === 'depth' ? 'depthRef' : 'sideRef'] = b.dataset.v // same pin, measured from the other edge
    keepScroll(render)
  }))
  document.querySelectorAll('[data-step]').forEach(b => (b.onclick = () => {
    const i = +b.dataset.step, h = course.holes[i], p = draft[i], d = +b.dataset.d
    let dv = shownDepth(p, h), sv = shownSide(p, h)
    if (b.dataset.kind === 'depth') dv += d
    else sv += d
    if (dv < 1 || dv > h.greenDepth - 1 || sv < 1 || sv > h.greenWidth - 1) return
    Object.assign(p, pinFrom(h, p.depthRef, dv, p.sideRef, sv))
    keepScroll(render)
  }))
  document.querySelectorAll('[data-w]').forEach(b => (b.onclick = () => { widthOpen = widthOpen === +b.dataset.w ? null : +b.dataset.w; keepScroll(render) }))
  document.querySelectorAll('[data-wd]').forEach(b => (b.onclick = () => { const o = $('wv'); o.textContent = Math.max(8, Math.min(80, +o.textContent + +b.dataset.wd)) }))
  const ws = $('wsave')
  if (ws) ws.onclick = async () => {
    const n = widthOpen, w = +$('wv').textContent, i = n - 1, p = draft[i], h = course.holes[i]
    await api.setGreenWidth(n, w)
    // Keep the pin where it was measured from: "1 yd from the right" stays 1 from the right.
    const side = Math.min(shownSide(p, h), w - 1)
    Object.assign(p, pinFrom({ ...h, greenWidth: w }, p.depthRef, shownDepth(p, h), p.sideRef, side))
    widthOpen = null
    await keepScroll(render)
    toast(`Hole ${n} green is ${w} yds wide`)
  }
  $('pub').onclick = async () => {
    await api.publishPins(draft)
    draft = null
    await toAdmin()
    toast('Pins published to the Course tab')
  }
}
