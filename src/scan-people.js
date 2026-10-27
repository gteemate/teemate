// Adding playing partners by scanning their QR (the one on their Account card): one after another, the camera opens
// again for the next person until the group is full. Used by the booking screen, Scoring → Players and Friends.
import { openScanner } from './scan-qr.js'
import { personFromScan } from './member-card.js'
import { toast } from './ui.js'

/** onPerson({ member } | { card }) → true to scan the next person, false to stop. */
export function scanPeople(members, onPerson) {
  const next = () => openScanner({
    onText: async text => {
      const p = personFromScan(text, members)
      if (!p) { toast('That isn’t a TeeMate card.'); return }
      if (await onPerson(p)) setTimeout(next, 700) // a moment to see who was added
    },
    onError: msg => toast(msg),
  })
  next()
}
