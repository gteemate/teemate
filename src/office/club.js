// Club office → Club: the settings set once and changed now and then. Each opens the page that already does it,
// plus the office login itself (the email the iPad signs in with).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast, top0 } from '../ui.js'
import { isoDate, today } from '../dates.js'
import { panel } from './shell.js'

export async function load() {
  const [theme, pins, hut, staff, access, points, me] = await Promise.all([api.getTheme(), api.getPins(), api.getHut(), api.getHutStaff(), api.getAccessList(), api.getGuestPoints(), api.getMe()])
  return { theme, pinsToday: pins.date === isoDate(today()), pinsBy: pins.setBy, hut, staff: staff.length, office: access.find(m => m.office) ?? null, allowance: points.allowance, me }
}

export function draw({ theme, pinsToday, pinsBy, hut, staff, office, allowance, me }) {
  header('Club', 'Settings you set once and change now and then')
  const row = (k, title, sub, btn, primary) => `<div class="orow"><span class="ot"><b>${title}</b><span>${sub}</span></span><span class="oacts"><button class="${primary ? 'primary' : 'ghost'} sm" data-o-open="${k}">${btn}</button></span></div>`
  $('main').innerHTML = `<div class="screen office">
    <div class="card olist">
      ${row('colours', 'Name, colours and course', `${esc(theme?.name || 'No name yet')}${theme?.coursePlace ? ` · weather for ${esc(theme.coursePlace)}` : ' · no course location yet'}`, 'Edit')}
      ${row('pins', 'Pins', pinsToday ? `Set today by ${esc(pinsBy)}` : '<span class="owarn">Not set today</span>', pinsToday ? 'Change' : 'Set today’s flags', !pinsToday)}
      ${row('hutadmin', 'Halfway hut', `${hut.on ? 'Taking orders' : 'Off'} · ${hut.menu.length} on the menu · ${staff} staff`, 'Edit')}
      ${row('points', 'Guest points', `${allowance} a year for each member · see everyone’s balance`, 'Open')}
    </div>
    <h3>The office login</h3>
    <div class="card olist"><div class="orow"><span class="ot"><b>${office?.email ? esc(office.email) : 'Not set up'}</b><span>${office?.email ? (office.signedIn ? 'Signed in on the club’s iPad or computer' : 'Approved: create the account on the sign-in screen with this email') : 'An account for the club’s iPad or computer that opens straight here and never shows up as a player'}</span></span>
      ${me.office ? '' : `<span class="oacts"><button class="ghost sm" id="o-office">${office?.email ? 'Change' : 'Set up'}</button></span>`}</div></div>
    ${me.office ? '<p class="hint">To change the office login, ask an admin to do it from their own account.</p>' : ''}
  </div>`
  document.querySelectorAll('[data-o-open]').forEach(b => (b.onclick = async () => { S.aview = b.dataset.oOpen; await render(); top0() }))
  if ($('o-office')) $('o-office').onclick = () => {
    const close = panel(`<h4>The office login</h4><p class="hint">Use an email for the club (e.g. the office or the secretary’s club address), not a member’s own. Then create the account on the sign-in screen with it.</p>
      <label for="o-oemail">Email</label><input id="o-oemail" type="email" inputmode="email" autocomplete="off" value="${esc(office?.email ?? '')}" placeholder="office@yourclub.ie">
      <p class="gerr" id="o-err" role="alert"></p><div class="gm-btns">${office?.email ? '<button class="ghost" id="o-orem">Remove</button>' : ''}<button class="primary" id="o-osave">Save</button></div>`)
    const save = async (email, msg) => {
      try { await api.setOfficeLogin(email) } catch (err) { $('o-err').textContent = err.message; return }
      close(); await keepScroll(render); toast(msg)
    }
    $('o-osave').onclick = () => { const v = $('o-oemail').value.trim(); if (!v) { $('o-err').textContent = 'Enter an email.'; return } save(v, 'Saved: create the account with that email') }
    if ($('o-orem')) $('o-orem').onclick = () => save('', 'Office login removed')
  }
}
