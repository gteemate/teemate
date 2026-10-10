// Admin → Games (every player): my preferred game for 2-, 3- and 4-ball cards.
// A new scorecard starts on it; it can still be changed from the card's game menu.
import * as api from '../api.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { buildLibrary, playable, preferredGame } from '../games.js'
import { toAdmin } from './nav.js'

export async function load() {
  return { L: buildLibrary(await api.getGameSettings()) }
}

export function draw({ L }) {
  header('Game preferences', 'Your preferred game for each group size', toAdmin)
  const sec = n => {
    const ok = playable(L, n), pick = preferredGame(L, n)
    const later = n < 4 ? L.sections[n].games.filter(x => x.on && !x.play) : []
    return `<div class="card gsec"><h4>${n} players</h4>
      <div class="games" role="radiogroup" aria-label="${n}-player game">${ok.map(x => `<button class="gamecard sm" role="radio" aria-checked="${x.k === pick}" data-n="${n}" data-k="${x.k}"><span class="radio"></span><span class="who"><strong>${esc(x.name)}</strong><small>${esc(x.desc)}${x.pct != null ? ` · ${x.pct}%` : ''}</small></span></button>`).join('')}</div>
      ${later.length ? `<span class="hint" style="margin-top:8px">Not on the scorecard yet: ${later.map(x => esc(x.name)).join(', ')}</span>` : ''}
    </div>`
  }
  $('main').innerHTML = `<div class="screen">
    <div class="hint">A new scorecard starts on your preferred game for the number of players. You can still switch game on the card.</div>
    ${sec(4)}${sec(3)}${sec(2)}</div>`
  document.querySelectorAll('[data-k]').forEach(b => (b.onclick = async () => {
    await api.setMyGamePref(+b.dataset.n, b.dataset.k)
    await keepScroll(render)
    toast(`${L.lib[b.dataset.k].name} is your ${b.dataset.n}-player game`)
  }))
}
