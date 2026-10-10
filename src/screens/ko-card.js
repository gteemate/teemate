// A knockout fixture's scorecard (from the draw, or the club office's bracket): both sides, where the match stands,
// the match after each hole, and the card (par, SI, playing handicaps, shots as dots, scores). Read-only: players
// score on their own scorecard and this fills in as holes are saved. koStates() also gives the draw each linked
// fixture's state, so it can show the lead and offer the result.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, render, top0, goBack } from '../ui.js'
import { courseHandicap, shotsOnHole } from '../scoring.js'
import { buildLibrary, gameSpec, teeRating } from '../games.js'
import { entryName, entryPlayers, koCardState, koSpec, roundName } from '../knockout.js'

const COL = ['var(--gold)', 'var(--flag-back)'] // side A, side B

/** The state of every fixture with a scorecard: { [matchId]: koCardState + { card } }. */
export function koStates({ matches, entries, members, course, games, cards }) {
  const L = buildLibrary(games), ch = id => courseHandicap(members.find(m => m.id === id)?.hcp ?? 0, teeRating(course))
  const out = {}
  for (const m of matches) {
    const card = m.roundId && cards[m.roundId]
    if (!card) continue
    const sides = [entryPlayers(m.aEntry, entries), entryPlayers(m.bEntry, entries)]
    const lib = L.lib[card.game], st = koCardState(card, course.holes, sides, ch, koSpec(lib?.play ? gameSpec(lib) : null, sides[0].length === 2))
    if (st) out[m.id] = { ...st, card }
  }
  return out
}

/** "Cochrane 2 up thru 7", "Cochrane won 3&2", "All square thru 4". */
export function koStateText(st, m, name) {
  const who = st.lead == null ? null : name(st.lead === 0 ? m.aEntry : m.bEntry)
  if (st.finished) return who ? `${who} won ${st.text}` : 'All square after 18'
  if (!st.thru) return 'Card started: no holes yet'
  return who ? `${who} ${st.text} thru ${st.thru}` : `All square thru ${st.thru}`
}

export async function load() {
  const [signups, members, course, games] = await Promise.all([api.getSignups(), api.getMembers(), api.getCourse(), api.getGameSettings()])
  const comp = signups.comps.find(c => c.id === S.koComp)
  if (!comp) return { comp: null }
  const ko = await api.getKnockout(comp.id), m = ko.matches.find(x => x.id === S.koCard)
  const cards = m?.roundId ? await api.getCardsById([m.roundId]) : {}
  return { comp, m, ...ko, members, course, st: m ? koStates({ matches: [m], entries: ko.entries, members, course, games, cards })[m.id] : null }
}

export function draw({ comp, m, matches = [], entries = [], members, course, st }) {
  const back = () => goBack(async () => { S.aview = S.kcFrom ?? 'ko'; await render(); top0() })
  if (!comp || !m || !st) { header('Scorecard', '', back); $('main').innerHTML = '<div class="screen"><div class="empty-state">This scorecard isn’t available any more.</div></div>'; return }
  const rounds = Math.max(...matches.map(x => x.round)), name = id => entryName(id, entries, members)
  header(`${esc(name(m.aEntry))} v ${esc(name(m.bEntry))}`, `${esc(comp.name)} · ${roundName(m.round, rounds)}`, back)
  const holes = course.holes, run = st.run, pname = id => members.find(x => x.id === id)?.name ?? 'Former member'
  const sideEl = (k, right) => { const ps = st.players.filter(p => p.side === k)
    return `<div class="mside${right ? ' r' : ''}"><span class="pairav">${ps.map(p => `<span class="av" style="border-color:${COL[k]}">${ini(pname(p.id))}</span>`).join('')}</span><span>${ps.map(p => esc(sur(pname(p.id)))).join('<br>')}</span></div>` }
  const lead = st.lead == null ? null : st.lead
  const status = !st.thru ? '<b class="ms-big">Not started</b>'
    : st.finished ? `<b class="ms-big" style="color:${lead == null ? 'var(--muted)' : COL[lead]}">${lead == null ? 'All square' : `${esc(sur(name(lead === 0 ? m.aEntry : m.bEntry)))} won ${esc(st.text)}`}</b><small>${lead == null ? 'After 18: extra holes decide it' : 'On the card'}</small>`
    : `<b class="ms-big" style="color:${lead == null ? 'var(--muted)' : COL[lead]}">${lead == null ? 'AS' : st.text}</b><small>thru ${st.thru}</small>`
  const won = i => (run[i] == null ? 0 : Math.sign(run[i] - (i ? run[i - 1] : 0)))
  const dot = i => { const d = run[i]; return `<div class="msh"><span class="mshn">${i + 1}</span><b style="color:${d ? COL[d > 0 ? 0 : 1] : 'var(--muted)'}">${d == null ? '–' : d === 0 ? 'AS' : Math.abs(d)}${d ? '<small>▲</small>' : ''}</b></div>` }
  const table = (from, label) => {
    const idx = Array.from({ length: 9 }, (_, k) => from + k), tot = f => idx.reduce((t, i) => t + (f(i) ?? 0), 0)
    const row = p => { const mineWin = p.side === 0 ? 1 : -1
      const cells = idx.map(i => `<td class="${won(i) === mineWin ? `mwon kw${p.side}` : ''}">${p.gross[i] ?? ''}<i>${'•'.repeat(Math.max(0, shotsOnHole(p.ph, holes[i].si)))}</i></td>`).join('')
      return `<tr><th style="color:${COL[p.side]}">${esc(sur(pname(p.id)))}<small>(${p.ph})</small></th>${cells}<td class="mtot">${idx.some(i => p.gross[i] != null) ? tot(i => p.gross[i]) : ''}</td></tr>` }
    return `<div class="card mcardtbl"><table class="msc"><thead><tr><th>${label}</th>${idx.map(i => `<th>${i + 1}</th>`).join('')}<th>Tot</th></tr></thead><tbody>
      <tr class="mpar"><th>Par</th>${idx.map(i => `<td>${holes[i].par}</td>`).join('')}<td class="mtot">${tot(i => holes[i].par)}</td></tr>
      <tr class="mpar"><th>SI</th>${idx.map(i => `<td>${holes[i].si}</td>`).join('')}<td></td></tr>
      ${st.players.map(row).join('')}</tbody></table></div>`
  }
  $('main').innerHTML = `<div class="screen">
    <div class="card mcard"><div class="mgrid">${sideEl(0)}<div class="mstat">${status}</div>${sideEl(1, true)}</div></div>
    ${m.status === 'confirmed' ? `<span class="hint">Result: <b>${esc(name(m.winnerEntry))} won ${esc(m.result ?? '')}</b></span>` : ''}
    <h3>Match after each hole</h3>
    <div class="card msum"><div class="msrow">${holes.slice(0, 9).map((_, i) => dot(i)).join('')}</div><div class="msrow">${holes.slice(9).map((_, i) => dot(i + 9)).join('')}</div></div>
    <h3>Scorecard</h3>
    ${table(0, 'Out')}${table(9, 'In')}
    <span class="hint">From the players’ own scorecard: it fills in as holes are saved. Dots are shots received; handicaps from the white tees.</span>
  </div>`
}
