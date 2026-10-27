// Paper scorecards: from photos of the group's paper cards to a saved card. Steps: photo (one card at a time) →
// crop (the box around the score grid; only that leaves the phone) → reading → match (which column is who) →
// check (each player, mine last) → who (confirms my score) → saved onto today's card like any other scores.
// The camera and the cut-out go through io, so the journeys can stand in for them.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, toast, top0 } from '../ui.js'
import { getRound } from '../screens/scores.js'
import { openCourse } from '../open-holes.js'
import { savedBox, saveBox, moveCorner, cropToBlob } from './crop.js'
import { toColumns, colChecks, guessPlayers, matchProblem, toScores, playerKey } from './reading.js'

export const io = {
  /** The phone's camera (or a photo from the library): a File, or null if nothing was picked. */
  choose: () => new Promise(ok => {
    const i = document.createElement('input')
    i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment')
    i.onchange = () => ok(i.files?.[0] ?? null)
    i.click()
  }),
  preview: file => URL.createObjectURL(file),
  /** The box cut out of the photo, as a JPEG. */
  crop: (file, box) => new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => cropToBlob(img, box).then(ok, fail)
    img.onerror = () => fail(new Error('That photo couldn’t be opened. Try another.'))
    img.src = URL.createObjectURL(file)
  }),
}

const SEEN = 'teemate.paperSeen' // the example card is shown until the first photo is taken
let F = null // this visit: { step, shots: [{ file, url, blob }], cur, box, cols, who, ci, confirmer, error }

/** Open the flow from today's card. */
export function startPaper() { F = { step: 'photo', shots: [], box: savedBox() }; S.sview = 'paper' }
/** Sent back: check my own scores on the saved card, then send them to the same person again. */
export function startPaperRecheck(meId) {
  const round = getRound(), k = round.lineup.findIndex(e => e.m === meId)
  const holes = round.scores.map(h => ({ score: h[k], sure: true }))
  F = { step: 'check', recheck: true, shots: [], ci: 0, who: [`m${meId}`], cols: [{ card: 1, label: 'A', holes, out: null, in: null, total: null, blank: false }] }
  S.sview = 'paper'
}
const leave = async () => { F = null; S.sview = 'card'; await render(); top0() }
const go = async step => { F.step = step; await render(); top0() }

export async function load() {
  const round = getRound()
  if (!round || !F) { S.sview = 'card'; return { round: null } }
  const [course, members, me] = await Promise.all([api.getCourse(), api.getMembers(), api.getMe()])
  const guests = await api.getGuests(round.lineup.filter(e => e.g != null).map(e => e.g))
  const open = openCourse(course.holes, S.cardHoles ?? null).map(x => x.i)
  const name = e => (e.m != null ? members.find(m => m.id === e.m)?.name : guests.find(g => g.id === e.g)?.name) ?? 'Guest'
  return { round, course, me, open, players: round.lineup.map(e => ({ key: playerKey(e), m: e.m ?? null, name: name(e), me: e.m === me.id })) }
}

export function draw(d) {
  if (!d.round || !F) { render(); return }
  ;({ photo, crop, reading, problem, match, check, who })[F.step](d)
}

const first = n => n.split(' ')[0]

function exampleCard() {
  const s = [[6, 4], [6, 4], [4, 4], [5, 6], [4, 5], [3, 5], [8, 3], [6, 8], [4, 5]]
  return `<div class="pex" aria-hidden="true"><span class="pex-tag">Like this</span>
    <div class="pex-names"><span>A</span><i></i><span>B</span><i></i></div>
    <table><tr><th>Hole</th><th>Par</th><th>SI</th><th>A</th><th>B</th></tr>
      ${s.map(([a, b], h) => `<tr><td>${h + 1}</td><td>${[4, 5, 3, 4, 4, 3, 5, 4, 4][h]}</td><td class="si">${[7, 13, 17, 1, 15, 11, 5, 9, 3][h]}</td><td class="hw">${a}</td><td class="hw">${b}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3">OUT</td><td class="hw">46</td><td class="hw">44</td></tr><tr><td colspan="5">…</td></tr></table></div>`
}

