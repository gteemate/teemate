// Scoring round? — asked once when a card starts: the leagues and events the players on this card are in today.
// Tick the ones this round counts for, or none for a general round; Start round saves the card and the ticks.
// (Replaces the league pop-up on the card; the league badges on the card can still change it before hole 1.)
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, top0, toast } from '../ui.js'
import { isoDate, today } from '../dates.js'
import { getRound, resetRound } from './scores.js'
import { countsForOptions, markerChoices } from '../round.js'
import { markLeagueAsked } from './scores-league.js'
import { eventFormat } from './event-editor.js'
import { feeLine } from '../fees.js'

let ticked = new Set() // option keys ticked on this visit
let marker = null // who marks the card ({ m } / { g }), for leagues and standard competitions
let seen = null // the card these ticks belong to (auto ticks are set once per card)

export async function load() {
  const round = getRound()
  if (!round) { S.sview = 'card'; return { round: null } }
  const events = await api.getEvents()
  const date = isoDate(today())
  const leagues = events.filter(e => e.style === 'league')
  const [leagueEntries, me, members, guests, theme, balances] = await Promise.all([api.getLeagueEntries(leagues.map(e => e.id)), api.getMe(), api.getMembers(),
    api.getGuests(round.lineup.filter(e => e.g != null).map(e => e.g)), api.getTheme(), api.getMyBalances()])
  const name = x => (x.m != null ? members.find(m => m.id === x.m)?.name : guests.find(g => g.id === x.g)?.name) ?? 'Guest'
  const choices = markerChoices(round.lineup, me.id).map(x => ({ ...x, name: name(x) }))
  return { round, me, choices, fees: { payment: theme?.feePayment ?? 'shop', purse: balances?.competition ?? null, example: !!balances?.example }, options: countsForOptions({ lineup: round.lineup, events, leagueEntries, date, meId: me.id }) }
}

const key = o => `${o.kind}:${o.e.id}`

// What the server is sent for a marker: just who it is on the card ({ m } or { g }), not the name shown here.
const who = c => (c.m != null ? { m: c.m } : { g: c.g })
const same = (a, b) => !!a && !!b && (a.m != null ? a.m === b.m : a.g === b.g)

async function start(round, options, me) {
  if (!round.id) await api.saveRound(round) // creates the group's card (or joins it)
  for (const o of options.filter(x => ticked.has(key(x)))) {
    // Each player's marker: the one chosen, or me when that player is the marker. Matches need none.
    const enter = (ids, mk) => (o.kind === 'league' ? api.enterLeague(round.id, o.e.id, ids, mk)
      : o.kind === 'join' ? api.enterEventToday(round.id, o.e.id, mk) : api.enterEventRound(round.id, o.e.id, ids, mk))
    try {
      if (!o.needsMarker) await enter(o.players)
      else for (const id of o.players) await enter([id], same(marker, { m: id }) ? { m: me.id } : who(marker))
    } catch (err) { toast(err.message) }
  }
  markLeagueAsked(round.id)
  ticked = new Set(); marker = null; seen = null
  S.sview = 'card'
  await render()
  top0()
}

export function draw({ round, me, choices, options, fees = { payment: 'shop', purse: null } }) {
  if (!round) { render(); return }
  if (!options.length) { start(round, options, me); return } // nothing to ask: straight to the card
  if (seen !== round) { seen = round; ticked = new Set(options.filter(o => o.auto).map(key)); marker = choices.length === 1 ? choices[0] : null } // your match counts already
  const needMarker = options.some(o => o.needsMarker && ticked.has(key(o)))
  header('Scoring round?', '', async () => { ticked = new Set(); marker = null; seen = null; resetRound(); S.sview = 'card'; await render(); top0() }) // back to New round (an unsaved card is dropped)
  const label = () => { const on = options.filter(o => ticked.has(key(o))).map(o => o.e.name); return `Start round · ${on.length ? on.join(' + ') : 'General play'}` }
  const sub = o => (o.kind === 'join' ? `Club competition${eventFormat(o.e) ? ` · ${eventFormat(o.e)}` : ''}` : o.match ? `Match ${o.match}${o.e.days > 1 ? ` · day ${o.day}` : ''} · all four of you are on this card` : o.kind === 'league' ? `Week ${o.week} of ${o.e.weeks} · Stableford` : `${o.e.days > 1 ? `Day ${o.day} of ${o.e.days} · ` : ''}${o.e.club ? 'Club event' : `Event by ${esc(o.e.createdBy?.name ?? 'a member')}`}`)
  const entered = options.filter(o => o.kind !== 'join'), joinable = options.filter(o => o.kind === 'join')
  const tick = o => `<button class="card tick" data-k="${key(o)}" aria-pressed="${ticked.has(key(o))}"><span class="box" aria-hidden="true">${ticked.has(key(o)) ? '✓' : ''}</span>
      <span><span class="tt">${esc(o.e.name)}</span><span class="sub">${sub(o)}</span></span></button>`
  $('main').innerHTML = `<div class="screen">
    ${entered.length ? `<p class="sub" style="margin:0">You’re currently entered in these competitions.</p>
    <h3 style="margin:0">Do you want to make this a scoring round?</h3>
    <p class="sub" style="margin:0">Tick the ones this round should count for, or leave them all for a general round.</p>
    ${entered.map(tick).join('')}` : ''}
    ${joinable.map(o => `<h3 style="margin:${entered.length ? '10px' : '0'} 0 0">${esc(o.e.name)} is on today. Do you want to play in it?</h3>
      <p class="sub" style="margin:0">Tick it and you’re entered, with this round counting.</p>${feeLine(o.e.entryFee, fees.payment, fees.purse) ? `<span class="feeline">${esc(feeLine(o.e.entryFee, fees.payment, fees.purse))}${fees.example && fees.purse != null ? ' (example balance)' : ''}</span>` : ''}${tick(o)}`).join('')}
    ${needMarker ? (choices.length === 1 ? `<p class="hint">Marker: <b>${esc(choices[0].name)}</b></p>`
      : `<span class="kicker">Who’s marking your card?</span><div class="chips" role="radiogroup" aria-label="Your marker">${choices.map((c, n) => `<button class="chip" role="radio" data-mk="${n}" aria-checked="${same(marker, c)}" aria-pressed="${same(marker, c)}">${esc(c.name)}</button>`).join('')}</div>`) : ''}
    <button class="primary" id="start" ${needMarker && !marker ? 'disabled' : ''}>${esc(needMarker && !marker ? 'Pick your marker' : label())}</button>
  </div>`
  const again = () => draw({ round, me, choices, options, fees })
  document.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { const k = b.dataset.k; ticked.has(k) ? ticked.delete(k) : ticked.add(k); again() }))
  document.querySelectorAll('[data-mk]').forEach(b => (b.onclick = () => { marker = choices[+b.dataset.mk]; again() }))
  $('start').onclick = async () => { $('start').disabled = true; await start(round, options, me) }
}
