// Friend links: your Account card as a link (QR, Share) that opens TeeMate's Add friend page with your details.
// The details sit after the # so they never reach a server. Plain functions, tested in friend-link.test.js.
import { fmtHcp } from './ui.js'

const MAX = 600 // longer than any real name + club; anything longer isn't one of ours
const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** `${base}#friend?n=…&c=…&h=…&g=…&m=…&d=YYYY-MM-DD` (club and GUI left out when there are none). */
export function friendLink(me, clubName, base, on = new Date()) {
  const q = new URLSearchParams({ n: me.name })
  if (clubName) q.set('c', clubName)
  q.set('h', fmtHcp(me.hcp))
  if (me.gui) q.set('g', me.gui)
  q.set('m', me.id)
  q.set('d', iso(on))
  return `${base}#friend?${q}`
}

/** '#friend?…' → { name, club, hcp, gui, memberId, sharedOn }, or null if it isn't a whole friend link. */
export function readFriendLink(hash) {
  if (!hash?.startsWith('#friend?') || hash.length > MAX) return null
  const q = new URLSearchParams(hash.slice('#friend?'.length))
  const name = q.get('n')?.trim(), m = q.get('m')
  if (!name || !/^\d+$/.test(m ?? '')) return null
  return { name, club: q.get('c') || null, hcp: q.get('h') || null, gui: q.get('g') || null, memberId: +m, sharedOn: q.get('d') || null }
}

/** A contact I've saved for this card: same GUI number, or the same name when either has no GUI. */
const sameContact = (card, c) => (card.gui && c.gui ? card.gui === c.gui : norm(card.name) === norm(c.name))

/**
 * What the Add friend page offers for this card. me null = signed out.
 * → { kind: 'signin' | 'self' | 'add' | 'already' | 'save' | 'update' | 'same', memberId?, contact? }
 */
export function addFriendAction(card, { me, members, buddies, contacts }) {
  if (!me) return { kind: 'signin' }
  if (card.memberId === me.id) return { kind: 'self' }
  const member = members.find(m => m.id === card.memberId && norm(m.name) === norm(card.name))
  if (member) return buddies.includes(member.id) ? { kind: 'already' } : { kind: 'add', memberId: member.id }
  const contact = contacts.find(c => sameContact(card, c))
  if (!contact) return { kind: 'save' }
  const same = norm(contact.name) === norm(card.name) && (contact.club ?? null) === card.club && (contact.hcp ?? null) === card.hcp
  return same ? { kind: 'same' } : { kind: 'update', contact }
}
