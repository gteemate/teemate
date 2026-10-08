// Small DOM and formatting helpers shared by every screen.
export const $ = id => document.getElementById(id)
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const ini = n => n.split(' ').map(p => p[0]).join('').slice(0, 2)
export const sur = n => n.split(' ').slice(-1)[0]
export const nn = n => String(n).padStart(2, '0')
export const asset = p => import.meta.env.BASE_URL + p

/** Handicap index typed by a person: "12.4", "12,4", "+2" (a plus handicap, stored as −2).
 *  Returns a number, null for blank, or NaN if it isn't a handicap. */
export function parseHcp(text) {
  const t = String(text ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t.startsWith('+') ? '-' + t.slice(1) : t)
  return Number.isFinite(n) && n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : NaN
}
/** Show a stored handicap index the golf way: −2 → "+2". */
export const fmtHcp = h => (h == null ? '–' : h < 0 ? `+${-h}` : String(h))

export function toast(t) {
  const el = $('toast')
  el.textContent = t
  el.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => (el.hidden = true), 1900)
}

export function header(title, sub, back) {
  $('hdr').innerHTML = `${back ? '<button class="back" id="back">‹ Back</button>' : ''}<h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}`
  if (back) $('back').onclick = back
}

const scroller = () => (matchMedia('(max-width:460px)').matches ? document.scrollingElement || document.documentElement : $('main'))
export async function keepScroll(fn) {
  const st = scroller().scrollTop
  await fn()
  scroller().scrollTop = st
}
export const top0 = () => (scroller().scrollTop = 0)

// main.js registers the real render; screens call render() to redraw.
let renderFn = () => {}
export const setRender = f => (renderFn = f)
export const render = () => renderFn()
