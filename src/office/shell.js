// The club office (the iPad back office): a sidebar of five sections beside the page. The office login always
// opens here; a member with admin rights opens it from Account → Club office and leaves with Back to TeeMate.
// Members' own events and leagues stay with them: the office deals with what the club runs.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, render, top0 } from '../ui.js'
import { forceAlertCheck } from '../alert-bar.js'

export const SECTIONS = [
  ['today', 'Today', '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>'],
  ['members', 'Members', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6"/>'],
  ['tee', 'Tee sheet', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['comps', 'Competitions', '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 20h8"/>'],
  ['club', 'Club', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'],
]

/** A club competition (not one a member set up for their group). */
export const clubComp = c => c.createdBy == null
export const clubEvent = e => e.club

/** What's waiting for the office: { joins, treqs, disputes: [{ comp, match }] } — loaded once per page. */
let pending = null
export const forgetSummary = () => { pending = null }
export function summary() {
  return (pending ??= (async () => {
    const [joins, treqs, signups] = await Promise.all([api.getAccessRequests(), api.getTeeTimeRequests(), api.getSignups()])
    const drawn = signups.comps.filter(c => clubComp(c) && c.drawPublished)
    const kos = await Promise.all(drawn.map(c => api.getKnockout(c.id)))
    const disputes = drawn.flatMap((c, i) => kos[i].matches.filter(m => m.status === 'disputed').map(m => ({ comp: c, match: m, entries: kos[i].entries, rounds: Math.max(...kos[i].matches.map(x => x.round)) })))
    return { joins, treqs: treqs.filter(r => r.status === 'pending'), disputes }
  })())
}

const COUNT = { today: s => s.joins.length + s.treqs.length + s.disputes.length, members: s => s.joins.length, tee: s => s.treqs.length, comps: s => s.disputes.length }

/** Open an office section (from the sidebar, or a link on a page). */
export async function openSection(ov) {
  Object.assign(S, { ov, aview: 'office', oMove: null })
  S.navReset = true
  await render(); top0()
}

export function drawSide(s, me, clubName) {
  const side = $('side')
  side.hidden = false
  side.innerHTML = `<div class="oclub">${esc(clubName || 'Your club')}<small>Club office</small></div>
    ${SECTIONS.map(([k, n, icon]) => { const c = COUNT[k]?.(s); return `<button class="onav" data-ov="${k}" aria-current="${S.ov === k ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${n}${c ? `<span class="ocnt">${c}</span>` : ''}</button>` }).join('')}
    <span class="osp"></span>
    ${me.office ? '<button class="onav" id="o-out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>Sign out</button>'
      : '<button class="onav" id="o-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Back to TeeMate</button>'}
    <div class="owho">${me.office ? 'Signed in as the club office' : `Signed in as <b>${esc(me.name)}</b>`}</div>`
  side.querySelectorAll('[data-ov]').forEach(b => (b.onclick = () => openSection(b.dataset.ov)))
  if ($('o-out')) $('o-out').onclick = () => api.signOut()
  if ($('o-back')) $('o-back').onclick = async () => { S.office = false; S.aview = 'account'; S.navReset = true; await render(); top0(); forceAlertCheck() } // anything new for me while I was in the office
}

export function hideSide() {
  const side = $('side')
  if (side) { side.hidden = true; side.innerHTML = '' }
}

/** A side panel for the one thing being worked on (a member, a booking, a request). Bottom sheet on a phone. */
export function panel(html, onClose) {
  $('modal').innerHTML = `<div class="overlay opanelwrap" id="ovl"><div class="sheet opanel" role="dialog" aria-modal="true"><button class="x opx" id="opx" aria-label="Close">×</button>${html}</div></div>`
  const close = () => { $('modal').innerHTML = ''; onClose?.() }
  $('opx').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  return close
}
