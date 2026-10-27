// Club office → Competitions: everything the club runs in one list (club events and leagues, sign-up
// competitions and their knockouts). Pick one to see it beside the list: a knockout shows its whole bracket.
// Members' own events, leagues and knockouts stay with them.
import { holesText } from '../open-holes.js'
import { signupLine, closesOn } from '../event-signups.js'
import { azList, wireAz } from '../az.js'
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, redraw, toast, top0 } from '../ui.js'
import { addDaysIso, eventDates, eventLastDay, isoDate, leagueWeek, today } from '../dates.js'
import { eventWhen } from '../season.js'
import { entryName, roundName, champion } from '../knockout.js'
import { EVENT_TYPES, fromTemplate, stepsAfterDetails } from '../screens/event-editor.js'
import { clubComp, clubEvent, panel } from './shell.js'
import { money, feeTotal } from '../fees.js'

const CAT = { men: 'Men’s', ladies: 'Ladies’', mixed: 'Mixed', open: 'Open' }

export async function load() {
  const [events, signups, members, tpls] = await Promise.all([api.getEvents(), api.getSignups(), api.getMembers(), api.getEventTemplates()])
  const t = isoDate(today())
  const evs = events.filter(clubEvent).map(e => ({ key: `e:${e.id}`, e, done: eventLastDay(e) < t && !(e.koTop && !e.koComp) }))
  const demo = new Set(members.filter(m => m.demo).map(m => m.id))
  const comps = signups.comps.filter(clubComp).map(c => {
    const es = signups.entries.filter(x => x.compId === c.id)
    return { key: `s:${c.id}`, c, n: es.length, demo: es.filter(x => demo.has(x.memberId) || demo.has(x.partnerId)).length }
  })
  evs.forEach(x => { x.demo = x.e.players.filter(id => demo.has(id)).length })
  const kos = Object.fromEntries(await Promise.all(comps.filter(x => x.c.drawPublished || x.n).map(async x => [x.key, await api.getKnockout(x.c.id)])))
  return { evs, comps, kos, members, t, tpls: tpls.map(x => ({ key: `t:${x.id}`, t: x })) }
}

