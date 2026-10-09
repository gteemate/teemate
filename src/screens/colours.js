// Account → Club name & colours: the club name on the membership card, two hex codes that theme
// the whole app for everyone (colour changes preview live), and the course location for the weather on Home.
import * as api from '../api.js'
import { $, esc, header, render, toast } from '../ui.js'
import { DEFAULT_THEME, applyTheme, isHex } from '../theme.js'
import { toAdmin } from './nav.js'
import { searchPlaces } from '../weather.js'

export async function load() {
  return { saved: await api.getTheme() }
}

export function draw({ saved }) {
  const leave = () => { applyTheme(saved); toAdmin() } // undo any unsaved preview
  header('Club name &amp; colours', 'The name on everyone’s membership card, and the app’s colours', leave)
  const row = (id, label, sub, v) => `<label for="${id}-hex">${label}</label><span class="hint">${sub}</span>
    <div class="colrow"><input type="color" id="${id}-pick" value="${v}" aria-label="${label} picker"><input type="text" id="${id}-hex" class="plainsel" value="${v}" maxlength="7" autocomplete="off" spellcheck="false"></div>`
  $('main').innerHTML = `<div class="screen">
    <div class="card evsec">
      <label for="club-name">Club name</label><span class="hint">Shown at the top of every member’s card on Home. Leave it blank to show nothing.</span>
      <input type="text" id="club-name" class="plainsel" value="${esc(saved.name ?? '')}" maxlength="60" autocomplete="off" placeholder="e.g. Royal Example Golf Club">
      ${row('main', 'Main colour', 'Buttons, header cards, selected days and options', saved.main)}
      ${row('accent', 'Accent colour', 'The selected tab, highlights and “they won the hole”', saved.accent)}
      <p class="gerr" id="cerr" role="alert"></p>
      <div class="bk-btns"><button class="ghost" id="reset">TeeMate defaults</button><button class="primary" id="csave">Save for everyone</button></div>
    </div>
    <div class="card evsec" id="locsec">
      <label for="loc-q">Course location</label>
      <span class="hint">For the wind and rain at the top of Home. ${saved.coursePlace ? `Now: <b>${esc(saved.coursePlace)}</b> <button class="linkbtn" id="loc-clear">Clear</button>` : 'Not set, so no weather on Home.'}</span>
      <div class="colrow"><input type="search" id="loc-q" class="plainsel" autocomplete="off" placeholder="Town or postcode, e.g. Portrush"><button class="ghost" id="loc-find">Find</button></div>
      <div class="card list" id="loc-res" hidden></div>
    </div>
    <h3>Preview</h3>
    <div class="card preview">
      <div class="darkcard"><div><small>Autumn Cup</small><b>Blues 2½ – 1½</b></div><span class="live">Live</span></div>
      <div class="row"><button class="primary" style="flex:0 0 auto;padding:12px 18px">Confirm booking</button><span class="pill">2 shots</span><span class="result-pill W">Your pair wins</span><span class="result-pill L">They win</span></div>
      <div class="pslot filled"><span class="av">GC</span><span class="who"><strong>Selected player</strong><small>Highlighted card</small></span><span></span></div>
      <div class="tabs-demo"><b>Home</b><span>Scores</span><span>Leaderboard</span><span>Course</span></div>
    </div>
    <div class="hint">Text on your colours switches between dark and light automatically so it stays readable. Dark mode uses lighter versions of both.</div>
  </div>`

  const current = () => ({ main: $('main-hex').value.trim().toUpperCase(), accent: $('accent-hex').value.trim().toUpperCase() })
  const preview = () => {
    const t = current()
    const bad = ['main', 'accent'].filter(k => !isHex(t[k]))
    $('cerr').textContent = bad.length ? 'Use 6-digit hex codes like #19335A.' : ''
    if (!bad.length) applyTheme(t)
  }
  for (const k of ['main', 'accent']) {
    $(`${k}-pick`).oninput = e => { $(`${k}-hex`).value = e.target.value.toUpperCase(); preview() }
    $(`${k}-hex`).oninput = e => {
      let v = e.target.value.trim()
      if (v && !v.startsWith('#')) { v = '#' + v; e.target.value = v } // people often paste codes without the #
      if (isHex(v)) $(`${k}-pick`).value = v
      preview()
    }
  }
  $('reset').onclick = () => {
    for (const k of ['main', 'accent']) { $(`${k}-hex`).value = DEFAULT_THEME[k]; $(`${k}-pick`).value = DEFAULT_THEME[k] }
    preview()
  }
  // Course location: search, tap a result to save it.
  const saveLoc = async (lat, lon, place) => {
    try { await api.setCourseLocation(lat, lon, place) } catch (err) { toast(err.message); return }
    await render()
    toast(place ? 'Course location saved' : 'Course location cleared')
  }
  const find = async () => {
    const box = $('loc-res')
    let found
    try { found = await searchPlaces($('loc-q').value) } catch (err) { toast(err.message); return }
    box.hidden = false
    box.innerHTML = found.length
      ? found.map((r, n) => `<button class="brow" data-loc="${n}"><span class="who"><strong>${esc(r.name)}</strong><small>${esc(r.detail)}</small></span><span class="chev">›</span></button>`).join('')
      : '<div class="empty-state">No places match. Try the nearest town.</div>'
    box.querySelectorAll('[data-loc]').forEach(b => (b.onclick = () => {
      const r = found[+b.dataset.loc]
      saveLoc(r.lat, r.lon, [r.name, r.detail].filter(Boolean).join(', '))
    }))
  }
  $('loc-find').onclick = find
  $('loc-q').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find() } }
  if ($('loc-clear')) $('loc-clear').onclick = () => saveLoc(null, null, null)

  $('csave').onclick = async () => {
    const t = current()
    if (!isHex(t.main) || !isHex(t.accent)) { preview(); return }
    $('csave').disabled = true
    try {
      const name = $('club-name').value.trim()
      if (name !== (saved.name ?? '')) await api.setClubName(name)
      await api.setTheme(t.main, t.accent)
    } catch (err) {
      $('cerr').textContent = err.message
      $('csave').disabled = false
      return
    }
    applyTheme(t)
    await render()
    toast('Club name and colours saved for everyone')
  }
}
