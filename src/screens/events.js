// Admin → Events (every player): events set up in advance — mine and ones I'm in.
// Club admin → Club events (S.evScope 'club'): club-wide events and leagues, set up by admins.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render } from '../ui.js'
import { eventDates, eventLastDay, isoDate, today } from '../dates.js'
import { EVENT_TYPES } from './event-editor.js'
import { toAdmin } from './nav.js'

export async function load() {
  const [events, me] = await Promise.all([api.getEvents(), api.getMe()])
  return { events, me }
}

export const lastDay = eventLastDay
export const canEdit = (e, me) => me.admin || (e.createdBy?.id === me.id && e.startDate > isoDate(today()))

export function draw({ events: all, me }) {
  const club = S.evScope === 'club' && me.admin
  const isClub = e => e.club || e.style === 'league'
  const events = club ? all.filter(isClub) : all.filter(e => !isClub(e) || e.players.includes(me.id))
  header(club ? 'Club events' : 'Events', club ? 'Club-wide events and leagues' : 'Set up matches and competitions in advance', toAdmin)
  const t = isoDate(today())
  const upcoming = events.filter(e => lastDay(e) >= t), done = events.filter(e => lastDay(e) < t).reverse()
  const card = e => {
    const mine = e.createdBy?.id === me.id, playing = e.players.includes(me.id), live = e.startDate <= t && lastDay(e) >= t
    const pills = [
      live ? '<span class="pill" style="background:var(--win)">On now</span>' : '',
      e.club ? '<span class="pill" style="background:var(--loss)">Club event</span>' : '',
      mine ? '<span class="pill">Yours</span>' : playing ? `<span class="pill ghosty">You’re playing${e.createdBy ? ` · set up by ${esc(e.createdBy.name.split(' ')[0])}` : ''}</span>` : '',
      e.style === 'league' ? `<span class="pill ghosty">${e.teams.length} teams · ${e.players.length} players · best ${e.bestOf} count</span>`
        : `<span class="pill ghosty">${e.players.length} players${e.style !== 'individual' ? ` · ${esc(e.A.name)} v ${esc(e.B.name)}` : ''}</span>`,
    ].join('')
    return `<div class="card evcard"><div class="who"><strong>${esc(e.name)}</strong><small>${EVENT_TYPES[e.style].name} · ${e.style === 'league' ? `${e.weeks} weeks from ${eventDates(e.startDate, 1)}` : eventDates(e.startDate, e.days)}</small><div class="pillrow">${pills}</div></div>
      <div class="peacts"><button class="linkbtn" data-view="${e.id}">${lastDay(e) < t ? 'Results' : 'View'}</button>${canEdit(e, me) ? `<button class="linkbtn" data-edit="${e.id}">Edit</button>` : ''}</div></div>`
  }
  $('main').innerHTML = `<div class="screen">
    ${club ? '<div class="bk-btns"><button class="primary" id="newev">+ New club event</button><button class="primary" id="newlg">+ New league</button></div>' : '<button class="primary" id="newev">+ New event</button>'}
    <h3>Coming up</h3>${upcoming.length ? upcoming.map(card).join('') : `<div class="empty-state">${club ? 'No club events or leagues coming up.' : 'No events coming up. Set one up for your group.'}</div>`}
    ${done.length ? `<h3>Finished</h3>${done.map(card).join('')}` : ''}
  </div>`
  const start = async style => { S.ev = null; S.evId = null; S.evStep = 1; S.evNew = style; S.aview = 'event'; await render(); top0() }
  $('newev').onclick = () => start(null)
  const lg = $('newlg')
  if (lg) lg.onclick = () => start('league')
  document.querySelectorAll('[data-edit]').forEach(b => (b.onclick = async () => { S.ev = null; S.evId = +b.dataset.edit; S.evStep = 1; S.aview = 'event'; await render(); top0() }))
  document.querySelectorAll('[data-view]').forEach(b => (b.onclick = async () => { S.evId = +b.dataset.view; S.evDay = 1; S.aview = 'evboard'; await render(); top0() }))
}
