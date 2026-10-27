// A member's card: the QR on their Account card is their friend link. The club office scans it to check in their
// guests. Pure, tested in member-card.test.js; the camera is in scan-qr.js.
import { readFriendLink } from './friend-link.js'

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Scanned text → { id, name, cardName } for a member whose number and name both match, or null. */
export function memberFromCard(text, members) {
  if (typeof text !== 'string' || text.length > 2000) return null
  const at = text.indexOf('#')
  const card = at < 0 ? null : readFriendLink(text.slice(at))
  if (!card) return null
  const m = members.find(x => x.id === card.memberId)
  return m && norm(m.name) === norm(card.name) ? { id: m.id, name: m.name, cardName: card.name } : null
}
