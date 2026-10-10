// Club office → Competitions: everything the club runs in one list (club events and leagues, sign-up
// competitions and their knockouts). Pick one to see it beside the list: a knockout shows its whole bracket.
// Members' own events, leagues and knockouts stay with them.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, top0 } from '../ui.js'
import { eventDates, eventLastDay, isoDate, leagueWeek, today } from '../dates.js'
import { entryName, roundName, champion } from '../knockout.js'
import { EVENT_TYPES } from '../screens/event-editor.js'
import { clubComp, clubEvent, panel } from './shell.js'

const CAT = { men: 'Men’s', ladies: 'Ladies’', mixed: 'Mixed', open: 'Open' }

export async function load() {
  const [events, signups, members] = await Promise.all([api.getEvents(), api.getSignups(), api.getMembers()])
  const t = isoDate(today())
  const evs = events.filter(clubEvent).map(e => ({ key: `e:${e.id}`, e, done: eventLastDay(e) < t && !(e.koTop && !e.koComp) }))
  const comps = signups.comps.filter(clubComp).map(c => ({ key: `s:${c.id}`, c, n: signups.entries.filter(x => x.compId === c.id).length }))
  const kos = Object.fromEntries(await Promise.all(comps.filter(x => x.c.drawPublished || x.n).map(async x => [x.key, await api.getKnockout(x.c.id)])))
  return { evs, comps, kos, members, t }
}

export function draw({ evs, comps, kos, members, t }) {
  const all = [...comps, ...evs]
  const disputed = k => (kos[k]?.matches ?? []).filter(m => m.status === 'disputed').length
  const live = all.filter(x => !(x.done || (x.c && (x.c.drawPublished ? champion(kos[x.key].matches, rounds(kos[x.key])) != null : false))))
  const finished = all.filter(x => !live.includes(x))
  const sel = all.find(x => x.key === S.oComp) ?? all.find(x => disputed(x.key)) ?? live[0] ?? all[0]
  header('Competitions', `<b>${live.length}</b> running or coming up`)

  const tag = x => {
    if (x.c) {
      const d = disputed(x.key)
      return d ? `<span class="pill warn">${d} disputed</span>` : x.c.drawPublished ? '<span class="pill live">Draw out</span>'
        : x.c.open && x.c.closesOn && x.c.closesOn >= t ? '<span class="pill gold">Open</span>' : x.c.open ? '<span class="pill">Entries closed</span>' : '<span class="pill ghosty">Hidden</span>'
    }
    return x.e.startDate <= t && !x.done ? '<span class="pill live">On now</span>' : x.done ? '<span class="pill ghosty">Finished</span>' : '<span class="pill">Coming up</span>'
  }
  const line = x => x.c ? `${CAT[x.c.category]} · ${x.c.kind === 'pairs' ? 'pairs' : 'singles'} · ${x.n}${x.c.maxEntries ? ` of ${x.c.maxEntries}` : ''} entered`
    : x.e.style === 'league' ? `League · ${x.e.weeks} weeks${x.e.koTop ? ` · top ${x.e.koTop} to a knockout` : ''}` : `${EVENT_TYPES[x.e.style]?.name ?? 'Event'} · ${eventDates(x.e.startDate, x.e.days)}`
  const row = x => `<button class="orow obtn ocomp" data-o-comp="${x.key}" aria-pressed="${x === sel}"><span class="ot"><b>${esc(x.c?.name ?? x.e.name)}</b><span>${line(x)}</span></span>${tag(x)}</button>`

  $('main').innerHTML = `<div class="screen office">
    <div class="osplit">
      <div class="ocol">
        <button class="primary sm" id="o-new">New competition</button>
        <div class="card olist">${live.map(row).join('') || '<div class="empty-state">Nothing running.</div>'}</div>
        ${finished.length ? `<h3>Finished</h3><div class="card olist">${finished.map(row).join('')}</div>` : ''}
      </div>
      <div class="card odetail">${sel ? detail(sel, kos[sel.key], members, t) : '<div class="empty-state">No club competitions yet. Start one with New competition.</div>'}</div>
    </div>
  </div>`

  document.querySelectorAll('[data-o-comp]').forEach(b => (b.onclick = () => { S.oComp = b.dataset.oComp; keepScroll(render) }))
  const go = async f => { $('modal').innerHTML = ''; f(); await render(); top0() }
  document.querySelectorAll('[data-o-go]').forEach(b => (b.onclick = () => go(() => {
    const [what, id] = b.dataset.oGo.split(':')
    if (what === 'board') Object.assign(S, { evId: +id, evDay: 1, lgWeek: null, aview: 'evboard' })
    if (what === 'edit') Object.assign(S, { ev: null, evId: +id, evStep: 1, evScope: 'club', aview: 'event' })
    if (what === 'draw') Object.assign(S, { koComp: +id, koRound: null, koFrom: 'office', aview: 'ko' })
    if (what === 'signups') S.aview = 'signups'
  })))
  document.querySelectorAll('[data-o-card]').forEach(b => (b.onclick = () => go(() => { const [mid, cid] = b.dataset.oCard.split(':'); Object.assign(S, { koCard: +mid, koComp: +cid, kcFrom: 'office', aview: 'kocard' }) })))
  $('o-new').onclick = () => {
    panel(`<h4>New competition</h4><p class="hint">What kind?</p>
      <div class="card olist">
        <button class="orow obtn" data-o-kind="event"><span class="ot"><b>A club event</b><span>One or more days: Stableford, medal, team formats</span></span></button>
        <button class="orow obtn" data-o-kind="league"><span class="ot"><b>A league</b><span>Weekly, singles or pairs, with a knockout finish if you like</span></span></button>
        <button class="orow obtn" data-o-kind="signup"><span class="ot"><b>A sign-up competition or knockout</b><span>Members enter in advance, with a limit; then a random draw</span></span></button>
      </div>`)
    document.querySelectorAll('[data-o-kind]').forEach(b => (b.onclick = () => go(() => {
      if (b.dataset.oKind === 'signup') Object.assign(S, { signupNew: true, aview: 'signups' })
      else Object.assign(S, { ev: null, evId: null, evStep: 1, evNew: b.dataset.oKind === 'league' ? 'league' : null, evScope: 'club', aview: 'event' })
    })))
  }
}

