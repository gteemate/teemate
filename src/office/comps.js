// Club office → Competitions: everything the club runs in one list (club events and leagues, sign-up
// competitions and their knockouts). Pick one to see it beside the list: a knockout shows its whole bracket.
// Members' own events, leagues and knockouts stay with them.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast, top0 } from '../ui.js'
import { addDaysIso, eventDates, eventLastDay, isoDate, leagueWeek, today } from '../dates.js'
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
  // A club sign-up competition is a template between runs: hidden, or its knockout finished. Run it again from there.
  const champ = x => (x.c?.drawPublished && kos[x.key]?.matches.length ? champion(kos[x.key].matches, rounds(kos[x.key])) : null)
  const isTemplate = x => !!x.c && (!x.c.open || champ(x) != null)
  const live = all.filter(x => !x.done && !isTemplate(x))
  const templates = comps.filter(isTemplate)
  const finished = evs.filter(x => x.done)
  const sel = all.find(x => x.key === S.oComp) ?? all.find(x => disputed(x.key)) ?? live[0] ?? all[0]
  header('Competitions', `<b>${live.length}</b> running or coming up`)

  const tag = x => {
    if (x.c && isTemplate(x)) return '<span class="pill ghosty">Ready to run</span>'
    if (x.c) {
      const d = disputed(x.key)
      return d ? `<span class="pill warn">${d} disputed</span>` : x.c.drawPublished ? '<span class="pill live">Draw out</span>'
        : x.c.open && x.c.closesOn && x.c.closesOn >= t ? '<span class="pill gold">Open</span>' : x.c.open ? '<span class="pill">Entries closed</span>' : '<span class="pill ghosty">Hidden</span>'
    }
    return x.e.startDate <= t && !x.done ? '<span class="pill live">On now</span>' : x.done ? '<span class="pill ghosty">Finished</span>' : '<span class="pill">Coming up</span>'
  }
  const line = x => x.c && isTemplate(x) ? `${CAT[x.c.category]} · ${x.c.kind === 'pairs' ? 'pairs' : 'singles'}${champ(x) != null ? ` · last won by ${esc(entryName(champ(x), kos[x.key].entries, members))}` : ''}`
    : x.c ? `${CAT[x.c.category]} · ${x.c.kind === 'pairs' ? 'pairs' : 'singles'} · ${x.n}${x.c.maxEntries ? ` of ${x.c.maxEntries}` : ''} entered`
    : x.e.style === 'league' ? `League · ${x.e.weeks} weeks${x.e.koTop ? ` · top ${x.e.koTop} to a knockout` : ''}` : `${EVENT_TYPES[x.e.style]?.name ?? 'Event'} · ${eventDates(x.e.startDate, x.e.days)}`
  const row = x => `<button class="orow obtn ocomp" data-o-comp="${x.key}" aria-pressed="${x === sel}"><span class="ot"><b>${esc(x.c?.name ?? x.e.name)}</b><span>${line(x)}</span></span>${tag(x)}</button>`

  $('main').innerHTML = `<div class="screen office">
    <div class="osplit">
      <div class="ocol">
        <button class="primary sm" id="o-new">New competition</button>
        <div class="card olist">${live.map(row).join('') || '<div class="empty-state">Nothing running.</div>'}</div>
        ${templates.length ? `<h3>Templates</h3><span class="hint">The club’s standard competitions. Pick one to run it with new dates.</span><div class="card olist">${templates.map(row).join('')}</div>` : ''}
        ${finished.length ? `<h3>Finished</h3><div class="card olist">${finished.map(row).join('')}</div>` : ''}
      </div>
      <div class="card odetail">${sel && isTemplate(sel) ? runForm(sel, kos[sel.key], champ(sel), members, t) : sel ? detail(sel, kos[sel.key], members, t) : '<div class="empty-state">No club competitions yet. Start one with New competition.</div>'}</div>
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
  if ($('o-run')) $('o-run').onclick = async () => {
    const b = $('o-run'), x = sel, v = id => $(id).value.trim()
    const closesOn = v('o-rclose'), finalBy = v('o-rfinal'), maxEntries = v('o-rmax'), notes = v('o-rnotes')
    const err = !closesOn ? 'Pick when entries close.' : closesOn < t ? 'Entries have to close today or later.' : !finalBy ? 'Pick when the final has to be played by.' : finalBy <= closesOn ? 'The final has to be after entries close.' : maxEntries && +maxEntries < 2 ? 'A limit needs at least 2 places.' : ''
    if (err) { $('o-rerr').textContent = err; return }
    if ((x.n || kos[x.key]?.matches.length) && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: last time’s entries and draw are cleared'; return }
    b.disabled = true
    try { await api.runSignup(x.c.id, { closesOn, finalBy, maxEntries, notes }) } catch (er) { $('o-rerr').textContent = er.message; b.disabled = false; return }
    await keepScroll(render); toast(`${x.c.name} is open: members see it under Competitions → Events`)
  }
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

// A template: run it with new dates (entries close, the final played by, a limit, notes), opened to members.
function runForm(x, ko, champ, members, t) {
  const c = x.c
  return `<div class="ohead"><div><h4>${esc(c.name)}</h4><p class="hint">${CAT[c.category]} ${c.kind === 'pairs' ? 'pairs' : 'singles'}${champ != null ? ` · last won by ${esc(entryName(champ, ko.entries, members))}` : ''}</p></div></div>
    <div class="opad orun">
      <p class="hint">Set this year’s dates and release it: members see it under Competitions → Events and answer Enter or No thanks.${x.n || ko?.matches.length ? ' Last time’s entries and draw are cleared.' : ''}</p>
      <div class="orunrow"><label>Entries close<input type="date" class="plainsel" id="o-rclose" min="${t}" value="${addDaysIso(t, 21)}"></label>
        <label>Final played by<input type="date" class="plainsel" id="o-rfinal" value="${addDaysIso(t, 120)}"></label>
        <label>Places (blank: no limit)<input type="number" class="plainsel" id="o-rmax" min="2" inputmode="numeric" value="${c.maxEntries ?? ''}"></label></div>
      <label>Notes for members (optional)<input class="plainsel" id="o-rnotes" maxlength="300" value="${esc(c.notes ?? '')}" placeholder="e.g. £5 entry, paid in the shop"></label>
      <p class="gerr" id="o-rerr" role="alert"></p>
      <button class="primary sm" id="o-run">Release to members</button>
    </div>`
}

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
