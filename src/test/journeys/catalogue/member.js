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
  {
    id: 'add-buddy', who: 'member', title: 'Add a member to my friends',
    steps: [{ tap: 'Friends' }, { tap: '[data-s="find"]' }, { type: ['#q', 'Eoin'] }, { tap: '[data-b="9"]' }],
    action: 'addBuddy', expect: db => db.buddies.some(b => b.id === 9), refusals: 'all',
  },
  {
    id: 'remove-buddy', who: 'member', title: 'Take a member out of my friends',
    steps: [{ tap: 'Friends' }, { tap: '[data-s="find"]' }, { type: ['#q', 'Ciar'] }, { tap: '[data-b="3"]' }],
    action: 'removeBuddy', expect: db => !db.buddies.some(b => b.id === 3), refusals: 'all',
  },
  {
    id: 'favourite-friend', who: 'member', title: 'Make a friend a favourite',
    steps: [{ tap: 'Friends' }, { tap: '[data-fm="5"]' }],
    action: 'setFriendFavourite', expect: db => db.buddies.find(b => b.id === 5).favourite, refusals: 'all',
  },
  {
    id: 'save-contact', who: 'member', title: 'Save a friend from another club from their shared card',
    hash: '#friend?n=Pat+Visitor&c=Royal+Portrush&h=8.4&m=55&d=2026-10-10',
    steps: [{ tap: 'Save contact' }],
    action: 'saveContact', expect: db => db.contacts.some(c => c.name === 'Pat Visitor'), refusals: 'all',
  },
  {
    id: 'remove-contact', who: 'member', title: 'Remove a saved contact',
    steps: [{ tap: 'Friends' }, { tap: '[data-c="1"]' }, { tap: '#ct-rm' }, { tap: '#ct-rm' }],
    action: 'removeContact', expect: db => !db.contacts.some(c => c.id === 1), refusals: 'all',
  },
  {
    id: 'plays-in', who: 'member', title: 'Say I play in the ladies’ competitions',
    steps: [{ tap: '#account' }, { tap: '[data-plays="ladies"]' }],
    action: 'setMyPlaysIn', expect: db => db.members.find(m => m.id === 1).playsIn === 'ladies', refusals: 'all',
  },
  {
    id: 'game-pref', who: 'member', title: 'Choose my usual game for a two-ball',
    steps: [{ tap: '#account' }, { tap: '[data-a="mygames"]' }, { tap: '[data-n="2"][data-k="sc2"]' }],
    action: 'setMyGamePref', expect: db => db.calls.includes('setMyGamePref'), refusals: 'all',
  },
]
