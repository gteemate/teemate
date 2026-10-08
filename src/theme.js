// Club colours: every brand shade in the app, light and dark mode, is worked out from two hex codes.
//   main   — buttons, header cards, selected items, outlines (default navy)
//   accent — selected tab, highlights, "they won" results (default maroon)

export const DEFAULT_THEME = { main: '#19335A', accent: '#762A43' }
const LIGHT_BG = '#ffffff', DARK_SURFACE = '#181d29', DARK_TEXT = '#151a26', LIGHT_TEXT = '#f4f6fb'

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

/** CSS custom properties for light and dark mode. */
export function themeVars({ main, accent }) {
  const light = {
    '--green': main, '--pill': main, '--leaf-line': main, '--win': main, '--loss': accent,
    '--leaf': mix(main, LIGHT_BG, 0.86),
    '--on-green': textOn(main), '--on-win': textOn(main), '--on-loss': textOn(accent),
    '--shadow': `${main}66`,
    '--flag-front': accent, '--flag-back': main, // pin flags: the exact club colours in both modes
  }
  const dMain = mix(main, LIGHT_BG, 0.15), dLine = mix(main, LIGHT_BG, 0.55), dAccent = mix(accent, LIGHT_BG, 0.45)
  const dark = {
    '--green': dMain, '--pill': dMain, '--leaf-line': dLine, '--win': dLine, '--loss': dAccent,
    '--leaf': mix(main, DARK_SURFACE, 0.6),
    '--on-green': textOn(dMain), '--on-win': textOn(dLine), '--on-loss': textOn(dAccent),
    '--shadow': '#00000099',
    '--flag-front': accent, '--flag-back': main,
  }
  return { light, dark }
}

const block = vars => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
export function themeCss(theme) {
  const { light, dark } = themeVars(theme)
  return `:root{${block(light)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${block(dark)}}}
:root[data-theme="dark"]{${block(dark)}}`
}

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