function photo({ players }) {
  const n = F.shots.length + 1
  let seen = false
  try { seen = !!localStorage.getItem(SEEN) } catch { /* none */ }
  header('Photograph your card', n > 1 ? 'Card 1 done. Now the second card.' : 'After the round, a photo of each paper card', () => (n > 1 ? (F.shots = [], go('photo')) : leave()))
  $('main').innerHTML = `<div class="screen pflow">
    ${seen ? '' : exampleCard()}
    <ul class="ptips"><li>Lay the card flat, in good light, with all 18 holes and the totals in the picture</li>
      <li>Photograph the whole card: the names are cut off on your phone before it’s read</li>
      ${players.length > 2 ? '<li>A four-ball has two cards: photograph each one</li>' : ''}</ul>
  </div>
  <div class="cta">${n > 1 ? '<button class="ghost" id="pf-one">Only one card</button>' : ''}<button class="primary" id="pf-shot">Take photo of card ${n}</button></div>`
  $('pf-shot').onclick = async () => {
    const file = await io.choose()
    if (!file) return
    try { localStorage.setItem(SEEN, '1') } catch { /* none */ }
    F.cur = { file, url: io.preview(file) }
    go('crop')
  }
  if ($('pf-one')) $('pf-one').onclick = () => read()
}

function crop({ players }) {
  const n = F.shots.length + 1, b = F.box
  header('Are all the scores in the box?', `Card ${n}`, () => go('photo'), 'Retake')
  $('main').innerHTML = `<div class="screen pflow">
    <div class="pcrop" id="pcrop"><img src="${esc(F.cur.url)}" alt="Your photo of card ${n}">
      <div class="pbox" id="pbox" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%">
        ${['tl', 'tr', 'bl', 'br'].map(c => `<i class="phdl ${c}" data-corner="${c}"></i>`).join('')}</div></div>
    <div class="pprivate"><b>🔒 Names stay on your phone</b><span>Only the scores inside the box are sent to be read. Names, handicaps and signatures are cut off first and never leave your phone.</span></div>
    <p class="hint">Drag the corners if any scores are outside the box.</p>
  </div>
  <div class="cta"><button class="primary" id="pf-crop">Yes, all the scores are in the box</button></div>`
  const area = $('pcrop'), box = $('pbox')
  document.querySelectorAll('[data-corner]').forEach(h => (h.onpointerdown = e => {
    e.preventDefault()
    const r = area.getBoundingClientRect(), c = h.dataset.corner
    let lx = e.clientX, ly = e.clientY
    const move = ev => {
      F.box = moveCorner(F.box, c, (ev.clientX - lx) / (r.width || 1), (ev.clientY - ly) / (r.height || 1))
      lx = ev.clientX; ly = ev.clientY
      Object.assign(box.style, { left: `${F.box.x * 100}%`, top: `${F.box.y * 100}%`, width: `${F.box.w * 100}%`, height: `${F.box.h * 100}%` })
    }
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); saveBox(F.box) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }))
  $('pf-crop').onclick = async () => {
    $('pf-crop').disabled = true
    let blob
    try { blob = await io.crop(F.cur.file, F.box) } catch (err) { toast(err.message); $('pf-crop').disabled = false; return }
    saveBox(F.box)
    F.shots.push({ ...F.cur, blob })
    if (F.shots.length === 1 && players.length > 2) return go('photo')
    read()
  }
}

async function read() {
  F.error = null
  await go('reading')
  const round = getRound(), course = await api.getCourse()
  try {
    const reading = await api.readScorecard({ images: F.shots.map(s => s.blob), pars: course.holes.map(h => h.par),
      open: openCourse(course.holes, S.cardHoles ?? null).map(x => x.i), players: round.lineup.length })
    if (!reading.parMatches) throw new Error('This doesn’t look like a card for this course.')
    F.cols = toColumns(reading)
    F.who = guessPlayers(F.cols, round.lineup)
    F.ci = 0
    F.step = 'match'
  } catch (err) {
    F.error = err.message
    F.step = 'problem'
  }
  if (S.sview === 'paper') { await render(); top0() }
}

function reading() {
  header('Reading your card…', 'Finding the Score columns and checking the totals', null)
  $('main').innerHTML = '<div class="screen pflow"><div class="pspin" role="status" aria-label="Reading"></div></div>'
}

function problem() {
  header('The card couldn’t be read', '', () => go('photo'))
  $('main').innerHTML = `<div class="screen pflow"><div class="pnote" role="alert">${esc(F.error)}</div></div>
    <div class="cta"><button class="ghost" id="pf-hand">Enter scores by hand</button><button class="primary" id="pf-retake">Retake</button></div>`
  $('pf-hand').onclick = leave
  $('pf-retake').onclick = () => { F.shots = []; go('photo') }
}

const sum = (col, from) => col.holes.slice(from, from + 9).reduce((s, h) => s + (h.score ?? 0), 0)