export function draw({ evs, comps, kos, members, t, tpls = [] }) {
  const all = [...comps, ...evs, ...tpls]
  const disputed = k => (kos[k]?.matches ?? []).filter(m => m.status === 'disputed').length
  // A club sign-up competition is a template between runs: hidden, or its knockout finished. Run it again from there.
  const champ = x => (x.c?.drawPublished && kos[x.key]?.matches.length ? champion(kos[x.key].matches, rounds(kos[x.key])) : null)
  const isTemplate = x => !!x.t || (!!x.c && (!x.c.open || champ(x) != null)) // x.t: a club event template
  const live = all.filter(x => !x.done && !isTemplate(x))
  const templates = [...comps.filter(isTemplate), ...tpls]
  const finished = evs.filter(x => x.done)
  const sel = all.find(x => x.key === S.oComp) ?? all.find(x => disputed(x.key)) ?? live[0] ?? all[0]
  header('Competitions', `<b>${live.length}</b> running or coming up`)

  const tag = x => {
    if (x.t || (x.c && isTemplate(x))) return '<span class="pill ghosty">Ready to run</span>'
    if (x.c) {
      const d = disputed(x.key)
      return d ? `<span class="pill warn">${d} disputed</span>` : x.c.drawPublished ? '<span class="pill live">Draw out</span>'
        : x.c.open && x.c.closesOn && x.c.closesOn >= t ? '<span class="pill gold">Open</span>' : x.c.open ? '<span class="pill">Entries closed</span>' : '<span class="pill ghosty">Hidden</span>'
    }
    return x.e.startDate <= t && !x.done ? '<span class="pill live">On now</span>' : x.done ? '<span class="pill ghosty">Finished</span>' : '<span class="pill">Coming up</span>'
  }
  const line = x => x.t ? `${EVENT_TYPES[x.t.setup.style]?.name ?? 'Event'}${x.t.setup.style === 'league' ? ` · ${x.t.setup.weeks} weeks` : ''}${holesText(x.t.setup.holes) ? ` · ${holesText(x.t.setup.holes)}` : ''}`
    : x.c && isTemplate(x) ? `${CAT[x.c.category]} · ${x.c.kind === 'pairs' ? 'pairs' : 'singles'}${champ(x) != null ? ` · last won by ${esc(entryName(champ(x), kos[x.key].entries, members))}` : ''}`
    : x.c ? `${CAT[x.c.category]} · ${x.c.kind === 'pairs' ? 'pairs' : 'singles'} · ${x.n}${x.c.maxEntries ? ` of ${x.c.maxEntries}` : ''} entered`
    : x.e.signup && x.e.startDate > t ? `Sign-up · ${x.e.players.length}${x.e.maxEntries ? ` of ${x.e.maxEntries}` : ' entered'}`
    : `${x.e.style === 'league' ? `League · ${x.e.weeks} weeks${x.e.koTop ? ` · top ${x.e.koTop} to a knockout` : ''}` : `${EVENT_TYPES[x.e.style]?.name ?? 'Event'} · ${eventWhen(x.e)}`}${holesText(x.e.holes) ? ` · ${holesText(x.e.holes)}` : ''}`
  const row = x => `<button class="orow obtn ocomp" data-o-comp="${x.key}" aria-pressed="${x === sel}"><span class="ot"><b>${esc(x.t?.name ?? x.c?.name ?? x.e.name)}</b><span>${line(x)}</span></span>${tag(x)}</button>`

  $('main').innerHTML = `<div class="screen office">
    <div class="osplit">
      <div class="ocol">
        <button class="primary sm" id="o-new">New competition</button>
        <div class="card olist">${live.map(row).join('') || '<div class="empty-state">Nothing running.</div>'}</div>
        ${templates.length ? `<h3>Templates</h3><span class="hint">The club’s standard competitions. Pick one to run it with new dates.</span><div class="card olist">${templates.map(row).join('')}</div>` : ''}
        ${finished.length ? `<h3>Finished</h3><div class="card olist">${finished.map(row).join('')}</div>` : ''}
      </div>
      <div class="card odetail">${sel?.t ? tplForm(sel.t, t) : sel && isTemplate(sel) ? runForm(sel, kos[sel.key], champ(sel), members, t) : sel ? detail(sel, kos[sel.key], members, t) : '<div class="empty-state">No club competitions yet. Start one with New competition.</div>'}</div>
    </div>
  </div>`

  document.querySelectorAll('[data-o-comp]').forEach(b => (b.onclick = () => { S.oComp = b.dataset.oComp; keepScroll(redraw) }))
  const go = async f => { $('modal').innerHTML = ''; f(); await render(); top0() }
  document.querySelectorAll('[data-o-go]').forEach(b => (b.onclick = () => go(() => {
    const [what, id] = b.dataset.oGo.split(':')
    if (what === 'board') Object.assign(S, { evId: +id, evDay: 1, lgWeek: null, aview: 'evboard' })
    if (what === 'edit') Object.assign(S, { ev: null, evId: +id, evStep: 1, evScope: 'club', aview: 'event' })
    if (what === 'teams') Object.assign(S, { ev: null, evId: +id, evStep: 6, evTeam: null, evCapMode: null, evScope: 'club', aview: 'event' }) // captains first
    if (what === 'draw') Object.assign(S, { koComp: +id, koRound: null, koFrom: 'office', aview: 'ko' })
    if (what === 'signups') Object.assign(S, { aview: 'signups', signupOnly: id ? +id : null }) // one competition's page
  })))
  document.querySelectorAll('[data-o-card]').forEach(b => (b.onclick = () => go(() => { const [mid, cid] = b.dataset.oCard.split(':'); Object.assign(S, { koCard: +mid, koComp: +cid, kcFrom: 'office', aview: 'kocard' }) })))
  if ($('o-run')) $('o-run').onclick = async () => {
    const b = $('o-run'), x = sel, v = id => $(id).value.trim()
    const closesOn = v('o-rclose'), finalBy = v('o-rfinal'), maxEntries = v('o-rmax'), notes = v('o-rnotes'), feeText = v('o-rfee')
    const fee = feeText ? Math.round(+feeText * 100) : null
    const err = !closesOn ? 'Pick when entries close.' : closesOn < t ? 'Entries have to close today or later.' : !finalBy ? 'Pick when the final has to be played by.' : finalBy <= closesOn ? 'The final has to be after entries close.' : maxEntries && +maxEntries < 2 ? 'A limit needs at least 2 places.' : feeText && !(fee >= 0 && fee <= 100000) ? 'Enter the entry fee in pounds, e.g. 5 or 7.50.' : ''
    if (err) { $('o-rerr').textContent = err; return }
    if ((x.n || kos[x.key]?.matches.length) && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: last time’s entries and draw are cleared'; return }
    b.disabled = true
    try { await api.runSignup(x.c.id, { closesOn, finalBy, maxEntries, notes, fee }) } catch (er) { $('o-rerr').textContent = er.message; b.disabled = false; return }
    await keepScroll(render); toast(`${x.c.name} is open: members see it under Competitions → Events`)
  }
  // A club event template: run it on a day (the editor opens with its settings and that date), change it, or delete it.
  if ($('o-trun')) $('o-trun').onclick = () => {
    const date = $('o-tdate').value
    if (!date || date < t) { $('o-terr').textContent = 'Pick a day, today or later.'; return }
    go(() => { const ev = fromTemplate(sel.t.setup, date); Object.assign(S, { ev, evId: null, evTemplate: null, evRepeatUntil: null, evScope: 'club', aview: 'event' }); S.evStep = stepsAfterDetails(ev) })
  }
  if ($('o-tedit')) $('o-tedit').onclick = () => go(() => Object.assign(S, { ev: fromTemplate(sel.t.setup, null), evId: null, evTemplate: sel.t.id, evStep: 1, evScope: 'club', aview: 'event' }))
  if ($('o-tdel')) $('o-tdel').onclick = async () => {
    const b = $('o-tdel')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete the template'; return }
    try { await api.deleteEventTemplate(sel.t.id) } catch (er) { toast(er.message); return }
    S.oComp = null
    await keepScroll(render); toast(`${sel.t.name} template deleted`)
  }
  // An event's entrants: shown on a tap (a long list would swamp the page), A–Z by surname.
  wireAz(() => keepScroll(redraw))
  document.querySelectorAll('[data-o-ents]').forEach(b => (b.onclick = () => { S.oEnts = S.oEnts === +b.dataset.oEnts ? null : +b.dataset.oEnts; keepScroll(redraw) }))
  // Take someone off an event open for sign-up: tap twice.
  document.querySelectorAll('[data-o-rment]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Remove' }, 4000); return }
    const mid = +b.dataset.oRment, who = members.find(m => m.id === mid)?.name ?? 'They'
    try { await api.removeEventEntrant(sel.e.id, mid) } catch (er) { toast(er.message); return }
    await keepScroll(render); toast(`${who} taken off ${sel.e.name}`)
  }))
  // Demo entries: fill to a number (or the limit), or take them all out (tap twice).
  document.querySelectorAll('[data-o-demo]').forEach(b => (b.onclick = async () => {
    const count = b.dataset.oDemo === 'max' ? null : +b.dataset.oDemo
    b.disabled = true
    let r
    try { r = await (sel.c ? api.demoFillSignup(sel.c.id, count) : api.demoFillEvent(sel.e.id, count)) } catch (er) { toast(er.message); b.disabled = false; return }
    await keepScroll(render); toast(`${r.added} demo ${sel.c?.kind === 'pairs' ? 'pairs' : 'entries'} added`)
  }))
  if ($('o-demox')) $('o-demox').onclick = async () => {
    const b = $('o-demox')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: demo entries go'; return }
    b.disabled = true
    let r
    try { r = await (sel.c ? api.demoClearSignup(sel.c.id) : api.demoClearEvent(sel.e.id)) } catch (er) { toast(er.message); b.disabled = false; return }
    await keepScroll(render); toast(`${r.removed} demo ${sel.c?.kind === 'pairs' ? 'pairs' : 'entries'} removed`)
  }
  // Delete the selected competition (a club event or league, or a sign-up competition and its draw): tap twice.
  if ($('o-del')) $('o-del').onclick = async () => {
    const b = $('o-del'), x = sel, name = x.c?.name ?? x.e.name
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = x.c ? 'Tap again: entries and draw go too' : 'Tap again to delete'; return }
    b.disabled = true
    try { await (x.c ? api.deleteSignup(x.c.id) : api.deleteEvent(x.e.id)) } catch (er) { toast(er.message); b.disabled = false; return }
    S.oComp = null
    await keepScroll(render); toast(`${name} deleted`)
  }
  $('o-new').onclick = () => {
    panel(`<h4>New competition</h4><p class="hint">What kind?</p>
      <div class="card olist">
        <button class="orow obtn" data-o-kind="event"><span class="ot"><b>A club event</b><span>One or more days: Stableford, medal, team formats</span></span></button>
        <button class="orow obtn" data-o-kind="league"><span class="ot"><b>A league</b><span>Weekly, singles or pairs, with a knockout finish if you like</span></span></button>
        <button class="orow obtn" data-o-kind="signup"><span class="ot"><b>A sign-up competition or knockout</b><span>Members enter in advance, with a limit; then a random draw</span></span></button>
      </div>`)
    document.querySelectorAll('[data-o-kind]').forEach(b => (b.onclick = () => go(() => {
      if (b.dataset.oKind === 'signup') Object.assign(S, { signupOnly: 'new', aview: 'signups' }) // its own page; saved, back here
      else Object.assign(S, { ev: null, evId: null, evStep: 1, evNew: b.dataset.oKind === 'league' ? 'league' : null, evScope: 'club', aview: 'event' })
    })))
  }
}

