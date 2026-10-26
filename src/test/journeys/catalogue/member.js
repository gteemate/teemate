// Journeys for a member (Declan Murphy, id 1, not an admin). See ../catalogue.js for the shape.
const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)
const players = (db, time) => at(db, time).players.map(p => p.memberId)
const FUTURE = '2026-10-30' // beyond the booking window (requests)

export default [
  {
    id: 'enter-pairs', who: 'member', title: 'Enter a pairs competition with a partner',
    steps: [{ tap: 'Competition' }, { tap: 'Events' }, { tap: '[data-sign="2"]' }, { tap: "Ciarán O'Neill" }, { tap: 'Enter as a pair' }],
    action: 'enterSignup',
    expect: db => db.signupEntries.some(e => e.compId === 2 && e.memberId === 1 && e.partnerId === 3),
    refusals: 'all',
  },
  {
    id: 'book-tee-time', who: 'member', title: 'Book a tee time with a friend',
    steps: [{ tap: 'Booking' }, { tap: '+ Add a booking' }, { tap: '10:20' }, { tap: '[data-open]' }, { tap: "Ciarán O'Neill" }, { tap: 'Confirm booking' }],
    action: 'bookTeeTime', expect: db => players(db, 620).includes(1) && players(db, 620).includes(3), refusals: 'all',
  },
  {
    id: 'cancel-booking', who: 'member', title: 'Delete my booking',
    setup: db => db.book(1, at(db, 540).id, [3]),
    steps: [{ tap: 'Booking' }, { tap: '09:00' }, { tap: 'Delete booking' }, { tap: 'Tap again to delete' }],
    action: 'cancelBooking', expect: db => db.bookings.length === 0, refusals: 'all',
  },
  {
    id: 'request-tee-time', who: 'member', title: 'Request a tee time further ahead',
    steps: [{ tap: 'Booking' }, { tap: 'Request a tee time further ahead' }, { tap: '10:20' }, { type: ['#rq-why', 'Visitors from Boston'] }, { tap: 'Send request' }],
    action: 'requestTeeTime', expect: db => db.requests.some(r => r.memberId === 1 && r.status === 'pending'), refusals: 'all',
  },
  {
    id: 'cancel-tee-time-request', who: 'member', title: 'Cancel a tee time request',
    setup: db => db.requests.push({ id: 31, memberId: 1, slotId: at(db, 540, FUTURE).id, date: FUTURE, time: 540, memberIds: [], guests: [], reason: 'Visitors', status: 'pending', bookingId: null, note: null, seen: true, createdAt: '2026-10-09T18:00:00Z' }),
    steps: [{ tap: 'Booking' }, { tap: 'Cancel' }, { tap: 'Sure?' }],
    action: 'cancelTeeTimeRequest', expect: db => db.requests[0].status === 'cancelled', refusals: 'all',
  },
  {
    id: 'dismiss-tee-time-request', who: 'member', title: 'Remove an answered request from the list',
    setup: db => db.requests.push({ id: 36, memberId: 1, slotId: 1, date: FUTURE, time: 460, memberIds: [], guests: [], reason: 'Visitors flying in', status: 'approved', bookingId: null, note: null, decidedAt: '2026-10-09T18:45:00Z', seen: true, createdAt: '2026-10-09T18:00:00Z' }),
    steps: [{ tap: 'Booking' }, { tap: 'Remove' }],
    action: 'dismissTeeTimeRequest', expect: db => db.requests[0].dismissed, refusals: 'all',
  },
  {
    id: 'withdraw-signup', who: 'member', title: 'Withdraw from a competition',
    setup: db => db.signupEntries.push({ id: 90, compId: 1, memberId: 1, partnerId: null }),
    steps: [{ tap: 'Competition' }, { tap: '[data-tab="entered"]' }, { tap: 'Withdraw' }, { tap: 'Tap again to withdraw' }],
    action: 'withdrawSignup', expect: db => !db.signupEntries.some(e => e.memberId === 1), refusals: 'all',
  },
  {
    id: 'decline-signup', who: 'member', title: 'Say No thanks to a competition',
    steps: [{ tap: 'Competition' }, { tap: 'Events' }, { tap: '[data-nothanks="1"]' }],
    action: 'declineSignup', expect: db => db.declines.includes(1), refusals: 'all',
  },
]
