// Scores → Change players: use your tee time's four-ball, or pick up to three friends (favourites first).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, toast, fmtHcp } from '../ui.js'
import { getRound, setRound, newRound, lineupFromTeeTime } from './scores.js'
import { buildLibrary, NO_GAME } from '../games.js'
import { today, hhmm } from '../dates.js'

export async function load() {
  const [members, friends, course, games, me, teeTimes] = await Promise.all([
    api.getMembers(), api.getFriends(), api.getCourse(), api.getGameSettings(), api.getMe(), api.getMyTeeTimes(today()),
  ])
  return { members, buddies: friends.buddies, course, L: buildLibrary(games), me, teeTimes }
}

export function draw({ members, buddies, course, L, me, teeTimes }) {
  header('Players', 'Who are you playing with?', () => { S.pickTmp = null; S.sview = 'card'; render() })
  // Club friends, favourites first (friends from other clubs join a card through the booking, as guests).
  const fav = new Set(buddies.filter(b => b.favourite).map(b => b.id)), ids = new Set(buddies.map(b => b.id))
  const myB = members.filter(m => ids.has(m.id)).sort((a, b) => fav.has(b.id) - fav.has(a.id)), t = S.pickTmp
  const others = teeTimes.filter(s => s.players.length >= 2)
  $('main').innerHTML = `<div class="screen">
    ${others.map(s => `<button class="card evrow" data-slot="${s.id}"><span class="who"><strong>Use your ${hhmm(s.time)} tee time</strong><small>${s.players.filter(p => p.memberId !== me.id).map(p => esc(p.name) + (p.guest ? ' (guest)' : '')).join(', ')}</small></span><span class="pill">${s.players.length}</span></button>`).join('')}
    ${others.length ? '<h3>Or pick playing partners</h3>' : ''}
    <div class="pick">${myB.map(m => {
      const on = t.includes(m.id), dis = !on && t.length >= 3
      return `<button class="brow" data-p="${m.id}" aria-pressed="${on}" ${dis ? 'disabled' : ''}><span class="av">${ini(m.name)}</span><span class="who"><strong>${fav.has(m.id) ? '<span class="favmark" aria-label="Favourite">★</span> ' : ''}${esc(m.name)}</strong><small>HI ${fmtHcp(m.hcp)} · GUI ${m.gui ?? '–'}</small></span><span class="check">${on ? '✓' : ''}</span></button>`
    }).join('') || '<div class="empty-state">No playing partners yet.</div>'}</div>
    <button class="ghost" id="more">+ Add playing partners</button>
    <div class="hint">Pick 1 to 3. Better-ball games need four players. Changing players starts a new scorecard.</div></div>
    <div class="cta"><button class="primary" id="ok" ${t.length ? '' : 'disabled'}>${t.length ? `Use these ${t.length + 1} players` : 'Pick who you’re playing with'}</button></div>`

  const start = async (lineup, slotId, msg) => {
    const cur = getRound()
    const same = cur && JSON.stringify(cur.lineup) === JSON.stringify(lineup)
    if (!same) {
      setRound(newRound(course, lineup, NO_GAME, slotId)) // scores only until someone adds a match
      await api.saveRound(getRound())
      toast(msg)
    }
    S.pickTmp = null
    S.sview = same ? 'card' : 'counts' // a new card asks what it counts for
    await render()
    top0()
  }
  document.querySelectorAll('[data-slot]').forEach(b => (b.onclick = () => {
    const s = others.find(x => x.id === +b.dataset.slot)
    start(lineupFromTeeTime(s, me.id), s.id, `Card started for your ${hhmm(s.time)}`)
  }))
  document.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.p
    S.pickTmp = t.includes(id) ? t.filter(x => x !== id) : [...t, id]
    keepScroll(render)
  }))
  $('more').onclick = async () => { S.tab = 'home'; S.aview = 'buddies'; S.bseg = 'find'; S.bfrom = 'players'; await render(); top0() }
  $('ok').onclick = () => start([{ m: me.id }, ...S.pickTmp.map(m => ({ m }))], null, 'New scorecard started')
}
