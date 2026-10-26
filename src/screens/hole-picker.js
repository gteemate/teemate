// Pick the open holes with a tap for each (1–9 on top, 10–18 below), with All 18, Front 9 and Back 9. Used when
// setting up an event, a day of it, a league week, a season match day or a knockout round. The choice is kept as in
// open-holes.js: null when all 18 are open, else a list of hole numbers ([] while none are open).
import { holeList, holesCount } from '../open-holes.js'

const ALL = Array.from({ length: 18 }, (_, i) => i + 1)
const QUICK = { all: null, front: ALL.slice(0, 9), back: ALL.slice(9) }
const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i])

/** The picker for one choice; key tells pickers on the same screen apart. */
export function holePickerHtml(spec, key) {
  const open = new Set(holeList(spec))
  const list = holeList(spec)
  const btn = n => `<button type="button" class="hp${open.has(n) ? ' on' : ''}" data-hp="${key}:${n}" aria-pressed="${open.has(n)}" aria-label="Hole ${n}">${n}</button>`
  const quick = (k, label) => `<button type="button" class="ghost sm" data-hpq="${key}:${k}" aria-pressed="${k === 'all' ? list.length === 18 : same(list, QUICK[k])}">${label}</button>`
  return `<div class="hpick" data-hpick="${key}">
    <div class="hpgrid">${ALL.map(btn).join('')}</div>
    <div class="hpquick">${quick('all', 'All 18')}${quick('front', 'Front 9')}${quick('back', 'Back 9')}</div>
    <span class="hint hpcount">${holesCount(spec)}</span></div>`
}

/** Taps on the picker: set(spec) gets null for all 18, else the list ([] when the last hole is closed). */
export function bindHolePicker(key, get, set) {
  document.querySelectorAll(`[data-hp^="${key}:"]`).forEach(b => (b.onclick = () => {
    const n = +b.dataset.hp.split(':').pop(), open = new Set(holeList(get()))
    open.has(n) ? open.delete(n) : open.add(n)
    set(open.size === 18 ? null : [...open].sort((x, y) => x - y))
  }))
  document.querySelectorAll(`[data-hpq^="${key}:"]`).forEach(b => (b.onclick = () => set(QUICK[b.dataset.hpq.split(':').pop()])))
}

/** No holes open in this choice. */
export const noneOpen = spec => Array.isArray(spec) && !spec.length
