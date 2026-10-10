// Competitions (the Competition tile on Home): Entered (everything I'm in, match invitations to answer first, and
// the season competitions I've signed up for), Events (season competitions I can still sign up for) and History,
// plus today's field and Create your own event. Lists from competitions.js and signups.js (tested).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, top0, toast } from '../ui.js'
import { isoDate, today, eventDates, hhmm } from '../dates.js'
import { eventFormatName } from '../games.js'
import { competitionLists } from '../competitions.js'
import { canEdit } from './events.js'
import { canEnter, myEntries, partnerChoices, needsSection } from '../signups.js'

const TABS = [['entered', 'Entered'], ['events', 'Events'], ['history', 'History']]
const FORMAT = { individual: 'Individual', teams: 'Team Stableford', ryder: 'Ryder Cup', league: 'League' }

export async function load() {
  const [events, me, playerEvents, signups, members, friends] = await Promise.all([api.getEvents(), api.getMe(), api.getMyPlayerEvents(), api.getSignups(), api.getMembers(), api.getFriends()])
  const date = isoDate(today())
  return { me, date, members, friends, signups, lists: competitionLists({ me, events, playerEvents, date }),
    open: canEnter({ ...signups, me, date }), entered: myEntries({ ...signups, me }) }
}

export function draw({ me, date, members, friends, signups, lists, open, entered }) {
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
    const edit = tab === 'entered' && canEdit(e, me) ? `<button class="linkbtn" data-edit="${e.id}">Edit</button>` : '<span></span>'
    return `<div class="card comp${x.running && tab === 'entered' ? ' gold' : ''}" data-n="${n}" role="button" tabindex="0">
      <span class="ct">${esc(e.name)}</span><span class="sub">${what}</span>${bars}
      <span class="row"><span class="sub">${tab === 'history' ? 'Finished' : when}</span><span class="row">${edit}${action}</span></span></div>`
  }
  const list = lists[tab] ?? []
  const nameOf = id => members.find(m => m.id === id)?.name ?? 'a member'
  const kindText = c => (c.kind === 'pairs' ? 'Pairs' : 'Singles')
  const closes = c => `Entries close ${eventDates(c.closesOn, 1)}`
  // Season competitions: to sign up for (Events), or signed up for (Entered: with whom, Withdraw until they close).
  const signRow = c => `<button class="card comp" data-sign="${c.id}"><span class="row"><span class="ct">${esc(c.name)}</span><span class="pill gold">Enter ›</span></span>
      <span class="sub">${kindText(c)} · ${closes(c)}${c.notes ? ` · ${esc(c.notes)}` : ''}</span></button>`
  const mineRow = x => `<div class="card comp"><span class="row"><span class="ct">${esc(x.comp.name)}</span><span class="pill">Entered</span></span>
      <span class="sub">${x.partnerId ? `With ${esc(nameOf(x.partnerId))}` : 'Singles'} · ${x.comp.closesOn && date > x.comp.closesOn ? 'Entries closed: the draw is coming' : closes(x.comp)}</span>
      ${x.comp.closesOn && date > x.comp.closesOn ? '' : `<span class="row"><span></span><button class="linkbtn" data-wd="${x.comp.id}">Withdraw${x.partnerId ? ' (both of you)' : ''}</button></span>`}</div>`
  const empty = { entered: 'You’re not in any competitions right now. When a club competition is on, you can join it as you start your round.',
    events: needsSection(signups.comps, me, date) ? '' : 'No season competitions are open for entries right now.', history: 'Finished competitions you played in will show here.' }[tab]
  $('main').innerHTML = `<div class="screen">
    <div class="seg seg4" role="tablist" aria-label="Competitions">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    ${tab === 'entered' ? '<button class="card comp" id="field"><span class="row"><span class="ct">Today at the club</span><span class="link">Scores ›</span></span><span class="sub">Everyone’s round today: gross, net, Stableford</span></button>' : ''}
    ${tab === 'events' && needsSection(signups.comps, me, date) ? '<button class="card comp gold" id="setsec"><span class="ct">Men’s or Ladies’?</span><span class="sub">Set which you play in on your Account to see the competitions you can enter.</span><span class="row"><span></span><span class="link">Account ›</span></span></button>' : ''}
    ${tab === 'events' ? open.map(signRow).join('') : ''}
    ${tab === 'entered' ? entered.map(mineRow).join('') : ''}
    ${list.length ? list.map(row).join('') : (tab === 'events' && open.length) || (tab === 'entered' && entered.length) || !empty[tab] ? '' : `<div class="empty-state">${empty[tab]}</div>`}
    <button class="ghost dashed" id="create">+ Create your own event</button>
  </div>`
  const go = async f => { f(); await render(); top0() }
  document.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => go(() => { S.compTab = b.dataset.tab })))
  if ($('field')) $('field').onclick = () => go(() => { S.tab = 'lb'; S.lbv = 'today' })
  $('create').onclick = () => go(() => { S.ev = null; S.evId = null; S.evStep = 1; S.evNew = null; S.evScope = 'player'; S.aview = 'event' })
  document.querySelectorAll('[data-edit]').forEach(b => (b.onclick = e => { e.stopPropagation(); go(() => { S.ev = null; S.evId = +b.dataset.edit; S.evStep = 1; S.evScope = 'player'; S.aview = 'event' }) }))
  if ($('setsec')) $('setsec').onclick = () => go(() => { S.aview = 'account' })
  document.querySelectorAll('[data-sign]').forEach(b => (b.onclick = () => signSheet(open.find(c => c.id === +b.dataset.sign), me, members, friends, signups.entries)))
  document.querySelectorAll('[data-wd]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to withdraw'; return }
    b.disabled = true
    try { await api.withdrawSignup(+b.dataset.wd) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render); toast('Withdrawn')
  }))
  document.querySelectorAll('[data-n]').forEach(c => (c.onclick = () => {
    const x = list[+c.dataset.n]
    if (x.kind === 'invite') return go(() => { S.peDismissed.delete(x.e.id); S.tab = 'scores'; S.sview = 'card' }) // the invitation pop-up is on the scorecard
    if (x.kind === 'match') return go(() => { S.peId = x.e.id; S.tab = 'scores'; S.sview = 'pevent' })
    return go(() => { S.evId = x.e.id; S.evDay = 1; S.aview = 'evboard' })
  }))
}