const rounds = ko => Math.max(0, ...ko.matches.map(m => m.round))

// For a demo: fill with made-up players up to a number (or the limit), and take them out again. Real entries stay.
function demoBar(n, max, demo, what) {
  const sizes = [8, 16, 32].filter(k => k > n && (!max || k < max))
  return `<div class="orow odemo"><span class="ot"><b>Demo</b><span>${demo ? `${demo} demo ${demo === 1 ? what.replace(/s$/, '') : what} in. ` : ''}Fill with made-up players to show it off; real entries stay.</span></span>
    <span class="oacts">${sizes.map(k => `<button class="ghost sm" data-o-demo="${k}">Fill to ${k}</button>`).join('')}${max && max > n ? `<button class="ghost sm" data-o-demo="max">Fill all ${max}</button>` : ''}${demo ? '<button class="ghost sm accremove" id="o-demox">Remove demo entries</button>' : ''}</span></div>`
}

// A club event template: what it keeps, and Run on a day.
function tplForm(tp, t) {
  const st = tp.setup
  return `<div class="ohead"><div><h4>${esc(tp.name)}</h4><p class="hint">Template · ${EVENT_TYPES[st.style]?.name ?? 'Event'}${holesText(st.holes) ? ` · ${holesText(st.holes)}` : ''}</p></div>
      <span class="oacts"><button class="ghost sm" id="o-tedit">Change</button><button class="ghost sm accremove" id="o-tdel">Delete</button></span></div>
    <div class="opad orun"><label for="o-tdate">Run on a day</label><input id="o-tdate" type="date" class="plainsel" min="${t}">
      <span class="hint">Opens it with the template’s settings on that day: pick the players (if it isn’t open to all) and save. The template stays for next time.</span>
      <p class="gerr" id="o-terr" role="alert"></p><button class="primary" id="o-trun">Run on this day</button></div>`
}

