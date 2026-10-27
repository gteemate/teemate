// Paper scorecards: confirming someone else's score. The holes as saved, the photo of the card, and the short
// note that goes back to the uploader when it isn't right. Used by the alerts drop-down and the club office.
import * as api from '../api.js'
import { $, esc } from '../ui.js'
import { playerTotals } from './reading.js'

/** One player's saved holes in two rows of nine (scores[hole][player]). */
export function holesHtml(scores, k) {
  const half = from => `<div class="pgrid">${scores.slice(from, from + 9).map((_, i) => `<span class="ph">${from + i + 1}</span>`).join('')}${scores.slice(from, from + 9).map(h => `<span class="pcell">${h?.[k] ?? '–'}</span>`).join('')}</div>`
  return half(0) + half(9)
}

/** The waiting score to show: who uploaded it and their totals. c: an item of getPaperConfirms(). */
export function confirmLine(c, members) {
  const k = c.lineup.findIndex(e => e.m === c.paperBy)
  const t = playerTotals(c.scores, k)
  return { k, byName: members.find(m => m.id === c.paperBy)?.name ?? 'A member', ...t }
}

const close = () => { $('modal').innerHTML = '' }

/** "What isn't right?": a short note, then send(note). */
export function noteSheet(send) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="pbt">
    <h3 id="pbt">What isn’t right?</h3><p class="hint">A short note goes back to the player who uploaded the card, to check and send again.</p>
    <textarea id="pb-note" maxlength="200" rows="3" placeholder="Hole 14 was a 6"></textarea><p class="gerr" id="pb-err" role="alert"></p>
    <div class="gm-btns"><button class="ghost" id="pb-no">Cancel</button><button class="primary" id="pb-send">Send back</button></div></div></div>`
  $('pb-no').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('pb-send').onclick = async () => {
    const note = $('pb-note').value.trim()
    if (!note) { $('pb-err').textContent = 'Add a short note saying what isn’t right.'; return }
    $('pb-send').disabled = true
    try { await send(note); close() } catch (err) { $('pb-err').textContent = err.message; $('pb-send').disabled = false }
  }
}

/** The holes and the photo(s), with Confirm and Not right. */
export async function reviewSheet(c, members, { confirm, back }) {
  const l = confirmLine(c, members)
  const photos = await Promise.all(Array.from({ length: c.paperPhotos }, (_, i) => api.cardPhotoUrl(c.id, i + 1).catch(() => null)))
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="prt">
    <h3 id="prt">${esc(l.byName)} · ${l.gross}</h3><p class="hint">Out ${l.out} · In ${l.in}. Read from their paper card.</p>
    ${holesHtml(c.scores, l.k)}
    ${photos.filter(Boolean).map((u, i) => `<img class="pphoto" src="${esc(u)}" alt="Photo of card ${i + 1}">`).join('')}
    <div class="gm-btns"><button class="ghost" id="pr-back">Not right</button><button class="primary" id="pr-ok">Confirm</button></div></div></div>`
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('pr-ok').onclick = async () => { close(); await confirm() }
  $('pr-back').onclick = () => noteSheet(back)
}

/** The photo(s) of a card read from paper. */
export async function photosSheet(roundId, n) {
  const photos = await Promise.all(Array.from({ length: n }, (_, i) => api.cardPhotoUrl(roundId, i + 1).catch(() => null)))
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="ppt"><h3 id="ppt">The paper card</h3>
    ${photos.filter(Boolean).map((u, i) => `<img class="pphoto" src="${esc(u)}" alt="Photo of card ${i + 1}">`).join('') || '<p class="hint">The photo isn’t available.</p>'}
    <div class="gm-btns"><button class="ghost" id="pp-no">Close</button></div></div></div>`
  $('pp-no').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
}
