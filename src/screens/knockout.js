// A knockout competition's draw (sign-up competitions, step 2). Players in it see the published draw: their next
// match at the top (opponent, play-by date, Book this match, Enter result / Confirm / That's not right), then the
// rounds one at a time, or the whole draw side by side. Admins also make the draw (swap any two, play-by dates,
// publish) and set any result or walkover.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast, top0 } from '../ui.js'
import { eventDates, isoDate, today } from '../dates.js'
import { roundName, myNextMatch, matchState, entryName, champion } from '../knockout.js'

export async function load() {
  const [signups, me, members] = await Promise.all([api.getSignups(), api.getMe(), api.getMembers()])
  const comp = signups.comps.find(c => c.id === S.koComp)
  if (!comp) return { comp: null }
  const ko = await api.getKnockout(comp.id)
  const mine = signups.entries.find(e => e.compId === comp.id && (e.memberId === me.id || e.partnerId === me.id)) ?? null
  return { comp, me, members, ...ko, mine }
}

const RESULTS = ['1 up', '2&1', '3&2', '4&3', '5&4', 'At the 19th', 'Conceded']

export function draw({ comp, me, members, matches = [], entries = [], mine }) {
  const back = async () => { S.aview = S.koFrom ?? 'comp'; await render(); top0() }
  if (!comp) { header('Competition', '', back); $('main').innerHTML = '<div class="screen"><div class="empty-state">This competition is no longer available.</div></div>'; return }
  const rounds = Math.max(0, ...matches.map(m => m.round))
  const name = id => entryName(id, entries, members)
  const champ = champion(matches, rounds)
  header(esc(comp.name), champ ? `Champion: <b>${esc(name(champ))}</b>` : matches.length ? (comp.drawPublished ? 'The draw' : 'Draft draw: only admins see it') : 'No draw yet', back)
  const date = isoDate(today())
  const by = r => comp.roundDeadlines[r - 1]
  const next = mine ? myNextMatch(matches, mine.id) : null
  const round = Math.min(Math.max(1, S.koRound ?? next?.round ?? 1), rounds || 1)

  // A match line: both sides (winner gold, mine highlighted) and where it stands.
  const side = (m, id, byeSide) => `<div class="kos${m.winnerEntry === id && id != null && (m.status === 'confirmed' || m.status === 'bye') ? ' won' : ''}${mine && id === mine.id ? ' me' : ''}">${esc(entryName(id, entries, members, byeSide))}</div>`
  const state = m => m.status === 'bye' ? 'Bye' : m.status === 'confirmed' ? `${esc(name(m.winnerEntry))} won${m.result ? ` ${esc(m.result)}` : ''}`
    : m.status === 'reported' ? 'Result entered: waiting for the other side to confirm' : m.status === 'disputed' ? 'Result questioned: with the competition secretary'
    : by(m.round) ? `To play by ${eventDates(by(m.round), 1)}` : 'To play'
  const card = m => `<div class="card kom${next && m.id === next.id ? ' mine' : ''}" data-km="${m.id}">${side(m, m.aEntry)}${side(m, m.bEntry, m.status === 'bye')}
    <span class="hint">${state(m)}</span>${me.admin && comp.drawPublished && m.aEntry != null && m.bEntry != null ? `<button class="linkbtn" data-kset="${m.id}">${m.status === 'confirmed' ? 'Correct result' : 'Set result'}</button>` : ''}</div>`

  // My next match: opponent, play-by date and what to do now.
  let top = ''
  if (next && comp.drawPublished) {
    const opp = next.aEntry === mine.id ? next.bEntry : next.aEntry, st = matchState(next, mine.id)
    const act = st === 'report' ? '<button class="primary sm" id="ko-book">Book this match</button><button class="ghost sm" id="ko-report">Enter result</button>'
      : st === 'confirm' ? `<span class="hint">They’ve entered: <b>${esc(name(next.winnerEntry))} won ${esc(next.result ?? '')}</b></span><button class="primary sm" id="ko-confirm">Confirm</button><button class="ghost sm" id="ko-dispute">That’s not right</button>`
      : st === 'reported' ? '<span class="hint">You’ve entered the result: waiting for them to confirm.</span>'
      : st === 'disputed' ? '<span class="hint">The result has been questioned: the competition secretary will settle it.</span>'
      : '<span class="hint">Your opponent isn’t known yet.</span>'
    top = `<div class="card kotop"><span class="kicker">Your next match · ${roundName(next.round, rounds)}</span>
      <b class="kovs">v ${esc(name(opp))}</b><span class="hint">${by(next.round) ? `Play by ${eventDates(by(next.round), 1)}` : ''}</span><div class="koact">${act}</div></div>`
  } else if (mine && comp.drawPublished && rounds) top = `<div class="card kotop"><span class="kicker">Your draw</span><b class="kovs">${champ === mine.id ? 'You’re the champion!' : 'Your run is over this year. The draw carries on below.'}</b></div>`

  // Admin, before publishing: make or remake the draw, swap two, play-by dates, publish.
  const admin = me.admin && !comp.drawPublished ? `<div class="card evsec"><b>${matches.length ? 'Draft draw' : 'Make the draw'}</b>
      <span class="hint">${matches.length ? 'Only admins see this. Tap two names to swap them. Set a play-by date for each round, then publish: everyone in it is shown their first match.' : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}. The draw places them at random; byes go straight through to round 2.`}</span>
      ${matches.length ? `<div class="kodates">${Array.from({ length: rounds }, (_, i) => `<label>${roundName(i + 1, rounds)}<input type="date" class="plainsel" data-kd="${i}" value="${comp.roundDeadlines[i] ?? ''}"></label>`).join('')}</div>` : ''}
      <div class="bk-btns"><button class="${matches.length ? 'ghost' : 'primary'}" id="ko-make">${matches.length ? 'Draw again' : 'Make the draw'}</button>${matches.length ? '<button class="primary" id="ko-pub">Publish the draw</button>' : ''}</div></div>` : ''

  const view = S.koView === 'all' ? 'all' : 'round'
  const body = !rounds ? '' : view === 'all'
    ? `<div class="kogrid">${Array.from({ length: rounds }, (_, i) => `<div class="kocol"><span class="kicker">${roundName(i + 1, rounds)}</span>${matches.filter(m => m.round === i + 1).map(card).join('')}</div>`).join('')}</div>`
    : `<div class="tabs-pill" role="group" aria-label="Round">${Array.from({ length: rounds }, (_, i) => `<button data-kr="${i + 1}" aria-pressed="${round === i + 1}">${roundName(i + 1, rounds)}</button>`).join('')}</div>
       ${matches.filter(m => m.round === round).map(card).join('')}`
  $('main').innerHTML = `<div class="screen">${top}${admin}
    ${rounds ? `<div class="seg" role="group" aria-label="Show"><button data-kv="round" aria-pressed="${view === 'round'}">By round</button><button data-kv="all" aria-pressed="${view === 'all'}">Whole draw</button></div>` : ''}
    ${champ ? `<div class="card kochamp"><span class="kicker">${new Date().getFullYear()} champion</span><b>${esc(name(champ))}</b></div>` : ''}
    ${body}</div>`

  const again = () => keepScroll(render)
  const act = async (f, ok) => { try { await f() } catch (err) { toast(err.message); return } ; await again(); if (ok) toast(ok) }
  document.querySelectorAll('[data-kr]').forEach(b => (b.onclick = () => { S.koRound = +b.dataset.kr; again() }))
  document.querySelectorAll('[data-kv]').forEach(b => (b.onclick = () => { S.koView = b.dataset.kv; again() }))
  if ($('ko-make')) $('ko-make').onclick = () => act(() => api.makeDraw(comp.id), 'Draw made')
  if ($('ko-pub')) $('ko-pub').onclick = async () => {
    const b = $('ko-pub')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: everyone in it sees the draw'; return }
    await act(() => api.publishDraw(comp.id), 'The draw is out')
  }
  document.querySelectorAll('[data-kd]').forEach(i => (i.onchange = () => {
    const dates = [...document.querySelectorAll('[data-kd]')].map(x => x.value || null)
    act(() => api.setRoundDeadlines(comp.id, dates), 'Play-by dates saved')
  }))
  // Swap two names in a draft draw: tap one, then the other.
  if (me.admin && !comp.drawPublished) document.querySelectorAll('.kos').forEach((el, n) => {
    const m = matches.find(x => x.id === +el.closest('[data-km]').dataset.km), id = el.parentElement.children[0] === el ? m.aEntry : m.bEntry
    if (id == null) return
    el.setAttribute('role', 'button'); el.tabIndex = 0
    el.classList.toggle('picked', S.koSwap === id)
    el.onclick = () => {
      if (S.koSwap == null || S.koSwap === id) { S.koSwap = S.koSwap === id ? null : id; return again() }
      const x = S.koSwap; S.koSwap = null
      act(() => api.swapDraw(comp.id, x, id), 'Swapped')
    }
  })
  if ($('ko-report')) $('ko-report').onclick = () => resultSheet(next, name, (w, r) => api.reportKoResult(next.id, w, r), 'Result sent: they confirm it')
  if ($('ko-confirm')) $('ko-confirm').onclick = () => act(() => api.confirmKoResult(next.id), 'Confirmed')
  if ($('ko-dispute')) $('ko-dispute').onclick = async () => {
    const b = $('ko-dispute')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: the secretary settles it'; return }
    await act(() => api.disputeKoResult(next.id), 'Sent to the competition secretary')
  }
  document.querySelectorAll('[data-kset]').forEach(b => (b.onclick = () => {
    const m = matches.find(x => x.id === +b.dataset.kset)
    resultSheet(m, name, (w, r) => api.adminSetKoResult(m.id, w, r), 'Result set')
  }))
  if ($('ko-book')) $('ko-book').onclick = async () => {
    // The tee sheet with the other players in this match added (my partner and theirs).
    const opp = entries.find(e => e.id === (next.aEntry === mine.id ? next.bEntry : next.aEntry))
    const others = [mine.memberId, mine.partnerId, opp?.memberId, opp?.partnerId].filter(x => x != null && x !== me.id)
    Object.assign(S, { tab: 'home', aview: 'tee', matchPick: others, filter: others.length >= 2 ? '4' : '2', reqMode: false, day: 0 })
    await render(); top0()
  }
}

// Who won and how (players report it; admins set or correct it).
function resultSheet(m, name, send, ok) {
  let winner = null, how = ''
  const sheet = () => `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="krt">
    <h4 id="krt">Who won?</h4>
    <div class="games" role="radiogroup" aria-label="Who won">${[m.aEntry, m.bEntry].map(id => `<button class="gamecard sm" role="radio" aria-checked="${winner === id}" data-kw="${id}"><span class="radio"></span><span class="who"><strong>${esc(name(id))}</strong></span></button>`).join('')}</div>
    <label>How</label><div class="chips">${RESULTS.map(r => `<button class="chip" data-kh="${r}" aria-pressed="${how === r}">${r}</button>`).join('')}</div>
    <div class="gm-btns"><button type="button" class="ghost" id="kr-no">Cancel</button><button class="primary" id="kr-go" ${winner && how ? '' : 'disabled'}>Save result</button></div>
  </div></div>`
  const draw = () => {
    $('modal').innerHTML = sheet()
    $('kr-no').onclick = () => { $('modal').innerHTML = '' }
    $('ovl').onclick = e => { if (e.target.id === 'ovl') $('modal').innerHTML = '' }
    document.querySelectorAll('[data-kw]').forEach(b => (b.onclick = () => { winner = +b.dataset.kw; draw() }))
    document.querySelectorAll('[data-kh]').forEach(b => (b.onclick = () => { how = b.dataset.kh; draw() }))
    $('kr-go').onclick = async () => {
      $('kr-go').disabled = true
      try { await send(winner, how) } catch (err) { toast(err.message); $('kr-go').disabled = false; return }
      $('modal').innerHTML = ''; await keepScroll(render); toast(ok)
    }
  }
  draw()
}
