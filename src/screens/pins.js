// Admin → Pins (committee): set today's pin positions and publish them to the Course tab.
import * as api from '../api.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { flagOf, FLAGCOL, FLAGNAME } from '../course-art.js'
import { today } from '../dates.js'
import { toAdmin } from './nav.js'

let draft // edits in progress, kept until published or you leave via Back
export async function load() {
  const [course, sheet] = await Promise.all([api.getCourse(), api.getPins(today())])
  draft ??= sheet.pins
  return { course, sheet }
}

export function draw({ course, sheet }) {
  header('Pins', `Today · set ${esc(sheet.setAt)} by ${esc(sheet.setBy)}`, () => { draft = null; toAdmin() })
  $('main').innerHTML = `<div class="screen"><div class="hint">Yards on from the front edge. The flag colour follows: red front third, white middle, blue back.</div>
   <div class="card list">${course.holes.map((h, i) => {
     const { yardsOn: d, side: s } = draft[i], g = h.greenDepth, f = flagOf(d, g)
     return `<div class="pinrow"><div class="t"><strong>${h.n} · ${esc(h.name)}</strong><span class="hint"><i class="fl" style="background:${FLAGCOL[f]}"></i>${FLAGNAME[f]}</span></div>
     <div class="c"><span class="stepper sm"><button data-pd="${i}" data-d="-1" aria-label="Hole ${h.n} pin nearer">−</button><output>${d}</output><button data-pd="${i}" data-d="1" aria-label="Hole ${h.n} pin further">+</button><span class="hint">of ${g} yds</span></span>
     <span class="lcr" role="group" aria-label="Hole ${h.n} side">${['L', 'C', 'R'].map(x => `<button data-ps="${i}" data-s="${x}" aria-pressed="${s === x}">${x}</button>`).join('')}</span></div></div>`
   }).join('')}</div></div>
   <div class="cta"><button class="primary" id="pub">Publish pins to members</button></div>`
  document.querySelectorAll('[data-pd]').forEach(b => (b.onclick = () => {
    const i = +b.dataset.pd, p = draft[i], v = p.yardsOn + +b.dataset.d
    if (v < 3 || v > course.holes[i].greenDepth - 3) return
    p.yardsOn = v
    keepScroll(render)
  }))
  document.querySelectorAll('[data-ps]').forEach(b => (b.onclick = () => { draft[+b.dataset.ps].side = b.dataset.s; keepScroll(render) }))
  $('pub').onclick = async () => {
    await api.publishPins(draft)
    draft = null
    await toAdmin()
    toast('Pins published to the Course tab')
  }
}