function match({ players }) {
  const meKey = players.find(p => p.me).key
  const names = Object.fromEntries(players.map(p => [p.key, p.me ? 'you' : p.name]))
  const missing = players.find(p => !F.who.includes(p.key))
  const problem = matchProblem(F.who, meKey, names) ?? (missing ? `Pick a column for ${missing.name}.` : null)
  const found = F.cols.filter(c => !c.blank).length
  const unsure = F.cols.reduce((n, c, i) => n + (F.who[i] ? c.holes.filter(h => !h.sure).length : 0), 0)
  header(`${found} player${found === 1 ? '' : 's'} found`, 'Match each Score column to a player', () => { F.shots = []; go('photo') }, 'Retake')
  $('main').innerHTML = `<div class="screen pflow">
    ${unsure ? `<p class="hint">${unsure} score${unsure === 1 ? ' was' : 's were'} hard to read: you’ll be asked to check ${unsure === 1 ? 'it' : 'them'}.</p>` : ''}
    <div class="card pmatch">${F.cols.map((c, i) => `<label class="pcol"><span>Card ${c.card} · column ${c.label}${c.blank ? ' · blank'
      : ` · Out ${c.out ?? sum(c, 0)} · In ${c.in ?? sum(c, 9)} = ${c.total ?? sum(c, 0) + sum(c, 9)}`}</span>
      <select data-pcol="${i}" aria-label="Card ${c.card}, column ${c.label}">
        ${players.map(p => `<option value="${p.key}" ${F.who[i] === p.key ? 'selected' : ''}>${p.me ? 'You' : esc(p.name)}</option>`).join('')}
        <option value="" ${!F.who[i] ? 'selected' : ''}>Skip this column</option></select></label>`).join('')}</div>
    ${problem ? `<div class="pnote" role="alert">${esc(problem)}</div>` : '<p class="hint">Guessed from the order of the players on your card.</p>'}
  </div>
  <div class="cta"><button class="primary" id="pf-next" ${problem ? 'disabled' : ''}>Next: check the scores</button></div>`
  document.querySelectorAll('[data-pcol]').forEach(s => (s.onchange = () => { F.who[+s.dataset.pcol] = s.value || null; render() }))
  $('pf-next').onclick = () => { F.ci = 0; go('check') }
}

/** Who to check, in column order with me last. */
const order = players => [...F.who.filter(k => k && !players.find(p => p.key === k)?.me), players.find(p => p.me).key]

function check({ players, open }) {
  const keys = order(players), key = keys[F.ci], p = players.find(x => x.key === key)
  const col = F.cols[F.who.indexOf(key)], ck = colChecks(col, open)
  const blank = open.filter(h => col.holes[h].score == null)
  const cell = h => `<button class="pcell ${ck.unsure.includes(h) ? 'warn' : ''}" data-ph="${h}" aria-label="Hole ${h + 1}: ${col.holes[h].score ?? 'blank'}">${col.holes[h].score ?? '–'}</button>`
  const half = from => { const hs = open.filter(h => h >= from && h < from + 9); return hs.length ? `<div class="pgrid">${hs.map(h => `<span class="ph">${h + 1}</span>`).join('')}${hs.map(cell).join('')}</div>` : '' }
  const line = (ok, text) => `<div class="pchk ${ok ? 'ok' : 'wn'}"><span>${ok ? '✓' : '!'}</span>${text}</div>`
  const tot = (t, nm) => (!t ? '' : t.ok ? line(true, `${nm} adds up to ${t.holes}, as written on the card`) : line(false, `${nm}: the holes add up to ${t.holes}, but the card says ${t.written}. Check the amber holes.`))
  header(p.me ? 'Your scores' : p.name, F.recheck ? 'Check them against your paper card' : `Card ${col.card} · column ${col.label} · player ${F.ci + 1} of ${keys.length}`,
    () => (F.recheck ? leave() : F.ci ? (F.ci--, go('check')) : go('match')))
  $('main').innerHTML = `<div class="screen pflow">
    <p class="hint">Tap any score to change it.</p>
    <div class="card">${half(0)}${half(9)}</div>
    <div class="card">${tot(ck.out, 'Out')}${tot(ck.in, 'In')}${ck.unsure.map(h => line(false, `Hole ${h + 1} was hard to read. Is it a ${col.holes[h].score ?? 'blank'}?`)).join('')}
      ${blank.map(h => line(false, `Hole ${h + 1} has no score.`)).join('')}${!ck.out && !ck.in && !ck.unsure.length && !blank.length ? line(true, 'Everything was read clearly') : ''}</div>
  </div>
  <div class="cta"><button class="primary" id="pf-ok" ${blank.length ? 'disabled' : ''}>${p.me ? 'My scores are right' : `${esc(first(p.name))}’s scores are right`}</button></div>`
  document.querySelectorAll('[data-ph]').forEach(b => (b.onclick = () => pad(col, +b.dataset.ph)))
  $('pf-ok').onclick = () => {
    for (const h of open) col.holes[h].sure = true
    if (F.recheck) return resend({ players, open, col })
    if (F.ci < keys.length - 1) { F.ci++; go('check') } else go('who')
  }
}