// A template: run it with new dates (entries close, the final played by, a limit, notes), opened to members.
function runForm(x, ko, champ, members, t) {
  const c = x.c
  return `<div class="ohead"><div><h4>${esc(c.name)}</h4><p class="hint">${CAT[c.category]} ${c.kind === 'pairs' ? 'pairs' : 'singles'}${champ != null ? ` · last won by ${esc(entryName(champ, ko.entries, members))}` : ''}</p></div><span class="oacts"><button class="ghost sm accremove" id="o-del">Delete</button></span></div>
    <div class="opad orun">
      <p class="hint">Set this year’s dates and release it: members see it under Competitions → Events and answer Enter or No thanks.${x.n || ko?.matches.length ? ' Last time’s entries and draw are cleared.' : ''}</p>
      <div class="orunrow"><label>Entries close<input type="date" class="plainsel" id="o-rclose" min="${t}" value="${addDaysIso(t, 21)}"></label>
        <label>Final played by<input type="date" class="plainsel" id="o-rfinal" value="${addDaysIso(t, 120)}"></label>
        <label>Places (blank: no limit)<input type="number" class="plainsel" id="o-rmax" min="2" inputmode="numeric" value="${c.maxEntries ?? ''}"></label>
        <label>Entry fee £ (blank: free)<input type="number" class="plainsel" id="o-rfee" min="0" step="0.5" inputmode="decimal" value="${c.entryFee ? c.entryFee / 100 : ''}"></label></div>
      <label>Notes for members (optional)<input class="plainsel" id="o-rnotes" maxlength="300" value="${esc(c.notes ?? '')}" placeholder="e.g. £5 entry, paid in the shop"></label>
      <p class="gerr" id="o-rerr" role="alert"></p>
      <button class="primary sm" id="o-run">Release to members</button>
    </div>`
}

