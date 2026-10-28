// Admin → Events → New/Edit: set up an event in advance in five steps:
// details, players, teams, draw (Four-ball team match play; a season: its match days), review. Scores come from players' own cards on the day.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, top0, render, toast, fmtHcp, goBack } from '../ui.js'
import { addDaysIso, eventDates, isoDate, today, weeklyDates } from '../dates.js'
import { drawTeams, drawCaptains } from '../event-scoring.js'
import { PALETTE } from '../palette.js'
import { DEFAULT_POINTS, dayRules } from '../match-scoring.js'
import { openFlow, currentFlow, flowHtml, bindFlow, flowNext, flowBack, flowCta, flowTitle, typeName } from './match-day-flow.js'
import { drawDay, dayDate, dayOfDate, playedIds } from '../season.js'
import { holesText } from '../open-holes.js'
import { signupLine } from '../event-signups.js'
import { holePickerHtml, bindHolePicker, noneOpen } from './hole-picker.js'
import { azList, wireAz } from '../az.js'

export const EVENT_TYPES = {
  ryder: { name: 'Four-ball team match play', desc: 'Two teams play four-balls, singles and 3-balls for points.', formats: [['bbl', 'Better ball · off the low'], ['bbstab', 'Better ball · Stableford'], ['bbscr', 'Better ball · scratch'], ['stabtot', 'Stableford total over the holes']] },
  teams: { name: 'Team Stableford', desc: 'Two teams. Everyone’s Stableford points count for their team.', formats: [['teamstab', 'Team Stableford']] },
  individual: { name: 'Individual', desc: 'A leaderboard of everyone: Stableford or net.', formats: [['stab', 'Stableford'], ['net', 'Net strokeplay']] },
  league: { name: 'League', desc: 'Over several weeks: singles or pairs Stableford, with teams for club leagues and an optional knockout finish.', formats: [['beststab', 'Best Stableford rounds']] },
}
const TEAM_COLOURS = PALETTE.map(p => p.hex) // only colours you can see on navy (palette.js)
// A row of colour swatches; who = 'A', 'B' or a league team's index.
const swatches = (who, col, off = false, taken = null) => `<div class="swatches" role="group" aria-label="Team colour">${PALETTE.map(p => `<button type="button" data-col="${who}:${p.hex}" aria-pressed="${col === p.hex}" aria-label="${p.name}" style="background:${p.hex}"${off || p.hex === taken ? ' disabled' : ''}></button>`).join('')}</div>`
export const leagueTeams = (n, existing = []) => Array.from({ length: n }, (_, i) => existing[i] ?? { name: `Team ${i + 1}`, col: TEAM_COLOURS[i % TEAM_COLOURS.length], size: 12 })
export const eventFormat = e => EVENT_TYPES[e.style].formats.find(f => f[0] === e.fmt)?.[1] ?? ''

