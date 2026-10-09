// Scores tab: set, change or clear a guest's handicap index from the card.
import * as api from '../api.js'
import { $, esc, keepScroll, render, toast, parseHcp, fmtHcp } from '../ui.js'

export function guestHcpSheet(p) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="hform" novalidate aria-labelledby="htitle">
    <h4 id="htitle">${esc(p.name)}’s handicap</h4>
    <label for="h-idx">Handicap index</label><input id="h-idx" inputmode="decimal" autocomplete="off" value="${p.hcp == null ? '' : fmtHcp(p.hcp)}" placeholder="e.g. 18.4, or +2">
    <span class="hint">No official handicap? Agree one with them. You can change it any time, even mid-round.</span>
    <p class="gerr" id="herr" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="hcancel">Cancel</button><button type="submit" class="primary" id="hsave">Save</button></div>
  </form></div>`
  setTimeout(() => $('h-idx')?.focus(), 30)
  const close = () => { $('modal').innerHTML = '' }
  $('hcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('hform').onsubmit = async e => {
    e.preventDefault()
    const h = parseHcp($('h-idx').value)
    if (Number.isNaN(h)) { $('herr').textContent = 'Enter a handicap index between +10 and 54, e.g. 18.4.'; return }
    $('hsave').disabled = true
    try {
      await api.setGuestHandicap(p.guestId, h)
    } catch (err) {
      $('herr').textContent = err.message
      $('hsave').disabled = false
      return
    }
    close()
    await keepScroll(render)
    toast(h == null ? `${p.name}’s handicap cleared` : `${p.name} now plays off ${fmtHcp(h)}`)
  }
}
