// Scoring round? — asked once when a card starts: the leagues and events the players on this card are in today.
// Tick the ones this round counts for, or none for a general round; Start round saves the card and the ticks.
// (Replaces the league pop-up on the card; the league badges on the card can still change it before hole 1.)
// A league or event with more than one of its players on the card asks who's entering their score (me to start).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, top0, toast } from '../ui.js'
import { isoDate, today } from '../dates.js'
import { getRound, resetRound } from './scores.js'
import { countsForOptions } from '../round.js'
import { markLeagueAsked } from './scores-league.js'
import { eventFormat } from './event-editor.js'
import { feeLine } from '../fees.js'

let ticked = new Set() // option keys ticked on this visit
let marker = null // who marks my card ({ m } / { g }), for leagues and standard competitions
let marks = {} // the others entering: who marks each one's card (me unless changed)
let othersOpen = false // "Someone else is" tapped: ask who marks each of the others
let seen = null // the card these ticks belong to (auto ticks are set once per card)
let entering = {} // option key → the players on the card entering it (asked when more than one of them is on it)

export async function load() {
  const round = getRound()
  if (!round) { S.sview = 'card'; return { round: null } }
  const events = await api.getEvents()
  const date = isoDate(today())
  const leagues = events.filter(e => e.style === 'league')
  const [leagueEntries, me, members, guests, theme, balances] = await Promise.all([api.getLeagueEntries(leagues.map(e => e.id)), api.getMe(), api.getMembers(),
    api.getGuests(round.lineup.filter(e => e.g != null).map(e => e.g)), api.getTheme(), api.getMyBalances()])
  const name = x => (x.m != null ? members.find(m => m.id === x.m)?.name : guests.find(g => g.id === x.g)?.name) ?? 'Guest'
  const people = round.lineup.map(x => ({ ...x, name: x.m === me.id ? 'You' : name(x) })) // who's on the card, for the marker
  const names = Object.fromEntries(members.map(m => [m.id, m.name]))
  return { round, me, people, names, fees: { payment: theme?.feePayment ?? 'shop', purse: balances?.competition ?? null }, options: countsForOptions({ lineup: round.lineup, events, leagueEntries, date, meId: me.id }) }
}

const key = o => `${o.kind}:${o.e.id}`
// Asked whenever someone else on the card could enter (a match needs everyone in it; a club competition is only me).
const asksWho = (o, me) => !o.match && o.kind !== 'join' && o.players.some(id => id !== me.id)

// What the server is sent for a marker: just who it is on the card ({ m } or { g }), not the name shown here.
const who = c => (c.m != null ? { m: c.m } : { g: c.g })
const same = (a, b) => !!a && !!b && (a.m != null ? a.m === b.m : a.g === b.g)

async function start(round, options, me) {
  if (!round.id) await api.saveRound(round) // creates the group's card (or joins it)
  for (const o of options.filter(x => ticked.has(key(x)))) {
    const players = asksWho(o, me) ? o.players.filter(id => entering[key(o)]?.has(id)) : o.players
    // Each player's marker: mine as chosen; each of the others, me unless someone else was picked. Matches need none.
    const enter = (ids, mk) => (o.kind === 'league' ? api.enterLeague(round.id, o.e.id, ids, mk)
      : o.kind === 'join' ? api.enterEventToday(round.id, o.e.id, mk) : api.enterEventRound(round.id, o.e.id, ids, mk))
    try {
      if (!o.needsMarker) await enter(players)
      else for (const id of players) await enter([id], who(id === me.id ? marker : marks[id] ?? { m: me.id }))
    } catch (err) { toast(err.message) }
  }
  markLeagueAsked(round.id)
  ticked = new Set(); marker = null; marks = {}; othersOpen = false; seen = null; entering = {}
  S.sview = 'card'
  await render()
  top0()
}

