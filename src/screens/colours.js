// Admin → Club colours: two hex codes theme the whole app for everyone. Changes preview live.
import * as api from '../api.js'
import { $, header, render, toast } from '../ui.js'
import { DEFAULT_THEME, applyTheme, isHex } from '../theme.js'
import { toAdmin } from './nav.js'

export async function load() {
  return { saved: await api.getTheme() }
}

export function draw({ saved }) {
  const leave = () => { applyTheme(saved); toAdmin() } // undo any unsaved preview
  header('Club colours', 'Theme the whole app for everyone', leave)
  const row = (id, label, sub, v) => `<label for="${id}-hex">${label}</label><span class="hint">${sub}</span>
    <div class="colrow"><input type="color" id="${id}-pick" value="${v}" aria-label="${label} picker"><input type="text" id="${id}-hex" class="plainsel" value="${v}" maxlength="7" autocomplete="off" spellcheck="false"></div>`
  $('main').innerHTML = `<div class="screen">
    <div class="card evsec">
      ${row('main', 'Main colour', 'Buttons, header cards, selected days and options', saved.main)}
      ${row('accent', 'Accent colour', 'The selected tab, highlights and “they won the hole”', saved.accent)}
      <p class="gerr" id="cerr" role="alert"></p>
      <div class="bk-btns"><button class="ghost" id="reset">TeeMates defaults</button><button class="primary" id="csave">Save for everyone</button></div>
    </div>
    <h3>Preview</h3>
    <div class="card preview">
      <div class="darkcard"><div><small>Autumn Cup</small><b>Blues 2½ – 1½</b></div><span class="live">Live</span></div>
      <div class="row"><button class="primary" style="flex:0 0 auto;padding:12px 18px">Confirm booking</button><span class="pill">2 shots</span><span class="result-pill W">Your pair wins</span><span class="result-pill L">They win</span></div>
      <div class="pslot filled"><span class="av">GC</span><span class="who"><strong>Selected player</strong><small>Highlighted card</small></span><span></span></div>
      <div class="tabs-demo"><span>Scores</span><span>Leaderboard</span><span>Course</span><b>Admin</b></div>
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
  $('csave').onclick = async () => {
    const t = current()
    if (!isHex(t.main) || !isHex(t.accent)) { preview(); return }
    $('csave').disabled = true
    try {
      await api.setTheme(t.main, t.accent)
    } catch (err) {
      $('cerr').textContent = err.message
      $('csave').disabled = false
      return
    }
    applyTheme(t)
    await render()
    toast('Club colours saved for everyone')
  }
}
