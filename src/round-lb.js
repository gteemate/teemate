// In a round, the Leaderboard tab: the competition the card counts for (S.roundBoard) and today's scores at the club
// (when the leaderboard of the day is on, S.roundDayOn), with a switch between the two when there are both. A general
// round's tab is today's scores.
import { S } from './state.js'
import { $, esc, render, top0 } from './ui.js'

/** Point S at one of the tab's two boards: 'comp' (the card's competition) or 'today'. */
export function openRoundLb(which) {
  const rb = S.roundBoard
  if (which === 'today' || !rb) Object.assign(S, { tab: 'lb', lbv: 'today' })
  else if (rb.view === 'pevent') Object.assign(S, { tab: 'scores', sview: 'pevent', peId: rb.id })
  else Object.assign(S, { tab: 'home', aview: 'evboard', evId: rb.id, evDay: 1 })
}

// Showing the card's competition (or today's scores) from the round bar.
const onComp = () => !!S.roundBoard && ((S.roundBoard.view === 'evboard' && S.tab === 'home' && S.aview === 'evboard' && S.evId === S.roundBoard.id)
  || (S.roundBoard.view === 'pevent' && S.tab === 'scores' && S.sview === 'pevent' && S.peId === S.roundBoard.id))

/** The switch, at the top of the screen showing either board in a round (nothing anywhere else). */
export function addRoundLbSwitch() {
  if (!S.roundBar || !S.roundBoard || !S.roundDayOn || !(onComp() || S.tab === 'lb')) return
  const today = S.tab === 'lb'
  $('main').querySelector('.screen')?.insertAdjacentHTML('afterbegin', `<div class="seg" role="group" aria-label="Leaderboard">
    <button data-rlb="comp" aria-pressed="${!today}">${esc(S.roundBoard.name ?? 'Competition')}</button><button data-rlb="today" aria-pressed="${today}">Today</button></div>`)
  document.querySelectorAll('[data-rlb]').forEach(b => (b.onclick = async () => { openRoundLb(b.dataset.rlb); await render(); top0() }))
}
