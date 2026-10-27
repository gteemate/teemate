// Scores tab, league entry: "Count today's round?" and the league badges on each player.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, keepScroll, render, toast } from '../ui.js'
import { today, isoDate, leagueWeek } from '../dates.js'

// The card on the Scores tab, as passed in by the two exported functions (the sheet and its
// buttons keep working on it after they return).
let round

// League entry: before hole 1 the card keeper is asked, once, whether today's round counts for each
// league player on the card (one entered round a week each). Entering is final: that's the player's go for the
// week, even if the card is deleted; only the club office can take them out. Players whose round counts get a
// badge on the card; a league player not yet entered can still be entered by tapping theirs before hole 1.
const initials = name => name.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('').slice(0, 3)
const leagueWeekNow = e => leagueWeek(e, isoDate(today()))
const entered = (entries, e, id) => round.id != null && entries.some(x => x.eventId === e.id && x.memberId === id && x.roundId === round.id)
const enteredElsewhere = (entries, e, id) => !entered(entries, e, id) && entries.some(x => x.eventId === e.id && x.memberId === id && x.week === leagueWeekNow(e))
const settled = (entries, e, id) => entered(entries, e, id) || enteredElsewhere(entries, e, id) // nothing left to ask
const leaguePlayers = e => round.lineup.filter(x => x.m != null && e.players.includes(x.m)).map(x => x.m)

// Counting: a solid badge. Before hole 1, league players get a badge to tap (outlined if not
// counting) that reopens the question; after that only the counting ones show, and can't change.
export function leagueBadges(card, memberId, leagues, entries) {
  round = card
  if (memberId == null) return ''
  const started = round.done.some(Boolean)
  return leagues.filter(e => e.players.includes(memberId)).map(e => {
    const on = entered(entries, e, memberId), tag = esc(initials(e.name))
    if (started || settled(entries, e, memberId)) return on ? `<span class="pill wlpill on" title="This round counts for ${esc(e.name)}">${tag}</span>` : ''
    return `<button class="pill wlpill ${on ? 'on' : 'off'}" data-lgask aria-label="${on ? 'Counting for' : 'Not counting for'} ${esc(e.name)}. Change">${tag}</button>`
  }).join('')
}

// Answered (or put off) per card in this visit; answered also remembered on this phone.
const askedKey = () => `teemate.lgAsked.${round.id}`
function answered() {
  if (S.lgLater === round) return true
  try { return round.id != null && localStorage.getItem(askedKey()) === '1' } catch { return false }
}
function markAnswered() { markLeagueAsked(round.id) }
/** The card's league question has been answered (on Scoring round?), so the sheet doesn't pop up again. */
export function markLeagueAsked(roundId) { try { localStorage.setItem(`teemate.lgAsked.${roundId}`, '1') } catch { /* fine: it asks again */ } }

