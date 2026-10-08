// Admin → Games (admins): turn games on/off, edit allowances, pick the preferred game per group size.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { buildLibrary } from '../games.js'
import { toAdmin } from './nav.js'

export async function load() {
  return { L: buildLibrary(await api.getGameSettings()) }
}

export function draw({ L }) {
  header('Games', "Pick each group's preferred game", toAdmin)
  const sec = n => {
    const s = L.sections[n]
    return `<div class="card gsec"><h4>${s.title}</h4>${s.games.map(x => {
      const pref = L.pref[n] === x.k, ed = S.gedit === x.k
      return `<div class="grow"><div class="gtop"><div class="who"><strong>${esc(x.name)}</strong><small>${esc(x.sub)}${x.pct != null ? ` ${x.pct}%` : ''}${+n === 4 && !x.play ? ' · not on the scorecard yet' : ''}</small></div>
        <div class="gctl">${x.pct != null ? `<button class="linkbtn edit" data-ed="${x.k}">${ed ? 'Done' : 'Edit'}</button>` : ''}<button class="switch" role="switch" aria-checked="${x.on}" aria-label="${esc(x.name)} on" data-tg="${x.k}" ${pref ? 'disabled' : ''}><span></span></button></div></div>
        <p>${esc(x.desc)}</p>
        ${ed ? `<div class="gedit"><span class="hint">Allowance</span><span class="stepper sm"><button data-pc="${x.k}" data-d="-5" aria-label="Lower allowance">−</button><output>${x.pct}%</output><button data-pc="${x.k}" data-d="5" aria-label="Raise allowance">+</button></span></div>` : ''}
        <button class="prefbtn${pref ? ' on' : ''}" data-pf="${x.k}" data-n="${n}" ${x.on ? '' : 'disabled'}>${pref ? '★ Preferred' : 'Make preferred'}</button></div>`
    }).join('')}</div>`
  }
  $('main').innerHTML = `<div class="screen">
    <div class="hint">Turn games on or off for the club. The preferred game is what a new card starts on for that group size; players can still change it from the drop-down on the Scores tab.</div>
    <div class="prefsum card">${[4, 3, 2].map(n => `<div><span>${n}-ball</span><b>${esc(L.lib[L.pref[n]].name)}</b></div>`).join('')}</div>
    ${sec(4)}${sec(3)}${sec(2)}</div>`
  document.querySelectorAll('[data-tg]').forEach(b => (b.onclick = async () => { const x = L.lib[b.dataset.tg]; await api.updateGame(x.k, { on: !x.on }); keepScroll(render) }))
  document.querySelectorAll('[data-pf]').forEach(b => (b.onclick = async () => {
    const n = +b.dataset.n, k = b.dataset.pf
    await api.setPreferredGame(n, k)
    toast(`${L.lib[k].name} is now the preferred ${n}-ball game`)
    keepScroll(render)
  }))
  document.querySelectorAll('[data-ed]').forEach(b => (b.onclick = () => { S.gedit = S.gedit === b.dataset.ed ? null : b.dataset.ed; keepScroll(render) }))
  document.querySelectorAll('[data-pc]').forEach(b => (b.onclick = async () => {
    const x = L.lib[b.dataset.pc]
    await api.updateGame(x.k, { pct: Math.max(0, Math.min(100, x.pct + +b.dataset.d)) })
    keepScroll(render)
  }))
}
