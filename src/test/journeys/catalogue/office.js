// Journeys for the club office (the office login: an admin, never a player). See ../catalogue.js for the shape.
const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)
const LATER = '2026-10-17'
const join = db => db.joins.push({ id: 1, name: 'Sean Byrne', email: 'sean@example.invalid', createdAt: '2026-10-09T10:00:00Z' })
const request = db => db.requests.push({ id: 7, memberId: 1, slotId: at(db, 540, LATER).id, date: LATER, time: 540, memberIds: [], guests: [], reason: 'Visitors from Boston', status: 'pending', bookingId: null, note: null, seen: true, createdAt: '2026-10-09T18:00:00Z' })
const booked = db => db.book(1, at(db, 600).id, [3])
const member = id => [{ tap: '[data-ov="members"]' }, { tap: `[data-o-m="${id}"]` }]

export default [
  {
    id: 'office-let-in', who: 'office', title: 'Let in someone asking to join',
    setup: join, steps: [{ tap: 'Let in' }],
    action: 'saveMember', expect: db => db.emails[db.members.at(-1).id] === 'sean@example.invalid', refusals: 'all',
  },
  {
    id: 'office-refuse-join', who: 'office', title: 'Refuse someone asking to join',
    setup: join, steps: [{ tap: 'Refuse' }, { tap: 'Sure?' }],
    action: 'declineRequest', expect: db => db.joins.length === 0, refusals: 'all',
  },
  {
    id: 'office-book-request', who: 'office', title: 'Book a member’s tee time request',
    setup: request, steps: [{ tap: 'Book it' }],
    action: 'decideTeeTimeRequest', expect: db => db.requests[0].status === 'approved', refusals: 'all',
  },
  {
    id: 'office-cancel-booking', who: 'office', title: 'Cancel a member’s booking with a note',
    setup: booked, steps: [{ tap: '[data-ov="tee"]' }, { tap: db => `[data-o-slot="${at(db, 600).id}"]` }, { tap: 'Cancel the booking' }, { type: ['#o-cxnote', 'Course closed for the frost'] }, { tap: '#o-cxgo' }],
    action: 'adminCancelBooking', expect: db => db.bookings.length === 0, refusals: 'all',
  },
  {
    id: 'office-move-booking', who: 'office', title: 'Move a member’s booking to another time',
    setup: booked, steps: [{ tap: '[data-ov="tee"]' }, { tap: db => `[data-o-slot="${at(db, 600).id}"]` }, { tap: 'Move to another time' }, { tap: db => `[data-o-slot="${at(db, 660).id}"]` }, { tap: '#o-mvgo' }],
    action: 'adminMoveBooking', expect: db => at(db, 660).players.length === 2, refusals: 'all',
  },
  {
    id: 'office-hut-staff', who: 'office', title: 'Make a member halfway hut staff',
    steps: [...member(1), { tap: '#o-hut' }, { tap: '#o-save' }],
    action: 'setHutStaff', expect: db => db.members.find(m => m.id === 1).hutStaff, refusals: 'all',
  },
  {
    id: 'office-plays-in', who: 'office', title: 'Say which competitions a member plays in',
    steps: [...member(1), { pick: ['#o-plays', 'ladies'] }, { tap: '#o-save' }],
    action: 'adminSetPlaysIn', expect: db => db.members.find(m => m.id === 1).playsIn === 'ladies', refusals: 'all',
  },
  {
    id: 'office-reset-login', who: 'office', title: 'Reset a member’s login',
    setup: db => { db.members.find(m => m.id === 1).signedIn = true },
    steps: [...member(1), { tap: '#o-reset' }, { tap: '#o-reset' }],
    action: 'resetLogin', expect: db => db.calls.includes('resetLogin'), refusals: 'all',
  },
  {
    id: 'office-delete-member', who: 'office', title: 'Delete a member',
    steps: [...member(1), { tap: '#o-del' }, { tap: '#o-del' }],
    action: 'deleteMember', expect: db => !db.members.some(m => m.id === 1), refusals: 'all',
  },
  {
    id: 'office-login', who: 'office', title: 'Set up the office login’s email',
    setup: db => { db.asOffice = false }, // an admin member sets it up (the office login can't change itself)
    steps: [{ tap: 'Gary Cochrane' }, { tap: 'Club office' }, { tap: 'Club' }, { tap: 'Set up' }, { type: ['#o-oemail', 'office@royalteemate.ie'] }, { tap: '#o-osave' }],
    action: 'setOfficeLogin', expect: db => db.office === 'office@royalteemate.ie', refusals: 'all',
  },
  {
    id: 'office-fee', who: 'office', title: 'Say fees come from the competition purse',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-fee="purse"]' }],
    action: 'setFeePayment', expect: db => db.theme.feePayment === 'purse', refusals: 'all',
  },
  {
    id: 'office-day-board-days', who: 'office', title: 'Choose the days of the leaderboard of the day',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-dbday="6"]' }],
    action: 'setDayBoardDays', expect: db => !db.theme.dayBoardDays.includes(6), refusals: 'all',
  },
  {
    id: 'office-day-board-today', who: 'office', title: 'Switch off the leaderboard of the day for today',
    steps: [{ tap: '[data-ov="board"]' }, { tap: '[data-o-db="off"]' }],
    action: 'setDayBoardToday', expect: db => db.theme.dayBoardToday?.on === false, refusals: 'all',
  },
  {
    id: 'office-paper-cards', who: 'office', title: 'Switch on paper scorecards',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-paper="on"]' }],
    action: 'setPaperCards', expect: db => db.theme.paperCards, refusals: 'all',
  },
]
