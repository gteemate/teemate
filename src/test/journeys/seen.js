// Is a message seen where the person is looking? (The pretend browser has no layout, so this reads the page and the
// stylesheet: the real-browser journeys check what's actually on top.)
//   'modal'  — inside the open pop-up
//   'notice' — in the notice (#toast), drawn above any pop-up
//   'page'   — in an alert line on the page (no pop-up open)
//   'hidden' — only in the notice, while a pop-up is open and notices are drawn under pop-ups
//   null     — not shown at all
import { readFileSync } from 'node:fs'

const STYLES = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8')
const zIndex = (css, sel) => +(css.match(new RegExp(`(?:^|\\})\\s*\\${sel}\\{[^}]*?z-index:(\\d+)`, 'm'))?.[1] ?? 0)

export function whereSeen(message, css = STYLES) {
  const has = el => !!el && !el.hidden && el.textContent.includes(message)
  const modal = document.getElementById('modal'), open = !!modal?.innerHTML.trim()
  const notice = has(document.getElementById('toast'))
  if (open) {
    if (has(modal)) return 'modal'
    if (notice) return zIndex(css, '.toast') > zIndex(css, '.overlay') ? 'notice' : 'hidden'
    return null
  }
  if (notice) return 'notice'
  if ([...document.querySelectorAll('#main [role="alert"], #alerts [role="alert"]')].some(has)) return 'page'
  return null
}