function detail(x, ko, members, t) {
  if (x.e) {
    const name = id => members.find(m => m.id === id)?.name ?? 'Former member', sur = n => n.split(' ').pop()
    const e = x.e, wk = e.style === 'league' ? leagueWeek(e, t) : 0
    // A team league open for sign-up, full or closed, with no teams yet: time to pick captains and make the draw.
    const ready = e.style === 'league' && e.signup && (e.teams?.length ?? 0) > 0 && e.players.length >= 2 && !Object.keys(e.team ?? {}).length
      && ((e.maxEntries && e.players.length >= e.maxEntries) || t > closesOn(e))
    const ents = azList([...e.players].sort((a, b) => sur(name(a)).localeCompare(sur(name(b)))), name, `ents${e.id}`)
    return `<div class="ohead"><div><h4>${esc(e.name)}</h4><p class="hint">${e.style === 'league' ? `${e.weeks}-week league from ${eventDates(e.startDate, 1)}${wk > 0 && wk <= e.weeks ? ` · week ${wk}` : ''}` : eventWhen(e)}${holesText(e.holes) ? ` · ${holesText(e.holes)}` : ''}</p></div><span class="oacts"><button class="ghost sm accremove" id="o-del">Delete</button></span></div>
      ${ready ? `<div class="ogold"><b>Entries are in: ${e.players.length}${e.maxEntries ? ` of ${e.maxEntries}` : ''}</b><span>Next, pick the captains and make the draw: teams balanced by handicap.</span><button class="primary sm" data-o-go="teams:${e.id}">Pick captains and make the draw</button></div>` : ''}
      <div class="olist">
        <div class="orow"><span class="ot"><b>${e.style === 'league' ? 'Table and results' : 'Leaderboard'}</b><span>${e.players.length} player${e.players.length === 1 ? '' : 's'}${e.everyone ? ' · everyone can play' : ''}${e.entryFee ? ` · entry ${money(e.entryFee)}` : ''}</span></span><span class="oacts"><button class="ghost sm" data-o-go="board:${e.id}">Open</button></span></div>
        <div class="orow"><span class="ot"><b>Settings</b><span>Dates, format, who plays</span></span><span class="oacts"><button class="ghost sm" data-o-go="edit:${e.id}">Edit</button></span></div>
        ${e.signup ? `<div class="orow"><span class="ot"><b>Sign-up · ${e.players.length}${e.maxEntries ? ` of ${e.maxEntries} places` : ' entered'}</b><span>${signupLine(e)}</span></span>
            ${e.players.length ? `<span class="oacts"><button class="ghost sm" data-o-ents="${e.id}" aria-expanded="${S.oEnts === e.id}">${S.oEnts === e.id ? 'Hide entrants' : `Show entrants (${e.players.length})`}</button></span>` : ''}</div>
          ${S.oEnts !== e.id ? '' : `<div class="opad">${ents.bar}</div>` + ents.shown.map(id => `<div class="orow"><span class="ot"><b>${esc(name(id))}</b></span><span class="oacts"><button class="ghost sm accremove" data-o-rment="${id}">Remove</button></span></div>`).join('')}
          ${demoBar(e.players.length, e.maxEntries, x.demo, 'entrants')}` : ''}
        ${e.koComp ? `<div class="orow"><span class="ot"><b>The knockout finish</b><span>The top ${e.koTop} from the table</span></span><span class="oacts"><button class="ghost sm" data-o-go="draw:${e.koComp}">Open the draw</button></span></div>` : ''}
      </div>`
  }
  const c = x.c
  const head = `<div class="ohead"><div><h4>${esc(c.name)}</h4><p class="hint">${CAT[c.category]} ${c.kind === 'pairs' ? 'pairs' : 'singles'} · ${x.n}${c.maxEntries ? ` of ${c.maxEntries}` : ''} entered${c.closesOn ? ` · entries ${c.closesOn >= t ? 'close' : 'closed'} ${eventDates(c.closesOn, 1)}` : ''}</p>${c.entryFee ? `<p class="hint">Entry ${money(c.entryFee)}${c.kind === 'pairs' ? ' each' : ''} · ${feeTotal(c.kind === 'pairs' ? c.entryFee * 2 : c.entryFee, x.n).split(' · ')[1]}</p>` : ''}</div>
    <span class="oacts"><button class="ghost sm accremove" id="o-del">Delete</button><button class="ghost sm" data-o-go="signups:${c.id}">Entries and settings</button>${ko?.matches.length ? `<button class="primary sm" data-o-go="draw:${c.id}">${c.drawPublished ? 'Set results' : 'Make the draw'}</button>` : x.n > 1 ? `<button class="primary sm" data-o-go="draw:${c.id}">Make the draw</button>` : ''}</span></div>`
  if (!ko?.matches.length) return `${head}${demoBar(x.n, c.maxEntries, x.demo, c.kind === 'pairs' ? 'pairs' : 'entries')}<div class="empty-state">${x.n ? 'No draw yet. Make it once entries close.' : 'Nobody has entered yet.'}</div>`
  const n = rounds(ko), name = id => entryName(id, ko.entries, members)
  const champ = champion(ko.matches, n)
  const side = (m, id, bye) => `<div class="obk${m.winnerEntry === id && id != null && ['confirmed', 'bye'].includes(m.status) ? ' w' : ''}">${esc(entryName(id, ko.entries, members, bye))}</div>`
  const state = m => m.status === 'bye' ? 'Bye' : m.status === 'confirmed' ? `${esc(name(m.winnerEntry))} won${m.result ? ` ${esc(m.result)}` : ''}`
    : m.status === 'disputed' ? 'Disputed: set the result' : m.status === 'reported' ? 'Waiting for the other side to confirm' : c.roundDeadlines[m.round - 1] ? `To play by ${eventDates(c.roundDeadlines[m.round - 1], 1)}` : 'To play'
  return `${head}${!c.drawPublished ? '<p class="hint opad">Draft: members don’t see it until it’s published.</p>' : ''}${champ ? `<p class="opad"><span class="pill gold">Champion: ${esc(name(champ))}</span></p>` : ''}
    <div class="obracket">${[...Array(n)].map((_, r) => `<div class="oround"><small>${roundName(r + 1, n)}${c.roundDeadlines[r] ? `<span>By ${eventDates(c.roundDeadlines[r], 1)}</span>` : ''}</small>
      ${ko.matches.filter(m => m.round === r + 1).sort((a, b) => a.slot - b.slot).map(m => `<div class="omatch${m.status === 'disputed' ? ' disp' : ''}">${side(m, m.aEntry)}${side(m, m.bEntry, m.status === 'bye')}<div class="ost">${state(m)}${m.roundId ? ` · <button class="linkbtn" data-o-card="${m.id}:${c.id}">Scorecard</button>` : ''}</div></div>`).join('')}</div>`).join('')}</div>`
}
