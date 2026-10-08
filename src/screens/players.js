// Scores → Change players: pick the three buddies you're playing with.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast } from '../ui.js'
import { getRound, setRound, newRound } from './scores.js'
import { buildLibrary } from '../games.js'

export async function load() {
  const [members, buddies, course, games, me] = await Promise.all([api.getMembers(), api.getBuddies(), api.getCourse(), api.getGameSettings(), api.getMe()])
  return { members, buddies, course, L: buildLibrary(games), me }
}

export function draw({ members, buddies, course, L, me }) {
  header('Players', "Pick the three you're playing with.", () => { S.pickTmp = null; S.sview = 'card'; render() })
  const myB = members.filter(m => buddies.includes(m.id)), t = S.pickTmp
  $('main').innerHTML = `<div class="screen"><div class="pick">${myB.map(m => {
    const on = t.includes(m.id), dis = !on && t.length >= 3
    return `<button class="brow" data-p="${m.id}" aria-pressed="${on}" ${dis ? 'disabled' : ''}><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong><small>HI ${m.hcp} · GUI ${m.gui}</small></span><span class="check">${on ? '✓' : ''}</span></button>`
  }).join('')}</div>
    <button class="ghost" id="more">+ Add buddies</button>
    <div class="hint">Changing players starts a new scorecard.</div></div>
    <div class="cta"><button class="primary" id="ok" ${t.length === 3 ? '' : 'disabled'}>${t.length === 3 ? 'Use these players' : `Pick ${3 - t.length} more`}</button></div>`
  document.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.p
    S.pickTmp = t.includes(id) ? t.filter(x => x !== id) : [...t, id]
    keepScroll(render)
  }))
  $('more').onclick = async () => { S.tab = 'admin'; S.aview = 'buddies'; S.bseg = 'find'; S.bfrom = 'players'; await render(); top0() }
  $('ok').onclick = async () => {
    const round = getRound()
    if (S.pickTmp.join() !== round.players.slice(1).join()) {
      setRound(newRound(course, [me.id, ...S.pickTmp], round.game))
      await api.saveRound(getRound())
      if (L.lib[round.game]?.play?.pairs) S.gmenu = true
      toast('New scorecard started')
    }
    S.pickTmp = null
    S.sview = 'card'
    await render()
    top0()
  }
}

