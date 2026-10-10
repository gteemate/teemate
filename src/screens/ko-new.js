// A knockout set up by a member (Competitions → Events → + Create your own event → A knockout): a name, singles or
// pairs, the players (or pairs) they pick, and when the final has to be played by. Made, drawn at random and
// published in one step; everyone picked sees it under Entered.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, render, toast, top0 } from '../ui.js'
import { addDaysIso, isoDate, today } from '../dates.js'
import { spreadDates } from '../knockout.js'

export async function load() {
  const [members, friends, me] = await Promise.all([api.getMembers(), api.getFriends(), api.getMe()])
  return { members, friends, me }
}

// The form, kept while the page redraws (search, picks).
const F = () => (S.koNew ??= { name: '', kind: 'singles', picked: [], pairs: [], q: '', finish: '' })

export function draw({ members, friends, me }) {
  const f = F()
  const back = async () => { S.koNew = null; S.aview = 'comp'; await render(); top0() }
  header('New knockout', 'You pick the players; the draw is random', back)
  const fav = new Set(friends.buddies.filter(b => b.favourite).map(b => b.id)), mine = new Set(friends.buddies.map(b => b.id))
  const inPair = id => f.pairs.some(p => p.includes(id))
  const chosen = id => f.picked.includes(id) || inPair(id)
  const q = f.q.trim().toLowerCase()
  const list = (q ? members.filter(m => m.name.toLowerCase().includes(q)) : members.filter(m => m.id === me.id || mine.has(m.id)))
    .sort((a, b) => (b.id === me.id) - (a.id === me.id) || fav.has(b.id) - fav.has(a.id) || a.name.localeCompare(b.name)).slice(0, 40)
  const name = id => members.find(m => m.id === id)?.name ?? 'A member'
  const n = f.kind === 'pairs' ? f.pairs.length : f.picked.length
  const half = f.kind === 'pairs' && f.picked.length === 1 ? name(f.picked[0]) : null
  const finishMin = addDaysIso(isoDate(today()), 7)
  $('main').innerHTML = `<div class="screen">
    <div class="card evsec">
      <label for="kn-name">Name</label><input id="kn-name" class="plainsel" maxlength="60" autocomplete="off" placeholder="e.g. Friday Knockout" value="${esc(f.name)}">
      <div class="seg" role="group" aria-label="Singles or pairs"><button data-kk="singles" aria-pressed="${f.kind === 'singles'}">Singles</button><button data-kk="pairs" aria-pressed="${f.kind === 'pairs'}">Pairs</button></div>
      <label for="kn-fin">Final played by</label><input id="kn-fin" type="date" class="plainsel" min="${finishMin}" value="${f.finish}">
      <span class="hint">The rounds’ play-by dates are spread evenly up to this.</span>
    </div>
    ${f.kind === 'pairs' && f.pairs.length ? `<span class="kicker">Pairs (${f.pairs.length})</span><div class="card list">${f.pairs.map((p, i) => `<div class="lrow hutrow"><span class="who"><strong>${esc(name(p[0]))} & ${esc(name(p[1]))}</strong></span><button class="x" data-unpair="${i}" aria-label="Remove this pair">×</button></div>`).join('')}</div>` : ''}
    <span class="kicker">${f.kind === 'pairs' ? (half ? `Pick ${esc(half)}’s partner` : 'Pick a pair: tap two players') : `Players (${n} picked)`}</span>
    <div class="search"><input id="kn-q" type="search" autocomplete="off" placeholder="Search members" value="${esc(f.q)}"></div>
    <div class="pick">${list.map(m => `<button class="brow" data-kp="${m.id}" aria-pressed="${chosen(m.id)}" ${inPair(m.id) ? 'disabled' : ''}><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</strong></span><span class="chev">${chosen(m.id) ? '✓' : '+'}</span></button>`).join('') || '<div class="empty-state">No member matches.</div>'}</div>
    <p class="gerr" id="kn-err" role="alert"></p>
  </div>
  <div class="cta"><div class="tot">${n} ${f.kind === 'pairs' ? `pair${n === 1 ? '' : 's'}` : `player${n === 1 ? '' : 's'}`}<b>${n >= 2 ? 'Ready to draw' : 'Pick at least 2'}</b></div><button class="primary" id="kn-go" ${n >= 2 ? '' : 'disabled'}>Make the draw</button></div>`

  const keep = () => { f.name = $('kn-name').value; f.finish = $('kn-fin').value }
  document.querySelectorAll('[data-kk]').forEach(b => (b.onclick = () => { keep(); f.kind = b.dataset.kk; f.picked = []; f.pairs = []; render() }))
  document.querySelectorAll('[data-kp]').forEach(b => (b.onclick = () => {
    keep()
    const id = +b.dataset.kp
    if (f.kind === 'singles') f.picked = f.picked.includes(id) ? f.picked.filter(x => x !== id) : [...f.picked, id]
    else if (f.picked.includes(id)) f.picked = []
    else if (f.picked.length === 1) { f.pairs.push([f.picked[0], id]); f.picked = [] }
    else f.picked = [id]
    render()
  }))
  document.querySelectorAll('[data-unpair]').forEach(b => (b.onclick = () => { keep(); f.pairs.splice(+b.dataset.unpair, 1); render() }))
  const qi = $('kn-q')
  qi.oninput = () => { keep(); f.q = qi.value; S.knCaret = qi.selectionStart; render() }
  if (S.knCaret != null) { qi.focus(); qi.setSelectionRange(S.knCaret, S.knCaret); S.knCaret = null }
  $('kn-go').onclick = async () => {
    keep()
    const entries = f.kind === 'pairs' ? f.pairs : f.picked.map(id => [id])
    const rounds = Math.ceil(Math.log2(entries.length))
    const err = !f.name.trim() ? 'Give it a name.' : !f.finish ? 'Pick when the final has to be played by.' : f.finish < finishMin ? 'Give it at least a week.' : ''
    if (err) { $('kn-err').textContent = err; return }
    $('kn-go').disabled = true
    let id
    try { id = await api.createMemberKnockout(f.name, f.kind, entries, spreadDates(isoDate(today()), f.finish, rounds)) } catch (er) { $('kn-err').textContent = er.message; $('kn-go').disabled = false; return }
    S.koNew = null
    Object.assign(S, { koComp: id, koRound: null, koFrom: 'comp', aview: 'ko', compTab: 'entered' })
    await render(); top0()
    toast(`${f.name.trim()} is drawn: everyone in it can see their first match`)
  }
}