// The draw's own state, cleared when the editor closes (or opens from the office's yellow box).
export const DRAW_FRESH = { evDraw: null, evCapMode: null, evBalMode: null, evHandTeam: 0, evOpen: null, evMove: null, evNoCaps: false, evEnts: false }
const STEPS = { 1: 'Details', 2: 'Players', 3: 'Teams', 4: 'Draw', 5: 'Review', 6: 'Teams & players', 7: 'Pairs' }
// A club Individual competition open to anyone playing that day: no players to pick (they join as they start).
export const openToAll = ev => !!ev.club && ev.style === 'individual' && !!ev.selfEntry
// Leagues: pairs (fixed pairs all season), club leagues with teams, or a member's singles league (just players).
export const pairsLeague = ev => ev.style === 'league' && Array.isArray(ev.leaguePairs)
const teamLeague = ev => ev.style === 'league' && !pairsLeague(ev) && (ev.teams?.length ?? 0) > 0
const fmtHalf = n => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`)
// A match day's card on the Match days step: its date, matches, holes and points; Change / Remove while not started.
function dayCard(ev, d, name, canChange) {
  const r = dayRules(ev, d), list = ev.matches[d] ?? []
  const when = ev.season ? eventDates(dayDate(ev, d), 1) : `Day ${d} · ${eventDates(addDaysIso(ev.startDate, d - 1), 1)}`
  return `<div class="card evsec"><div class="pinhead"><h4 style="font-size:20px">${when}</h4>${canChange ? `<span><button class="linkbtn" data-mdset="${d}">${list.length ? 'Change' : 'Set up'}</button>${ev.season ? ` <button class="linkbtn" data-rmday="${d}">Remove</button>` : ` <button class="linkbtn" data-draw="${d}">Redraw</button>`}</span>` : '<span class="hint">Played</span>'}</div>
    ${list.map(m => `<div class="matchedit"><span style="color:${ev.A.col}">${m.a.map(id => esc(sur(name(id)))).join(' &amp; ')}</span><span class="v">${typeName(m)}</span><span class="r" style="color:${ev.B.col}">${m.b.map(id => esc(sur(name(id)))).join(' &amp; ')}</span></div>`).join('') || '<span class="hint">No matches yet.</span>'}
    <span class="hint">${holesText(r.holes) || '18 holes'} · four-ball ${fmtHalf(r.points.four)}, singles ${fmtHalf(r.points.singles)}, 3-ball ${fmtHalf(r.points.threePair)} / ${fmtHalf(r.points.threeSingle)}</span></div>`
}
const stepName = (ev, s) => (s === 4 && ev.season ? 'Match days' : STEPS[s])
// A season that has begun: changes go through save_season (teams fixed, played match days locked).
// Making a team league's draw (step 6): 1 captains, 2 teams, 3 check and save. Opens where it left off.
const drawStep = ev => (S.evDraw ??= Object.keys(ev.team ?? {}).length > ev.teams.filter(x => x.captain != null).length ? 3 : ev.teams.some(x => x.captain != null) ? 2 : 1)
const drawCta = ev => {
  const d = drawStep(ev)
  if (d === 1) return { label: 'Next: put the entrants on teams', off: !ev.teams.some(x => x.captain != null) && !S.evNoCaps }
  if (d === 2) return { label: 'Next: check the teams', off: !ev.players.some(id => ev.team[id] != null && !ev.teams.some(x => x.captain === id)) }
  return { label: 'Save the draw', off: false }
}
// A league under way: its teams are drawn or week 1 has started.
const liveLeague = ev => ev.style === 'league' && !!ev.id && (ev.startDate <= isoDate(today()) || Object.keys(ev.team ?? {}).length > 0)
const begun = ev => !!ev.id && !!ev.season && ev.startDate <= isoDate(today())
// …and the organiser (not an admin) changes it only through save_season: end date, teams and match days.
const viaSeason = (ev, me) => begun(ev) && !me.admin
// Once an event has started its points stay as they are: days already played count them (each day can still change its own).
const pointsFixed = ev => !!ev.id && ev.startDate <= isoDate(today())
const lockedDay = (ev, d) => dayDate(ev, d) < isoDate(today())
const seasonDays = ev => Object.keys(ev.matches).map(Number).sort((x, y) => x - y)
// Take a player out of the match days that can still change (a season), or out of the whole draw (a one-off).
const dropFromMatches = (ev, id) => {
  if (!ev.season) { ev.matches = {}; return }
  for (const d of seasonDays(ev)) if (!lockedDay(ev, d)) ev.matches[d] = ev.matches[d].filter(m => !m.a.includes(id) && !m.b.includes(id))
}
// The open holes: the event's, and any day's (a league's weeks') own. A day's own all 18 is kept as the full list, so
// it isn't mistaken for "same as the event".
const ALL18 = Array.from({ length: 18 }, (_, i) => i + 1)
const holeUnits = ev => (ev.style === 'league' ? ev.weeks : ev.days) ?? 1
const ownHoles = (ev, d) => (ev.dayRules?.[d] && 'holes' in ev.dayRules[d] ? ev.dayRules[d].holes : undefined)
const holesEmpty = ev => noneOpen(ev.holes) || Object.entries(ev.dayRules ?? {}).some(([d, r]) => +d <= holeUnits(ev) && noneOpen(r?.holes)) // days still in it
function holesCard(ev) {
  const unit = ev.style === 'league' ? 'Week' : 'Day', n = holeUnits(ev)
  const days = n > 1 ? Array.from({ length: n }, (_, i) => i + 1).map(d => {
    const own = ownHoles(ev, d), open = S.evHoleDay === d
    return `<div class="actrow hpday"><span class="who"><strong>${unit} ${d}</strong><small>${own === undefined ? 'Same holes as the event' : holesText(own) || 'All 18 holes'}</small></span>
      <button type="button" class="ghost sm" data-evhd="${d}">${open ? 'Done' : 'Change'}</button></div>
      ${open ? `${holePickerHtml(own ?? ev.holes, `d${d}`)}${own !== undefined ? `<button type="button" class="linkbtn" data-evhsame="${d}">Same as the event</button>` : ''}` : ''}`
  }).join('') : ''
  return `<div class="card evsec"><h4>Holes</h4><span class="hint">Tap a hole to open or close it. Handicaps are scaled to the holes played, with shots on the hardest of them.</span>
    ${holePickerHtml(ev.holes, 'ev')}${days ? `<div class="hpdays">${days}</div>` : ''}</div>`
}
/** "All 18", or "Holes 1–6, 10–12", with any day's (week's) own holes after it. */
export function holesSummary(ev) {
  const unit = ev.style === 'league' ? 'week' : 'day'
  const own = Object.entries(ev.dayRules ?? {}).filter(([, r]) => r && 'holes' in r).map(([d, r]) => `${unit} ${d}: ${holesText(r.holes).replace(/^H/, 'h') || 'all 18'}`)
  return [holesText(ev.holes) || 'All 18', ...own].join(' · ')
}

// Sign-up in advance (club office): advertised from a date, entries until a closing date, a number of places.
const leaguePlaces = ev => (ev.teams ?? []).reduce((n, t) => n + (t.size ?? 12), 0)
const signupCard = ev => `<div class="card evsec"><div class="actrow"><span class="who"><strong>Members sign up in advance</strong><small>Advertise it with a closing date and a number of places; members see the spaces left.</small></span>
    <button type="button" class="switch" role="switch" id="ev-signup" aria-checked="${!!ev.signup}" aria-label="Members sign up in advance"><span></span></button></div>
    ${ev.signup ? `<div class="tnames"><div><label for="ev-adv">Advertise from</label><input id="ev-adv" type="date" value="${ev.advertiseFrom ?? ''}"></div>
      <div><label for="ev-close">Entries close</label><input id="ev-close" type="date" value="${ev.entriesClose ?? ''}"></div></div>
      <label for="ev-max">Places <span class="opt">blank: no limit</span></label><input id="ev-max" type="number" class="plainsel" min="1" inputmode="numeric" value="${ev.maxEntries ?? ''}">
      <span class="hint">${signupLine(ev)}</span>` : ''}</div>`

// Club event templates (the club office): an event's settings without its date or players, run again on any day.
const NOT_KEPT = ['id', 'startDate', 'endDate', 'start0', 'team0', 'players', 'team', 'matches', 'captainPool', 'leaguePairs', 'createdBy', 'koComp', 'koFinish', 'entryRequired', 'advertiseFrom', 'entriesClose', 'placesAuto'] // sign-up dates go with the day it's run
export function templateOf(ev) {
  const setup = structuredClone(ev)
  NOT_KEPT.forEach(k => delete setup[k])
  if (setup.teams) setup.teams = setup.teams.map(t => ({ name: t.name, col: t.col })) // no captains: they're players
  if (setup.season) { delete setup.dayRules; setup.days = 1 } // a season's match days are its own: a run starts with none
  if (ev.leaguePairs) setup.pairs = true
  return setup
}
/** A new event from a template, on a day (null when changing the template itself). */
export function fromTemplate(setup, date) {
  const { pairs, ...rest } = structuredClone(setup)
  return { days: 1, A: { name: 'Blues', col: '#6CB6FF' }, B: { name: 'Reds', col: '#E5484D' }, points: { ...DEFAULT_POINTS }, ...rest,
    startDate: date ?? addDaysIso(isoDate(today()), 1), players: [], team: {}, matches: {}, captainPool: [], leaguePairs: pairs ? [] : null, club: true }
}
// The review step's extras for a new club event: save it as a template instead, or repeat it weekly.
function clubExtras(ev) {
  const dates = S.evRepeatUntil ? weeklyDates(ev.startDate, S.evRepeatUntil) : []
  const repeat = ev.style === 'league' || ev.season ? '' : `<div class="card evsec"><label for="ev-rep">Repeat weekly until <span class="opt">blank: just this day</span></label>
      <input id="ev-rep" type="date" class="plainsel" value="${S.evRepeatUntil ?? ''}" min="${addDaysIso(ev.startDate, 7)}">
      <span class="hint">${dates.length > MAX_REPEATS ? `<b class="gerr">That would make ${dates.length} events: at most ${MAX_REPEATS} (a year). Pick an earlier date.</b>`
        : dates.length > 1 ? `<b>Makes ${dates.length} events: ${eventDates(dates[0], 1)} … ${eventDates(dates.at(-1), 1)}</b>. Each can be changed or deleted on its own.` : 'The same day each week, each its own event.'}</span></div>`
  return `${repeat}<div class="card evsec"><button type="button" class="ghost" id="ev-tpl">Save as a template</button>
    <span class="hint">Keeps everything but the date and the players, under Competitions → Templates, to run on any day.</span></div>`
}
/** Where a run template opens: the step after the details (players, or the review for an event open to all). */
export const stepsAfterDetails = ev => stepsFor(ev)[1] ?? 1
const MAX_REPEATS = 52 // a year of weeks: a wrong year shouldn't make hundreds of events
const repeatDates = ev => (S.evRepeatUntil && !(ev.style === 'league' || ev.season) ? weeklyDates(ev.startDate, S.evRepeatUntil) : [ev.startDate])

// A club event open for sign-up with nobody in yet: players come from the sign-ups (teams and draw are set later by Edit).
const fromSignups = ev => ev.club && ev.signup && ev.style !== 'league' && !ev.players.length
// A team or singles league open for sign-up with nobody in yet: save it now; captains and teams come once entries are in.
const signupLeague = ev => ev.club && ev.signup && ev.style === 'league' && !pairsLeague(ev) && !ev.players.length
const stepsFor = ev => S.evTemplate || fromSignups(ev) ? [1, 5] : signupLeague(ev) ? [1] : (ev.style === 'ryder' ? [1, 2, 3, 4, 5] : ev.style === 'teams' ? [1, 2, 3, 5] : pairsLeague(ev) ? [1, 7, 5] : teamLeague(ev) ? [1, 6, 5]
  : ev.style === 'league' ? [1, 2, 5] : openToAll(ev) ? [1, 5] : [1, 2, 5])

// Members and events are loaded once when the wizard opens, so each tap redraws instantly
// (and nothing being typed is overwritten by a slow reload).
let cache = null
export async function load() {
  if (!S.ev || !cache) cache = await Promise.all([api.getEvents(), api.getMembers(), api.getMe()])
  const [events, members, me] = cache
  if (!S.ev) {
    if (S.evStep !== 6) Object.assign(S, DRAW_FRESH) // a fresh edit; the office's yellow box opens straight on the draw
    const e = S.evId && events.find(x => x.id === S.evId)
    S.ev = e ? { ...structuredClone(e), team0: { ...e.team }, start0: e.startDate, endDate: e.season ? addDaysIso(e.startDate, e.days - 1) : null } : {
      name: '', startDate: addDaysIso(isoDate(today()), 1), days: 1, style: 'ryder', fmt: 'bbl', club: S.evScope === 'club', everyone: S.evScope === 'club',
      players: S.evScope === 'club' ? [] : [me.id], team: {}, matches: {}, A: { name: 'Blues', col: '#6CB6FF' }, B: { name: 'Reds', col: '#E5484D' }, points: { ...DEFAULT_POINTS },
    }
    if (S.mdFlowNew) { S.mdFlowNew = false; openFlow(S.ev) } // from the board's + Add a match day
    if (!e && S.evNew === 'league') Object.assign(S.ev, { style: 'league', fmt: 'beststab', weeks: 6, bestOf: 7, teams: leagueTeams(10), captainPool: [], club: true, everyone: false })
  }
  return { members, me }
}

// Done (saved or cancelled): back the way you came. Deleted: to Competitions (its leaderboard has gone).
const leave = async (deleted = false) => {
  S.ev = null; S.evQ = ''; S.evSwap = null; Object.assign(S, DRAW_FRESH); S.evMore = false; S.mdFlow = null; S.evTemplate = null; S.evRepeatUntil = null; cache = null
  if (deleted) { S.aview = 'comp'; await render(); top0(); return }
  await goBack(async () => { S.aview = 'comp'; await render(); top0() })
}
const teamOf = (ev, id) => ev.team[id]
const sideIds = (ev, t) => ev.players.filter(id => teamOf(ev, id) === t)

/** What's wrong with the event at a step ('' if fine). */
function problem(ev, step) {
  if (step === 1) {
    if (!ev.name.trim()) return 'Give the event a name.'
    if (!ev.startDate || (!ev.id && ev.startDate < isoDate(today()))) return 'Pick a first day from today on.'
    if (ev.season) {
      if (!ev.endDate || ev.endDate < ev.startDate || ev.endDate < isoDate(today())) return 'Pick an end date after the first day, from today on.'
      if (ev.days > 366) return 'A season can run for up to a year.'
      const days = seasonDays(ev).filter(d => ev.matches[d].length)
      if (ev.id && ev.start0 && ev.startDate !== ev.start0 && days.length) return 'Remove the match days before moving the first day (they’d move with it).'
      const late = days.find(d => d > ev.days)
      if (late) return `There’s a match day on ${eventDates(dayDate(ev, late), 1)}, after the end date.`
    }
  }
  if (step === 1 && ev.signup) {
    if (ev.entriesClose && ev.entriesClose >= ev.startDate) return 'Entries have to close before the first day.'
    if (ev.advertiseFrom && ev.advertiseFrom > (ev.entriesClose ?? addDaysIso(ev.startDate, -1))) return 'Advertise it before entries close.'
  }
  if (step === 2) {
    if (ev.players.length < 2) return 'Pick at least two players.'
    if (ev.style === 'teams' && ev.players.length % 2) return `Two equal teams need an even number of players. You have ${ev.players.length}.`
  }
  if (step === 7 && (ev.leaguePairs?.length ?? 0) < 2) return 'Make at least two pairs.'
  if (step === 3) {
    const a = sideIds(ev, 'A').length, b = sideIds(ev, 'B').length
    if (a + b !== ev.players.length) return 'Put everyone on a team.'
    if (ev.style === 'ryder' && (!a || !b)) return 'Each team needs at least one player.'
    if (ev.style !== 'ryder' && a !== b) return `The teams need the same number of players (${a} v ${b}).`
    if (!ev.A.name.trim() || !ev.B.name.trim()) return 'Give both teams a name.'
  }
  if (step === 4 && !ev.season) {
    for (let d = 1; d <= ev.days; d++) if (!(ev.matches[d] ?? []).length) return `Draw the matches for day ${d}.`
  }
  return ''
}

// Snake order by handicap (A B B A …) keeps the teams' average index close.
function autoBalance(ev, members) {
  const hcp = id => members.find(m => m.id === id)?.hcp ?? 54
  ev.team = {}
  ;[...ev.players].sort((x, y) => hcp(x) - hcp(y)).forEach((id, n) => (ev.team[id] = [0, 3].includes(n % 4) ? 'A' : 'B'))
  ev.matches = {}
}
const shuffle = xs => xs.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1])
function draw1(ev, d) {
  ev.matches[d] = drawDay(sideIds(ev, 'A'), sideIds(ev, 'B'))
}

export function draw({ members, me }) {
  const ev = S.ev, steps = stepsFor(ev)
  if (ev.placesAuto && ev.signup && ev.style === 'league') ev.maxEntries = leaguePlaces(ev) // places follow the teams until the office sets its own
  if (!steps.includes(S.evStep)) S.evStep = steps[0]
  const step = S.evStep, idx = steps.indexOf(step)
  const byId = id => members.find(m => m.id === id)
  const name = id => byId(id)?.name ?? '?'
  const flow = step === 4 ? currentFlow(ev) : null
  header(ev.id ? 'Edit event' : 'New event', flow ? flowTitle(flow) : stepName(ev, step), async () => {
    if (flow) { flowBack(flow); keepScroll(render) } else if (step === 6 && drawStep(ev) > 1) { S.evDraw--; S.evMove = null; keepScroll(render) } else if (idx > 0) { S.evStep = steps[idx - 1]; keepScroll(render) } else leave()
  })
  const wiz = `<div class="wiz">${steps.map((s, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div>`
  let body = ''

  if (step === 1) {
    const evCard = `<div class="card evsec"><h4>Event</h4>
        <label for="ev-name">Name</label><input id="ev-name" value="${esc(ev.name)}" maxlength="60" placeholder="e.g. Saturday Fourball Cup"${viaSeason(ev, me) ? ' disabled' : ''}>
        ${ev.style === 'ryder' && !begun(ev) ? `<div class="seg" role="group" aria-label="When"><button data-when="once" aria-pressed="${!ev.season}">One-off</button><button data-when="season" aria-pressed="${!!ev.season}">Season</button></div>` : ''}
        <div class="tnames"><div${S.evTemplate ? ' hidden' : ''}><label for="ev-date">First day</label><input id="ev-date" type="date" value="${ev.startDate}" min="${isoDate(today())}"${begun(ev) ? ' disabled' : ''}></div>
          ${ev.season ? `<div><label for="ev-end">Season ends</label><input id="ev-end" type="date" value="${ev.endDate ?? ''}" min="${ev.startDate > isoDate(today()) ? ev.startDate : isoDate(today())}" max="${addDaysIso(ev.startDate, 365)}"></div>`
            : ev.style === 'league' ? '' : `<div><label>Days</label><div class="daychips">${[1, 2, 3].map(n => `<button data-days="${n}" aria-pressed="${ev.days === n}">${n}</button>`).join('')}</div></div>`}</div>
        ${ev.style === 'league' ? '<span class="hint">Week 1 starts on this day; each week runs seven days.</span>'
          : ev.season ? `<span class="hint">${ev.endDate ? `${eventDates(ev.startDate, 1)} to ${eventDates(ev.endDate, 1)}. ` : ''}Add match days as you go, with four-balls and singles; points add up over the season.</span>`
          : `<span class="hint">${ev.startDate ? eventDates(ev.startDate, ev.days) : ''}${ev.days > 1 ? '. Points add up across the days.' : ''}</span>`}</div>`
    const holes = ev.season ? '' : holesCard(ev)
    const lgCard = ev.style === 'league' ? `<div class="card evsec"><h4>League</h4>
        ${ev.id ? '' : `<div class="seg" role="group" aria-label="Played as"><button data-lgas="singles" aria-pressed="${!pairsLeague(ev)}">Singles</button><button data-lgas="pairs" aria-pressed="${pairsLeague(ev)}">Pairs</button></div>
        <span class="hint">${pairsLeague(ev) ? 'Fixed pairs all season: each week a pair’s better-ball Stableford counts when they play together.' : 'Each player’s Stableford rounds count.'}</span>`}
        ${(teamLeague(ev) ? [['weeks', 'Weeks', 1, 26], ['bestOf', 'Scores that count per team each week', 1, 30], ['nteams', 'Number of teams', 2, 20], ['size', 'Players per team', 1, 30]] : [['weeks', 'Weeks', 1, 26]]).map(([k, l, lo, hi]) => `<div class="gedit"><span class="hint">${l}</span><span class="stepper sm"><button data-lg="${k}" data-d="-1" data-lo="${lo}" aria-label="Fewer">−</button><output>${k === 'nteams' ? ev.teams.length : k === 'size' ? ev.teams[0]?.size ?? 12 : ev[k]}</output><button data-lg="${k}" data-d="1" data-hi="${hi}" aria-label="More">+</button></span></div>`).join('')}
        <span class="hint">${ev.weeks} weeks from ${eventDates(ev.startDate, 1)} to ${eventDates(addDaysIso(ev.startDate, ev.weeks * 7 - 1), 1)}. ${teamLeague(ev) ? `Each week a team’s best ${ev.bestOf} Stableford rounds count; the season table is the total. ` : ''}Players choose before they play whether a round is entered, one per week.</span>
        <label for="ev-ko">Knockout finish</label><select id="ev-ko" class="plainsel"><option value="">None: the table decides it</option>${[4, 8, 16].map(n => `<option value="${n}" ${ev.koTop === n ? 'selected' : ''}>Top ${n} ${pairsLeague(ev) ? 'pairs' : 'players'} go into a knockout</option>`).join('')}</select>
        ${ev.koTop ? `<label for="ev-kof">Knockout final played by</label><input id="ev-kof" type="date" class="plainsel" value="${ev.koFinish ?? ''}"><span class="hint">After the last week, the organiser starts the knockout: seeded from the table (1st plays the lowest qualifier).</span>` : ''}</div>` : ''
    const rest = `<h3>Format</h3>
      ${begun(ev) ? `<div class="hint">${EVENT_TYPES.ryder.name} over a season. The first day and format stay as they are once it has started${me.admin ? '' : ', and the name and team names can be changed by the club office'}.</div>` : `<div class="games">${Object.entries(EVENT_TYPES).filter(([, t]) => !t.adminOnly || (me.admin && S.evScope === 'club')).map(([k, t]) => `<button class="gamecard" role="radio" aria-checked="${ev.style === k}" data-style="${k}"><span class="radio"></span><span class="who"><strong>${t.name}</strong><small>${t.desc}</small></span></button>`).join('')}</div>`}
      ${EVENT_TYPES[ev.style].formats.length > 1 ? `<div class="card evsec"><label for="ev-fmt">${ev.style === 'ryder' ? 'Match format' : 'Scoring'}</label><select id="ev-fmt" class="plainsel"${begun(ev) ? ' disabled' : ''}>${EVENT_TYPES[ev.style].formats.map(([k, n]) => `<option value="${k}" ${ev.fmt === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${ev.style === 'ryder' ? `<div class="card evsec"><b>Points</b><span class="hint">What a win is worth (a halve is half). Each match day starts with these, and can change them.</span>
        ${[['four', 'Four-ball win'], ['singles', 'Singles win'], ['threePair', '3-ball: the pair win'], ['threeSingle', '3-ball: the single wins']].map(([k, l]) => `<div class="gedit"><span class="hint">${l}</span><span class="stepper sm"><button data-pt="${k}" data-d="-1" aria-label="Less"${pointsFixed(ev) ? ' disabled' : ''}>−</button><output>${fmtHalf(dayRules(ev, 0).points[k])}</output><button data-pt="${k}" data-d="1" aria-label="More"${pointsFixed(ev) ? ' disabled' : ''}>+</button></span></div>`).join('')}</div>` : ''}
      ${ev.club && me.admin && ev.style !== 'league' ? `<div class="card evsec"><label for="ev-fee">Entry fee £ <span class="opt">blank: free</span></label><input id="ev-fee" type="number" class="plainsel" min="0" step="0.5" inputmode="decimal" value="${ev.entryFee ? ev.entryFee / 100 : ''}">
        <span class="hint">Shown to members when they enter, with how the club takes it (Club office → Club).</span></div>` : ''}
      ${ev.club && me.admin ? `<div class="card evsec"><b>Who can see it</b>
        <div class="seg" role="group" aria-label="Who can see it"><button data-vis="all" aria-pressed="${!!ev.everyone}">All members</button><button data-vis="entrants" aria-pressed="${!ev.everyone}">Entrants only</button></div>
        <span class="hint">${ev.everyone ? 'Every member sees it on their Leaderboard tab.' : `Only the ${ev.style === 'league' ? 'league’s players' : 'players in it'} (and admins) see it.`}</span></div>
      ${ev.style === 'individual' ? `<div class="card evsec"><b>Who plays</b>
        <div class="seg" role="group" aria-label="Who plays"><button data-who="all" aria-pressed="${!!ev.selfEntry}">Anyone playing that day</button><button data-who="pick" aria-pressed="${!ev.selfEntry}">Players I pick</button></div>
        <span class="hint">${ev.selfEntry ? 'Everyone starting a round that day is asked if they want to play in it. No list of players needed.' : 'Only the players you pick next can play in it.'}</span></div>`
      : `<div class="card evsec"><div class="actrow"><span class="who"><strong>Members can enter themselves</strong><small>${ev.selfEntry ? 'On the day, members starting a round are asked if they want to play in it (not for events with a draw).' : 'Only admins add entrants.'}</small></span>
        <button type="button" class="switch" role="switch" id="ev-self" aria-checked="${!!ev.selfEntry}" aria-label="Members can enter themselves"><span></span></button></div></div>`}
      ${ev.season || openToAll(ev) ? '' : signupCard(ev)}`
      : '<div class="hint">Only the players you pick will see this event.</div>'}`
    // A league that's under way: the holes change week to week; everything else was settled when it was made.
    body = liveLeague(ev) ? `${holes}<details class="card evsec evmore"${S.evMore ? ' open' : ''}><summary><b>Other settings</b><span class="hint">Name, dates, teams, format and sign-up: set when the league was made.</span></summary>${evCard}${lgCard}${rest}</details>`
      : `${evCard}${lgCard}${holes}${rest}`
  } else if (step === 2) {
    const q = (S.evQ || '').trim().toLowerCase()
    const list = members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q))
    body = `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="ev-q" type="search" placeholder="Name or GUI number" value="${esc(S.evQ || '')}" autocomplete="off"></div>
      <div class="hint"><b class="count">${ev.players.length} picked</b>${ev.style === 'ryder' && ev.season ? ' · add more any time in the season' : ev.style === 'ryder' ? ' · Four-ball team match play needs a multiple of 4 (pairs v pairs)' : ev.style === 'teams' ? ' · an even number for two equal teams' : ''}. Members only.</div>
      <div class="pick">${list.map(m => { const on = ev.players.includes(m.id); return `<button class="brow" data-pick="${m.id}" aria-pressed="${on}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</strong><small>Index ${fmtHcp(m.hcp)}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
  } else if (step === 7) {
    const q = (S.evQ || '').trim().toLowerCase(), half = S.evHalf ?? null
    const taken = new Set(ev.leaguePairs.flat())
    const list = members.filter(m => !taken.has(m.id) && (!q || m.name.toLowerCase().includes(q))).slice(0, 40)
    const nm = id => members.find(m => m.id === id)?.name ?? 'Former member'
    body = `${ev.leaguePairs.length ? `<div class="card list">${ev.leaguePairs.map((p, i) => `<div class="lrow hutrow"><span class="who"><strong>${esc(nm(p[0]))} & ${esc(nm(p[1]))}</strong></span><button class="x" data-lgunpair="${i}" aria-label="Remove this pair">×</button></div>`).join('')}</div>` : ''}
      <div class="hint"><b class="count">${ev.leaguePairs.length} pairs</b> · ${half != null ? `pick ${esc(nm(half))}’s partner` : 'tap two players to make a pair'}</div>
      <div class="search"><input id="ev-q" type="search" placeholder="Search members" value="${esc(S.evQ || '')}"></div>
      <div class="pick">${list.map(m2 => `<button class="brow" data-lgpair="${m2.id}" aria-pressed="${half === m2.id}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}</strong></span><span class="chev">${half === m2.id ? '✓' : '+'}</span></button>`).join('')}</div>`
  } else if (step === 3) {
    const avg = ids => (ids.length ? (ids.reduce((t, id) => t + (byId(id)?.hcp ?? 0), 0) / ids.length).toFixed(1) : '–')
    const A = sideIds(ev, 'A'), B = sideIds(ev, 'B')
    body = `<div class="card evsec"><div class="tnames">
        <div><label for="ev-an">Team name</label><div class="trowin"><input id="ev-an" value="${esc(ev.A.name)}" maxlength="24"${viaSeason(ev, me) ? ' disabled' : ''}></div>${swatches('A', ev.A.col, viaSeason(ev, me), ev.B.col)}</div>
        <div><label for="ev-bn">Team name</label><div class="trowin"><input id="ev-bn" value="${esc(ev.B.name)}" maxlength="24"${viaSeason(ev, me) ? ' disabled' : ''}></div>${swatches('B', ev.B.col, viaSeason(ev, me), ev.A.col)}</div></div></div>
      <div class="tcards"><div style="background:${ev.A.col}"><small>${esc(ev.A.name)}</small><b>${A.length}</b><small>avg index ${avg(A)}</small></div><div style="background:${ev.B.col}"><small>${esc(ev.B.name)}</small><b>${B.length}</b><small>avg index ${avg(B)}</small></div></div>
      ${begun(ev) ? '<div class="hint">Players stay on their team for the whole season. Put anyone new on a team.</div>' : '<div class="bk-btns"><button class="ghost" id="ev-bal">Auto-balance by handicap</button><button class="ghost" id="ev-shuf">Shuffle</button></div>'}
      <div class="card evsec"><div class="tlist">${ev.players.map(id => `<div class="trow"><span class="who"><strong>${esc(name(id))}</strong><small>Index ${fmtHcp(byId(id)?.hcp)}</small></span><span class="tseg">${['A', 'B'].map(t => `<button data-tm="${id}" data-t="${t}" aria-pressed="${teamOf(ev, id) === t}" style="--tc:${ev[t].col}"${begun(ev) && ev.team0?.[id] ? ' disabled' : ''}>${esc(ev[t].name)}</button>`).join('')}</span></div>`).join('')}</div></div>`
  } else if (step === 4 && flow) {
    body = flowHtml(ev, flow, name)
  } else if (step === 4) {
    const days = ev.season ? seasonDays(ev).filter(d => ev.matches[d].length) : Array.from({ length: ev.days }, (_, i) => i + 1)
    const open = d => !lockedDay(ev, d)
    body = ev.season
      ? `<div class="hint">Add a match day whenever matches are on: who’s playing, the matches (four-balls, singles, 3-balls), the holes and the points.</div>
        ${ev.endDate >= isoDate(today()) ? '<button class="primary" id="md-new">+ Add a match day</button>' : ''}
        ${days.filter(open).map(d => dayCard(ev, d, name, true)).join('')}
        ${days.some(d => !open(d)) ? `<h3>Played</h3>${days.filter(d => !open(d)).reverse().map(d => dayCard(ev, d, name, false)).join('')}` : ''}`
      : `<div class="hint">Players book a tee time together as usual; the board scores each match from their cards.</div>
        ${days.map(d => dayCard(ev, d, name, !ev.id || !lockedDay(ev, d) || me.admin)).join('')}`
  } else if (step === 6) {
    // Making the draw, in three steps: 1 captains, 2 entrants onto teams (balanced by handicap, or assigned by hand),
    // 3 check and save (open a team: rename it, move a player, make someone captain).
    const d = drawStep(ev), size = k => ev.teams[k].size ?? 12
    const pool = ev.captainPool ?? []
    const inTeam = k => ev.players.filter(id => ev.team[id] === k)
    const avg = ids => (ids.length ? (ids.reduce((x, id) => x + (byId(id)?.hcp ?? 0), 0) / ids.length).toFixed(1) : '–')
    const q = (S.evQ || '').trim().toLowerCase()
    const found = members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q))
    const places = ev.teams.reduce((s2, x) => s2 + (x.size ?? 12), 0)
    const assigned = ev.players.filter(id => ev.team[id] != null).length
    const captains = ev.teams.filter(x => x.captain != null && ev.players.includes(x.captain)).length
    const capOf = id => ev.teams.findIndex(x => x.captain === id)
    const capTag = '<span class="pill tag">Captain</span>'
    const search = `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="ev-q" type="search" placeholder="Name or GUI number" value="${esc(S.evQ || '')}" autocomplete="off"></div>`
    const stepper = `<ol class="drawsteps" aria-label="Making the draw">${['Captains', 'Teams', 'Check and save'].map((l, i) => `<li class="${d === i + 1 ? 'on' : d > i + 1 ? 'done' : ''}"><span>${i + 1}</span>${l}</li>`).join('')}</ol>`
    const summary = `<div class="hint"><b>${ev.players.length} entrants · ${ev.teams.length} teams · ${assigned} of ${places} team places filled.</b></div>`
    if (d === 1) {
      const drawn = ev.teams.filter(x => x.captain != null).length, mode = S.evCapMode ?? 'pick'
      const showEnts = !ev.signup && (S.evEnts || !ev.players.length) // a league the office fills itself: its entrants here
      const entsList = azList(found, m => m.name, 'lgents'), full = ev.signup && ev.maxEntries && ev.players.length >= ev.maxEntries
      const notIn = entsList.shown.filter(m => !ev.players.includes(m.id))
      const cands = azList(found.filter(m => !ev.signup || ev.players.includes(m.id)), m => m.name, 'lgcand') // a sign-up league: from its entrants
      body = `${stepper}${summary}
        ${ev.signup ? '' : `<div class="card evsec"><div class="actrow"><span class="who"><strong>Entrants · ${ev.players.length}</strong><small>Members in the league. Add or take people off before the draw.</small></span><button type="button" class="ghost sm" id="lg-ents">${showEnts ? 'Done' : 'Add or remove'}</button></div></div>
        ${showEnts ? `${search}${notIn.length && !full ? `<button class="ghost" id="lg-addall">Add all ${notIn.length} listed</button>` : ''}${entsList.bar}
        <div class="pick">${entsList.shown.map(m2 => { const on = ev.players.includes(m2.id); return `<button class="brow" data-ent="${m2.id}" aria-pressed="${on}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}</strong><small>Index ${fmtHcp(m2.hcp)}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>` : ''}`}
        ${showEnts ? '' : `<div class="card evsec"><b>Captains: one for each of the ${ev.teams.length} teams</b>
          <div class="seg" role="group" aria-label="How to choose captains"><button data-capmode="pick" aria-pressed="${mode === 'pick'}">Pick candidates</button><button data-capmode="random" aria-pressed="${mode === 'random'}">Random from all entrants</button></div>
          <span class="hint">${mode === 'pick' ? 'Tick the people willing to captain below. Draw captains then picks one at random for each team; anyone not picked plays as an ordinary entrant.' : `One captain is drawn at random for each team from all ${ev.players.length} entrants.`}</span>
          <div class="capdraw">${ev.teams.map(x => `<div><i class="fl" style="background:${x.col}"></i><span>${esc(x.name)}</span><b>${x.captain != null ? esc(name(x.captain)) : S.evNoCaps ? 'no captain' : '–'}</b></div>`).join('')}</div>
          ${mode === 'pick' && pool.length && pool.length < ev.teams.length ? `<span class="gerr">${pool.length} candidate${pool.length === 1 ? '' : 's'} for ${ev.teams.length} teams: ${ev.teams.length - pool.length} team${ev.teams.length - pool.length === 1 ? '' : 's'} won’t have a captain.</span>` : ''}
          <button class="primary" id="lg-draw" ${(mode === 'pick' ? pool.length : ev.players.length) ? '' : 'disabled'}>${drawn ? 'Draw captains again' : mode === 'pick' ? `Draw captains from ${pool.length} candidate${pool.length === 1 ? '' : 's'}` : 'Draw captains from all entrants'}</button>
          ${assigned > captains ? '<span class="hint">Drawing captains clears the teams. Make them again in the next step.</span>' : ''}</div>
        ${mode === 'pick' ? `<b>Who’s willing to captain? <span class="hint">${pool.length ? `${pool.length} ticked` : 'none ticked yet'}</span></b>${search}${cands.bar}
        <div class="pick">${cands.shown.map(m2 => { const on = pool.includes(m2.id), k = capOf(m2.id); return `<button class="brow" data-cand="${m2.id}" aria-pressed="${on}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}${k >= 0 ? ` ${capTag}` : ''}</strong><small>Index ${fmtHcp(m2.hcp)}${k >= 0 ? ` · ${esc(ev.teams[k].name)} captain` : on ? ' · candidate' : ''}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>` : ''}`}`
    } else if (d === 2) {
      const mode = S.evBalMode ?? 'auto', ht = Math.min(S.evHandTeam ?? 0, ev.teams.length - 1)
      const avgs = ev.teams.map((_, k) => inTeam(k)).filter(ids => ids.length).map(ids => +avg(ids))
      const ents = azList(found.filter(m => ev.players.includes(m.id)), m => m.name, 'lghand')
      body = `${stepper}${summary}
        <div class="card evsec"><b>Put the entrants on teams</b>
          <div class="seg" role="group" aria-label="How to make the teams"><button data-balmode="auto" aria-pressed="${mode === 'auto'}">Balance by handicap</button><button data-balmode="hand" aria-pressed="${mode === 'hand'}">Assign myself</button></div>
          ${mode === 'auto' ? `<span class="hint">${captains ? 'Captains stay with their teams. Everyone else' : 'Everyone'} is dealt out so every team ends up with a similar average handicap. Balance again for a different mix.</span>
          <button class="primary" id="lg-bal" ${ev.players.length ? '' : 'disabled'}>${assigned > captains ? 'Balance again' : 'Balance teams by handicap'}</button>
          ${assigned > captains && avgs.length ? `<span class="okline">Team averages ${Math.min(...avgs).toFixed(1)} to ${Math.max(...avgs).toFixed(1)}</span>` : ''}`
          : `<span class="hint">Pick a team, then tap the entrants to put on it.${captains ? ' Captains are already on their teams.' : ''}</span>
          <div class="hteams" role="group" aria-label="Team to fill">${ev.teams.map((x, k) => `<button data-hteam="${k}" aria-pressed="${k === ht}"><i class="fl" style="background:${x.col}"></i>${esc(x.name)} <small>${inTeam(k).length}/${size(k)}</small></button>`).join('')}</div>
          <b>${assigned} of ${ev.players.length} on a team${ev.players.length - assigned ? ` · ${ev.players.length - assigned} still to place` : ' · everyone placed'}</b>`}
          ${ev.players.length > places ? `<span class="gerr">${ev.players.length - places} more entrants than places: they’ll stay off the teams. Add teams or places in Details.</span>` : ''}</div>
        ${mode === 'auto' ? (assigned > captains ? `<div class="dtiles">${ev.teams.map((x, k) => `<div class="dtile" style="border-top-color:${x.col}"><b>${esc(x.name)}</b><small>Captain</small><span>${x.captain != null ? esc(name(x.captain)) : 'none'}</span><em>${avg(inTeam(k))}</em><small>average index · ${inTeam(k).length} players</small></div>`).join('')}</div>` : '')
          : `<b>Entrants <span class="hint">tap to put them on ${esc(ev.teams[ht].name)}; tap again to take them off</span></b>${search}${ents.bar}
          <div class="pick">${ents.shown.map(m2 => { const k = ev.team[m2.id], on = k === ht, cap = capOf(m2.id) >= 0; return `<button class="brow" data-hand="${m2.id}" aria-pressed="${on}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}${cap ? ` ${capTag}` : ''}</strong><small>Index ${fmtHcp(m2.hcp)}${k != null && !on ? ` · on ${esc(ev.teams[k].name)}${cap ? '' : ' (tap to move)'}` : ''}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`}`
    } else {
      const mv = S.evMove, open = S.evOpen, loose = ev.players.filter(id => ev.team[id] == null)
      const chip = (id, k) => `<button class="dchip${mv === id ? ' on' : ''}${k != null && ev.teams[k].captain === id ? ' cap' : ''}" data-mv="${id}" aria-pressed="${mv === id}">${esc(name(id))} · ${fmtHcp(byId(id)?.hcp)}${k != null && ev.teams[k].captain === id ? ' · captain' : ''}</button>`
      body = `${stepper}${summary}
        <p class="hint">${mv != null ? `Moving ${esc(name(mv))}: tap <b>Move here</b> on their new team, or tap them again to cancel.` : 'Open a team to see its players, rename it or change its colour. To move someone, tap them, then Move here on another team.'}</p>
        ${ev.teams.map((x, k) => { const ids = inTeam(k), isOpen = open === k; return `<div class="card evsec dteam${isOpen ? ' open' : ''}">
          <div class="dteamhd"><button class="dteambtn" data-topen="${k}" aria-expanded="${isOpen}"><i class="fl" style="background:${x.col}"></i><b>${esc(x.name)}</b><span class="hint">Captain ${x.captain != null ? esc(name(x.captain).split(' ')[0]) : 'none'} · ${ids.length} players · average ${avg(ids)}</span><span aria-hidden="true">${isOpen ? '▾' : '▸'}</span></button>
            ${mv != null && ev.team[mv] !== k ? `<button class="primary sm" data-mvto="${k}">Move ${esc(name(mv).split(' ')[0])} here</button>` : ''}</div>
          ${isOpen ? `<div class="trowin"><input id="lg-tn" value="${esc(x.name)}" maxlength="24" aria-label="Team name"></div>${swatches(k, x.col)}
          <div class="dchips">${ids.map(id => chip(id, k)).join('') || '<span class="hint">No players yet.</span>'}</div>
          ${mv != null && ev.team[mv] === k && x.captain !== mv ? `<button class="ghost sm" data-mkcap="${k}">Make ${esc(name(mv).split(' ')[0])} captain</button>` : ''}` : ''}</div>` }).join('')}
        ${loose.length ? `<div class="card evsec"><b>Not on a team · ${loose.length}</b><span class="hint">Tap someone, then Move here on a team.</span><div class="dchips">${loose.map(id => chip(id, null)).join('')}</div></div>` : ''}`
    }
  } else if (ev.style === 'league') {
    const places = (ev.teams ?? []).reduce((s2, x) => s2 + (x.size ?? 12), 0)
    body = `<div class="card evsec"><h4>${esc(ev.name)}</h4><div class="sumgrid">
        <span>When</span><b>${ev.weeks} weeks · ${eventDates(ev.startDate, 1)} – ${eventDates(addDaysIso(ev.startDate, ev.weeks * 7 - 1), 1)}</b>
        ${pairsLeague(ev) ? `<span>Scoring</span><b>Pairs: better-ball Stableford when they play together; season total</b><span>Pairs</span><b>${ev.leaguePairs.length}</b>`
          : teamLeague(ev) ? `<span>Scoring</span><b>Best ${ev.bestOf} Stableford rounds per team each week; season total</b>
        <span>Teams</span><b>${ev.teams.length} · ${ev.teams.map(x => esc(x.name)).join(', ')}</b>
        <span>Players</span><b>${ev.players.length} of ${places} places filled</b>` : `<span>Scoring</span><b>Each player’s Stableford rounds; season total</b><span>Players</span><b>${ev.players.length}</b>`}
        ${ev.koTop ? `<span>Finish</span><b>Top ${ev.koTop} into a knockout${ev.koFinish ? `, final by ${eventDates(ev.koFinish, 1)}` : ''}</b>` : ''}
        <span>Entering</span><b>Players choose before they play; one round a week</b>
        <span>Who sees it</span><b>${ev.everyone ? 'All members' : 'Only the league’s players (and admins)'}</b>
        <span>Holes</span><b>${esc(holesSummary(ev))}</b>
        ${ev.signup ? `<span>Sign-up</span><b>${signupLine(ev)}</b>` : ''}</div></div>
      <div class="hint">Players see it on their Leaderboard tab while it runs: a team table and an individual table.</div>
      ${ev.id ? '<button class="ghost accremove" id="ev-del">Delete league</button>' : ''}`
  } else {
    const A = sideIds(ev, 'A'), B = sideIds(ev, 'B')
    body = `<div class="card evsec"><h4>${esc(ev.name)}</h4><div class="sumgrid">
        <span>When</span><b>${ev.season ? `Season · ${eventDates(ev.startDate, 1)} – ${eventDates(ev.endDate, 1)}` : `${eventDates(ev.startDate, ev.days)}${ev.days > 1 ? ` (${ev.days} days)` : ''}`}</b>
        <span>Format</span><b>${EVENT_TYPES[ev.style].name}${ev.style !== 'teams' ? ` · ${eventFormat(ev)}` : ''}</b>
        <span>Players</span><b>${openToAll(ev) ? 'Anyone playing that day' : `${ev.players.length} members`}</b>
        ${ev.style !== 'individual' ? `<span>Teams</span><b>${esc(ev.A.name)} ${A.length} · ${esc(ev.B.name)} ${B.length}</b>` : ''}
        ${ev.style === 'ryder' ? `<span>Matches</span><b>${Object.values(ev.matches).flat().length}${ev.season ? ` on ${seasonDays(ev).filter(d => ev.matches[d].length).length} match days so far` : ''} · points as set for each day</b>` : ''}
        <span>Who sees it</span><b>${ev.everyone ? 'All members' : 'Only the players in it'}</b>
        ${ev.season ? '' : `<span>Holes</span><b>${esc(holesSummary(ev))}</b>`}
        ${ev.signup ? `<span>Sign-up</span><b>${signupLine(ev)}</b>` : ''}
        <span>Scoring</span><b>Live from each player’s own card</b></div></div>
      <div class="hint">${ev.season ? `Players see it on their Leaderboard tab on their match days. You can add match days and players until the season ends.` : `Players see it on their Leaderboard tab on the day${ev.days > 1 ? 's' : ''}. ${me.admin ? 'As an admin you can change it any time.' : 'You can change it until the first day.'}`}</div>
      ${ev.id && (!begun(ev) || me.admin) ? '<button class="ghost accremove" id="ev-del">Delete event</button>' : ''}`
  }

  const last = idx === steps.length - 1
  const dc = step === 6 && !flow ? drawCta(ev) : null // making the draw: its own button
  const extras = last && !flow && !ev.id && !S.evTemplate && ev.club && me.admin && S.evScope === 'club'
  if (extras) body += clubExtras(ev)
  $('main').innerHTML = `<div class="screen">${wiz}${body}<p class="gerr" id="ev-err" role="alert"></p></div>
    <div class="cta">${dc && drawStep(ev) > 1 ? '<button class="ghost" id="ev-dback">Back</button>' : ''}${dc && drawStep(ev) === 1 && !ev.teams.some(x => x.captain != null) && ev.players.length ? '<button class="linkbtn" id="ev-nocaps">No captains: skip</button>' : ''}<button class="primary" id="ev-next"${step === 1 && holesEmpty(ev) ? ' disabled>Open at least one hole' : dc ? `${dc.off ? ' disabled' : ''}>${dc.label}` : `>${flow ? flowCta(flow) : last ? (S.evTemplate ? 'Save template' : ev.id ? 'Save changes' : repeatDates(ev).length > 1 ? `Save ${repeatDates(ev).length} events` : 'Save event') : `Next: ${stepName(ev, steps[idx + 1]).toLowerCase()}`}`}</button></div>`

  const redraw = () => keepScroll(render)
  const read = () => {
    if ($('ev-name')) { ev.name = $('ev-name').value; ev.startDate = $('ev-date').value; if ($('ev-fmt')) ev.fmt = $('ev-fmt').value }
    if ($('ev-adv')) {
      ev.advertiseFrom = $('ev-adv').value || null; ev.entriesClose = $('ev-close').value || null
      const max = +$('ev-max').value || null
      if (max !== ev.maxEntries) ev.placesAuto = false // the office typed its own number: it stays
      ev.maxEntries = max
    }
    if ($('ev-end')) ev.endDate = $('ev-end').value
    if (ev.season && ev.endDate && ev.startDate) ev.days = dayOfDate(ev, ev.endDate)
    if ($('ev-fee')) { const f = $('ev-fee').value.trim(); ev.entryFee = f && +f > 0 ? Math.min(100000, Math.round(+f * 100)) : null }
    if ($('ev-an')) { ev.A = { ...ev.A, name: $('ev-an').value }; ev.B = { ...ev.B, name: $('ev-bn').value } }
    if ($('lg-tn') && S.evOpen != null) { const t = S.evOpen; ev.teams[t] = { ...ev.teams[t], name: $('lg-tn').value || ev.teams[t].name } }
  }
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f }
  // A captain who leaves their team (or the league) stops being captain.
  const fixCaptains = () => { ev.teams = ev.teams.map((x, k) => (x.captain != null && ev.team[x.captain] !== k ? { ...x, captain: null } : x)) }
  document.querySelectorAll('[data-when]').forEach(b => (b.onclick = () => {
    read()
    ev.season = b.dataset.when === 'season'; ev.matches = {}; ev.dayRules = null // the days start again
    if (ev.season) ev.holes = null // a season's match days pick their own holes
    if (ev.season) { ev.endDate ??= addDaysIso(ev.startDate, 182); ev.days = dayOfDate(ev, ev.endDate) } else { ev.days = 1; ev.endDate = null }
    redraw()
  }))
  if ($('ev-end')) $('ev-end').onchange = () => { read(); redraw() }
  // Holes: the event's, and a day's (week's) own; a day's all 18 stays the full list (not "same as the event").
  bindHolePicker('ev', () => ev.holes, v => { read(); ev.holes = v; redraw() })
  const setDay = (d, rule) => { const rest = { ...(ev.dayRules?.[d] ?? {}) }; delete rest.holes
    const next = { ...(ev.dayRules ?? {}), [d]: rule === undefined ? rest : { ...rest, holes: rule } }
    if (!Object.keys(next[d]).length) delete next[d]
    ev.dayRules = Object.keys(next).length ? next : null }
  document.querySelectorAll('[data-evhd]').forEach(b => (b.onclick = () => { read(); const d = +b.dataset.evhd; S.evHoleDay = S.evHoleDay === d ? null : d; redraw() }))
  document.querySelectorAll('[data-evhsame]').forEach(b => (b.onclick = () => { read(); setDay(+b.dataset.evhsame, undefined); redraw() }))
  if (S.evHoleDay) bindHolePicker(`d${S.evHoleDay}`, () => ownHoles(ev, S.evHoleDay) ?? ev.holes, v => { read(); setDay(S.evHoleDay, v ?? ALL18); redraw() })
  document.querySelectorAll('[data-rmday]').forEach(b => (b.onclick = () => { const d = +b.dataset.rmday; delete ev.matches[d]; if (ev.dayRules) delete ev.dayRules[d]; redraw() }))
  on('md-new', () => { openFlow(ev); redraw() })
  document.querySelectorAll('[data-mdset]').forEach(b => (b.onclick = () => { openFlow(ev, +b.dataset.mdset); redraw() }))
  if (flow) bindFlow(ev, flow, redraw, msg => ($('ev-err').textContent = msg))
  document.querySelectorAll('[data-pt]').forEach(b => (b.onclick = () => {
    read()
    const k = b.dataset.pt, p = { ...DEFAULT_POINTS, ...(ev.points ?? {}) }
    ev.points = { ...p, [k]: Math.max(0, Math.min(10, p[k] + +b.dataset.d / 2)) }
    redraw()
  }))
  document.querySelectorAll('[data-days]').forEach(b => (b.onclick = () => { read(); ev.days = +b.dataset.days; ev.matches = {}; ev.dayRules = null; redraw() }))
  document.querySelectorAll('[data-style]').forEach(b => (b.onclick = () => {
    read()
    const was = ev.style
    ev.style = b.dataset.style
    ev.fmt = EVENT_TYPES[ev.style].formats[0][0]
    if (ev.style === 'league' && was !== 'league') {
      ev.weeks ??= 6; ev.bestOf ??= 7; ev.team = {}; ev.everyone = false; ev.days = 1; ev.leaguePairs = null
      if (S.evScope === 'club') { ev.teams = leagueTeams(10, ev.teams ?? []); ev.players = []; ev.club = true } else { ev.teams = []; ev.players = [me.id]; ev.club = false } // a member's league: just players
    }
    if (ev.style !== 'league' && was === 'league') { ev.team = {}; ev.players = [me.id] }
    if (ev.style !== 'ryder' && ev.season) { ev.season = false; ev.days = 1; ev.endDate = null; ev.matches = {} }
    if (ev.style === 'individual' && was !== 'individual' && ev.club && !ev.id) { ev.selfEntry = true; ev.everyone = true } // a club competition: open to the day's players
    redraw()
  }))
  document.querySelectorAll('[data-lgas]').forEach(b => (b.onclick = () => {
    read()
    if (b.dataset.lgas === 'pairs') { ev.leaguePairs ??= []; ev.teams = []; ev.team = {} } else { ev.leaguePairs = null; if (S.evScope === 'club') ev.teams = leagueTeams(10, []) }
    redraw()
  }))
  if ($('ev-ko')) $('ev-ko').onchange = e => { read(); ev.koTop = e.target.value ? +e.target.value : null; redraw() }
  if ($('ev-kof')) $('ev-kof').onchange = e => { ev.koFinish = e.target.value || null }
  document.querySelectorAll('[data-lgpair]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.lgpair
    if (S.evHalf == null) S.evHalf = id
    else if (S.evHalf === id) S.evHalf = null
    else { ev.leaguePairs.push([S.evHalf, id]); S.evHalf = null }
    redraw()
  }))
  document.querySelectorAll('[data-lgunpair]').forEach(b => (b.onclick = () => { ev.leaguePairs.splice(+b.dataset.lgunpair, 1); redraw() }))
  document.querySelectorAll('[data-lg]').forEach(b => (b.onclick = () => {
    read()
    const k = b.dataset.lg, d = +b.dataset.d, lo = +(b.dataset.lo ?? 1), hi = +(b.dataset.hi ?? 99)
    if (k === 'nteams') {
      const n = Math.max(2, Math.min(20, ev.teams.length + d))
      ev.teams = leagueTeams(n, ev.teams)
      for (const [id, t] of Object.entries(ev.team)) if (t >= n) delete ev.team[id] // players on a removed team come off
      ev.players = Object.keys(ev.team).map(Number)
    } else if (k === 'size') ev.teams = ev.teams.map(x => ({ ...x, size: Math.max(1, Math.min(30, (x.size ?? 12) + d)) }))
    else ev[k] = Math.max(lo, Math.min(hi, ev[k] + d))
    redraw()
  }))
  document.querySelectorAll('[data-capmode]').forEach(b => (b.onclick = () => { S.evCapMode = b.dataset.capmode; redraw() }))
  wireAz(redraw)
  document.querySelectorAll('[data-ent]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.ent
    if (ev.players.includes(id)) { ev.players = ev.players.filter(x => x !== id); ev.captainPool = (ev.captainPool ?? []).filter(x => x !== id); delete ev.team[id]; fixCaptains() }
    else if (ev.signup && ev.maxEntries && ev.players.length >= ev.maxEntries) { toast(`Full: ${ev.maxEntries} places. Raise the places in Details to add more.`); return }
    else ev.players = [...ev.players, id]
    redraw()
  }))
  on('lg-addall', () => {
    const q = (S.evQ || '').trim().toLowerCase()
    const room = ev.signup && ev.maxEntries ? Math.max(0, ev.maxEntries - ev.players.length) : Infinity // a sign-up league stops at its places
    const add = members.filter(m => (!q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q)) && !ev.players.includes(m.id)).map(m => m.id).slice(0, room)
    ev.players = [...ev.players, ...add]
    redraw()
    toast(`${add.length} entrants added`)
  })
  on('lg-bal', () => {
    ev.team = drawTeams(ev.players, id => byId(id)?.hcp ?? 54, ev.teams.length, ev.teams.map(x => x.size ?? 12), ev.teams.map(x => x.captain ?? null))
    fixCaptains()
    redraw()
    toast('Teams balanced by handicap')
  })
  // Captain candidates: listing someone also enters them; taking them off ends any captaincy.
  document.querySelectorAll('[data-cand]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.cand, pool = ev.captainPool ?? []
    if (pool.includes(id)) { ev.captainPool = pool.filter(x => x !== id); ev.teams = ev.teams.map(x => (x.captain === id ? { ...x, captain: null } : x)) }
    else { ev.captainPool = [...pool, id]; if (!ev.players.includes(id)) ev.players = [...ev.players, id] }
    redraw()
  }))
  on('lg-draw', () => {
    const picks = drawCaptains(S.evCapMode === 'random' ? ev.players : ev.captainPool ?? [], ev.players, ev.teams.length)
    ev.team = {} // a new set of captains: the teams are dealt again around them
    ev.teams = ev.teams.map((x, k) => ({ ...x, captain: picks[k] }))
    picks.forEach((id, k) => { if (id != null) ev.team[id] = k })
    redraw()
    S.evNoCaps = false
    toast(`${picks.filter(id => id != null).length} captains drawn`)
  })
  // The draw: skip captains, back a step, the entrants panel, how the teams are made, assigning by hand, and moving.
  on('ev-nocaps', () => { S.evNoCaps = true; S.evDraw = 2; keepScroll(render) })
  on('ev-dback', () => { read(); S.evDraw--; S.evMove = null; keepScroll(render) })
  on('lg-ents', () => { S.evEnts = !S.evEnts; S.evQ = ''; redraw() })
  document.querySelectorAll('[data-balmode]').forEach(b => (b.onclick = () => { S.evBalMode = b.dataset.balmode; S.evQ = ''; redraw() }))
  document.querySelectorAll('[data-hteam]').forEach(b => (b.onclick = () => { S.evHandTeam = +b.dataset.hteam; redraw() }))
  document.querySelectorAll('[data-hand]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.hand, t = S.evHandTeam ?? 0
    if (ev.teams.some(x => x.captain === id)) { toast('A captain stays with their team. Change captains in step 1, or move them in step 3.'); return }
    if (ev.team[id] === t) delete ev.team[id]
    else if (ev.players.filter(x => ev.team[x] === t).length >= (ev.teams[t].size ?? 12)) { toast(`${ev.teams[t].name} is full`); return }
    else ev.team[id] = t
    redraw()
  }))
  document.querySelectorAll('[data-topen]').forEach(b => (b.onclick = () => { read(); const k = +b.dataset.topen; S.evOpen = S.evOpen === k ? null : k; redraw() }))
  document.querySelectorAll('[data-mv]').forEach(b => (b.onclick = () => { const id = +b.dataset.mv; S.evMove = S.evMove === id ? null : id; redraw() }))
  document.querySelectorAll('[data-mvto]').forEach(b => (b.onclick = () => {
    read()
    ev.team[S.evMove] = +b.dataset.mvto // a captain who moves stops captaining their old team
    fixCaptains()
    S.evMove = null
    redraw()
  }))
  document.querySelectorAll('[data-mkcap]').forEach(b => (b.onclick = () => {
    read()
    const k = +b.dataset.mkcap, id = S.evMove
    ev.teams = ev.teams.map((x, j) => (j === k ? { ...x, captain: id } : x.captain === id ? { ...x, captain: null } : x))
    S.evMove = null
    redraw()
  }))
  if (document.querySelector('.evmore')) document.querySelector('.evmore').ontoggle = e => { S.evMore = e.target.open }
  if ($('ev-date')) $('ev-date').onchange = () => { read(); redraw() }
  if ($('ev-rep')) $('ev-rep').onchange = () => { S.evRepeatUntil = $('ev-rep').value || null; redraw() }
  on('ev-tpl', async () => {
    read()
    if (!ev.name.trim()) { $('ev-err').textContent = 'Give it a name.'; return }
    try { await api.saveEventTemplate({ name: ev.name.trim(), setup: templateOf(ev) }) } catch (e) { $('ev-err').textContent = e.message; return }
    const saved = ev.name.trim()
    await leave()
    toast(`${saved} saved as a template`)
  })
  if ($('ev-self')) $('ev-self').onclick = () => { read(); ev.selfEntry = !ev.selfEntry; redraw() }
  if ($('ev-signup')) $('ev-signup').onclick = () => { read(); ev.signup = !ev.signup; if (ev.signup && ev.maxEntries == null && ev.style === 'league' && leaguePlaces(ev)) { ev.maxEntries = leaguePlaces(ev); ev.placesAuto = true }; redraw() }
  ;['ev-adv', 'ev-close', 'ev-max'].forEach(id => { if ($(id)) $(id).onchange = () => { read(); redraw() } })
  document.querySelectorAll('[data-who]').forEach(b => (b.onclick = () => { read(); ev.selfEntry = b.dataset.who === 'all'; if (ev.selfEntry) ev.everyone = true; redraw() }))
  document.querySelectorAll('[data-vis]').forEach(b => (b.onclick = () => { read(); ev.everyone = b.dataset.vis === 'all'; redraw() }))
  const qi = $('ev-q')
  if (qi) qi.oninput = () => { S.evQ = qi.value; const p = qi.selectionStart; render().then(() => { const n = $('ev-q'); n.focus(); n.setSelectionRange(p, p) }) }
  document.querySelectorAll('[data-pick]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.pick
    if (ev.season && ev.players.includes(id) && playedIds(ev, {}, [], isoDate(today())).has(id)) { toast(`${name(id)} has played a match, so stays in the season`); return }
    ev.players = ev.players.includes(id) ? ev.players.filter(x => x !== id) : [...ev.players, id]
    delete ev.team[id]
    dropFromMatches(ev, id)
    redraw()
  }))
  document.querySelectorAll('[data-tm]').forEach(b => (b.onclick = () => { read(); const id = +b.dataset.tm; ev.team[id] = b.dataset.t; dropFromMatches(ev, id); redraw() }))
  ;document.querySelectorAll('[data-col]').forEach(b => (b.onclick = () => {
    read()
    const [who, hex] = b.dataset.col.split(':')
    if (who === 'A' || who === 'B') ev[who] = { ...ev[who], col: hex }
    else ev.teams[+who] = { ...ev.teams[+who], col: hex }
    redraw()
  }))
  ;['ev-an', 'ev-bn', 'lg-tn'].forEach(id => { if ($(id)) $(id).onchange = () => { read(); redraw() } })
  on('ev-bal', () => { read(); autoBalance(ev, members); redraw() })
  on('ev-shuf', () => { read(); ev.team = {}; shuffle(ev.players).forEach((id, n) => (ev.team[id] = n % 2 ? 'B' : 'A')); ev.matches = {}; redraw() })
  document.querySelectorAll('[data-draw]').forEach(b => (b.onclick = () => { draw1(ev, +b.dataset.draw); S.evSwap = null; redraw() }))
  document.querySelectorAll('[data-sw]').forEach(b => (b.onclick = () => {
    const [d, id] = b.dataset.sw.split(':').map(Number), sw = S.evSwap
    if (!sw || sw.d !== d) { S.evSwap = { d, id }; return redraw() }
    if (sw.id !== id && teamOf(ev, sw.id) === teamOf(ev, id)) {
      for (const m of (S.mdFlow ? S.mdFlow.matches : ev.matches[d])) for (const side of ['a', 'b']) m[side] = m[side].map(x => (x === id ? sw.id : x === sw.id ? id : x))
    }
    S.evSwap = null
    redraw()
  }))
  on('ev-del', async () => {
    const b = $('ev-del')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete this event'; return }
    try { await api.deleteEvent(ev.id) } catch (e) { $('ev-err').textContent = e.message; return }
    await leave(true)
    toast('Event deleted')
  })
  $('ev-next').onclick = async () => {
    read()
    if (flow) { const p = flowNext(ev, flow); if (p) { $('ev-err').textContent = p; return } keepScroll(render); return }
    const p = problem(ev, step)
    if (p) { $('ev-err').textContent = p; return }
    if (step === 3 && ev.style === 'ryder' && !ev.season) for (let d = 1; d <= ev.days; d++) if (!(ev.matches[d] ?? []).length) draw1(ev, d) // start with a draw
    if (dc && drawStep(ev) < 3) { $('ev-next').disabled = true; S.evDraw++; S.evMove = null; S.evQ = ''; await render(); top0(); return } // the draw's next step (a second tap while it loads would skip one)
    if (!last && !dc) { $('ev-next').disabled = true; S.evStep = steps[idx + 1]; S.evSwap = null; await render(); top0(); return } // (the draw's last step saves)
    if (ev.style !== 'ryder') ev.matches = {}
    if (ev.style === 'individual') ev.team = {}
    if (ev.style !== 'league') { ev.weeks = null; ev.bestOf = null; ev.teams = null; ev.leaguePairs = null; ev.koTop = null }
    if (pairsLeague(ev)) { ev.players = [...new Set(ev.leaguePairs.flat())]; ev.team = {}; ev.teams = [] } // a pairs league: no teams
    $('ev-next').disabled = true
    if (!ev.season) ev.endDate = null
    if (!ev.season && ev.dayRules) for (const d of Object.keys(ev.dayRules)) if (+d > holeUnits(ev)) delete ev.dayRules[d] // days (weeks) no longer in it
    if (ev.season || openToAll(ev)) ev.signup = false // no sign-up card shown for these: nothing hidden left switched on
    const p1 = !S.evTemplate && problem(ev, 1) // the details again (a run template opens past them)
    if (p1) { $('ev-err').textContent = p1; $('ev-next').disabled = false; return }
    const dates = repeatDates(ev)
    if (dates.length > MAX_REPEATS) { $('ev-err').textContent = `A weekly repeat makes at most ${MAX_REPEATS} events. Pick an earlier date.`; $('ev-next').disabled = false; return }
    try {
      if (S.evTemplate) await api.saveEventTemplate({ id: S.evTemplate, name: ev.name.trim(), setup: templateOf(ev) })
      else if (dates.length > 1) await api.saveEvents(dates.map((d, i) => ({ ...ev, startDate: d, // each week's sign-up dates move with it
        advertiseFrom: ev.advertiseFrom && addDaysIso(ev.advertiseFrom, 7 * i), entriesClose: ev.entriesClose && addDaysIso(ev.entriesClose, 7 * i) })))
      else await (viaSeason(ev, me) ? api.saveSeason(ev) : api.saveEvent(ev))
    } catch (e) { $('ev-err').textContent = e.message; $('ev-next').disabled = false; return }
    const saved = ev.name
    await leave()
    toast(dates.length > 1 ? `${dates.length} events saved: ${saved}` : `${saved} saved`)
  }
}
