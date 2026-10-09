// Scoring round? — asked once when a card starts: the leagues and events the players on this card are in today.
// Tick the ones this round counts for, or none for a general round; Start round saves the card and the ticks.
// (Replaces the league pop-up on the card; the league badges on the card can still change it before hole 1.)
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, top0, toast } from '../ui.js'
import { isoDate, today } from '../dates.js'
import { getRound, resetRound } from './scores.js'
import { countsForOptions } from '../round.js'
import { markLeagueAsked } from './scores-league.js'

let ticked = new Set() // option keys ticked on this visit

export async function load() {
  const round = getRound()
  if (!round) { S.sview = 'card'; return { round: null } }
  const events = await api.getEvents()
  const date = isoDate(today())
  const leagues = events.filter(e => e.style === 'league')
  const leagueEntries = await api.getLeagueEntries(leagues.map(e => e.id))
  return { round, options: countsForOptions({ lineup: round.lineup, events, leagueEntries, date }) }
}

const key = o => `${o.kind}:${o.e.id}`

async function start(round, options) {
  if (!round.id) await api.saveRound(round) // creates the group's card (or joins it)
  for (const o of options.filter(x => ticked.has(key(x)))) {
    try {
      if (o.kind === 'league') await api.enterLeague(round.id, o.e.id, o.players)
      else await api.enterEventRound(round.id, o.e.id, o.players)
    } catch (err) { toast(err.message) }
  }
  markLeagueAsked(round.id)
  ticked = new Set()
  S.sview = 'card'
  await render()
  top0()
}

export function draw({ round, options }) {
  if (!round) { render(); return }
  if (!options.length) { start(round, options); return } // nothing to ask: straight to the card
  header('Scoring round?', '', async () => { ticked = new Set(); resetRound(); S.sview = 'card'; await render(); top0() }) // back to New round (an unsaved card is dropped)
  const label = () => { const on = options.filter(o => ticked.has(key(o))).map(o => o.e.name); return `Start round · ${on.length ? on.join(' + ') : 'General play'}` }
  const sub = o => (o.kind === 'league' ? `Week ${o.week} of ${o.e.weeks} · Stableford` : `${o.e.days > 1 ? `Day ${o.day} of ${o.e.days} · ` : ''}${o.e.club ? 'Club event' : `Event by ${esc(o.e.createdBy?.name ?? 'a member')}`}`)
  $('main').innerHTML = `<div class="screen">
    <p class="sub" style="margin:0">You’re currently entered in these competitions.</p>
    <h3 style="margin:0">Do you want to make this a scoring round?</h3>
    <p class="sub" style="margin:0">Tick the ones this round should count for, or leave them all for a general round.</p>
    ${options.map(o => `<button class="card tick" data-k="${key(o)}" aria-pressed="${ticked.has(key(o))}"><span class="box" aria-hidden="true">${ticked.has(key(o)) ? '✓' : ''}</span>
      <span><span class="tt">${esc(o.e.name)}</span><span class="sub">${sub(o)}</span></span></button>`).join('')}
    <button class="primary" id="start">${esc(label())}</button>
  </div>`
  document.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { const k = b.dataset.k; ticked.has(k) ? ticked.delete(k) : ticked.add(k); draw({ round, options }) }))
  $('start').onclick = async () => { $('start').disabled = true; await start(round, options) }
}
