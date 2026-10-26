// Setting up a match day in four-ball team match play (seasons and one-offs), one step at a time: the date (a new
// season day), who's playing, the matches (four-balls, singles, 3-balls, or a draw), the holes, the day's points,
// then a summary to confirm. The flow lives in S.mdFlow while it's open; the event editor draws and drives it.
import { S } from '../state.js'
import { esc, sur } from '../ui.js'
import { eventDates, isoDate, today } from '../dates.js'
import { dayDate, dayOfDate, drawDay } from '../season.js'
import { DEFAULT_POINTS, HOLE_CHOICES, dayRules, matchType } from '../match-scoring.js'

const STEPS = ['date', 'players', 'matches', 'holes', 'points', 'confirm']
const TYPE = { four: 'Four-ball', singles: 'Singles', three: '3-ball' }
const POINTS = [['four', 'Four-ball win'], ['singles', 'Singles win'], ['threePair', '3-ball: the pair win'], ['threeSingle', '3-ball: the single wins']]
export const typeName = m => TYPE[matchType(m)]
const fmtPts = n => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`)

/** Open the flow: a new season day (from its date) or an existing day d. */
export function openFlow(ev, d = null) {
  const sides = ['A', 'B'].flatMap(t => ev.players.filter(id => ev.team[id] === t))
  const eventId = ev.id ?? 'new'
  if (d == null) { S.mdFlow = { eventId, d: null, step: 'date', first: 'date', isNew: true, playing: sides, matches: [], points: { ...DEFAULT_POINTS, ...(ev.points ?? {}) }, holes: 18 }; return }
  const r = dayRules(ev, d), inDay = (ev.matches[d] ?? []).flatMap(m => [...m.a, ...m.b])
  S.mdFlow = { eventId, d, step: 'players', first: 'players', isNew: !(ev.matches[d] ?? []).length, playing: inDay.length ? sides.filter(id => inDay.includes(id)) : sides,
    matches: structuredClone(ev.matches[d] ?? []), holes: r.holes, points: r.points }
}

const freeOf = (ev, f, t) => f.playing.filter(id => ev.team[id] === t && !f.matches.some(m => m.a.includes(id) || m.b.includes(id)))
const avail = f => f.matches.reduce((s, m) => {
  const type = matchType(m), p = f.points
  return s + (type === 'four' ? p.four : type === 'singles' ? p.singles : Math.max(p.threePair, p.threeSingle))
}, 0)

/** The flow open for this event, or none (one left open on another event is closed). */
export function currentFlow(ev) {
  if (S.mdFlow && S.mdFlow.eventId !== (ev.id ?? 'new')) S.mdFlow = null
  return S.mdFlow ?? null
}

/** The flow's footer label. */
export const flowCta = f => (f.step === 'confirm' ? (f.isNew ? 'Add match day' : 'Save match day') : 'Next')
/** The flow's screen title (under the event's). */
export const flowTitle = f => ({ date: 'Match day: date', players: 'Who’s playing', matches: 'Matches', holes: 'Holes', points: 'Points', confirm: 'Confirm the match day' })[f.step]

/** The flow's page. name(id) → a member's name. */
export function flowHtml(ev, f, name) {
  const sw = S.evSwap, d = f.d
  const who = id => `<button class="swapname${sw && sw.d === d && sw.id === id ? ' on' : ''}" data-sw="${d}:${id}">${esc(sur(name(id)))}</button>`
  const side = (ids, col, r = '') => `<span${r} style="color:${col}">${ids.map(who).join(' &amp; ')}</span>`
  const when = d ? `<div class="hint"><b>${eventDates(dayDate(ev, d), 1)}</b></div>` : ''
  if (f.step === 'date') {
    const now = isoDate(today()), from = ev.startDate > now ? ev.startDate : now
    return `<div class="card evsec"><label for="ev-md">Which day?</label><input id="ev-md" type="date" min="${from}" max="${ev.endDate ?? ''}"><button class="primary" id="ev-mdadd">Next</button></div>`
  }
  if (f.step === 'players') {
    return `${when}<div class="hint">Untick anyone who isn’t playing that day.</div>
      ${['A', 'B'].map(t => `<div class="card evsec"><b style="color:${ev[t].col}">${esc(ev[t].name)}</b><div class="pick">${ev.players.filter(id => ev.team[id] === t).map(id => {
        const on = f.playing.includes(id)
        return `<button class="brow" data-mdp="${id}" aria-pressed="${on}"><span class="who"><strong>${esc(name(id))}</strong></span><span class="check">${on ? '✓' : ''}</span></button>` }).join('')}</div></div>`).join('')}`
  }
  if (f.step === 'matches') {
    const fA = freeOf(ev, f, 'A'), fB = freeOf(ev, f, 'B')
    const btn = (attr, label, ok) => `<button class="ghost" ${attr} ${ok ? '' : 'disabled'}>${label}</button>`
    return `${when}<div class="hint">A four-ball is a pair from each team (better ball); a singles is one each; a 3-ball is a pair against one. Tap two players on the same team to swap them.</div>
      <div class="card evsec">${f.matches.map((m, k) => `<div class="matchedit">${side(m.a, ev.A.col)}<span class="v">${typeName(m)}</span>${side(m.b, ev.B.col, ' class="r"')}<button class="x" data-rmm="${d}:${k}" aria-label="Remove this match">×</button></div>`).join('') || '<span class="hint">No matches yet.</span>'}
      ${fA.length || fB.length ? `<div class="hint">Not in a match: ${[...fA, ...fB].map(who).join(' ')}</div>` : ''}</div>
      <div class="bk-btns">${btn(`data-add4="${d}"`, '+ Four-ball', fA.length >= 2 && fB.length >= 2)}${btn(`data-add1="${d}"`, '+ Singles', fA.length && fB.length)}</div>
      <div class="bk-btns">${btn('data-add3="A"', `+ 3-ball (${esc(ev.A.name)} pair)`, fA.length >= 2 && fB.length)}${btn('data-add3="B"', `+ 3-ball (${esc(ev.B.name)} pair)`, fB.length >= 2 && fA.length)}</div>
      <div class="bk-btns"><button class="ghost" data-drawday="${d}">Draw</button></div>`
  }
  if (f.step === 'holes') {
    return `${when}<div class="hint">Handicaps are scaled to the holes played (from hole 1): 18 shots become 12 over 12 holes.</div>
      <div class="daychips">${HOLE_CHOICES.map(n => `<button data-holes="${n}" aria-pressed="${f.holes === n}">${n}</button>`).join('')}</div>`
  }
  const types = new Set(f.matches.map(matchType))
  const used = POINTS.filter(([k]) => (k === 'four' ? types.has('four') : k === 'singles' ? types.has('singles') : types.has('three')))
  const total = `${f.matches.length} match${f.matches.length === 1 ? '' : 'es'} · ${fmtPts(avail(f))} point${avail(f) === 1 ? '' : 's'} available`
  if (f.step === 'points') {
    return `${when}<div class="hint">What a win is worth this day (a halve is half). They start from the event’s points.</div>
      <div class="card evsec">${used.map(([k, label]) => `<div class="gedit"><span class="hint">${label}</span><span class="stepper sm"><button data-mdpt="${k}" data-d="-1" aria-label="Less">−</button><output>${fmtPts(f.points[k])}</output><button data-mdpt="${k}" data-d="1" aria-label="More">+</button></span></div>`).join('')}</div>
      <div class="hint"><b>${total}</b></div>`
  }
  return `<div class="card evsec"><div class="sumgrid">
      <span>Date</span><b>${d ? eventDates(dayDate(ev, d), 1) : ''}</b>
      <span>Playing</span><b>${f.playing.length} players</b>
      <span>Matches</span><b>${f.matches.map(m => `${typeName(m)}: ${m.a.map(id => esc(sur(name(id)))).join(' & ')} v ${m.b.map(id => esc(sur(name(id)))).join(' & ')}`).join('<br>')}</b>
      <span>Holes</span><b>${f.holes} holes</b>
      <span>Points</span><b>${used.map(([k, label]) => `${label} ${fmtPts(f.points[k])}`).join('<br>')}</b></div></div>
    <div class="hint"><b>${total}</b></div>`
}

/** Taps inside the flow. redraw() draws it again. */
export function bindFlow(ev, f, redraw, setError) {
  const on = (sel, fn) => document.querySelectorAll(sel).forEach(b => (b.onclick = () => fn(b)))
  on('#ev-mdadd', () => { const p = dateProblem(ev, f); if (p) return setError(p); f.step = 'players'; redraw() })
  on('[data-mdp]', b => {
    const id = +b.dataset.mdp
    f.playing = f.playing.includes(id) ? f.playing.filter(x => x !== id) : [...f.playing, id]
    f.matches = f.matches.filter(m => [...m.a, ...m.b].every(x => f.playing.includes(x)))
    redraw()
  })
  on('[data-rmm]', b => { f.matches.splice(+b.dataset.rmm.split(':')[1], 1); redraw() })
  on('[data-add4],[data-add1]', b => { const n = b.dataset.add4 ? 2 : 1; f.matches.push({ a: freeOf(ev, f, 'A').slice(0, n), b: freeOf(ev, f, 'B').slice(0, n) }); redraw() })
  on('[data-add3]', b => { const pairA = b.dataset.add3 === 'A'; f.matches.push({ a: freeOf(ev, f, 'A').slice(0, pairA ? 2 : 1), b: freeOf(ev, f, 'B').slice(0, pairA ? 1 : 2) }); redraw() })
  on('[data-drawday]', () => { f.matches = drawDay(f.playing.filter(id => ev.team[id] === 'A'), f.playing.filter(id => ev.team[id] === 'B')); S.evSwap = null; redraw() })
  on('[data-holes]', b => { f.holes = +b.dataset.holes; redraw() })
  on('[data-mdpt]', b => { const k = b.dataset.mdpt; f.points = { ...f.points, [k]: Math.max(0, Math.min(10, f.points[k] + +b.dataset.d / 2)) }; redraw() })
}

function dateProblem(ev, f) {
  const v = document.getElementById('ev-md')?.value, d = v ? dayOfDate(ev, v) : 0
  if (!v || v < isoDate(today()) || d < 1 || (ev.endDate && v > ev.endDate)) return 'Pick a day from today to the end of the season.'
  if ((ev.matches[d] ?? []).length) return 'That day is already a match day: change it from its card.'
  f.d = d
  return ''
}

/** Next (or confirm) in the flow: '' when it moved on, else what's wrong. On confirm the day goes into the event. */
export function flowNext(ev, f) {
  if (f.step === 'date') return dateProblem(ev, f) || ((f.step = 'players'), '')
  if (f.step === 'players' && (!f.playing.some(id => ev.team[id] === 'A') || !f.playing.some(id => ev.team[id] === 'B'))) return 'Pick at least one player from each team.'
  if (f.step === 'matches' && !f.matches.length) return 'Add at least one match.'
  if (f.step !== 'confirm') { f.step = STEPS[STEPS.indexOf(f.step) + 1]; return '' }
  ev.matches = { ...ev.matches, [f.d]: f.matches }
  ev.dayRules = { ...(ev.dayRules ?? {}), [f.d]: { holes: f.holes, points: f.points } }
  S.mdFlow = null
  return ''
}

/** Back inside the flow: the step before, or out of it. */
export function flowBack(f) {
  if (f.step === f.first) { S.mdFlow = null; return }
  f.step = STEPS[STEPS.indexOf(f.step) - 1]
}
