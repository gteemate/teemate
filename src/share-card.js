// Account's shareable handicap card: the message a member shares (name, club, handicap index and their friend link),
// the link as a QR code, and the phone's share sheet.
import qrcode from 'qrcode-generator'
import { fmtHcp } from './ui.js'

/** "James Smith · Royal Portrush GC · Handicap index 14.5\nAdd me as a friend on TeeMate: <link>" (nothing else:
 *  shared text gets forwarded on). The link opens the Add friend page with these details (friend-link.js). */
export function shareText(me, clubName, link) {
  return `${[me.name, clubName || null, `Handicap index ${fmtHcp(me.hcp)}`].filter(Boolean).join(' · ')}\nAdd me as a friend on TeeMate: ${link}`
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
 * Share the card through the phone's share sheet (WhatsApp, Mail, Messages…): text and the link's QR picture where the
 * phone can share files, otherwise the text, otherwise copy it. Returns 'shared' | 'copied' | 'cancelled'.
 */
export async function shareCard(text, name, link = text) {
  try {
    const png = await qrPng(link)
    const file = png && new File([png], `${name.replace(/[^\w]+/g, '-')}-handicap.png`, { type: 'image/png' })
    if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: `${name}'s handicap`, text, files: [file] }); return 'shared' }
    if (navigator.share) { await navigator.share({ title: `${name}'s handicap`, text }); return 'shared' }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled' // they closed the share sheet
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
