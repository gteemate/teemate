// A surname letter bar for long lists (over 25 people): tap a letter to show only surnames starting with it.
// Each list has its own key, so picking a letter in one list doesn't filter another.
import { S } from './state.js'

const AZ = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const plain = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '') // Ó'Brien files under O
export const initial = name => plain((name.trim().split(/\s+/).pop()[0] || '').toUpperCase())

/** → { bar: the letters' html ('' for 25 or fewer), shown: the items with that surname letter (all when none picked) } */
export function azList(items, nameOf, key, min = 25) {
  if (items.length <= min) return { bar: '', shown: items }
  const has = new Set(items.map(x => initial(nameOf(x))))
  const az = S.az?.[key] && has.has(S.az[key]) ? S.az[key] : ''
  return {
    bar: `<div class="oaz" role="group" aria-label="Surname starts with"><button data-az="${key}:" aria-pressed="${!az}">All</button>${AZ.map(l => `<button data-az="${key}:${l}" aria-pressed="${az === l}" ${has.has(l) ? '' : 'disabled'}>${l}</button>`).join('')}</div>`,
    shown: az ? items.filter(x => initial(nameOf(x)) === az) : items,
  }
}

/** Wire every letter bar on the page; `redraw` shows the list again. */
export function wireAz(redraw) {
  document.querySelectorAll('[data-az]').forEach(b => (b.onclick = () => {
    const [k, l] = b.dataset.az.split(':')
    S.az = { ...S.az, [k]: l }
    redraw()
  }))
}
