// Admin → Events (committee): list of team events.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render } from '../ui.js'
import { teamEventScore, fmtPts } from '../scoring.js'
import { toAdmin } from './nav.js'

export async function load() {
  return { events: await api.getEvents() }
}

export function draw({ events }) {
  header('Events', 'Team matches with their own leaderboard', toAdmin)
  $('main').innerHTML = `<div class="screen">
    ${events.map(e => {
      const sc = teamEventScore(Object.values(e.matches).flat())
      return `<button class="card evrow" data-ev="${e.id}"><span class="who"><strong>${esc(e.name)}</strong><small>${esc(e.A.name)} v ${esc(e.B.name)} · ${e.players.length} players · ${e.days} day${e.days > 1 ? 's' : ''}</small></span>${e.active ? '<span class="pill">Active</span>' : ''}<span class="evmini"><i style="background:${e.A.col}"></i>${fmtPts(sc.cA)}–${fmtPts(sc.cB)}<i style="background:${e.B.col}"></i></span></button>`
    }).join('')}
    <button class="primary" id="newev">+ Create event</button></div>`
  const open = async id => { S.evId = id; S.evStep = 1; S.aview = 'event'; await render(); top0() }
  document.querySelectorAll('[data-ev]').forEach(b => (b.onclick = () => open(+b.dataset.ev)))
  $('newev').onclick = async () => open((await api.createEvent()).id)
}