function pad(col, h) {
  const close = () => { $('modal').innerHTML = '' }
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="pnt">
    <h3 id="pnt">Hole ${h + 1}</h3><p class="hint">The card was read as ${col.holes[h].score ?? 'blank'}.</p>
    <div class="ppad">${Array.from({ length: 12 }, (_, i) => `<button class="${col.holes[h].score === i + 1 ? 'on' : ''}" data-pn="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="gm-btns"><button class="ghost" id="pn-no">Cancel</button></div></div></div>`
  $('pn-no').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  document.querySelectorAll('[data-pn]').forEach(b => (b.onclick = () => { col.holes[h] = { score: +b.dataset.pn, sure: true }; close(); render() }))
}

function who({ players, open, me }) {
  const mine = F.cols[F.who.indexOf(players.find(p => p.me).key)]
  const s = toScores(mine, open), g = s.reduce((a, v) => a + (v ?? 0), 0), half = from => s.slice(from, from + 9).reduce((a, v) => a + (v ?? 0), 0)
  const opt = (k, title, sub) => `<button class="pradio ${F.confirmer === k ? 'on' : ''}" data-conf="${k}" aria-pressed="${F.confirmer === k}"><b>${title}</b><span>${sub}</span></button>`
  header('Who’ll confirm your score?', `Your ${g} · Out ${half(0)} · In ${half(9)}`, () => { F.ci = order(players).length - 1; go('check') })
  $('main').innerHTML = `<div class="screen pflow">
    <div class="pradios">${players.filter(p => p.m != null && !p.me).map(p => opt(String(p.m), esc(p.name), 'They’ll get a notice in the app to confirm it')).join('')}
      ${opt('office', 'The club office', 'Hand your card in at the office: they check it against the photo')}</div>
    <p class="hint">You can’t confirm your own score, the same as with a marker on paper.</p>
  </div>
  <div class="cta"><button class="primary" id="pf-save" ${F.confirmer ? '' : 'disabled'}>Save the card</button></div>`
  document.querySelectorAll('[data-conf]').forEach(b => (b.onclick = () => { F.confirmer = b.dataset.conf; render() }))
  $('pf-save').onclick = () => save({ players, open, me })
}

async function resend({ players, open, col }) {
  $('pf-ok').disabled = true
  const round = getRound(), me = players.find(p => p.me), k = round.lineup.findIndex(e => playerKey(e) === me.key)
  round.changed ??= new Set()
  round.entered ??= round.scores.map(r => r.map(() => null))
  toScores(col, open).forEach((v, h) => { if (v != null && v !== round.scores[h][k]) { round.scores[h][k] = v; round.entered[h][k] = me.m; round.changed.add(`${h}:${k}`) } })
  try {
    await api.saveRound(round)
    await api.resendPaperScore(round.id)
  } catch (err) { toast(err.message); $('pf-ok').disabled = false; return }
  const to = round.paper?.confirmer == null ? 'the office' : first(players.find(p => p.m === round.paper.confirmer)?.name ?? 'them')
  if (round.paper) Object.assign(round.paper, { state: 'waiting', note: null })
  await leave()
  toast(`Sent to ${to} again`)
}

async function save({ players, open, me }) {
  $('pf-save').disabled = true
  const round = getRound()
  round.entered ??= round.scores.map(r => r.map(() => null))
  round.changed ??= new Set()
  F.who.forEach((key, i) => {
    const k = key && round.lineup.findIndex(e => playerKey(e) === key)
    if (k == null || k < 0) return
    toScores(F.cols[i], open).forEach((v, h) => {
      if (v == null) return
      round.scores[h][k] = v; round.entered[h][k] = me.id; round.changed.add(`${h}:${k}`)
    })
  })
  for (const h of open) round.done[h] = true
  const confirmer = F.confirmer === 'office' ? null : +F.confirmer
  try {
    await api.saveRound(round)
    for (const [i, shot] of F.shots.entries()) await api.uploadCardPhoto(round.id, i + 1, shot.blob)
    await api.markPaperCard(round.id, F.shots.length, confirmer)
  } catch (err) { toast(err.message); $('pf-save').disabled = false; return }
  const by = confirmer == null ? null : players.find(p => p.m === confirmer)?.name
  await leave()
  toast(by ? `Card saved. ${first(by)} will confirm your score.` : 'Card saved. Hand it in at the office.')
}
