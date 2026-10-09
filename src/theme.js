// Club colours: every brand shade in the app, light and dark mode, is worked out from two hex codes.
//   main   — buttons, header cards, selected items, outlines (default navy)
//   accent — selected tab, highlights, "they won" results (default maroon)

export const DEFAULT_THEME = { main: '#19335A', accent: '#762A43' }
const DARK_TEXT = '#151a26', LIGHT_TEXT = '#f4f6fb'

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** Mix a towards b: t = 0 gives a, t = 1 gives b. */
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)) }
/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c) {
  return rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
    .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0)
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
/** Text colour that reads best on a background. */
export const textOn = bg => (contrast(bg, DARK_TEXT) >= contrast(bg, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT)
export const isHex = s => /^#[0-9a-f]{6}$/i.test(s)

// The navy look's background shades, darkest first. A club's main colour is shaded to the same darkness
// as each, so it keeps its hue (a green club gets green-tinted backgrounds) and light text always reads.
const NAVY = { '--sunk': '#0f1830', '--bg': '#141f3b', '--surface': '#1b2a4b', '--leaf': '#22325a', '--line': '#2b3c63' }
/** c mixed towards black (or white, if c is darker) until its luminance is lum. */
function shadeTo(c, lum) {
  const to = luminance(c) > lum ? '#000000' : '#ffffff'
  let lo = 0, hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2, l = luminance(mix(c, to, mid))
    if (to === '#000000' ? l > lum : l < lum) lo = mid; else hi = mid
  }
  return mix(c, to, hi)
}

/** CSS custom properties from the club's two colours: main shades the backgrounds, accent is the disc ring. */
export function themeVars({ main, accent }) {
  const isNavy = main.toUpperCase() === DEFAULT_THEME.main
  const shades = Object.fromEntries(Object.entries(NAVY).map(([k, v]) => [k, isNavy ? v : shadeTo(main, luminance(v))]))
  const accentText = mix(accent, '#ffffff', 0.45) // the accent as text or a highlight on navy
  return {
    ...shades,
    '--ring': accent, '--loss': accentText, '--on-loss': textOn(accentText),
    '--flag-front': accent, '--flag-back': luminance(main) < 0.2 ? shadeTo(main, 0.2) : main, // pin flags show on dark greens
  }
}

const block = vars => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
export const themeCss = theme => `:root{${block(themeVars(theme))}}`

const KEY = 'teemates-theme'
/** Apply a theme to the page (or the stylesheet defaults when it's the default theme). */
export function applyTheme(theme) {
  let el = document.getElementById('club-theme')
  if (!el) { el = document.createElement('style'); el.id = 'club-theme'; document.head.append(el) }
  const isDefault = theme.main.toUpperCase() === DEFAULT_THEME.main && theme.accent.toUpperCase() === DEFAULT_THEME.accent
  el.textContent = isDefault ? '' : themeCss(theme) // keep the hand-tuned default palette
  try { localStorage.setItem(KEY, JSON.stringify(theme)) } catch {}
}
/** The last theme this browser saw, so the page doesn't flash the default colours on load. */
export function cachedTheme() {
  try { const t = JSON.parse(localStorage.getItem(KEY)); return t && isHex(t.main) && isHex(t.accent) ? t : null } catch { return null }
}
