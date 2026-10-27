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
// My four-ball at 09:30 (with Tom) and Peter's at 09:40 (with Liam).
const twoGroups = db => { db.book(1, at(db, 570).id, [10]); db.book(7, at(db, 580).id, [11]) }
// The club advertises the Frosty League for sign-up (entries close 30 Nov, 4 places); players already in it.
const signupLeague = (players = [10, 12]) => db => db.events.push({ id: 881, name: 'Frosty League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: '2026-12-07', days: 1, weeks: 10, bestOf: 4,
  teams: [], team: {}, players: [...players], matches: {}, captainPool: [], signup: true, advertiseFrom: '2026-10-01', entriesClose: '2026-11-30', maxEntries: 4, createdBy: { id: 0, name: 'Gary Cochrane' } })
// A card read from paper today: Declan (1) and Ciarán (3), uploaded by `by`, to be confirmed by `confirmer`.
const paperCard = (db, { by, confirmer = null, state = 'waiting', note = null }) => {
  const b = db.book(1, at(db, 570).id, [3])
  db.rounds.push({ id: 61, date: db.today, slotId: b.slotId, createdBy: by, lineup: [{ m: 1 }, { m: 3 }], game: 'stab', pairing: 0, submitted: {},
    scores: Array.from({ length: 18 }, () => [4, 5]), done: Array(18).fill(true), paper: { by, confirmer, state, note, photos: 1 } })
  db.photos.push('61/1.jpg')
}
// The camera and the crop, stood in for (the pretend browser has neither).
const camera = async () => {
  const flow = await import('../../../paper/paper-flow.js')
  flow.io.choose = async () => new File(['card'], 'card.jpg', { type: 'image/jpeg' })
  flow.io.preview = () => 'data:,'
  flow.io.crop = async () => new Blob(['grid'], { type: 'image/jpeg' })
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
    id: 'book-club-match', who: 'member', title: 'Book my club knockout match (the other two places are held for it)',
    setup: db => {
      Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: ['2026-11-15', '2026-12-06'] })
      db.signupEntries.push(...[1, 0, 3, 5].map((m, i) => ({ id: 100 + i, compId: 1, memberId: m, partnerId: null })))
      db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
    },
    steps: [{ tap: 'Competition' }, { tap: 'Men’s Match Play' }, { tap: 'Book this match' }, { tap: db => `[data-id="${at(db, 600).id}"]` }, { tap: 'Book Men’s Match Play match' }],
    action: 'bookClubMatch', expect: db => db.bookings.some(b => b.held === 2), refusals: 'all',
  },
  {
    id: 'add-to-booking', who: 'member', title: 'Add a fourth player to a booking I’m on',
    setup: db => db.book(5, at(db, 600).id, [1, 7]),
    steps: [{ tap: 'Booking' }, { tap: '10:00' }, { tap: '+ Add a player' }, { tap: '[data-open]' }, { tap: "Ciarán O'Neill" }, { tap: 'Add to booking' }],
    action: 'addToBooking', expect: db => at(db, 600).players.some(p => p.memberId === 3), refusals: 'all',
  },
  {
    id: 'remove-from-booking', who: 'member', title: 'Take one person off my booking',
    setup: db => db.book(1, at(db, 540).id, [3, 5]),
    steps: [{ tap: 'Booking' }, { tap: '09:00' }, { tap: '.rmrow:nth-child(2) [data-rm]' }, { tap: 'Sure?' }],
    action: 'removeFromBooking', expect: db => db.bookings.length === 1 && at(db, 540).players.length === 2, refusals: 'all',
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
  {
    id: 'send-challenge', who: 'member', title: 'Challenge another four-ball on the tee sheet',
    setup: twoGroups, steps: [{ tap: 'Scoring' }, { tap: '#pe-new' }, { tap: db => `[data-inv="${at(db, 580).id}"]` }, { tap: '#pe-setup' }, { tap: '#pe-send' }],
    action: 'proposePlayerEvent', expect: db => db.playerEvents.some(e => e.status === 'pending'), refusals: 'all',
  },
  {
    id: 'send-singles', who: 'member', title: 'Challenge a player in another group to a one-on-one',
    setup: twoGroups,
    steps: [...startRound, { tap: '#gname' }, { tap: '[data-am="one"]' }, { tap: db => `[data-op="t${at(db, 580).players.find(p => p.memberId === 11).id}"]` }, { tap: '[data-ok="sm2"]' }, { tap: '#am-go' }],
    keeps: { rounds: 'the card is started first (Scoring); the challenge is separate' },
    action: 'proposeSingles', expect: db => db.playerEvents.some(e => e.style === 'singles'), refusals: 'all',
  },
  {
    id: 'enter-signup-league', who: 'member', title: 'Sign up for a league the club is advertising',
    setup: signupLeague(), steps: [{ tap: 'Competition' }, { tap: '[data-tab="events"]' }, { tap: '[data-esign="881"]' }],
    action: 'enterEvent', expect: db => db.events.find(e => e.id === 881).players.includes(1), refusals: 'all',
  },
  {
    id: 'withdraw-signup-league', who: 'member', title: 'Withdraw from a league I signed up for',
    setup: signupLeague([10, 1]), steps: [{ tap: 'Competition' }, { tap: '[data-tab="entered"]' }, { tap: '[data-ewd="881"]' }, { tap: '[data-ewd="881"]' }],
    action: 'withdrawEvent', expect: db => !db.events.find(e => e.id === 881).players.includes(1), refusals: 'all',
  },
  {
    id: 'guest-handicap', who: 'member', title: 'Set my guest’s handicap on the scorecard',
    setup: db => db.book(1, at(db, 570).id, [], [{ name: 'Sam Visitor', club: 'Royal Portrush' }]),
    steps: [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: '#start' }, { tap: 'Set handicap' }, { type: ['#h-idx', '12.4'] }, { tap: '#hsave' }],
    keeps: { rounds: 'the card is started first (Scoring); the handicap is separate' },
    action: 'setGuestHandicap', expect: db => Object.values(db.slots).flat().flatMap(s => s.players).find(p => p.name === 'Sam Visitor').hcp === 12.4, refusals: 'all',
  },
  {
    id: 'cancel-challenge', who: 'member', title: 'Cancel a challenge I sent',
    setup: db => { challenged(db); Object.assign(db.playerEvents[0], { createdBy: { id: 1, name: 'Declan Murphy' }, proposedBy: { id: 1, name: 'Declan Murphy' } }) },
    steps: [{ tap: 'Scoring' }, { tap: '[data-pe-cancel="5"]' }, { tap: '[data-pe-cancel="5"]' }],
    action: 'cancelPlayerEvent', expect: db => db.playerEvents[0].status === 'cancelled', refusals: 'all',
  },
  {
    id: 'counter-challenge', who: 'member', title: 'Suggest changes to a challenge',
    setup: challenged, steps: [{ tap: 'Scoring' }, { tap: '#pe-counter' }, { tap: '#pe-send' }],
    action: 'counterPlayerEvent', expect: db => db.calls.includes('counterPlayerEvent'), refusals: 'all',
  },
  {
    id: 'cancel-hut-order', who: 'member', title: 'Cancel my halfway hut order before it’s made',
    setup: db => db.orders.push({ id: 900, memberId: 1, items: [{ id: 1, name: 'Bacon roll', qty: 1, pricePence: 450 }], totalPence: 450, note: null, status: 'sent', cancelNote: null, createdAt: new Date().toISOString(), roundId: null }),
    steps: [{ tap: '#account' }, { tap: '[data-a="hutorder"]' }, { tap: '[data-cancel="900"]' }, { tap: '[data-cancel="900"]' }],
    action: 'cancelMyHutOrder', expect: db => db.orders[0].status === 'cancelled', refusals: 'all',
  },
  {
    id: 'count-for-event-round', who: 'member', title: 'Count my round for an event I’m entered in as I start',
    setup: db => { teeTime(db); db.events.push({ id: 950, name: 'Pals Medal', style: 'individual', fmt: 'stab', club: false, everyone: false, startDate: db.today, days: 1, players: [1, 3], team: {}, teams: [], matches: {}, captainPool: [], entryRequired: true, createdBy: { id: 1, name: 'Declan Murphy' } }) },
    steps: [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: 'Pals Medal' }, { tap: '#start' }], // (Ciarán marks me: the only other player)
    keeps: { rounds: 'the card is made first; a refused count leaves a general-play card, which can still be counted before hole 1' },
    action: 'enterEventRound', expect: db => db.entries.some(x => x.eventId === 950 && x.memberId === 1), refusals: 'all',
  },
  {
    id: 'leave-league', who: 'member', title: 'Stop my round counting for the league before hole 1',
    setup: db => { const b = teeTime(db); db.rounds.push({ id: 71, date: db.today, slotId: b.slotId, createdBy: 1, lineup: [{ m: 1 }, { m: 3 }], game: 'stab', pairing: 0, submitted: {}, scores: Array.from({ length: 18 }, () => [4, 4]), done: Array(18).fill(false) }); db.leagueEntries.push({ eventId: 2, week: 1, memberId: 1, roundId: 71 }, { eventId: 2, week: 1, memberId: 3, roundId: 71 }) },
    prepare: () => { try { localStorage.setItem('teemate.lgAsked.71', '1') } catch { /* none */ } },
    steps: [{ tap: 'Scoring' }, { tap: '.wlpill' }, { tap: '[data-yn="2:1"][data-v="0"]' }, { tap: '[data-yn="2:3"][data-v="1"]' }, { tap: '#lg-done' }],
    action: 'leaveLeague', expect: db => !db.leagueEntries.some(x => x.memberId === 1), refusals: 'all',
  },
  {
    id: 'booked-you-in', who: 'member', title: 'See that someone booked me in, and OK it',
    setup: db => { const b = db.book(7, at(db, 600).id, [1]); db.notices.push({ id: 900, memberId: 1, kind: 'added', date: db.today, oldTime: 600, newTime: null, note: null, byName: 'Peter Walsh', withNames: ['Peter'], bookingId: b.id, seen: false }) },
    steps: [{ tap: '[data-al="ok"]' }],
    action: 'seenBookingNotice', expect: db => db.notices[0].seen, refusals: { none: 'marking a notice read happens quietly; if it fails the notice simply shows again next time' },
  },
  {
    id: 'request-answers-read', who: 'member', title: 'Open my bookings after a request is answered (the answer is marked read)',
    setup: db => db.requests.push({ id: 36, memberId: 1, slotId: 1, date: FUTURE, time: 460, memberIds: [], guests: [], reason: 'Visitors flying in', status: 'approved', bookingId: null, note: null, decidedAt: '2026-10-09T18:45:00Z', seen: false, createdAt: '2026-10-09T18:00:00Z' }),
    steps: [{ tap: '[data-al="later"]' }, { tap: 'Booking' }],
    action: 'markTeeTimeRequestsSeen', expect: db => db.requests[0].seen, refusals: { none: 'marking answers read happens quietly; if it fails they show as new again next time' },
  },
  {
    id: 'paper-resend', who: 'member', title: 'Fix my paper score that was sent back, and send it again',
    setup: db => { paperCard(db, { by: 1, confirmer: 3, state: 'sent_back', note: 'Hole 14 was a 6' }) },
    steps: [{ tap: 'Check my scores' }, { tap: '[data-ph="13"]' }, { tap: '[data-pn="6"]' }, { tap: 'My scores are right' }],
    action: 'resendPaperScore', expect: db => db.rounds.find(r => r.id === 61).paper.state === 'waiting', refusals: 'all',
    keeps: { rounds: 'the fixed score is saved on the card first; a refused send leaves it sent back, to send again' },
  },
  {
    id: 'paper-card', who: 'member', title: 'Photograph our paper card and save the scores',
    setup: db => { db.theme.paperCards = true; db.book(1, at(db, 570).id, [3]) },
    prepare: camera,
    steps: [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: '#start' }, { tap: 'Photograph your card instead' }, { tap: 'Take photo of card 1' }, { tap: 'Yes, all the scores are in the box' },
      { tap: '#pf-next' }, { tap: 'Ciarán’s scores are right' }, { tap: 'My scores are right' }, { tap: '[data-conf="3"]' }, { tap: '#pf-save' }],
    keeps: { rounds: 'the scores are saved on the card first, then it is marked as read from paper', photos: 'the photo is kept with the card' },
    action: 'markPaperCard', expect: db => db.rounds.some(r => r.paper?.state === 'waiting'), refusals: 'all',
  },
  {
    id: 'paper-confirm', who: 'member', title: 'Confirm a playing partner’s paper score',
    setup: db => paperCard(db, { by: 3, confirmer: 1 }), steps: [{ tap: '[data-al="pconfirm"]' }],
    action: 'confirmPaperScore', expect: db => db.rounds.find(r => r.id === 61).paper.state === 'confirmed', refusals: 'all',
  },
  {
    id: 'paper-send-back', who: 'member', title: 'Send a partner’s paper score back with a note',
    setup: db => paperCard(db, { by: 3, confirmer: 1 }), steps: [{ tap: '[data-al="pback"]' }, { type: ['#pb-note', 'Hole 14 was a 6'] }, { tap: '#pb-send' }],
    action: 'sendBackPaperScore', expect: db => db.rounds.find(r => r.id === 61).paper.state === 'sent_back', refusals: 'all',
  },
  {
    id: 'move-match-booking', who: 'member', title: 'Rearrange my team match’s tee time',
    setup: db => {
      db.events.push({ id: 900, name: 'Pals Season', A: { name: 'Blues', col: '#19335A' }, B: { name: 'Reds', col: '#762A43' },
        club: false, everyone: false, startDate: '2026-10-07', days: 176, season: true, style: 'ryder', fmt: 'bbl', entryRequired: true,
        players: [0, 9, 10, 1], team: { 0: 'A', 9: 'A', 10: 'B', 1: 'B' }, matches: { 4: [{ a: [0, 9], b: [10, 1] }] }, createdBy: { id: 0, name: 'Gary Cochrane' } })
      db.book(1, at(db, 570).id, [0, 9, 10])
    },
    steps: [{ tap: 'Competition' }, { tap: '[data-tab="entered"]' }, { tap: 'Pals Season' }, { tap: '[data-mact="move"]' }, { tap: '11:00' }, { tap: '#mv-go' }],
    action: 'moveMatchBooking', expect: db => at(db, 660).players.length === 4, refusals: 'all',
  },
]