// Enter a season competition: singles is one tap to confirm; pairs pick a partner (favourites first, then search).
function signSheet(c, me, members, friends, entries) {
  const choices = c.kind === 'pairs' ? partnerChoices(c, me, members, entries) : []
  const fav = new Set(friends.buddies.filter(b => b.favourite).map(b => b.id)), mine = new Set(friends.buddies.map(b => b.id))
  let partner = null, q = ''
  const list = () => {
    const words = q.trim().toLowerCase()
    const shown = words ? choices.filter(m => m.name.toLowerCase().includes(words)) : choices.filter(m => mine.has(m.id)).sort((a, b) => fav.has(b.id) - fav.has(a.id))
    return shown.length ? shown.slice(0, 30).map(m => `<button class="brow" data-pt="${m.id}" aria-pressed="${partner === m.id}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong></span><span class="chev">${partner === m.id ? '✓' : '+'}</span></button>`).join('')
      : `<div class="empty-state">${words ? 'Nobody eligible matches.' : 'Search for your partner above.'}</div>`
  }
  const sheet = () => `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="sgt">
    <h4 id="sgt">Enter ${esc(c.name)}?</h4>
    <span class="hint">${c.kind === 'pairs' ? 'Pairs' : 'Singles'} · Entries close ${eventDates(c.closesOn, 1)}${c.notes ? ` · ${esc(c.notes)}` : ''}. You can withdraw until then.</span>
    ${c.kind === 'pairs' ? `<label for="sg-q">Your partner</label><input id="sg-q" type="search" autocomplete="off" placeholder="Type a name" value="${esc(q)}"><div class="pick picklist" id="sg-list">${list()}</div>` : ''}
    <div class="gm-btns"><button type="button" class="ghost" id="sg-no">Not now</button><button class="primary" id="sg-go" ${c.kind === 'pairs' && !partner ? 'disabled' : ''}>${c.kind === 'pairs' ? (partner ? 'Enter as a pair' : 'Pick your partner') : 'Enter'}</button></div>
  </div></div>`
  const draw = () => {
    $('modal').innerHTML = sheet()
    $('sg-no').onclick = () => { $('modal').innerHTML = '' }
    $('ovl').onclick = e => { if (e.target.id === 'ovl') $('modal').innerHTML = '' }
    if ($('sg-q')) $('sg-q').oninput = e => { q = e.target.value; $('sg-list').innerHTML = list(); wire() }
    wire()
    $('sg-go').onclick = async () => {
      $('sg-go').disabled = true
      try { await api.enterSignup(c.id, partner) } catch (err) { toast(err.message); $('sg-go').disabled = false; return }
      $('modal').innerHTML = ''
      S.compTab = 'entered'
      await render(); top0()
      toast(`You’re entered in ${c.name}${partner ? ` with ${members.find(m => m.id === partner).name}` : ''}`)
    }
  }
  const wire = () => document.querySelectorAll('[data-pt]').forEach(b => (b.onclick = () => { partner = +b.dataset.pt; draw(); if ($('sg-q')) { const i = $('sg-q'); i.focus(); i.setSelectionRange(q.length, q.length) } }))
  draw()
}
