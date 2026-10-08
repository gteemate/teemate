// Course tab: the yardage book for every hole, with today's pins.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, top0, render, nn, asset } from '../ui.js'
import { flagOf, FLAGCOL, greenPic, holeGrid, pinDistances } from '../course-art.js'

let course
export async function load() {
  course ??= await api.getCourse()
  return { course, pinSheet: await api.getPins(new Date()) }
}

export function draw({ course, pinSheet }) {
  const i = S.hole, h = course.holes[i], pins = pinSheet.pins, pin = pins[i]
  const d = pin.yardsOn, g = h.greenDepth, f = flagOf(d, g), par3 = h.par === 3
  const par = course.holes.reduce((t, x) => t + x.par, 0)
  const whites = course.holes.reduce((t, x) => t + x.yards.white, 0)
  header('Course', `${esc(course.name)} · Par ${par} · <b>${whites.toLocaleString('en-GB')}</b> yds from the whites`)
  $('main').innerHTML = `<div class="screen">
   ${holeGrid(i, j => `<span class="flagdot" style="background:${FLAGCOL[flagOf(pins[j].yardsOn, course.holes[j].greenDepth)]}"></span>`, 'data-h')}
   <div class="holetitle"><h4>Hole ${h.n} <span>· Par ${h.par} · SI ${h.si}</span></h4><p>${esc(h.name)}</p></div>
   <div class="teeyds">${course.tees.map(t => `<span><i style="background:${t.colour}"></i>${h.yards[t.key]}</span>`).join('')}</div>
   <div class="seg" role="group"><button data-ci="hole" aria-pressed="${S.cimg === 'hole'}">Hole</button><button data-ci="appr" aria-pressed="${S.cimg === 'appr'}">${par3 ? 'About the hole' : 'Approach'}</button></div>
   <div class="imgcard"><img src="${asset(`holes/${S.cimg}${nn(h.n)}.jpg`)}" width="576" height="900" alt="Yardage guide page for hole ${h.n}, ${esc(h.name)}"></div>
   <div class="hint">White numbers are yards to the front of the green. Boxed numbers are distances from the back of each numbered tee.</div>
   <div class="card pincard">${greenPic(h, pin)}<div style="display:flex;flex-direction:column;gap:12px;min-width:0">
     <b style="font-size:18px">Today's pin</b>
     <div class="facts">${Object.entries(pinDistances(h, pin)).map(([k, v]) => `<div><span>${k[0].toUpperCase() + k.slice(1)}</span><b>${v}</b></div>`).join('')}</div>
     <div class="pinsum"><i class="fl" style="background:${FLAGCOL[f]}"></i>${f[0].toUpperCase() + f.slice(1)} flag · yards from each edge of a ${g} × ${h.greenWidth} yd green</div>
     <small class="hint">Set ${esc(pinSheet.setAt)} today · Stimp 10.5</small></div></div>
   <div class="holenav"><button class="ghost" id="prev" ${i === 0 ? 'disabled' : ''}>‹ Hole ${i || 1}</button><button class="ghost" id="next" ${i === 17 ? 'disabled' : ''}>Hole ${Math.min(i + 2, 18)} ›</button></div>
  </div>`
  document.querySelectorAll('[data-h]').forEach(b => (b.onclick = () => { S.hole = +b.dataset.h; keepScroll(render) }))
  document.querySelectorAll('[data-ci]').forEach(b => (b.onclick = () => { S.cimg = b.dataset.ci; keepScroll(render) }))
  $('prev').onclick = async () => { S.hole--; await render(); top0() }
  $('next').onclick = async () => { S.hole++; await render(); top0() }
}
