// Journeys for a member (Declan Murphy, id 1, not an admin). See ../catalogue.js for the shape.
const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)
const players = (db, time) => at(db, time).players.map(p => p.memberId)
const FUTURE = '2026-10-30' // beyond the booking window (requests)
const teeTime = db => db.book(1, at(db, 570).id, [3]) // 09:30 today with Ciarán (both in the Winter League)
const startRound = [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: '#start' }]
// Men's Match Play drawn: Gary (entry 100) v Declan (101) in the semi-final; status/winner/result for that match.
const knockout = (status = 'open', winner = null, result = null) => db => {
  Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: ['2026-11-15', '2026-12-06'] })
  db.signupEntries.push(...[0, 1, 3, 5].map((m, i) => ({ id: 100 + i, compId: 1, memberId: m, partnerId: null })))
  db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: winner, result, status, reportedEntry: winner },
    { id: 2, compId: 1, round: 1, slot: 1, aEntry: 102, bEntry: 103, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 3, compId: 1, round: 2, slot: 0, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
}
const openKnockout = [{ tap: 'Competition' }, { tap: 'Men’s Match Play' }]
// Peter Walsh's four-ball (09:20) challenges mine (09:30, with Gary).
const challenged = db => {
  const mine = db.book(1, at(db, 570).id, [0]), theirs = db.book(7, at(db, 560).id, [11])
  db.playerEvents.push({ id: 5, date: db.today, style: 'fourball', format: 'best2', status: 'pending', proposerSlot: theirs.slotId, proposedBy: { id: 7, name: 'Peter Walsh' },
    createdBy: { id: 7, name: 'Peter Walsh' }, teamNames: {}, players: [{ id: 1, memberId: 1, name: 'Declan Murphy', slot: mine.slotId }, { id: 2, memberId: 7, name: 'Peter Walsh', slot: theirs.slotId }],
    groups: [{ slot: theirs.slotId, time: 560, host: true, answer: null }, { slot: mine.slotId, time: 570, host: false, answer: null }] })
}
const toHole9 = Array.from({ length: 8 }, (_, h) => ({ tap: `Save hole ${h + 1}` }))

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
  {
    id: 'save-hole', who: 'member', title: 'Start my round and save a hole',
    setup: teeTime, steps: [...startRound, { tap: 'Save hole 1' }],
    action: 'saveRound', expect: db => db.rounds.some(r => r.done[0]), refusals: 'all',
  },
  {
    id: 'delete-scorecard', who: 'member', title: 'Delete a scorecard',
    setup: teeTime, steps: [...startRound, { tap: '#delcard' }, { tap: '#delcard' }],
    action: 'deleteRound', expect: (db, app) => db.rounds.length === 0 && app.toast().includes('Scorecard deleted'), refusals: 'all',
  },
  {
    id: 'count-for-league', who: 'member', title: 'Count my round for the Winter League as I start',
    setup: teeTime, steps: [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: 'Winter League' }, { tap: '#start' }],
    keeps: { rounds: 'the card is made first; a refused count leaves a general-play card, which can still be counted before hole 1' },
    action: 'enterLeague', expect: db => db.leagueEntries.some(x => x.memberId === 1), refusals: 'all',
  },
  {
    id: 'join-today', who: 'member', title: 'Join today’s club competition as I start',
    setup: teeTime, steps: [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: 'Saturday Medal' }, { tap: '#start' }],
    keeps: { rounds: 'the card is made first; a refused count leaves a general-play card, which can still be counted before hole 1' },
    action: 'enterEventToday', expect: db => db.events.find(e => e.id === 21).players.includes(1), refusals: 'all',
  },
  {
    id: 'hut-order', who: 'member', title: 'Order from the halfway hut after the 8th',
    setup: teeTime, steps: [...startRound, ...toHole9, { tap: 'Order' }, { tap: 'One more Bacon roll' }, { tap: 'Send order' }],
    action: 'placeHutOrder', expect: db => db.orders.some(o => o.memberId === 1), refusals: 'all',
  },
  {
    id: 'ko-report', who: 'member', title: 'Report my knockout result',
    setup: knockout(), steps: [...openKnockout, { tap: '#ko-report' }, { tap: '[data-kw="101"]' }, { tap: '3&2' }, { tap: 'Save result' }],
    action: 'reportKoResult', expect: db => db.koMatches[0].status === 'reported', refusals: 'all',
  },
  {
    id: 'ko-confirm', who: 'member', title: 'Confirm the result my opponent reported',
    setup: knockout('reported', 100, '3&2'), steps: [...openKnockout, { tap: '#ko-confirm' }],
    action: 'confirmKoResult', expect: db => db.koMatches[0].status === 'confirmed', refusals: 'all',
  },
  {
    id: 'ko-dispute', who: 'member', title: 'Say a reported result isn’t right',
    setup: knockout('reported', 100, '3&2'), steps: [...openKnockout, { tap: '#ko-dispute' }, { tap: '#ko-dispute' }],
    action: 'disputeKoResult', expect: db => db.koMatches[0].status === 'disputed', refusals: 'all',
  },
  {
    id: 'ko-score', who: 'member', title: 'Score my knockout match on a card from the draw',
    setup: knockout(), steps: [...openKnockout, { tap: '#ko-score' }],
    keeps: { rounds: 'the card is made first; tapping Score this match again links the same card' },
    action: 'linkKoCard', expect: db => db.koMatches[0].roundId != null, refusals: 'all',
  },
  {
    id: 'answer-challenge', who: 'member', title: 'Accept another four-ball’s challenge',
    setup: challenged, steps: [{ tap: 'Accept' }],
    action: 'answerPlayerEvent', expect: db => db.playerEvents[0].status === 'accepted', refusals: 'all',
  },
]
