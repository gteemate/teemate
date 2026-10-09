// Tee time requests: how a request's status reads (Booking's Requests section, the admin list).
const STATUS = { pending: ['Waiting for an admin', 'wait'], approved: ['Approved: booked', 'ok'], cancelled: ['Cancelled', 'off'] }

/** { text, tone: 'wait' | 'ok' | 'no' | 'off' } */
export function requestStatus(r) {
  if (r.status === 'declined') return { text: `Declined: ${r.note || 'no reason given'}`, tone: 'no' }
  const [text, tone] = STATUS[r.status]
  return { text, tone }
}
