// Account's shareable handicap card: the text a member shares (name, club, handicap index, GUI — nothing
// else, since shared text gets forwarded on), the same text as a QR code, and the phone's share sheet.
import qrcode from 'qrcode-generator'
import { fmtHcp } from './ui.js'

/** "James Smith\nRoyal Portrush GC\nHandicap index 14.5\nGUI 4536292\n(shared from TeeMate, 9 Oct 2026)" */
export function shareText(me, clubName, on = new Date()) {
  const when = on.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return [me.name, clubName || null, `Handicap index ${fmtHcp(me.hcp)}`, me.gui ? `GUI ${me.gui}` : 'GUI not added', `(shared from TeeMate, ${when})`]
    .filter(Boolean).join('\n')
}

const code = text => { const q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make(); return q }
/** The QR code as an SVG string that scales to its box. */
export const qrSvg = text => code(text).createSvgTag({ cellSize: 4, margin: 0, scalable: true })

/** The QR code as a PNG (white border, for messages and mail). */
export function qrPng(text, size = 600) {
  const q = code(text), n = q.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2))
  const c = document.createElement('canvas'); c.width = c.height = cell * (n + quiet * 2)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell)
  return new Promise(res => c.toBlob(res, 'image/png'))
}

/**
 * Share the card through the phone's share sheet (WhatsApp, Mail, Messages…): text and QR picture where the
 * phone can share files, otherwise the text, otherwise copy it. Returns 'shared' | 'copied' | 'cancelled'.
 */
export async function shareCard(text, name) {
  try {
    const png = await qrPng(text)
    const file = png && new File([png], `${name.replace(/[^\w]+/g, '-')}-handicap.png`, { type: 'image/png' })
    if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: `${name}'s handicap`, text, files: [file] }); return 'shared' }
    if (navigator.share) { await navigator.share({ title: `${name}'s handicap`, text }); return 'shared' }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled' // they closed the share sheet
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
