// Journeys for the club office (the office login: an admin, never a player). See ../catalogue.js for the shape.
const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)
const LATER = '2026-10-17'
const join = db => db.joins.push({ id: 1, name: 'Sean Byrne', email: 'sean@example.invalid', createdAt: '2026-10-09T10:00:00Z' })
const request = db => db.requests.push({ id: 7, memberId: 1, slotId: at(db, 540, LATER).id, date: LATER, time: 540, memberIds: [], guests: [], reason: 'Visitors from Boston', status: 'pending', bookingId: null, note: null, seen: true, createdAt: '2026-10-09T18:00:00Z' })
const booked = db => db.book(1, at(db, 600).id, [3])
const member = id => [{ tap: '[data-ov="members"]' }, { tap: `[data-o-m="${id}"]` }]
// Men's Match Play: four entries (Gary 100, Declan 101, Ciarán 102, Siobhán 103), entries closed.
const entered = () => db => {
  Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: false, roundDeadlines: [] })
  db.signupEntries.push(...[0, 1, 3, 5].map((m, i) => ({ id: 100 + i, compId: 1, memberId: m, partnerId: null })))
}
const drawn = published => db => {
  entered()(db)
  Object.assign(db.signups[0], { drawPublished: published, roundDeadlines: published ? ['2026-11-15', '2026-12-06'] : [] })
  db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 2, compId: 1, round: 1, slot: 1, aEntry: 102, bEntry: 103, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 3, compId: 1, round: 2, slot: 0, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
}
const openDraw = [{ tap: '[data-ov="comps"]' }, { tap: '[data-o-comp="s:1"]' }, { tap: db => (db.koMatches.length ? (db.signups[0].drawPublished ? 'Set results' : 'Make the draw') : 'Make the draw') }]
// A card read from paper today, left for the office to confirm (Tom uploaded it).
const paperCard = db => {
  const b = db.book(10, at(db, 570).id, [1])
  db.rounds.push({ id: 61, date: db.today, slotId: b.slotId, createdBy: 10, lineup: [{ m: 10 }, { m: 1 }], game: 'stab', pairing: 0, submitted: {},
    scores: Array.from({ length: 18 }, () => [4, 5]), done: Array(18).fill(true), paper: { by: 10, confirmer: null, state: 'waiting', note: null, photos: 1 } })
}

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
    id: 'office-set-handicaps', who: 'office', title: 'Update handicaps from a CSV file',
    steps: [{ tap: '[data-ov="members"]' }, { tap: 'Update handicaps' }, { file: ['#o-hfile', 'handicaps.csv', 'Name,Handicap Index\nCiarán O\'Neill,11.9\n'] }, { tap: '#o-hgo' }],
    action: 'setHandicaps', expect: db => db.members.find(m => m.id === 3).hcp === 11.9, refusals: 'all',
  },
  {
    id: 'office-charge-guests', who: 'office', title: 'Check in a walk-in guest and charge the member’s guest points',
    steps: [{ tap: '[data-ov="guests"]' }, { type: ['#ci-find', 'ciar'] }, { tap: '[data-ci-m="3"]' }, { type: ['#ci-n0', 'Sam Guest'] }, { tap: '#ci-go' }],
    action: 'chargeGuests', expect: db => db.guestVisits.some(v => v.member === 3 && v.guest === 'Sam Guest' && v.by != null), refusals: 'all',
  },
  {
    id: 'office-remove-guest-charge', who: 'office', title: 'Remove a guest checked in at the office today',
    setup: db => db.guestVisits.push({ id: 77, member: 3, date: db.today, guest: 'Sam Guest', club: '', points: 3, playerId: null, by: 0 }),
    steps: [{ tap: '[data-ov="guests"]' }, { tap: '[data-ci-rm="77"]' }, { tap: 'Sure?' }],
    action: 'removeGuestCharge', expect: db => db.guestVisits.length === 0, refusals: 'all',
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
  {
    id: 'office-club-name', who: 'office', title: 'Rename the club',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="colours"]' }, { type: ['#club-name', 'Royal Portrush Test Club'] }, { tap: '#csave' }],
    action: 'setClubName', expect: db => db.theme.name === 'Royal Portrush Test Club', refusals: 'all',
  },
  {
    id: 'office-colours', who: 'office', title: 'Change the club’s colours',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="colours"]' }, { type: ['#main-hex', '#224466'] }, { tap: '#csave' }],
    action: 'setTheme', expect: db => db.theme.main?.toLowerCase() === '#224466', refusals: 'all',
  },
  {
    id: 'office-course-location', who: 'office', title: 'Set where the course is (for the weather)',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="colours"]' }, { type: ['#loc-q', '55.2, -6.65'] }, { tap: '#loc-find' }],
    action: 'setCourseLocation', expect: db => db.theme.coursePlace === 'Pinned point', refusals: 'all',
  },
  {
    id: 'office-publish-pins', who: 'office', title: 'Set today’s flags',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="pins"]' }, { tap: '#pub' }],
    action: 'publishPins', expect: db => db.pinSheet?.pins?.length === 18, refusals: 'all',
  },
  {
    id: 'office-green-width', who: 'office', title: 'Correct a green’s width',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="pins"]' }, { tap: '[data-w="1"]' }, { tap: '[data-wd="1"]' }, { tap: '#wsave' }],
    action: 'setGreenWidth', expect: db => db.calls.includes('setGreenWidth'), refusals: 'all',
  },
  {
    id: 'office-booking-rules', who: 'office', title: 'Change when tee times open',
    steps: [{ tap: '[data-ov="tee"]' }, { tap: '#o-rules' }, { tap: '#br-save' }],
    action: 'setBookingRules', expect: db => db.calls.includes('setBookingRules'), refusals: 'all',
  },
  {
    id: 'office-hut-on', who: 'office', title: 'Switch the halfway hut on or off',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="hutadmin"]' }, { tap: '#hut-on' }],
    action: 'setHutOn', expect: db => db.calls.includes('setHutOn'), refusals: 'all',
  },
  {
    id: 'office-hut-add', who: 'office', title: 'Add something to the halfway hut menu',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="hutadmin"]' }, { tap: '#hut-add' }, { type: ['#hut-name', 'Soup of the day'] }, { type: ['#hut-price', '4.50'] }, { tap: '#hut-form button[type="submit"]' }],
    action: 'saveHutItem', expect: db => db.hut.menu.some(i => i.name === 'Soup of the day'), refusals: 'all',
  },
  {
    id: 'office-hut-remove', who: 'office', title: 'Take something off the halfway hut menu',
    steps: [{ tap: '[data-ov="club"]' }, { tap: '[data-o-open="hutadmin"]' }, { tap: '[data-item="1"]' }, { tap: '#hut-rm' }, { tap: '#hut-rm' }],
    action: 'removeHutItem', expect: db => !db.hut.menu.some(i => i.id === 1), refusals: 'all',
  },
  {
    id: 'office-run-signup', who: 'office', title: 'Open a sign-up competition again for this year',
    setup: db => { Object.assign(db.signups[1], { open: false, closesOn: '2025-09-01' }) },
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '[data-o-comp="s:2"]' }, { type: ['#o-rclose', '2026-11-01'] }, { type: ['#o-rfinal', '2027-03-01'] }, { tap: '#o-run' }],
    action: 'runSignup', expect: db => db.signups[1].open && db.signups[1].closesOn === '2026-11-01', refusals: 'all',
  },
  {
    id: 'office-delete-signup', who: 'office', title: 'Delete a sign-up competition',
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '[data-o-comp="s:2"]' }, { tap: '#o-del' }, { tap: '#o-del' }],
    action: 'deleteSignup', expect: db => !db.signups.some(c => c.id === 2), refusals: 'all',
  },
  {
    id: 'office-delete-event', who: 'office', title: 'Delete a club event',
    steps: [{ tap: '[data-ov="comps"]' }, { tap: db => `[data-o-comp="e:${db.events.find(e => e.club && e.style !== 'league').id}"]` }, { tap: '#o-del' }, { tap: '#o-del' }],
    action: 'deleteEvent', expect: db => db.events.filter(e => e.club && e.style !== 'league').length === 0, refusals: 'all',
  },
  {
    id: 'office-save-template', who: 'office', title: 'Save a club event as a template',
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '#o-new' }, { tap: '[data-o-kind="event"]' }, { type: ['#ev-name', 'Turkey Trot'] }, { tap: '[data-style="individual"]' }, { tap: '[data-who="all"]' }, { tap: '#ev-next' }, { tap: '#ev-tpl' }],
    action: 'saveEventTemplate', expect: db => db.eventTemplates.some(t => t.name === 'Turkey Trot'), refusals: 'all',
  },
  {
    id: 'office-delete-template', who: 'office', title: 'Delete a club event template',
    setup: db => db.eventTemplates.push({ id: 77, name: 'Turkey Trot', setup: { name: 'Turkey Trot', style: 'individual', fmt: 'stab', days: 1, club: true, everyone: true, selfEntry: true, holes: null } }),
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '[data-o-comp="t:77"]' }, { tap: '#o-tdel' }, { tap: '#o-tdel' }],
    action: 'deleteEventTemplate', expect: db => db.eventTemplates.length === 0, refusals: 'all',
  },
  {
    id: 'office-new-event', who: 'office', title: 'Make a club event',
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '#o-new' }, { tap: '[data-o-kind="event"]' }, { type: ['#ev-name', 'Captain’s Day'] }, { tap: '[data-style="individual"]' }, { tap: '[data-who="all"]' }, { tap: '#ev-next' }, { tap: '#ev-next' }],
    action: 'saveEvent', expect: db => db.events.some(e => e.name === 'Captain’s Day'), refusals: 'all',
  },
  {
    id: 'office-weekly-repeat', who: 'office', title: 'Make a club event every week until a date',
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '#o-new' }, { tap: '[data-o-kind="event"]' }, { type: ['#ev-name', 'Sunday Stableford'] }, { tap: '[data-style="individual"]' }, { tap: '[data-who="all"]' }, { type: ['#ev-date', '2026-12-06'] }, { tap: '#ev-next' }, { type: ['#ev-rep', '2027-01-10'] }, { tap: '#ev-next' }],
    action: 'saveEvents', expect: db => db.events.filter(e => e.name === 'Sunday Stableford').length === 6, refusals: 'all',
  },
  {
    id: 'office-remove-entrant', who: 'office', title: 'Take someone off a league they signed up for',
    setup: db => db.events.push({ id: 880, name: 'Frosty League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: '2026-12-07', days: 1, weeks: 10, bestOf: 4,
      teams: [], team: {}, players: [10], matches: {}, captainPool: [], signup: true, advertiseFrom: '2026-10-01', entriesClose: '2026-11-30', maxEntries: 4, createdBy: { id: 0, name: 'Gary Cochrane' } }),
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '[data-o-comp="e:880"]' }, { tap: '[data-o-ents="880"]' }, { tap: '[data-o-rment="10"]' }, { tap: '[data-o-rment="10"]' }],
    action: 'removeEventEntrant', expect: db => db.events.find(e => e.id === 880).players.length === 0, refusals: 'all',
  },
  {
    id: 'office-save-signup', who: 'office', title: 'Change a sign-up competition’s settings',
    steps: [{ tap: '[data-ov="comps"]' }, { tap: '[data-o-comp="s:1"]' }, { tap: 'Entries and settings' }, { type: ['#sc-name', 'Men’s Match Play Cup'] }, { tap: 'Save' }],
    action: 'saveSignup', expect: db => db.signups[0].name === 'Men’s Match Play Cup', refusals: 'all',
  },
  {
    id: 'office-make-draw', who: 'office', title: 'Make a knockout draw',
    setup: entered(), steps: [...openDraw, { tap: '#ko-make' }],
    action: 'makeDraw', expect: db => db.koMatches.length > 0, refusals: 'all',
  },
  {
    id: 'office-publish-draw', who: 'office', title: 'Publish a knockout draw',
    setup: drawn(false), steps: [...openDraw, { tap: '#ko-pub' }, { tap: '#ko-pub' }],
    action: 'publishDraw', expect: db => db.signups[0].drawPublished, refusals: 'all',
  },
  {
    id: 'office-swap-draw', who: 'office', title: 'Swap two names in a draft draw',
    setup: drawn(false), steps: [...openDraw, { tap: '[data-km="1"] .kos' }, { tap: '[data-km="2"] .kos' }],
    action: 'swapDraw', expect: db => db.koMatches[0].aEntry === 102, refusals: 'all',
  },
  {
    id: 'office-round-dates', who: 'office', title: 'Spread a knockout’s play-by dates to the final',
    setup: drawn(false), steps: [...openDraw, { type: ['#ko-fin', '2027-03-01'] }, { tap: '#ko-spread' }],
    action: 'setRoundDeadlines', expect: db => db.signups[0].roundDeadlines.at(-1) === '2027-03-01', refusals: 'all',
  },
  {
    id: 'office-set-result', who: 'office', title: 'Set a knockout result as the competition secretary',
    setup: drawn(true), steps: [...openDraw, { tap: '[data-kset="1"]' }, { tap: '[data-kw="101"]' }, { tap: '3&2' }, { tap: 'Save result' }],
    action: 'adminSetKoResult', expect: db => db.koMatches[0].status === 'confirmed', refusals: 'all',
  },
  {
    id: 'office-confirm-paper', who: 'office', title: 'Confirm a paper score left for the office',
    setup: paperCard, steps: [{ tap: '[data-o-pconf="61"]' }],
    action: 'confirmPaperScore', expect: db => db.rounds.find(r => r.id === 61).paper.state === 'confirmed', refusals: 'all',
  },
  {
    id: 'office-send-back-paper', who: 'office', title: 'Send a paper score back with a note',
    setup: paperCard, steps: [{ tap: '[data-o-pback="61"]' }, { type: ['#pb-note', 'Hole 14 was a 6'] }, { tap: '#pb-send' }],
    action: 'sendBackPaperScore', expect: db => db.rounds.find(r => r.id === 61).paper.state === 'sent_back', refusals: 'all',
  },
]
