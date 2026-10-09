// Admin → Events (every player): events set up in advance — mine and ones I'm in.
// Club admin → Club events (S.evScope 'club'): club-wide events and leagues, set up by admins.
// Matches set up on the day from the Scores tab (player events) are listed here too, to view or call off,
// and so is today's scorecard, to open or delete.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render, toast } from '../ui.js'
import { buildLibrary } from '../games.js'
import { resetRound } from './scores.js'
import { eventDates, eventLastDay, isoDate, today } from '../dates.js'
import { EVENT_TYPES } from './event-editor.js'
import { toAdmin } from './nav.js'
import { eventTitle, eventSubtitle, stateLine, bindCancel } from './player-events.js'

export async function load() {
  const [events, me, matches, card, members, games] = await Promise.all([api.getEvents(), api.getMe(), api.getMyPlayerEvents(), api.getCurrentRound(), api.getMembers(), api.getGameSettings()])
  const guests = card ? await api.getGuests(card.lineup.filter(x => x.g != null).map(x => x.g)) : []
  // Today's card: the game and who's on it (me first)
  const todayCard = card && {
    id: card.id, mine: card.createdBy === me.id, holes: card.done.filter(Boolean).length,
    game: buildLibrary(games).lib[card.game]?.name ?? 'Scorecard',
    who: card.lineup.map(x => (x.m === me.id ? 'You' : x.m != null ? members.find(m => m.id === x.m)?.name : `${guests.find(g => g.id === x.g)?.name ?? 'Guest'} (guest)`)),
  }
  return { events, me, todayCard, matches: matches.filter(e => e.status === 'pending' || e.status === 'accepted') }
}

export const canEdit = (e, me) => me.admin || (e.createdBy?.id === me.id && e.startDate > isoDate(today()))

export function draw({ events: all, me, matches, todayCard: tc }) {
  const club = S.evScope === 'club' && me.admin
  const isClub = e => e.club
  const events = club ? all.filter(isClub) : all.filter(e => !isClub(e) || e.players.includes(me.id))
  header(club ? 'Club events' : 'Events', club ? 'Club-wide events and leagues' : 'Set up matches and competitions in advance', toAdmin)
  const t = isoDate(today())
  const upcoming = events.filter(e => eventLastDay(e) >= t), done = events.filter(e => eventLastDay(e) < t).reverse()
  const card = e => {
    const mine = e.createdBy?.id === me.id, playing = e.players.includes(me.id), live = e.startDate <= t && eventLastDay(e) >= t
    const pills = [
      live ? '<span class="pill" style="background:var(--win)">On now</span>' : '',
      e.club ? `<span class="pill" style="background:var(--loss)">Club event${e.everyone ? '' : ' · entrants only'}</span>` : '',
      mine ? '<span class="pill">Yours</span>' : playing ? `<span class="pill ghosty">You’re playing${e.createdBy ? ` · set up by ${esc(e.createdBy.name.split(' ')[0])}` : ''}</span>` : '',
      e.style === 'league' ? `<span class="pill ghosty">${e.teams.length} teams · ${e.players.length} players · best ${e.bestOf} count</span>`
        : `<span class="pill ghosty">${e.players.length} players${e.style !== 'individual' ? ` · ${esc(e.A.name)} v ${esc(e.B.name)}` : ''}</span>`,
    ].join('')
    return `<div class="card evcard"><div class="who"><strong>${esc(e.name)}</strong><small>${EVENT_TYPES[e.style].name} · ${e.style === 'league' ? `${e.weeks} weeks from ${eventDates(e.startDate, 1)}` : eventDates(e.startDate, e.days)}</small><div class="pillrow">${pills}</div></div>
      <div class="peacts"><button class="linkbtn" data-view="${e.id}">${eventLastDay(e) < t ? 'Results' : 'View'}</button>${canEdit(e, me) ? `<button class="linkbtn" data-edit="${e.id}">Edit</button>` : ''}</div></div>`
  }
  $('main').innerHTML = `<div class="screen">
    ${club ? '<div class="bk-btns"><button class="primary" id="newev">+ New club event</button><button class="primary" id="newlg">+ New league</button></div>' : '<button class="primary" id="newev">+ New event</button>'}
    ${!club && tc ? `<h3>Today’s card</h3><div class="card evcard"><div class="who"><strong>${esc(tc.game)}</strong><small>${tc.who.map(esc).join(', ')}</small><small class="pestate">${tc.holes ? `${tc.holes} hole${tc.holes > 1 ? 's' : ''} saved` : 'Not started'}</small></div>
      <div class="peacts"><button class="linkbtn" id="card-open">Open</button>${tc.mine ? '<button class="linkbtn" id="card-del">Delete</button>' : ''}</div></div>` : ''}
    ${!club && matches.length ? `<h3>Matches from the Scores tab</h3>${matches.map(e => `<div class="card evcard"><div class="who"><strong>${eventTitle(e)}</strong><small>${eventSubtitle(e)}</small><small class="pestate">${stateLine(e, me)}</small></div>
      <div class="peacts">${e.status === 'accepted' ? `<button class="linkbtn" data-pe-board="${e.id}">Live board</button>` : `<button class="linkbtn" data-pe-scores="${e.id}">Open</button>`}<button class="linkbtn" data-pe-cancel="${e.id}">${e.createdBy.id === me.id ? 'Cancel' : 'Call off'}</button></div></div>`).join('')}` : ''}
    <h3>Coming up</h3>${upcoming.length ? upcoming.map(card).join('') : `<div class="empty-state">${club ? 'No club events or leagues coming up.' : 'No events coming up. Set one up for your group.'}</div>`}
    ${done.length ? `<h3>Finished</h3>${done.map(card).join('')}` : ''}
  </div>`
  const start = async style => { S.ev = null; S.evId = null; S.evStep = 1; S.evNew = style; S.aview = 'event'; await render(); top0() }
  $('newev').onclick = () => start(null)
  const lg = $('newlg')
  if (lg) lg.onclick = () => start('league')
  document.querySelectorAll('[data-edit]').forEach(b => (b.onclick = async () => { S.ev = null; S.evId = +b.dataset.edit; S.evStep = 1; S.aview = 'event'; await render(); top0() }))
  bindCancel()
  if ($('card-open')) $('card-open').onclick = async () => { S.tab = 'scores'; S.sview = 'card'; await render(); top0() }
  if ($('card-del')) $('card-del').onclick = async () => {
    const b = $('card-del')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = tc.holes ? `Sure? ${tc.holes} hole${tc.holes > 1 ? 's' : ''} of scores go too` : 'Sure?'; return }
    b.disabled = true
    await api.deleteRound(tc.id)
    resetRound()
    await render()
    toast('Card deleted')
  }
  document.querySelectorAll('[data-pe-board]').forEach(b => (b.onclick = async () => { S.peId = +b.dataset.peBoard; S.tab = 'scores'; S.sview = 'pevent'; await render(); top0() }))
  document.querySelectorAll('[data-pe-scores]').forEach(b => (b.onclick = async () => { S.peDismissed.delete(+b.dataset.peScores); S.tab = 'scores'; S.sview = 'card'; await render(); top0() }))
  document.querySelectorAll('[data-view]').forEach(b => (b.onclick = async () => { S.evId = +b.dataset.view; S.evDay = 1; S.aview = 'evboard'; await render(); top0() }))
}
