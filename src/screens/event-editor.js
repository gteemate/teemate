// Admin → Events → New/Edit: set up an event in advance in five steps:
// details, players, teams, draw (Ryder Cup), review. Scores come from players' own cards on the day.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, top0, render, toast, fmtHcp } from '../ui.js'
import { addDaysIso, eventDates, isoDate, today } from '../dates.js'
import { drawTeams, drawCaptains } from '../event-scoring.js'

export const EVENT_TYPES = {
  ryder: { name: 'Ryder Cup', desc: 'Two teams. Pairs play better-ball matches, 1 point each.', formats: [['bbl', 'Better ball · off the low'], ['bbstab', 'Better ball · Stableford'], ['bbscr', 'Better ball · scratch']] },
  teams: { name: 'Team Stableford', desc: 'Two teams. Everyone’s Stableford points count for their team.', formats: [['teamstab', 'Team Stableford']] },
  individual: { name: 'Individual', desc: 'A leaderboard of everyone: Stableford or net.', formats: [['stab', 'Stableford'], ['net', 'Net strokeplay']] },
  league: { name: 'League', desc: 'Many teams over several weeks. Each week a team’s best Stableford rounds count. Admins only.', formats: [['beststab', 'Best Stableford rounds']], adminOnly: true },
}
const TEAM_COLOURS = ['#19335A', '#762A43', '#0B6E4F', '#C9A227', '#5B3E96', '#D2691E', '#2A7AB0', '#8B1E3F', '#3D7A2E', '#555B6E', '#B5446E', '#1F8A8A']
export const leagueTeams = (n, existing = []) => Array.from({ length: n }, (_, i) => existing[i] ?? { name: `Team ${i + 1}`, col: TEAM_COLOURS[i % TEAM_COLOURS.length], size: 12 })
export const eventFormat = e => EVENT_TYPES[e.style].formats.find(f => f[0] === e.fmt)?.[1] ?? ''

const STEPS = { 1: 'Details', 2: 'Players', 3: 'Teams', 4: 'Draw', 5: 'Review', 6: 'Teams & players' }
const stepsFor = style => (style === 'ryder' ? [1, 2, 3, 4, 5] : style === 'teams' ? [1, 2, 3, 5] : style === 'league' ? [1, 6, 5] : [1, 2, 5])

// Members and events are loaded once when the wizard opens, so each tap redraws instantly
// (and nothing being typed is overwritten by a slow reload).
let cache = null
export async function load() {
  if (!S.ev || !cache) cache = await Promise.all([api.getEvents(), api.getMembers(), api.getMe()])
  const [events, members, me] = cache
  if (!S.ev) {
    const e = S.evId && events.find(x => x.id === S.evId)
    S.ev = e ? structuredClone(e) : {
      name: '', startDate: addDaysIso(isoDate(today()), 1), days: 1, style: 'ryder', fmt: 'bbl', club: S.evScope === 'club', everyone: S.evScope === 'club',
      players: S.evScope === 'club' ? [] : [me.id], team: {}, matches: {}, A: { name: 'Blues', col: '#19335A' }, B: { name: 'Reds', col: '#762A43' },
    }
    if (!e && S.evNew === 'league') Object.assign(S.ev, { style: 'league', fmt: 'beststab', weeks: 6, bestOf: 7, teams: leagueTeams(10), captainPool: [], club: true, everyone: false })
  }
  return { members, me }
}

const leave = async () => { S.ev = null; S.evQ = ''; S.evSwap = null; S.evTeam = null; cache = null; S.aview = 'events'; await render(); top0() }
const teamOf = (ev, id) => ev.team[id]
const sideIds = (ev, t) => ev.players.filter(id => teamOf(ev, id) === t)

