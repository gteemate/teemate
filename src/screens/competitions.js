// Competitions (the Competition tile on Home): Entered, Events
// (invitations, events set up by players) and History, plus today's field and Create your own event.
// Each competition opens its existing board; the lists come from competitions.js (tested).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, top0, toast } from '../ui.js'
import { isoDate, today, eventDates, hhmm } from '../dates.js'
import { eventFormatName } from '../games.js'
import { competitionLists } from '../competitions.js'
import { canEdit } from './events.js'

const TABS = [['entered', 'Entered'], ['events', 'Events'], ['history', 'History']]
const FORMAT = { individual: 'Individual', teams: 'Team Stableford', ryder: 'Ryder Cup', league: 'League' }

export async function load() {
  const [events, me, playerEvents] = await Promise.all([api.getEvents(), api.getMe(), api.getMyPlayerEvents()])
  return { me, lists: competitionLists({ me, events, playerEvents, date: isoDate(today()) }) }
}

export function draw({ me, lists }) {
  header('Competitions', '')
  const tab = TABS.some(([k]) => k === S.compTab) ? S.compTab : 'entered' // (Open is gone: a remembered 'open' falls back)
  const teamOf = e => e.teams?.[e.team?.[me.id]]?.name
  const row = (x, n) => {
    const e = x.e
    if (x.kind === 'invite') return `<button class="card comp gold" data-n="${n}"><span class="row"><span class="ct">Invitation from ${esc(e.proposedBy?.name ?? 'another group')}</span><span class="pill gold">Answer</span></span>
      <span class="sub">${e.groups.map(g => hhmm(g.time)).join(' v ')} · ${esc(eventFormatName(e.format))}</span></button>`
    if (x.kind === 'match') return `<button class="card comp" data-n="${n}"><span class="row"><span class="ct">${esc(eventFormatName(e.format))} match</span><span class="pill live">● Live</span></span>
      <span class="sub">Today · ${e.groups.map(g => hhmm(g.time)).join(' v ')}</span><span class="row"><span></span><span class="link">Board ›</span></span></button>`
    const when = x.running ? (x.kind === 'league' ? `Week ${x.week} of ${x.weeks}` : 'On now') : `Starts ${eventDates(e.startDate, 1)}`
    const what = x.kind === 'league' ? `${e.weeks} weeks · best ${e.bestOf} count${teamOf(e) ? ` · ${esc(teamOf(e))}` : ''}` : `${eventDates(e.startDate, e.days)} · ${FORMAT[e.style] ?? ''}${e.club ? ' · club' : ''}`
    const bars = x.kind === 'league' ? `<span class="cprog">${Array.from({ length: x.weeks }, (_, i) => `<i class="${i + 1 < x.week ? 'wk-done' : i + 1 === x.week && x.running ? 'wk-now' : ''}"></i>`).join('')}</span>` : ''
    const action = `<span class="link">${tab === 'history' ? 'Results' : x.kind === 'league' ? 'Leaderboard' : 'Board'} ›</span>`
    const edit = tab === 'events' && canEdit(e, me) ? `<button class="linkbtn" data-edit="${e.id}">Edit</button>` : '<span></span>'
    return `<div class="card comp${x.running && tab === 'entered' ? ' gold' : ''}" data-n="${n}" role="button" tabindex="0">
      <span class="ct">${esc(e.name)}</span><span class="sub">${what}</span>${bars}
      <span class="row"><span class="sub">${tab === 'history' ? 'Finished' : when}</span><span class="row">${edit}${action}</span></span></div>`
  }
  const list = lists[tab]
  const empty = { entered: 'You’re not in any competitions right now. When a club competition is on, you can join it as you start your round.', events: 'No invitations or events. Create your own below.', history: 'Finished competitions you played in will show here.' }[tab]
  $('main').innerHTML = `<div class="screen">
    <div class="seg seg4" role="tablist" aria-label="Competitions">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    ${tab === 'entered' ? '<button class="card comp" id="field"><span class="row"><span class="ct">Today at the club</span><span class="link">Scores ›</span></span><span class="sub">Everyone’s round today: gross, net, Stableford</span></button>' : ''}
    ${list.length ? list.map(row).join('') : `<div class="empty-state">${empty}</div>`}
    <button class="ghost dashed" id="create">+ Create your own event</button>
  </div>`
  const go = async f => { f(); await render(); top0() }
  document.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => go(() => { S.compTab = b.dataset.tab })))
  if ($('field')) $('field').onclick = () => go(() => { S.tab = 'lb'; S.lbv = 'today' })
  $('create').onclick = () => go(() => { S.ev = null; S.evId = null; S.evStep = 1; S.evNew = null; S.evScope = 'player'; S.aview = 'event' })
  document.querySelectorAll('[data-edit]').forEach(b => (b.onclick = e => { e.stopPropagation(); go(() => { S.ev = null; S.evId = +b.dataset.edit; S.evStep = 1; S.evScope = 'player'; S.aview = 'event' }) }))
  document.querySelectorAll('[data-n]').forEach(c => (c.onclick = () => {
    const x = list[+c.dataset.n]
    if (x.kind === 'invite') return go(() => { S.peDismissed.delete(x.e.id); S.tab = 'scores'; S.sview = 'card' }) // the invitation pop-up is on the scorecard
    if (x.kind === 'match') return go(() => { S.peId = x.e.id; S.tab = 'scores'; S.sview = 'pevent' })
    return go(() => { S.evId = x.e.id; S.evDay = 1; S.aview = 'evboard' })
  }))
}