function leagueSheet(leagues, entries, members) {
  const list = leagues.filter(e => leaguePlayers(e).length)
  const ans = S.lgAns
  const name = id => members.find(m => m.id === id)?.name ?? ''
  const askable = list.flatMap(e => leaguePlayers(e).filter(id => !settled(entries, e, id)).map(id => `${e.id}:${id}`))
  const ready = askable.every(k => ans[k] != null)
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet lgsheet" role="dialog" aria-labelledby="lgq">
    ${list.map(e => `<span class="kicker">🏆 ${esc(e.name)} · Week ${leagueWeekNow(e)}</span>`).join('')}
    <h4 id="lgq">Count today's round?</h4>
    <p class="hint">Their Stableford score goes towards their team's total for the week. Only one round a week counts, and once entered it's final: only the club office can change it.</p>
    ${askable.length > 1 ? `<button class="ghost" id="lg-all">Yes for everyone</button>` : ''}
    ${list.map(e => leaguePlayers(e).map(id => {
      const team = e.teams?.[e.team?.[id]]?.name, me = id === round.lineup[0].m
      if (entered(entries, e, id)) return `<div class="ask prev"><span class="av">${ini(name(id))}</span><span class="who"><strong>${esc(name(id))}${me ? ' (you)' : ''}</strong><small>${team ? esc(team) + ' · ' : ''}counting this round: entered for the week</small></span></div>`
      if (enteredElsewhere(entries, e, id)) return `<div class="ask prev"><span class="av">${ini(name(id))}</span><span class="who"><strong>${esc(name(id))}</strong><small>${team ? esc(team) + ' · ' : ''}already counted a round this week</small></span></div>`
      const k = `${e.id}:${id}`
      return `<div class="ask"><span class="av">${ini(name(id))}</span><span class="who"><strong>${esc(name(id))}${me ? ' (you)' : ''}</strong><small>${team ? esc(team) : ''}</small></span>
        <div class="yn"><button class="yes" data-yn="${k}" data-v="1" aria-pressed="${ans[k] === true}">Yes, count it</button><button class="no" data-yn="${k}" data-v="0" aria-pressed="${ans[k] === false}">Not this one</button></div></div>`
    }).join('')).join('')}
    <div class="gm-btns"><button type="button" class="ghost" id="lg-later">Ask me later</button><button class="primary" id="lg-done" ${ready ? '' : 'disabled'}>Done</button></div>
    ${askable.length ? `<span class="hint" style="text-align:center">“Not this one” can still be changed with the ${esc(list.map(e => initials(e.name)).join('/'))} badge until hole 1 is saved.</span>` : ''}
  </div></div>`
  const redraw = () => leagueSheet(leagues, entries, members)
  document.querySelectorAll('[data-yn]').forEach(b => (b.onclick = () => { ans[b.dataset.yn] = b.dataset.v === '1'; redraw() }))
  if ($('lg-all')) $('lg-all').onclick = () => { askable.forEach(k => (ans[k] = true)); redraw() }
  const close = () => { S.lgOpenSheet = false; $('modal').innerHTML = '' }
  $('lg-later').onclick = () => { S.lgLater = round; close(); keepScroll(render) }
  $('ovl').onclick = e => { if (e.target.id === 'ovl') { S.lgLater = round; close(); keepScroll(render) } }
  $('lg-done').onclick = async () => {
    $('lg-done').disabled = true
    try {
      if (!round.id) await api.saveRound(round) // the card needs to exist to be entered
      for (const e of list) {
        const ids = leaguePlayers(e).filter(id => ans[`${e.id}:${id}`] != null)
        const yes = ids.filter(id => ans[`${e.id}:${id}`] && !entered(entries, e, id))
        if (yes.length) await api.enterLeague(round.id, e.id, yes)
      }
    } catch (err) {
      toast(err.message)
      $('lg-done').disabled = false
      return
    }
    markAnswered()
    close()
    const n = Object.values(ans).filter(Boolean).length
    await keepScroll(render)
    toast(n ? `${n} counting for the league this week` : 'Not counting this round')
  }
}

export function bindLeagueBox(card, leagues, entries, members) {
  round = card
  if (!leagues.some(e => leaguePlayers(e).length) || round.done.some(Boolean)) return
  const open = () => {
    // start from what's saved: entered = yes; asked before and not entered = no
    S.lgAns = {}
    for (const e of leagues) for (const id of leaguePlayers(e)) if (!settled(entries, e, id) && answered() && S.lgLater !== round) S.lgAns[`${e.id}:${id}`] = false
    S.lgOpenSheet = true
    leagueSheet(leagues, entries, members)
  }
  document.querySelectorAll('[data-lgask]').forEach(b => (b.onclick = open))
  // Ask straight away on a fresh card, unless everyone has already counted a round this week.
  const anyAskable = leagues.some(e => leaguePlayers(e).some(id => !settled(entries, e, id)))
  if (S.lgOpenSheet || (anyAskable && !answered() && !leagues.some(e => leaguePlayers(e).some(id => entered(entries, e, id))))) open()
}