const rounds = ko => Math.max(0, ...ko.matches.map(m => m.round))

function detail(x, ko, members, t) {
  if (x.e) {
    const e = x.e, wk = e.style === 'league' ? leagueWeek(e, t) : 0
    return `<div class="ohead"><div><h4>${esc(e.name)}</h4><p class="hint">${e.style === 'league' ? `${e.weeks}-week league from ${eventDates(e.startDate, 1)}${wk > 0 && wk <= e.weeks ? ` · week ${wk}` : ''}` : eventDates(e.startDate, e.days)}</p></div></div>
      <div class="olist">
        <div class="orow"><span class="ot"><b>${e.style === 'league' ? 'Table and results' : 'Leaderboard'}</b><span>${e.players.length} player${e.players.length === 1 ? '' : 's'}${e.everyone ? ' · everyone can play' : ''}</span></span><span class="oacts"><button class="ghost sm" data-o-go="board:${e.id}">Open</button></span></div>
        <div class="orow"><span class="ot"><b>Settings</b><span>Dates, format, who plays</span></span><span class="oacts"><button class="ghost sm" data-o-go="edit:${e.id}">Edit</button></span></div>
        ${e.koComp ? `<div class="orow"><span class="ot"><b>The knockout finish</b><span>The top ${e.koTop} from the table</span></span><span class="oacts"><button class="ghost sm" data-o-go="draw:${e.koComp}">Open the draw</button></span></div>` : ''}
      </div>`
  }
  const c = x.c
  const head = `<div class="ohead"><div><h4>${esc(c.name)}</h4><p class="hint">${CAT[c.category]} ${c.kind === 'pairs' ? 'pairs' : 'singles'} · ${x.n}${c.maxEntries ? ` of ${c.maxEntries}` : ''} entered${c.closesOn ? ` · entries ${c.closesOn >= t ? 'close' : 'closed'} ${eventDates(c.closesOn, 1)}` : ''}</p></div>
    <span class="oacts"><button class="ghost sm" data-o-go="signups">Entries and settings</button>${ko?.matches.length ? `<button class="primary sm" data-o-go="draw:${c.id}">${c.drawPublished ? 'Set results' : 'Make the draw'}</button>` : x.n > 1 ? `<button class="primary sm" data-o-go="draw:${c.id}">Make the draw</button>` : ''}</span></div>`
  if (!ko?.matches.length) return `${head}<div class="empty-state">${x.n ? 'No draw yet. Make it once entries close.' : 'Nobody has entered yet.'}</div>`
  const n = rounds(ko), name = id => entryName(id, ko.entries, members)
  const champ = champion(ko.matches, n)
  const side = (m, id, bye) => `<div class="obk${m.winnerEntry === id && id != null && ['confirmed', 'bye'].includes(m.status) ? ' w' : ''}">${esc(entryName(id, ko.entries, members, bye))}</div>`
  const state = m => m.status === 'bye' ? 'Bye' : m.status === 'confirmed' ? `${esc(name(m.winnerEntry))} won${m.result ? ` ${esc(m.result)}` : ''}`
    : m.status === 'disputed' ? 'Disputed: set the result' : m.status === 'reported' ? 'Waiting for the other side to confirm' : c.roundDeadlines[m.round - 1] ? `To play by ${eventDates(c.roundDeadlines[m.round - 1], 1)}` : 'To play'
  return `${head}${!c.drawPublished ? '<p class="hint opad">Draft: members don’t see it until it’s published.</p>' : ''}${champ ? `<p class="opad"><span class="pill gold">Champion: ${esc(name(champ))}</span></p>` : ''}
    <div class="obracket">${[...Array(n)].map((_, r) => `<div class="oround"><small>${roundName(r + 1, n)}${c.roundDeadlines[r] ? `<span>By ${eventDates(c.roundDeadlines[r], 1)}</span>` : ''}</small>
      ${ko.matches.filter(m => m.round === r + 1).sort((a, b) => a.slot - b.slot).map(m => `<div class="omatch${m.status === 'disputed' ? ' disp' : ''}">${side(m, m.aEntry)}${side(m, m.bEntry, m.status === 'bye')}<div class="ost">${state(m)}${m.roundId ? ` · <button class="linkbtn" data-o-card="${m.id}:${c.id}">Scorecard</button>` : ''}</div></div>`).join('')}</div>`).join('')}</div>`
}