/** What's wrong with the event at a step ('' if fine). */
function problem(ev, step) {
  if (step === 1) {
    if (!ev.name.trim()) return 'Give the event a name.'
    if (!ev.startDate || (!ev.id && ev.startDate < isoDate(today()))) return 'Pick a first day from today on.'
  }
  if (step === 2) {
    if (ev.players.length < 2) return 'Pick at least two players.'
    if (ev.style === 'ryder' && ev.players.length % 4) return `Ryder Cup needs a multiple of 4 players (pairs v pairs). You have ${ev.players.length}.`
    if (ev.style === 'teams' && ev.players.length % 2) return `Two equal teams need an even number of players. You have ${ev.players.length}.`
  }
  if (step === 3) {
    const a = sideIds(ev, 'A').length, b = sideIds(ev, 'B').length
    if (a + b !== ev.players.length) return 'Put everyone on a team.'
    if (a !== b) return `The teams need the same number of players (${a} v ${b}).`
    if (!ev.A.name.trim() || !ev.B.name.trim()) return 'Give both teams a name.'
  }
  if (step === 4) {
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
  const a = shuffle(sideIds(ev, 'A')), b = shuffle(sideIds(ev, 'B'))
  ev.matches[d] = Array.from({ length: a.length / 2 }, (_, k) => ({ a: [a[2 * k], a[2 * k + 1]], b: [b[2 * k], b[2 * k + 1]] }))
}

export function draw({ members, me }) {
  const ev = S.ev, steps = stepsFor(ev.style)
  if (!steps.includes(S.evStep)) S.evStep = steps[0]
  const step = S.evStep, idx = steps.indexOf(step)
  const byId = id => members.find(m => m.id === id)
  const name = id => byId(id)?.name ?? '?'
  header(ev.id ? 'Edit event' : 'New event', STEPS[step], async () => { if (idx > 0) { S.evStep = steps[idx - 1]; keepScroll(render) } else leave() })
  const wiz = `<div class="wiz">${steps.map((s, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div>`
  let body = ''

  if (step === 1) {
    body = `<div class="card evsec"><h4>Event</h4>
        <label for="ev-name">Name</label><input id="ev-name" value="${esc(ev.name)}" maxlength="60" placeholder="e.g. Saturday Fourball Cup">
        <div class="tnames"><div><label for="ev-date">First day</label><input id="ev-date" type="date" value="${ev.startDate}" min="${isoDate(today())}"></div>
          ${ev.style === 'league' ? '' : `<div><label>Days</label><div class="daychips">${[1, 2, 3].map(n => `<button data-days="${n}" aria-pressed="${ev.days === n}">${n}</button>`).join('')}</div></div>`}</div>
        ${ev.style === 'league' ? '<span class="hint">Week 1 starts on this day; each week runs seven days.</span>' : `<span class="hint">${ev.startDate ? eventDates(ev.startDate, ev.days) : ''}${ev.days > 1 ? '. Points add up across the days.' : ''}</span>`}</div>
      ${ev.style === 'league' ? `<div class="card evsec"><h4>League</h4>${[['weeks', 'Weeks', 1, 26], ['bestOf', 'Scores that count per team each week', 1, 30], ['nteams', 'Number of teams', 2, 20], ['size', 'Players per team', 1, 30]].map(([k, l, lo, hi]) => `<div class="gedit"><span class="hint">${l}</span><span class="stepper sm"><button data-lg="${k}" data-d="-1" data-lo="${lo}" aria-label="Fewer">−</button><output>${k === 'nteams' ? ev.teams.length : k === 'size' ? ev.teams[0]?.size ?? 12 : ev[k]}</output><button data-lg="${k}" data-d="1" data-hi="${hi}" aria-label="More">+</button></span></div>`).join('')}
        <span class="hint">${ev.weeks} weeks from ${eventDates(ev.startDate, 1)} to ${eventDates(addDaysIso(ev.startDate, ev.weeks * 7 - 1), 1)}. Each week a team’s best ${ev.bestOf} Stableford rounds count; the season table is the total. Players choose before they play whether a round is entered, one per week.</span></div>` : ''}
      <h3>Format</h3>
      <div class="games">${Object.entries(EVENT_TYPES).filter(([, t]) => !t.adminOnly || (me.admin && S.evScope === 'club')).map(([k, t]) => `<button class="gamecard" role="radio" aria-checked="${ev.style === k}" data-style="${k}"><span class="radio"></span><span class="who"><strong>${t.name}</strong><small>${t.desc}</small></span></button>`).join('')}</div>
      ${EVENT_TYPES[ev.style].formats.length > 1 ? `<div class="card evsec"><label for="ev-fmt">${ev.style === 'ryder' ? 'Match format' : 'Scoring'}</label><select id="ev-fmt" class="plainsel">${EVENT_TYPES[ev.style].formats.map(([k, n]) => `<option value="${k}" ${ev.fmt === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${ev.club && me.admin ? `<div class="card evsec"><b>Who can see it</b>
        <div class="seg" role="group" aria-label="Who can see it"><button data-vis="all" aria-pressed="${!!ev.everyone}">All members</button><button data-vis="entrants" aria-pressed="${!ev.everyone}">Entrants only</button></div>
        <span class="hint">${ev.everyone ? 'Every member sees it on their Leaderboard tab.' : `Only the ${ev.style === 'league' ? 'league’s players' : 'players in it'} (and admins) see it.`}</span></div>
      <div class="card evsec"><div class="actrow"><span class="who"><strong>Members can enter themselves</strong><small>${ev.selfEntry ? 'On the day, members starting a round are asked if they want to play in it (not for events with a draw).' : 'Only admins add entrants.'}</small></span>
        <button type="button" class="switch" role="switch" id="ev-self" aria-checked="${!!ev.selfEntry}" aria-label="Members can enter themselves"><span></span></button></div></div>`
      : '<div class="hint">Only the players you pick will see this event.</div>'}`
  } else if (step === 2) {
    const q = (S.evQ || '').trim().toLowerCase()
    const list = members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q))
    body = `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="ev-q" type="search" placeholder="Name or GUI number" value="${esc(S.evQ || '')}" autocomplete="off"></div>
      <div class="hint"><b class="count">${ev.players.length} picked</b>${ev.style === 'ryder' ? ' · Ryder Cup needs a multiple of 4 (pairs v pairs)' : ev.style === 'teams' ? ' · an even number for two equal teams' : ''}. Members only.</div>
      <div class="pick">${list.map(m => { const on = ev.players.includes(m.id); return `<button class="brow" data-pick="${m.id}" aria-pressed="${on}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</strong><small>Index ${fmtHcp(m.hcp)}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
  } else if (step === 3) {
    const avg = ids => (ids.length ? (ids.reduce((t, id) => t + (byId(id)?.hcp ?? 0), 0) / ids.length).toFixed(1) : '–')
    const A = sideIds(ev, 'A'), B = sideIds(ev, 'B')
    body = `<div class="card evsec"><div class="tnames">
        <div><label for="ev-an">Team name</label><div class="trowin"><input id="ev-an" value="${esc(ev.A.name)}" maxlength="24"><input type="color" id="ev-ac" value="${ev.A.col}" aria-label="Colour"></div></div>
        <div><label for="ev-bn">Team name</label><div class="trowin"><input id="ev-bn" value="${esc(ev.B.name)}" maxlength="24"><input type="color" id="ev-bc" value="${ev.B.col}" aria-label="Colour"></div></div></div></div>
      <div class="tcards"><div style="background:${ev.A.col}"><small>${esc(ev.A.name)}</small><b>${A.length}</b><small>avg index ${avg(A)}</small></div><div style="background:${ev.B.col}"><small>${esc(ev.B.name)}</small><b>${B.length}</b><small>avg index ${avg(B)}</small></div></div>
      <div class="bk-btns"><button class="ghost" id="ev-bal">Auto-balance by handicap</button><button class="ghost" id="ev-shuf">Shuffle</button></div>
      <div class="card evsec"><div class="tlist">${ev.players.map(id => `<div class="trow"><span class="who"><strong>${esc(name(id))}</strong><small>Index ${fmtHcp(byId(id)?.hcp)}</small></span><span class="tseg"><button data-tm="${id}" data-t="A" aria-pressed="${teamOf(ev, id) === 'A'}" style="--tc:${ev.A.col}">${esc(ev.A.name)}</button><button data-tm="${id}" data-t="B" aria-pressed="${teamOf(ev, id) === 'B'}" style="--tc:${ev.B.col}">${esc(ev.B.name)}</button></span></div>`).join('')}</div></div>`
  } else if (step === 4) {
    const sw = S.evSwap
    const who = (d, id) => `<button class="swapname${sw && sw.d === d && sw.id === id ? ' on' : ''}" data-sw="${d}:${id}">${esc(sur(name(id)))}</button>`
    body = `<div class="hint">Each match is a four-ball. Players book a tee time together as usual; the board scores each match from their cards. Tap two players on the same team to swap them.</div>
      ${Array.from({ length: ev.days }, (_, i) => i + 1).map(d => `<div class="card evsec"><div class="pinhead"><h4 style="font-size:20px">Day ${d} · ${eventDates(addDaysIso(ev.startDate, d - 1), 1)}</h4><button class="linkbtn" data-draw="${d}">${(ev.matches[d] ?? []).length ? 'Redraw' : 'Draw matches'}</button></div>
        ${(ev.matches[d] ?? []).map((m, k) => `<div class="matchedit"><span style="color:${ev.A.col}">${who(d, m.a[0])} &amp; ${who(d, m.a[1])}</span><span class="v">v</span><span class="r" style="color:${ev.B.col}">${who(d, m.b[0])} &amp; ${who(d, m.b[1])}</span></div>`).join('') || '<span class="hint">Not drawn yet.</span>'}</div>`).join('')}`
  } else if (step === 6) {
    // S.evTeam: -1 = the entrants list; -2 = captain candidates; 0.. = a team.
    const t = S.evTeam == null ? -1 : Math.min(S.evTeam, ev.teams.length - 1), team = ev.teams[t]
    const pool = ev.captainPool ?? []
    const inTeam = k => ev.players.filter(id => ev.team[id] === k)
    const avg = ids => (ids.length ? (ids.reduce((x, id) => x + (byId(id)?.hcp ?? 0), 0) / ids.length).toFixed(1) : '–')
    const q = (S.evQ || '').trim().toLowerCase()
    const list = members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q))
    const places = ev.teams.reduce((s2, x) => s2 + (x.size ?? 12), 0)
    const assigned = ev.players.filter(id => ev.team[id] != null).length, unassigned = ev.players.length - assigned
    const captains = ev.teams.filter(x => x.captain != null && ev.players.includes(x.captain)).length
    const capOf = id => ev.teams.findIndex(x => x.captain === id)
    const capTag = '<span class="pill tag">Captain</span>'
    const tabs = `<div class="tabs-pill" role="group" aria-label="Team"><button data-team="-1" aria-pressed="${t === -1}">Entrants ${ev.players.length}</button><button data-team="-2" aria-pressed="${t === -2}">Captains ${pool.length}</button>${ev.teams.map((x, k) => `<button data-team="${k}" aria-pressed="${k === t}"><i class="fl" style="background:${x.col}"></i>${esc(x.name)} ${inTeam(k).length}/${x.size ?? 12}</button>`).join('')}</div>`
    const search = `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="ev-q" type="search" placeholder="Name or GUI number" value="${esc(S.evQ || '')}" autocomplete="off"></div>`
    const summary = `<div class="hint"><b>${ev.players.length} entrants · ${assigned} of ${places} team places filled${unassigned ? ` · ${unassigned} not on a team yet` : ''}.</b> You can save now and add more as members join.</div>`
    if (t === -1) {
      const notIn = list.filter(m => !ev.players.includes(m.id))
      body = `${summary}${tabs}
        <div class="card evsec"><b>Entrants</b><span class="hint">Add everyone who has entered below. Then:</span>
          <b>1 · Draw captains</b>
          <span class="hint">${captains ? `${captains} of ${ev.teams.length} teams have a captain.` : 'No captains yet.'} List the candidates on the Captains tab and draw one for each team.</span>
          <button class="ghost" data-team="-2">${captains ? 'Change captains' : 'Choose captains'}</button>
          <b>2 · Balance the teams</b>
          <span class="hint">Captains stay with their teams. Everyone else is dealt out at random so every team ends up with a similar average handicap. Balance again for a different mix; you can move players afterwards.</span>
          <button class="primary" id="lg-bal" ${ev.players.length ? '' : 'disabled'}>${assigned ? 'Rebalance teams' : 'Balance teams'}${captains ? ` around ${captains} captain${captains === 1 ? '' : 's'}` : ' by handicap'}</button>
          ${ev.players.length > places ? `<span class="gerr">${ev.players.length - places} more entrants than places: they’ll stay off the teams. Add teams or places in Details.</span>` : ''}</div>
        ${search}
        ${notIn.length ? `<button class="ghost" id="lg-addall">Add all ${notIn.length} listed</button>` : ''}
        <div class="pick">${list.map(m2 => { const on = ev.players.includes(m2.id), k = ev.team[m2.id]; return `<button class="brow" data-ent="${m2.id}" aria-pressed="${on}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}</strong><small>Index ${fmtHcp(m2.hcp)}${on ? (k != null ? ` · ${esc(ev.teams[k].name)}${capOf(m2.id) === k ? ' captain' : ''}` : ' · not on a team') : ''}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
    } else if (t === -2) {
      const drawn = ev.teams.filter(x => x.captain != null).length
      body = `${summary}${tabs}
        <div class="card evsec"><b>Captain candidates</b>
          <span class="hint">Tap members below to list them. Draw captains picks one at random for each team; anyone not picked plays as an ordinary entrant. You can list more people than there are teams.</span>
          <div class="capdraw">${ev.teams.map(x => `<div><i class="fl" style="background:${x.col}"></i><span>${esc(x.name)}</span><b>${x.captain != null ? esc(name(x.captain)) : '–'}</b></div>`).join('')}</div>
          ${pool.length && pool.length < ev.teams.length ? `<span class="gerr">${pool.length} candidate${pool.length === 1 ? '' : 's'} for ${ev.teams.length} teams: ${ev.teams.length - pool.length} team${ev.teams.length - pool.length === 1 ? '' : 's'} won’t have a captain.</span>` : ''}
          <button class="primary" id="lg-draw" ${pool.length ? '' : 'disabled'}>${drawn ? 'Draw captains again' : 'Draw captains'}</button>
          ${assigned ? '<span class="hint">Drawing captains clears the teams. Balance them again on Entrants afterwards.</span>' : ''}</div>
        ${search}
        <div class="pick">${list.map(m2 => { const on = pool.includes(m2.id), k = capOf(m2.id); return `<button class="brow" data-cand="${m2.id}" aria-pressed="${on}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}${k >= 0 ? ` ${capTag}` : ''}</strong><small>Index ${fmtHcp(m2.hcp)}${k >= 0 ? ` · ${esc(ev.teams[k].name)} captain` : on ? ' · candidate' : ''}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
    } else {
      const others = pool.filter(id => capOf(id) < 0 && ev.players.includes(id)) // candidates not already captaining a team
      body = `${summary}${tabs}
        <div class="card evsec"><div class="trowin"><input id="lg-tn" value="${esc(team.name)}" maxlength="24" aria-label="Team name"><input type="color" id="lg-tc" value="${team.col}" aria-label="Team colour"></div>
          <span class="hint">${inTeam(t).length ? `${inTeam(t).length} player${inTeam(t).length === 1 ? '' : 's'} · average index ${avg(inTeam(t))}: ${inTeam(t).map(id => esc(name(id)) + (team.captain === id ? ' (captain)' : '')).join(', ')}` : 'No players yet. Pick members below, or draw captains and balance the teams from Entrants.'}</span>
          <b>Captain: ${team.captain != null ? esc(name(team.captain)) : 'none'}</b>
          ${others.length ? `<span class="hint">Tap a candidate to make them this team’s captain instead:</span><div class="capchips">${others.map(id => `<button class="pill tag" data-setcap="${id}">${esc(name(id))}</button>`).join('')}</div>` : ''}</div>
        ${search}
        <div class="pick">${list.map(m2 => { const k = ev.team[m2.id], on = k === t; return `<button class="brow" data-lgp="${m2.id}" aria-pressed="${on}"><span class="av">${ini(m2.name)}</span><span class="who"><strong>${esc(m2.name)}${on && team.captain === m2.id ? ` ${capTag}` : ''}</strong><small>Index ${fmtHcp(m2.hcp)}${k != null && !on ? ` · in ${esc(ev.teams[k].name)} (tap to move)` : ''}</small></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div>`
    }
  } else if (ev.style === 'league') {
    const places = ev.teams.reduce((s2, x) => s2 + (x.size ?? 12), 0)
    body = `<div class="card evsec"><h4>${esc(ev.name)}</h4><div class="sumgrid">
        <span>When</span><b>${ev.weeks} weeks · ${eventDates(ev.startDate, 1)} – ${eventDates(addDaysIso(ev.startDate, ev.weeks * 7 - 1), 1)}</b>
        <span>Scoring</span><b>Best ${ev.bestOf} Stableford rounds per team each week; season total</b>
        <span>Teams</span><b>${ev.teams.length} · ${ev.teams.map(x => esc(x.name)).join(', ')}</b>
        <span>Players</span><b>${ev.players.length} of ${places} places filled</b>
        <span>Entering</span><b>Players choose before they play; one round a week</b>
        <span>Who sees it</span><b>${ev.everyone ? 'All members' : 'Only the league’s players (and admins)'}</b></div></div>
      <div class="hint">Players see it on their Leaderboard tab while it runs: a team table and an individual table.</div>
      ${ev.id ? '<button class="ghost accremove" id="ev-del">Delete league</button>' : ''}`
  } else {
    const A = sideIds(ev, 'A'), B = sideIds(ev, 'B')
    body = `<div class="card evsec"><h4>${esc(ev.name)}</h4><div class="sumgrid">
        <span>When</span><b>${eventDates(ev.startDate, ev.days)}${ev.days > 1 ? ` (${ev.days} days)` : ''}</b>
        <span>Format</span><b>${EVENT_TYPES[ev.style].name}${ev.style !== 'teams' ? ` · ${eventFormat(ev)}` : ''}</b>
        <span>Players</span><b>${ev.players.length} members</b>
        ${ev.style !== 'individual' ? `<span>Teams</span><b>${esc(ev.A.name)} ${A.length} · ${esc(ev.B.name)} ${B.length}</b>` : ''}
        ${ev.style === 'ryder' ? `<span>Matches</span><b>${Object.values(ev.matches).flat().length} · 1 point each</b>` : ''}
        <span>Who sees it</span><b>${ev.everyone ? 'All members' : 'Only the players in it'}</b>
        <span>Scoring</span><b>Live from each player’s own card</b></div></div>
      <div class="hint">Players see it on their Leaderboard tab on the day${ev.days > 1 ? 's' : ''}. ${me.admin ? 'As an admin you can change it any time.' : 'You can change it until the first day.'}</div>
      ${ev.id ? '<button class="ghost accremove" id="ev-del">Delete event</button>' : ''}`
  }

  const last = idx === steps.length - 1
  $('main').innerHTML = `<div class="screen">${wiz}${body}<p class="gerr" id="ev-err" role="alert"></p></div>
    <div class="cta"><button class="primary" id="ev-next">${last ? (ev.id ? 'Save changes' : 'Save event') : `Next: ${STEPS[steps[idx + 1]].toLowerCase()}`}</button></div>`

  const redraw = () => keepScroll(render)
  const read = () => {
    if ($('ev-name')) { ev.name = $('ev-name').value; ev.startDate = $('ev-date').value; if ($('ev-fmt')) ev.fmt = $('ev-fmt').value }
    if ($('ev-an')) { ev.A = { name: $('ev-an').value, col: $('ev-ac').value }; ev.B = { name: $('ev-bn').value, col: $('ev-bc').value } }
    if ($('lg-tn')) { const t = S.evTeam ?? 0; ev.teams[t] = { ...ev.teams[t], name: $('lg-tn').value || ev.teams[t].name, col: $('lg-tc').value } }
  }
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f }
  // A captain who leaves their team (or the league) stops being captain.
  const fixCaptains = () => { ev.teams = ev.teams.map((x, k) => (x.captain != null && ev.team[x.captain] !== k ? { ...x, captain: null } : x)) }
  document.querySelectorAll('[data-days]').forEach(b => (b.onclick = () => { read(); ev.days = +b.dataset.days; ev.matches = {}; redraw() }))
  document.querySelectorAll('[data-style]').forEach(b => (b.onclick = () => {
    read()
    const was = ev.style
    ev.style = b.dataset.style
    ev.fmt = EVENT_TYPES[ev.style].formats[0][0]
    if (ev.style === 'league' && was !== 'league') { ev.weeks ??= 6; ev.bestOf ??= 7; ev.teams = leagueTeams(10, ev.teams ?? []); ev.team = {}; ev.players = []; ev.club = true; ev.everyone = false; ev.days = 1 }
    if (ev.style !== 'league' && was === 'league') { ev.team = {}; ev.players = [me.id] }
    redraw()
  }))
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
  document.querySelectorAll('[data-team]').forEach(b => (b.onclick = () => { read(); S.evTeam = +b.dataset.team; redraw() }))
  document.querySelectorAll('[data-ent]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.ent
    if (ev.players.includes(id)) { ev.players = ev.players.filter(x => x !== id); ev.captainPool = (ev.captainPool ?? []).filter(x => x !== id); delete ev.team[id]; fixCaptains() } else ev.players = [...ev.players, id]
    redraw()
  }))
  on('lg-addall', () => {
    const q = (S.evQ || '').trim().toLowerCase()
    const add = members.filter(m => (!q || m.name.toLowerCase().includes(q) || (m.gui || '').includes(q)) && !ev.players.includes(m.id)).map(m => m.id)
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
  document.querySelectorAll('[data-lgp]').forEach(b => (b.onclick = () => {
    read()
    const id = +b.dataset.lgp, t = S.evTeam ?? 0
    if (ev.team[id] === t) delete ev.team[id] // off the team, still an entrant
    else { ev.team[id] = t; if (!ev.players.includes(id)) ev.players = [...ev.players, id] } // picks, or moves from another team
    fixCaptains()
    redraw()
  }))
  // Captain candidates: listing someone also enters them; taking them off ends any captaincy.
  document.querySelectorAll('[data-cand]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.cand, pool = ev.captainPool ?? []
    if (pool.includes(id)) { ev.captainPool = pool.filter(x => x !== id); ev.teams = ev.teams.map(x => (x.captain === id ? { ...x, captain: null } : x)) }
    else { ev.captainPool = [...pool, id]; if (!ev.players.includes(id)) ev.players = [...ev.players, id] }
    redraw()
  }))
  on('lg-draw', () => {
    const picks = drawCaptains(ev.captainPool ?? [], ev.players, ev.teams.length)
    ev.team = {} // a new set of captains: the teams are dealt again around them
    ev.teams = ev.teams.map((x, k) => ({ ...x, captain: picks[k] }))
    picks.forEach((id, k) => { if (id != null) ev.team[id] = k })
    redraw()
    toast(`${picks.filter(id => id != null).length} captains drawn. Now balance the teams on Entrants`)
  })
  document.querySelectorAll('[data-setcap]').forEach(b => (b.onclick = () => {
    read()
    const id = +b.dataset.setcap, t = S.evTeam ?? 0
    ev.teams = ev.teams.map((x, k) => (k === t ? { ...x, captain: id } : x.captain === id ? { ...x, captain: null } : x)) // one team each
    ev.team[id] = t // the new captain joins this team; the old one stays as a player
    fixCaptains()
    redraw()
  }))
  if ($('ev-date')) $('ev-date').onchange = () => { read(); redraw() }
  if ($('ev-self')) $('ev-self').onclick = () => { read(); ev.selfEntry = !ev.selfEntry; redraw() }
  document.querySelectorAll('[data-vis]').forEach(b => (b.onclick = () => { read(); ev.everyone = b.dataset.vis === 'all'; redraw() }))
  const qi = $('ev-q')
  if (qi) qi.oninput = () => { S.evQ = qi.value; const p = qi.selectionStart; render().then(() => { const n = $('ev-q'); n.focus(); n.setSelectionRange(p, p) }) }
  document.querySelectorAll('[data-pick]').forEach(b => (b.onclick = () => {
    const id = +b.dataset.pick
    ev.players = ev.players.includes(id) ? ev.players.filter(x => x !== id) : [...ev.players, id]
    delete ev.team[id]
    ev.matches = {}
    redraw()
  }))
  document.querySelectorAll('[data-tm]').forEach(b => (b.onclick = () => { read(); ev.team[+b.dataset.tm] = b.dataset.t; ev.matches = {}; redraw() }))
  ;['ev-an', 'ev-bn', 'ev-ac', 'ev-bc', 'lg-tn', 'lg-tc'].forEach(id => { if ($(id)) $(id).onchange = () => { read(); redraw() } })
  on('ev-bal', () => { read(); autoBalance(ev, members); redraw() })
  on('ev-shuf', () => { read(); ev.team = {}; shuffle(ev.players).forEach((id, n) => (ev.team[id] = n % 2 ? 'B' : 'A')); ev.matches = {}; redraw() })
  document.querySelectorAll('[data-draw]').forEach(b => (b.onclick = () => { draw1(ev, +b.dataset.draw); S.evSwap = null; redraw() }))
  document.querySelectorAll('[data-sw]').forEach(b => (b.onclick = () => {
    const [d, id] = b.dataset.sw.split(':').map(Number), sw = S.evSwap
    if (!sw || sw.d !== d) { S.evSwap = { d, id }; return redraw() }
    if (sw.id !== id && teamOf(ev, sw.id) === teamOf(ev, id)) {
      for (const m of ev.matches[d]) for (const side of ['a', 'b']) m[side] = m[side].map(x => (x === id ? sw.id : x === sw.id ? id : x))
    }
    S.evSwap = null
    redraw()
  }))
  on('ev-del', async () => {
    const b = $('ev-del')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete this event'; return }
    try { await api.deleteEvent(ev.id) } catch (e) { $('ev-err').textContent = e.message; return }
    await leave()
    toast('Event deleted')
  })
  $('ev-next').onclick = async () => {
    read()
    const p = problem(ev, step)
    if (p) { $('ev-err').textContent = p; return }
    if (step === 3 && ev.style === 'ryder') for (let d = 1; d <= ev.days; d++) if (!(ev.matches[d] ?? []).length) draw1(ev, d) // start with a draw
    if (!last) { S.evStep = steps[idx + 1]; S.evSwap = null; await render(); top0(); return }
    if (ev.style !== 'ryder') ev.matches = {}
    if (ev.style === 'individual') ev.team = {}
    if (ev.style !== 'league') { ev.weeks = null; ev.bestOf = null; ev.teams = null }
    $('ev-next').disabled = true
    try { await api.saveEvent(ev) } catch (e) { $('ev-err').textContent = e.message; $('ev-next').disabled = false; return }
    const saved = ev.name
    await leave()
    toast(`${saved} saved`)
  }
}
