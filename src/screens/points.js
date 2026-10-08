// Admin → Guest points: my balance and guests, plus every member's balance.
import * as api from '../api.js'
import { $, esc, ini, header } from '../ui.js'
import { fromIso, dayMonth } from '../dates.js'
import { bar } from './booking.js'
import { toAdmin } from './nav.js'

export async function load() {
  const [points, me] = await Promise.all([api.getGuestPoints(), api.getMe()])
  return { points, me }
}

export function draw({ points: P, me }) {
  header('Guest points', `${P.allowance} a year · resets 1 Jan`, toAdmin)
  const usedMine = P.mine.reduce((t, x) => t + x.points, 0), left = P.allowance - usedMine
  const all = P.members.map(m => ({ ...m, left: P.allowance - m.used })).sort((a, b) => a.left - b.left)
  $('main').innerHTML = `<div class="screen">
   <div class="card mypts"><span class="hint">Your points</span><div class="big">${left}<small> of ${P.allowance}</small></div>${bar(left, P.allowance)}
     <span class="hint">${P.mine.length} guest${P.mine.length === 1 ? '' : 's'} this year · ${usedMine} points used</span></div>
   <h3>Your guests</h3>
   <div class="card list">${P.mine.length ? P.mine.slice().reverse().map(x => `<div class="lrow" style="grid-template-columns:56px 1fr auto"><span class="hint" style="font-weight:700">${dayMonth(fromIso(x.date))}</span><span class="who"><strong>${esc(x.guest)}</strong><small>${x.club ? esc(x.club) : 'No home club'} · ${esc(x.course)}</small></span><span class="ptag">−${x.points}</span></div>`).join('') : '<div class="empty-state">No guests yet this year.</div>'}</div>
   ${me.admin ? `<h3>All members</h3><div class="hint">Admin view. Lowest balance first.</div>
   <div class="card list">${all.map(r => `<div class="lrow ptsline"><span class="av">${ini(r.name)}</span><span class="who"><strong>${esc(r.name)}${r.id === me.id ? ' (you)' : ''}</strong><small>${r.used} of ${P.allowance} used</small>${bar(r.left, P.allowance)}</span><span class="hcp${r.left === 0 ? ' zero' : ''}">${r.left}<small>left</small></span></div>`).join('')}</div>` : ''}
  </div>`
}