export function draw({ round, me, people, names = {}, options, fees = { payment: 'shop', purse: null } }) {
  if (!round) { render(); return }
  if (!options.length) { start(round, options, me); return } // nothing to ask: straight to the card
  if (seen !== round) { seen = round; ticked = new Set(options.filter(o => o.auto).map(key)); marker = null; marks = {}; othersOpen = false
    // you're entering to start with; if you can't (already counted this week), the one other player who can
    entering = Object.fromEntries(options.filter(o => asksWho(o, me)).map(o => [key(o), new Set(o.players.includes(me.id) ? [me.id] : o.players.length === 1 ? o.players : [])])) } // your match counts already
  const needMarker = options.some(o => o.needsMarker && ticked.has(key(o)))
  // Who's entering a competition that needs a marker: my card's marker is asked; the others' cards are marked by me
  // unless "Someone else is" (asked straight away when I'm not entering myself).
  const entrants = [...new Set(options.filter(o => o.needsMarker && ticked.has(key(o))).flatMap(o => (asksWho(o, me) ? o.players.filter(id => entering[key(o)]?.has(id)) : o.players)))]
  const mine = entrants.includes(me.id), others = entrants.filter(id => id !== me.id)
  const choices = people.filter(c => c.m !== me.id)
  if (mine && !marker && choices.length === 1) marker = choices[0]
  const markOf = id => marks[id] ?? { m: me.id }, choicesFor = id => people.filter(c => c.m !== id)
  const first = id => names[id]?.split(' ')[0] ?? 'Their', poss = id => `${esc(first(id))}’s`
  const cards = others.length === 1 ? `${poss(others[0])} card` : `${others.slice(0, -1).map(poss).join(', ')} and ${poss(others.at(-1))} cards`
  const askOthers = othersOpen || !mine
  const markRow = (label, list, pressed, attr) => (list.length === 1 ? `<p class="hint">${label}: <b>${esc(list[0].name)}</b></p>`
    : `<span class="kicker">Who’s marking ${label === 'Marker' ? 'your card' : label.replace(' marker', ' card')}?</span><div class="chips" role="radiogroup" aria-label="${label}">${list.map((c, n) => `<button class="chip" role="radio" ${attr}="${n}" aria-checked="${pressed(c)}" aria-pressed="${pressed(c)}">${esc(c.name)}</button>`).join('')}</div>`)
  const markersHtml = !needMarker ? '' : `${mine ? markRow('Marker', choices, c => same(marker, c), 'data-mk') : ''}
    ${others.length && !askOthers ? `<p class="hint mkothers">You’re marking ${cards}. <button type="button" class="linkbtn" id="mk-else">Someone else is</button></p>` : ''}
    ${others.length && askOthers ? others.map(id => markRow(`${poss(id)} marker`, choicesFor(id), c => same(markOf(id), c), `data-mko="${id}" data-n`)).join('') : ''}`
  const nobody = options.some(o => ticked.has(key(o)) && asksWho(o, me) && !entering[key(o)].size) // ticked, but nobody entering
  header('Scoring round?', '', async () => { ticked = new Set(); marker = null; marks = {}; othersOpen = false; seen = null; resetRound(); S.sview = 'card'; await render(); top0() }) // back to New round (an unsaved card is dropped)
  const label = () => { const on = options.filter(o => ticked.has(key(o))).map(o => o.e.name); return `Start round · ${on.length ? on.join(' + ') : 'General play'}` }
  const sub = o => (o.kind === 'join' ? `Club competition${eventFormat(o.e) ? ` · ${eventFormat(o.e)}` : ''}` : o.match ? `Match ${o.match}${o.e.season ? '' : o.e.days > 1 ? ` · day ${o.day}` : ''} · ${o.players.length === 1 ? 'your singles: your card counts' : o.players.length === 2 ? 'both of you are on this card' : o.players.length === 3 ? 'all three of you are on this card' : 'all four of you are on this card'}` : o.kind === 'league' ? `Week ${o.week} of ${o.e.weeks} · Stableford${o.e.players.includes(me.id) && !o.players.includes(me.id) ? ' · you’ve had your round this week' : ''}` : `${o.e.days > 1 && !o.e.season ? `Day ${o.day} of ${o.e.days} · ` : ''}${o.e.club ? 'Club event' : `Event by ${esc(o.e.createdBy?.name ?? 'a member')}`}`)
  const entered = options.filter(o => o.kind !== 'join'), joinable = options.filter(o => o.kind === 'join')
  const tick = o => `<button class="card tick" data-k="${key(o)}" aria-pressed="${ticked.has(key(o))}"><span class="box" aria-hidden="true">${ticked.has(key(o)) ? '✓' : ''}</span>
      <span><span class="tt">${esc(o.e.name)}</span><span class="sub">${sub(o)}</span></span></button>${ticked.has(key(o)) && asksWho(o, me) ? `
      <span class="kicker">Who’s entering their score?</span><div class="chips" role="group" aria-label="Who’s entering ${esc(o.e.name)}">${o.players.map(id =>
        `<button class="chip" data-ent="${key(o)}|${id}" aria-pressed="${entering[key(o)].has(id)}">${id === me.id ? 'You' : esc(names[id] ?? 'A player')}</button>`).join('')}</div>` : ''}`
  $('main').innerHTML = `<div class="screen">
    ${entered.length ? `<p class="sub" style="margin:0">${entered.every(o => o.players.length === 1 && o.players[0] === me.id) ? 'You’re' : 'You or your group are'} entered in these competitions.</p>
    <h3 style="margin:0">${entered.every(o => o.players.length === 1 && o.players[0] === me.id) ? 'Do you want to make this a scoring round?' : 'Is anyone making this a scoring round?'}</h3>
    <p class="sub" style="margin:0">Tick the ones this round should count for${entered.some(o => asksWho(o, me)) ? ', then who’s entering' : ''}, or leave them all for a general round.</p>
    ${entered.map(tick).join('')}` : ''}
    ${joinable.map(o => `<h3 style="margin:${entered.length ? '10px' : '0'} 0 0">${esc(o.e.name)} is on today. Do you want to play in it?</h3>
      <p class="sub" style="margin:0">Tick it and you’re entered, with this round counting.</p>${feeLine(o.e.entryFee, fees.payment, fees.purse) ? `<span class="feeline">${esc(feeLine(o.e.entryFee, fees.payment, fees.purse))}</span>` : ''}${tick(o)}`).join('')}
    ${markersHtml}
    <button class="primary" id="start" ${(mine && !marker) || nobody ? 'disabled' : ''}>${esc(nobody ? 'Pick who’s entering' : mine && !marker ? 'Pick your marker' : label())}</button>
  </div>`
  const again = () => draw({ round, me, people, names, options, fees })
  document.querySelectorAll('[data-ent]').forEach(b => (b.onclick = () => { const [k, id] = b.dataset.ent.split('|'), set = entering[k]; set.has(+id) ? set.delete(+id) : set.add(+id); again() }))
  document.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { const k = b.dataset.k; ticked.has(k) ? ticked.delete(k) : ticked.add(k); again() }))
  document.querySelectorAll('[data-mk]').forEach(b => (b.onclick = () => { marker = choices[+b.dataset.mk]; again() }))
  document.querySelectorAll('[data-mko]').forEach(b => (b.onclick = () => { const id = +b.dataset.mko; marks[id] = choicesFor(id)[+b.dataset.n]; again() }))
  if ($('mk-else')) $('mk-else').onclick = () => { othersOpen = true; again() }
  $('start').onclick = async () => { $('start').disabled = true; await start(round, options, me) }
}
