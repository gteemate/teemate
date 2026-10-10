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
/** A password box with an eye button to show or hide what's typed. */
export const passwordInput = (id, attrs = '') =>
  `<span class="pwwrap"><input id="${id}" type="password" ${attrs}><button type="button" class="pweye" data-eye="${id}" aria-label="Show password" aria-pressed="false">${EYE}</button></span>`
const EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
// One listener for every eye button in the app (only in a browser, not in tests).
if (typeof document !== 'undefined') document.addEventListener('click', e => {
  const b = e.target.closest('[data-eye]')
  if (!b) return
  const input = document.getElementById(b.dataset.eye), show = input.type === 'password'
  input.type = show ? 'text' : 'password'
  b.innerHTML = show ? EYE_OFF : EYE
  b.setAttribute('aria-pressed', show)
  b.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
  input.focus()
})

/** Show a stored handicap index the golf way: −2 → "+2". */
export const fmtHcp = h => (h == null ? '–' : h < 0 ? `+${-h}` : String(h))

export function toast(t) {
  const el = $('toast')
  el.textContent = t
  el.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => (el.hidden = true), Math.max(1900, t.length * 60)) // longer messages stay up long enough to read
}

// Every screen but Home gets a back arrow: its own handler if it passes one, otherwise back along the
// trail of screens the member came through (main.js sets that with setDefaultBack).
let defaultBack = () => null
export const setDefaultBack = f => (defaultBack = f)
/** Back the way you came (the trail of screens main.js keeps); `otherwise` when there's nowhere to go back to.
 *  Screens that tidy up before leaving call this rather than sending you to a fixed screen. */
export async function goBack(otherwise) {
  const go = defaultBack()
  if (go) await go()
  else await otherwise?.()
}
export function header(title, sub, back, backLabel = 'Back') {
  const go = back ?? defaultBack()
  $('hdr').innerHTML = `${go ? `<button class="back" id="back">‹ ${backLabel}</button>` : ''}<h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}`
  if (go) $('back').onclick = go
}

const scroller = () => (matchMedia('(max-width:460px),(max-height:500px)').matches ? document.scrollingElement || document.documentElement : $('main'))
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
