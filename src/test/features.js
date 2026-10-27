// The feature register: every feature of TeeMate, in the club's words, with the situations it's tested in and the
// steps to try it on a phone before a demo. features.test.js checks every test named here exists, and that every
// journey in the catalogue belongs to a feature. scripts/testing-pdf.mjs turns it into the testing PDF.
//
// A test is named one of these ways:
//   'journey:<id>'                 a journey in src/test/journeys/catalogue (tapped through, plus every refusal it can meet)
//   'rule:<id>'                    a rule in src/test/contract/rules.js (the pretend server and the database agree)
//   'src/…test.js › <test title>'  one test in that file
//   'src/…test.js'                 every test in that file
//   'supabase/tests/<file>.sql › <name>'  one database check, run on the test database
// demo: steps on a phone with the demo logins (password: password). Logins: live@test.com (Live Tester, a member),
// captain@test.com (a league captain), winter.league@test.com (a Winter League player), clean@test.com (a new member
// with nothing yet), admin@test.com (the club office), hut@test.com (halfway hut staff).

const J = 'src/test/journeys/journeys.test.js', F = 'src/test/journeys/features.test.js', P = 'src/test/journeys/paper.test.js'

export const AREAS = ['Booking', 'Scoring and games', 'Competitions', 'Club life', 'Paper scorecards', 'Club office', 'Signing in', 'Behind the scenes']

export const FEATURES = [
  // ── Booking ──────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'book', area: 'Booking', name: 'Book a tee time',
    what: 'Members book a time on the tee sheet with friends and guests. Times open on a set day and hour; nobody can be booked twice within two hours.',
    scenarios: [
      { says: 'Book with a friend; the booking shows for both', tests: ['journey:book-tee-time', `${J} › 1. Book a tee time with a friend`] },
      { says: 'Book a guest from another club, using guest points', tests: [`${J} › 2. Book with a friend from another club as a guest (their details filled in)`, 'src/friend-link.test.js › not enough guest points: other-club friends are greyed out'] },
      { says: 'Days not open yet are refused, with when they open', tests: ['supabase/tests/release.sql › Before release: a member is refused, with when it opens', 'src/release.test.js'] },
      { says: 'Today starts at the time now; members can’t book a time that has gone (the office still can)', tests: [`${F} › today starts at the time now: times already gone aren’t listed (so they can’t be booked, and no scrolling past them)`, 'supabase/tests/passed_times.sql › Passed: a member can\'t book a time that has gone today', 'supabase/tests/passed_times.sql › Passed: the club office still can'] },
      { says: 'Two hours apart: refused closer, allowed after', tests: ['rule:booking-two-hours-fine', 'supabase/tests/bookings_cards.sql › 2 hours: 2 hours 10 minutes later is fine'] },
      { says: 'Every refusal while booking is seen, nothing half-booked', tests: ['journey:book-tee-time'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Booking → + Add a booking', 'Pick a free time, add a friend', 'Confirm booking'], see: 'The booking is under Booking, with your friend on it.' }] },
  { id: 'my-bookings', area: 'Booking', name: 'My bookings: cancel and change',
    what: 'Members see their bookings and cancel them, or take one person off one they made. Cancelling a booking with scores warns first and takes the scorecard with it.',
    scenarios: [
      { says: 'Delete a booking (two taps)', tests: ['journey:cancel-booking'] },
      { says: 'A club singles match (knockout or club event) holds the other two places: “Autumn Knockout match”, nobody else can book them', tests: ['journey:book-club-match', `${F} › a club knockout: the other two places are held for the match, and the time is full for everyone else`, `${F} › a club event’s singles match holds the places too`, 'supabase/tests/match_hold.sql › Hold: nobody else can book the held places'] },
      { says: 'Only club 1 v 1 matches hold places; a held booking moves with its hold and opens up if a player leaves', tests: [`${F} › a members’ own knockout doesn’t hold places: the usual open spaces`, 'supabase/tests/match_hold.sql › Hold: a pairs match doesn\'t hold places', 'supabase/tests/match_hold.sql › Hold: an office move takes the held places with it', 'supabase/tests/match_hold.sql › Hold: when a player withdraws the held places open up'] },
      { says: 'Add a player (a fourth, say) to a booking I’m on, even one someone else made; they’re told', tests: ['journey:add-to-booking', `${F} › someone else booked me with two others: + Add a player, pick a member, and they join the same booking`, 'supabase/tests/add_to_booking.sql › Add: the new player is told who booked them in'] },
      { says: 'A full time has no + Add a player; adding to a full time is refused', tests: [`${F} › a full time: no + Add a player`, 'supabase/tests/add_to_booking.sql › Add: a full time is refused'] },
      { says: 'Take one person off a booking I made (two taps); a guest’s points come back; the last one off deletes it', tests: ['journey:remove-from-booking', `${F} › a guest: their guest points come back`, 'supabase/tests/remove_from_booking.sql › Take off: taking the last person off deletes the booking'] },
      { says: 'Only whoever made the booking can take people off', tests: [`${F} › a booking someone else made: no Remove buttons (I can only withdraw myself)`, 'supabase/tests/remove_from_booking.sql › Take off: only the member who made the booking'] },
      { says: 'A booking with scores: warned, and the scorecard goes too', tests: [`${J} › 3. Delete a booking that has scores: warned, and the scorecard goes too`, 'supabase/tests/card_delete.sql › Delete confirmed: the scorecard goes too'] },
      { says: 'Rearrange a team match’s booking to another time', tests: ['journey:move-match-booking', `${J} › 5. Book your match from the event, then rearrange it`] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Booking → tap a booking → Delete booking → tap again'], see: 'It’s gone from Booking and the tee sheet.' },
      { who: 'live@test.com', steps: ['Book a time with a friend', 'Booking → tap it → Remove next to your friend → Sure?'], see: 'Your friend is off; you keep the time.' }] },
  { id: 'maker-mark', area: 'Booking', name: 'Made by TeeMate on Home',
    what: 'A quiet maker’s mark at the foot of Home (and sign-in and Account), which opens about us.',
    scenarios: [{ says: 'On Home, tappable', tests: ['src/test/journeys/features.test.js › a quiet maker’s mark at the foot of Home, which opens about us'] }],
    demo: [{ who: 'live@test.com', steps: ['Home → tap Made by TeeMate at the foot'], see: 'The about-us sheet, with the email to ask about TeeMate.' }] },
  { id: 'offline-scores', area: 'Scoring and games', name: 'Scoring with no signal',
    what: 'A hole saved in a dead spot is kept on the phone (the card says so) and sent when the signal comes back, every 20 seconds, or the next time the app opens. Only the cells you typed are sent, so the group’s scores aren’t overwritten.',
    scenarios: [
      { says: 'Kept on the phone, said on the card, sent when the signal is back', tests: ['src/test/journeys/offline-scores.test.js › a hole is kept on the phone, the card says so, and it’s sent when the signal comes back', 'src/test/journeys/offline-scores.test.js › it keeps trying by itself every 20 seconds'] },
      { says: 'Closing the app loses nothing', tests: ['src/test/journeys/offline-scores.test.js › closing the app doesn’t lose them: the next time Scoring opens, they’re sent'] },
      { says: 'A real refusal still says why', tests: ['src/test/journeys/offline-scores.test.js › a refusal from the server (not the signal) still says why and keeps the hole open'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Start a round', 'Turn on Airplane mode, save a hole', 'Turn Airplane mode off'], see: '“Saved on your phone”, then “Your scores have been sent”.' }] },
  { id: 'scan-partners', area: 'Booking', name: 'Add playing partners by scanning their QR code',
    what: 'In booking, Scoring → Players and Friends, scan the QR on someone’s Account card instead of searching. The camera opens again for the next person until the group is full. Club members join the group; TeeMate players from other clubs join a booking as guests. Each is kept as a friend.',
    scenarios: [
      { says: 'Booking: a club member, then another club’s player as a guest, back to back', tests: ['src/test/journeys/guest-check-in.test.js › booking: scan a club member, then a player from another club (a guest, details filled in); the camera opens again for each', 'src/test/journeys/guest-check-in.test.js › booking: scanning someone already in the group says so'] },
      { says: 'Scoring → Players: club members onto the card; other clubs told to come through a booking', tests: ['src/test/journeys/guest-check-in.test.js › Scoring → Players: scan club members onto the card, one after another', 'src/test/journeys/guest-check-in.test.js › Scoring → Players: someone from another club is told how they join a card'] },
      { says: 'Friends: scan to add friends', tests: ['src/test/journeys/guest-check-in.test.js › Friends → Find members: scan to add friends, one after another', 'src/member-card.test.js'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Booking → + Add a booking → a time → Open space → Scan their QR code', 'Scan a friend’s Account card QR'], see: 'They join the group and the camera opens for the next.' }] },
  { id: 'guest-check-in', area: 'Booking', name: 'Guest check-in at the club office',
    what: 'For guests who weren’t booked in the app, the office scans the member’s card (or finds them by name), adds up to 3 guests and charges their guest points. Today’s check-ins can be removed again.',
    scenarios: [
      { says: 'Scan a card, add two guests, 6 points charged', tests: ['src/test/journeys/guest-check-in.test.js › the office scans a card, adds two guests, and 6 points are charged', 'journey:office-charge-guests', 'supabase/tests/guest_check_in.sql › Check-in: two guests charged, points left is right'] },
      { says: 'A card that isn’t ours, or whose name doesn’t match, is refused', tests: ['src/test/journeys/guest-check-in.test.js › a card that isn’t ours is refused', 'src/member-card.test.js', 'rule:checkin-card-name'] },
      { says: 'Not enough points: refused with the points left, nothing charged', tests: ['src/test/journeys/guest-check-in.test.js › not enough points: refused with the points left, nothing charged', 'rule:checkin-over-allowance'] },
      { says: 'Only the club office can check in guests', tests: ['rule:checkin-admin-only', 'supabase/tests/guest_check_in.sql › Check-in: only the office sees today\'s list'] },
      { says: 'Find by name when there’s no phone or no camera', tests: ['src/test/journeys/guest-check-in.test.js › find a member by name, then charge', 'src/test/journeys/guest-check-in.test.js › the camera can’t be used: the message, and find by name still works'] },
      { says: 'Remove today’s check-in: the points come back; booked guests and earlier days can’t be removed here', tests: ['journey:office-remove-guest-charge', 'supabase/tests/guest_check_in.sql › Check-in: a booked guest can\'t be removed here', 'supabase/tests/guest_check_in.sql › Check-in: yesterday\'s charge can\'t be removed'] },
      { says: 'The office sees each member’s guests this year, with how often each has come (×3 stands out)', tests: ['src/test/journeys/guest-check-in.test.js › Members → a member: guests this year, each with ×times and points', 'src/test/journeys/guest-check-in.test.js › Admin → Guest points: under each member, their guests with counts', 'src/guest-counts.test.js'] },
      { says: 'The member is told: “6 guest points used today · 30 of 36 left”, with the guests’ names', tests: ['src/test/journeys/guest-check-in.test.js › the office charges; the member’s drop-down says the points used and what’s left; OK clears it', 'src/alerts.test.js › the club office charged my guests: points used today and how many are left; OK only', 'supabase/tests/guest_notice.sql › Guest notice: the member is told the points used and how many are left'] },
      { says: 'Members show their card, and see office check-ins in their guest list', tests: ['src/test/journeys/guest-check-in.test.js › Guest points: Show my card shows my QR code', 'src/test/journeys/guest-check-in.test.js › a guest checked in at the office shows in my guest list'] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Club office → Guests → Find a member by name → pick Live Tester', 'Add a guest name → Charge 3 points · 1 guest'], see: 'The guest is under Checked in today; Live Tester has 3 fewer points.' },
      { who: 'live@test.com', steps: ['Account → Guest points → Show my card'], see: 'Your QR code, for the office to scan.' }] },
  { id: 'handicap-file', area: 'Booking', name: 'Handicaps from a file (club office)',
    what: 'The office exports handicap indexes from the club’s own system as a CSV and uploads it. Members match by GUI number or name; the office sees what changes, and who wasn’t found, before confirming.',
    scenarios: [
      { says: 'Upload, see the changes and who wasn’t found, then update', tests: ['journey:office-set-handicaps', `src/test/journeys/guest-check-in.test.js › upload, see what changes and who wasn’t found, then update them all`, 'src/handicap-csv.test.js'] },
      { says: 'A file without a handicap column says so; nothing changes', tests: [`src/test/journeys/guest-check-in.test.js › a file without a handicap column says so, and nothing is updated`] },
      { says: 'Office only; one bad row refuses the lot', tests: ['supabase/tests/handicap_import.sql › Handicaps: only the club office can update them', 'supabase/tests/handicap_import.sql › Handicaps: one out of range refuses the lot, nothing changed'] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Club office → Members → Update handicaps', 'Choose a CSV with Name and Handicap Index columns'], see: 'The changes listed; Update N handicaps saves them.' }] },
  { id: 'requests', area: 'Booking', name: 'Tee time requests further ahead',
    what: 'For days not open yet, members ask the club office for a time with a reason. The office books it or declines with a note; the member is told.',
    scenarios: [
      { says: 'Request, then cancel it', tests: ['journey:request-tee-time', 'journey:cancel-tee-time-request', `${J} › 4. Request a tee time further ahead, then cancel it`] },
      { says: 'A reason is needed; at most 3 waiting; only your own can be cancelled', tests: ['rule:request-reason', 'rule:request-three', 'rule:request-cancel-own'] },
      { says: 'A member sees only their own requests', tests: ['rule:request-privacy'] },
      { says: 'Answered: told in a drop-down; marked read when Booking is opened', tests: ['src/alerts.test.js › two answered requests: two alerts, oldest answer first', 'journey:request-answers-read', 'journey:dismiss-tee-time-request'] },
      { says: 'The office books it or declines it', tests: ['journey:office-book-request', `${J} › 18. The club office login: opens on Today; let someone in, decline a request, see a disputed result, make a member hut staff`] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Booking → Request a tee time further ahead', 'Pick a time, give a reason, Send request'], see: 'It shows as waiting.' },
      { who: 'admin@test.com', steps: ['Today → the request → Book it'], see: 'The member gets “Request approved” when they next open the app.' }] },
  { id: 'booked-you-in', area: 'Booking', name: 'Booked you in',
    what: 'When someone books you onto a tee time, a notice drops down saying who booked you in, when, and who else is playing.',
    scenarios: [
      { says: 'Everyone else on the booking is told; the booker isn’t', tests: ['rule:booked-you-in', 'supabase/tests/booked_you_in.sql › Chris is told Pat booked him in, for that day and time', `${J} › 20c. When I book others in, each of them gets a "booked you in" notice (and I do not)`] },
      { says: 'OK, or See my bookings', tests: ['journey:booked-you-in', `${J} › 20b. Another member books me in: I'm told who, when and with whom, and See my bookings opens them`, 'src/alerts.test.js › someone booked me in: who, when and who else is playing; OK or See my bookings'] },
      { says: 'Not shown once the day has passed; gone if the booking is cancelled', tests: ['src/alerts.test.js › a \"booked you in\" for a day that has passed is not shown', 'supabase/tests/booked_you_in.sql › A cancelled booking takes its \"booked you in\" notice with it'] },
      { says: 'Moving a booking sends no new notice', tests: ['supabase/tests/booked_you_in.sql › A move sends no \"booked you in\" notice'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Book a time with captain@test.com on it'], see: 'The booking is under Booking, with the captain on it.' }, { who: 'captain@test.com', steps: ['Open the app'], see: '“Live Tester has booked you in” drops down, with the day, time and who else.' }] },

  // ── Scoring and games ────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'scorecard', area: 'Scoring and games', name: 'The scorecard',
    what: 'One card for the group, shared on everyone’s phone. Scores are saved hole by hole; two phones typing different scores are asked to check.',
    scenarios: [
      { says: 'Start a round and save holes; a refused save leaves the hole open to try again', tests: ['journey:save-hole'] },
      { says: 'Two phones, one card: each sees themselves first; different scores are flagged', tests: ['src/card-view.test.js', 'src/shared-card.test.js'] },
      { says: 'Delete a scorecard: anyone on it can', tests: ['journey:delete-scorecard', 'rule:card-delete-anyone-on-it'] },
      { says: 'A guest’s handicap set on the card', tests: ['journey:guest-handicap', `${F} › a guest’s handicap set on the scorecard`] },
      { says: 'Open holes: an event on some holes plays only those', tests: [`${F} › an event on holes 1–6 and 10–12: 9 holes on the card, 6 goes on to 10, the round ends after 12`, `${F} › a general round still has all 18`, 'src/open-holes-scoring.test.js'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Scoring → your tee time → Start round', 'Save hole 1, hole 2'], see: 'The other player sees the scores on their phone.' }] },
  { id: 'games', area: 'Scoring and games', name: 'Games on the card',
    what: 'Every game in the club’s list can be played on the card: Stableford, match play, better ball, Sixes and more, for 2, 3 or 4 players, with shots worked out.',
    scenarios: [
      { says: 'A full round of every game: the result matches the rules', tests: ['src/test/journeys/games.test.js', 'src/scoring.test.js', 'src/games.test.js'] },
      { says: 'One against one on a four-ball card', tests: ['src/test/journeys/games.test.js › one against one on a four-ball card: just those two, shots off the lower of them; the result matches the rules'] },
      { says: 'Choose my usual game', tests: ['journey:game-pref'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['On a card: + Add a match → pick a game'], see: 'The match line updates as holes are saved.' }] },
  { id: 'challenges', area: 'Scoring and games', name: 'Challenges between groups',
    what: 'A four-ball challenges another on the tee sheet, or one player challenges a player in another group. They accept, decline or suggest changes.',
    scenarios: [
      { says: 'Send a challenge; accept it; suggest changes; cancel it', tests: ['journey:send-challenge', 'journey:answer-challenge', 'journey:counter-challenge', 'journey:cancel-challenge'] },
      { says: 'One against one with a player in another group', tests: ['journey:send-singles', `${F} › accept a one-on-one from the drop-down: only the player asked answers`] },
      { says: 'Decline from the drop-down', tests: [`${F} › decline a challenge from the drop-down`] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Scoring → New event with other groups → pick a group → Send'], see: 'The other group sees the challenge drop down.' }] },
  { id: 'day-board', area: 'Scoring and games', name: 'Leaderboard of the day',
    what: 'Everyone’s scores today on one board, on the days the club chooses. The office can switch it off for today.',
    scenarios: [
      { says: 'On by default; off today; off on chosen weekdays', tests: [`${F} › on (every day to start): Today at the club opens today’s scores`, `${F} › off today: nobody sees today’s scores`, 'src/day-board.test.js'] },
      { says: 'An unconfirmed paper score shows with a mark', tests: ['src/screens/leaderboard-field.test.js › awaiting confirmation, or sent back'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Home → Today at the club'], see: 'Today’s scores, best first.' }] },
  { id: 'hut', area: 'Scoring and games', name: 'Halfway hut',
    what: 'After the 8th (or the last open hole before the 9th) members are asked if they’d like to order. The hut staff make it and say when it’s ready.',
    scenarios: [
      { says: 'Order after the 8th; told when it’s ready', tests: ['journey:hut-order', `${J} › 6. Start a round, count it for the Winter League (marker), save to hole 8, order a bacon roll`] },
      { says: 'Sold out, 3 waiting: refused', tests: ['rule:hut-sold-out', 'rule:hut-three-waiting', 'rule:hut-own-orders'] },
      { says: 'On fewer holes, it asks after the last open hole before the 9th', tests: [`${J} › 6b. Found in review: on holes 1–6 and 10–12 the halfway hut asks after hole 6 (hole 8 is closed)`, 'src/hut.test.js'] },
      { says: 'Cancel my order before it’s made', tests: ['journey:cancel-hut-order'] },
      { says: 'Staff move an order along', tests: ['journey:hut-order-making', `${F} › halfway hut staff: today’s order marked ready`] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Save hole 8 on a card', 'Order → a bacon roll → Send order'], see: '' }, { who: 'hut@test.com', steps: ['Account → Halfway hut orders → mark it Ready'], see: 'The member is told it’s ready.' }] },

  // ── Competitions ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'signups', area: 'Competitions', name: 'Sign-up competitions',
    what: 'The club opens singles and pairs competitions for entry, with a closing date, a number of places and a fee. Members enter, withdraw, or say No thanks.',
    scenarios: [
      { says: 'Enter singles and pairs; withdraw', tests: ['journey:enter-pairs', 'journey:withdraw-signup', `${J} › 11. Sign up for Men’s Fourball with a partner, see it in Entered, then withdraw`] },
      { says: 'Not twice, closed, full, partner already entered', tests: ['rule:signup-not-twice', 'rule:signup-closed', 'rule:signup-full', 'rule:signup-partner-taken'] },
      { says: 'A partner already entered is told in the sheet, not behind it', tests: ['src/test/journeys/caching.test.js › says so in the sheet (not behind it), and you can pick someone else'] },
      { says: 'No thanks moves it to Declined, where it can still be entered', tests: ['journey:decline-signup', `${J} › 23. Events: No thanks moves a competition to Declined, where I can still enter it`] },
      { says: 'Fees: shown when entering; from the purse or the shop', tests: [`${J} › 25. The club office sets an entry fee and how fees are paid; members see it when they enter`, 'src/fees.test.js'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Competition → Events → a competition → Enter'], see: 'It moves to Entered.' }] },
  { id: 'knockouts', area: 'Competitions', name: 'Knockouts',
    what: 'The club makes and publishes the draw; players report results and opponents confirm or question them; the secretary settles disputes. Rounds can be over fewer holes.',
    scenarios: [
      { says: 'Make, swap and publish the draw; spread the play-by dates', tests: ['journey:office-make-draw', 'journey:office-swap-draw', 'journey:office-publish-draw', 'journey:office-round-dates', 'rule:ko-swap-before-publish'] },
      { says: 'Report, confirm, dispute; only players in the match report', tests: ['journey:ko-report', 'journey:ko-confirm', 'journey:ko-dispute', 'rule:ko-report-own-match', `${J} › 12. Knockout: report my result, my opponent confirms, I go through to the next round`] },
      { says: 'Score the match on a card; the result comes from the card', tests: ['journey:ko-score', `${J} › 22. Knockout: score the match on a card from the draw; the result comes from the card; anyone can open the scorecard`, 'src/knockout.test.js'] },
      { says: 'An unfinished card from an earlier day isn’t shown as the match’s card', tests: ['src/screens/ko-card.test.js › a card from an earlier day that was never finished is left out (it’s no longer on the Scores tab)'] },
      { says: 'A round over fewer holes', tests: [`${F} › the club office sets round 1 to the front 9; the match is decided over those holes`, 'journey:own-knockout-holes'] },
      { says: 'The secretary sets a result', tests: ['journey:office-set-result'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Competition → Autumn Knockout'], see: 'Your next match, the play-by date, and Enter result.' }] },
  { id: 'own-events', area: 'Competitions', name: 'Members’ own events and knockouts',
    what: 'Any member can run an event, season or knockout for their own group of friends.',
    scenarios: [
      { says: 'Make my own knockout; delete it', tests: ['journey:make-own-knockout', 'journey:delete-own-knockout', `${J} › 15. A member sets up their own knockout: picks the players, it’s drawn, they organise it`] },
      { says: 'Make each kind of event, play it, see the leaderboard', tests: [`${F} › Individual Stableford for my group today: set up, play 18 on one card, the leaderboard has everyone`, `${F} › Team Stableford: set up two balanced teams, play, the board shows both teams`, `${F} › Four-ball team match play: teams, the draw, play the match on one card, the board shows the match result`] },
      { says: 'Count my round for my event as I start', tests: ['journey:count-for-event-round', 'rule:event-round-locked'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Competition → Events → + Create your own event'], see: 'The event is under Entered.' }] },
  { id: 'club-events', area: 'Competitions', name: 'Club events, templates and repeats',
    what: 'The club office makes events for everyone or by sign-up, saves them as templates to run on any day, and repeats them weekly.',
    scenarios: [
      { says: 'Make a club event; delete it', tests: ['journey:office-new-event', 'journey:office-delete-event'] },
      { says: 'Templates: save, run on a day, change, delete', tests: ['journey:office-save-template', 'journey:office-delete-template', `${F} › Run on a day: an event on that date with the template’s settings; the template stays`] },
      { says: 'Weekly repeats, at most 52', tests: ['journey:office-weekly-repeat', `${F} › found in review: a weekly repeat is at most 52 events`] },
      { says: 'Join today’s competition as I start', tests: ['journey:join-today', 'rule:self-entry-started'] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Competitions → New competition → Event', 'Name it, pick who plays, Save as a template'], see: 'It’s under Ready to run.' }] },
  { id: 'event-signups', area: 'Competitions', name: 'Leagues and events open for sign-up',
    what: 'The office advertises a league or event from a date, with a closing date and places. Members see spaces left, enter and withdraw; it stops at full.',
    scenarios: [
      { says: 'Enter and withdraw', tests: ['journey:enter-signup-league', 'journey:withdraw-signup-league'] },
      { says: 'Closed and full refused; hidden before it’s advertised', tests: ['rule:event-signup-closed', 'rule:event-signup-full', 'rule:event-signup-not-advertised'] },
      { says: 'The last place goes while I’m looking', tests: [`${F} › the last place goes while I’m looking: told in a notice I can see, and it shows Full`] },
      { says: 'The office sees who’s entered and can take someone off', tests: ['journey:office-remove-entrant', `${F} › the office sees who’s entered, “1 of 4 places”, and can take someone off`] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Competition → Events → the Winter League sign-up'], see: '“N spaces remaining” and Enter.' }] },
  { id: 'leagues', area: 'Competitions', name: 'Leagues',
    what: 'Members count one round a week for their league before they start; the table builds week by week, and the top players can go into a knockout.',
    scenarios: [
      { says: 'Count my round as I start; a captain counts theirs', tests: ['journey:count-for-league', 'journey:captain-counts-round'] },
      { says: 'Locked after hole 1; one round a week', tests: ['rule:league-locked-after-hole-1', 'rule:league-one-a-week'] },
      { says: 'Take my round out of the league before hole 1', tests: ['journey:leave-league'] },
      { says: 'The organiser starts the seeded knockout', tests: ['journey:start-league-knockout', `${J} › 17. At the end of a league, the organiser starts the seeded knockout`] },
    ],
    demo: [{ who: 'winter.league@test.com', steps: ['Scoring → tee time → tick Winter League → Start round'], see: 'The card shows the league badge.' }] },
  { id: 'seasons', area: 'Competitions', name: 'Team seasons and match days',
    what: 'Two teams play match days over a season: four-balls, singles and 3-balls, each day on its own holes and points.',
    scenarios: [
      { says: 'Set up a season, add match days', tests: [`${F} › set up a season with an end date and no match days yet`, `${F} › the organiser adds a match day with a four-ball and a singles`, 'journey:edit-begun-season'] },
      { says: 'The season board and each match', tests: [`${F} › the board: season score, match days newest first, a singles one a side, the organiser’s buttons`, 'src/season.test.js', 'src/match-scoring.test.js'] },
      { says: 'Who’s playing on a match day: names readable on a phone', tests: ['src/screens/match-day-flow.test.js › each player row has the initials badge the row layout expects, so the name gets the full width'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Competition → a season → a match day'], see: 'Who plays whom, and the season score.' }] },

  // ── Club life ────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'friends', area: 'Club life', name: 'Friends and contacts',
    what: 'Members keep friends in the club and from other clubs (shared by a link), and star favourites, for quick booking.',
    scenarios: [
      { says: 'Add, remove and star friends', tests: ['journey:add-buddy', 'journey:remove-buddy', 'journey:favourite-friend'] },
      { says: 'Save a friend from another club from their shared card; remove them', tests: ['journey:save-contact', 'journey:remove-contact', 'src/friend-link.test.js'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Friends → Find → add someone → star them'], see: 'They’re first when you book.' }] },
  { id: 'account', area: 'Club life', name: 'My account',
    what: 'Members say which competitions they play in, choose their usual games and change their password.',
    scenarios: [
      { says: 'Plays in; usual games; password', tests: ['journey:plays-in', 'journey:game-pref', `${F} › change password`] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Account → Plays in → Men’s or Ladies’'], see: 'Saved.' }] },
  { id: 'course', area: 'Club life', name: 'Course guide, pins and weather',
    what: 'The course guide shows each hole and today’s flags; Home shows the weather at the course.',
    scenarios: [
      { says: 'The office sets today’s flags; the guide shows them', tests: ['journey:office-publish-pins', `${F} › pins: the office sets today’s flags and the course guide shows them`] },
      { says: 'Correct a green’s width', tests: ['journey:office-green-width'] },
      { says: 'Weather', tests: ['src/weather.test.js'] },
    ],
    demo: [{ who: 'live@test.com', steps: ['Course → hole 1'], see: 'Today’s flag position.' }] },

  // ── Paper scorecards ─────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'paper', area: 'Paper scorecards', name: 'Paper scorecards',
    what: 'A group that played on paper photographs its cards after the round. Names are cut off on the phone; Claude reads the scores; the uploader checks every player; a partner or the club office confirms the uploader’s own score.',
    scenarios: [
      { says: 'The office switch: off by default; members see the link only when it’s on', tests: ['journey:office-paper-cards', `${P} › switched off, members don’t see it`] },
      { says: 'Two cards, names cut off, read, matched, checked, saved', tests: ['journey:paper-card', `${P} › two cards → names cut off → read → matched → each player checked (fixing hole 18) → Orla to confirm → saved`] },
      { says: 'Two columns set to one player; another course; the daily limit', tests: [`${P} › two columns set to the same player: Next is off until it’s fixed`, `${P} › a card for another course: says so, with Retake`, 'rule:paper-ten-reads'] },
      { says: 'Open holes: only those are checked and saved', tests: [`${P} › an event on holes 1–6 and 10–12: only those holes are checked and saved`, 'src/paper/reading.test.js'] },
      { says: 'Confirm, send back with a note, fix and resend', tests: ['journey:paper-confirm', 'journey:paper-send-back', 'journey:paper-resend', 'journey:office-confirm-paper', 'journey:office-send-back-paper'] },
      { says: 'Who can confirm; the office when the player asked has left the card', tests: ['rule:paper-confirmer-on-card', 'rule:paper-players-only', `${P} › found in review: the player asked has left the card, so it’s left for the office`] },
      { says: 'The reader: request and reply checks', tests: ['supabase/functions/read-scorecard/core.test.js', 'src/paper/crop.test.js'] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Club → Paper scorecards → On'], see: '' },
      { who: 'live@test.com', steps: ['Start a card → Photograph your card instead', 'Photograph a real card → check the box → Yes', 'Match, check each player, pick who confirms, Save'], see: 'The scores are on the card, yours marked “Awaiting confirmation”.' }] },

  // ── Club office ──────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'office-today', area: 'Club office', name: 'Office: Today',
    what: 'Everything waiting for the office: people asking to join, tee time requests, paper scores to confirm and questioned results.',
    scenarios: [
      { says: 'Let someone in, or refuse them', tests: ['journey:office-let-in', 'journey:office-refuse-join'] },
      { says: 'A paper score left for the office', tests: [`${P} › the club office confirms one left for the office, from Today`] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Today'], see: 'What’s waiting, with a count.' }] },
  { id: 'office-members', area: 'Club office', name: 'Office: Members',
    what: 'Find a member by surname letter, add one, set halfway hut staff and the competitions they play in, reset a login, or delete them.',
    scenarios: [
      { says: 'Hut staff, plays in, reset login, delete', tests: ['journey:office-hut-staff', 'journey:office-plays-in', 'journey:office-reset-login', 'journey:office-delete-member'] },
      { says: 'Find by letter; add a member', tests: [`${F} › a letter shows only the members whose surname starts with it; All shows everyone again`, `${F} › Add a member opens as a small box, not the full side panel`] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Members → a letter → a member'], see: 'Their details, with Save and Delete.' }] },
  { id: 'office-tee', area: 'Club office', name: 'Office: Tee sheet',
    what: 'The office cancels or moves a member’s booking with a note (everyone on it is told), and sets when tee times open.',
    scenarios: [
      { says: 'Cancel and move, with a note', tests: ['journey:office-cancel-booking', 'journey:office-move-booking', `${J} › 21. The club office cancels a booking, with a note`] },
      { says: 'When tee times open', tests: ['journey:office-booking-rules'] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Tee sheet → a booked time → Move to another time'], see: 'The players are told in the app.' }] },
  { id: 'office-comps', area: 'Club office', name: 'Office: Competitions',
    what: 'Run sign-up competitions again each year, change their settings, delete them, and manage the knockout draw.',
    scenarios: [
      { says: 'Run again, change settings, delete', tests: ['journey:office-run-signup', 'journey:office-save-signup', 'journey:office-delete-signup'] },
      { says: 'Deleting asks first', tests: [`${F} › a sign-up competition: Delete, tap again, gone`] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Competitions → a competition → Entries and settings'], see: 'Its entries and settings only.' }] },
  { id: 'office-club', area: 'Club office', name: 'Office: Club settings',
    what: 'Name, colours and course location; how fees are paid; the leaderboard of the day; paper scorecards; the halfway hut; the office login.',
    scenarios: [
      { says: 'Name, colours, course location', tests: ['journey:office-club-name', 'journey:office-colours', 'journey:office-course-location'] },
      { says: 'Fees, leaderboard days and today, office login', tests: ['journey:office-fee', 'journey:office-day-board-days', 'journey:office-day-board-today', 'journey:office-login'] },
      { says: 'The halfway hut: on or off, its menu', tests: ['journey:office-hut-on', 'journey:office-hut-add', 'journey:office-hut-remove'] },
    ],
    demo: [{ who: 'admin@test.com', steps: ['Club → Name, colours and course → Edit'], see: 'The app’s colours change for everyone.' }] },

  // ── Signing in ───────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'signing-in', area: 'Signing in', name: 'Joining and signing in',
    what: 'A visitor asks to join; the office lets them in. A new joiner whose email is approved signs up straight in.',
    scenarios: [
      { says: 'Ask to join; sign up when approved', tests: ['journey:visitor-asks-to-join', 'journey:new-joiner-signs-up', 'src/test/journeys/people.test.js'] },
    ],
    demo: [{ who: 'clean@test.com', steps: ['Sign in'], see: 'Home, with nothing booked yet.' }] },

  // ── Behind the scenes ────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'device-cache', area: 'Behind the scenes', name: 'Data kept on the phone',
    what: 'Lists that rarely change are kept on the phone, so screens open fast; a change anywhere is picked up on the next check.',
    scenarios: [
      { says: 'Kept, refreshed when someone changes something, cleared on sign out', tests: ['src/test/journeys/caching.test.js', 'src/api/cache.test.js'] },
    ],
    demo: [] },
  { id: 'getting-around', area: 'Behind the scenes', name: 'Getting around',
    what: 'Every screen draws without errors and Back always gets you home.',
    scenarios: [
      { says: 'Every screen within two taps of Home; back always works', tests: ['src/test/journeys/wander.test.js', 'src/nav-stack.test.js'] },
    ],
    demo: [] },
]

// The generic tests: things that must hold across every feature (for the PDF's Part 2).
const R = 'src/test/journeys/ripples.test.js'
export const GENERIC = [
  { name: 'A deleted scorecard goes everywhere, for everyone on it', group: 'Ripples',
    says: 'Deleting a card (unfinished or finished): it stops counting for the event, the league and the knockout, for every player on it; the results go back to “not started”; the other player’s Scores tab starts fresh.',
    tests: [`${R} › Declan deletes the unfinished card: it no longer counts for the event, the league or the knockout, and Peter’s Scores tab starts fresh`,
      `${R} › Declan deletes a finished card that counted for Pals Medal: Peter’s board no longer has its scores`,
      'supabase/tests/ripples.sql › A deleted card: no longer counts for the event, for anyone on it', 'supabase/tests/ripples.sql › A deleted card: no longer counts for the league, for anyone on it', 'supabase/tests/ripples.sql › A deleted card: the knockout match no longer points at it',
      'supabase/tests/card_delete.sql › Delete confirmed: the scorecard goes too'] },
  { name: 'A deleted member goes from everything, and every screen still draws', group: 'Ripples',
    says: 'Off every event, team, league captaincy and knockout; a paper score they were to confirm goes to the office; their scores on other people’s cards stay as history and show as “Former member”.',
    tests: [`${R} › the office deletes Declan: he’s off the event, the league and the knockout, and Peter’s screens all still draw`,
      'supabase/tests/ripples.sql › A deleted member: off every event’s players', 'supabase/tests/ripples.sql › A deleted member: off every team', 'supabase/tests/ripples.sql › A deleted member: no longer a league team’s captain',
      'supabase/tests/ripples.sql › A deleted member: their knockout entry goes, and the match no longer names it', 'supabase/tests/ripples.sql › A deleted member: a paper score they were asked to confirm goes to the office'] },
  { name: 'A cancelled or moved booking', group: 'Ripples',
    says: 'Cancelling takes the other player’s unstarted card with it (a card with scores is kept); moving keeps the players and tells them; a “booked you in” notice goes with the booking.',
    tests: [`${R} › the booker cancels: the other player’s unstarted card for that tee time goes too`, 'supabase/tests/bookings_cards.sql › Cards: a card with saved holes is kept',
      `${'src/test/journeys/journeys.test.js'} › 20. The club office moves a booking to another time; the members on it are told in the app`, 'supabase/tests/booked_you_in.sql › A cancelled booking takes its "booked you in" notice with it'] },
  { name: 'A deleted event or competition', group: 'Ripples',
    says: 'Its entries go; the cards that counted for it stay; it’s gone from Competitions.',
    tests: ['supabase/tests/ripples.sql › A deleted event: its entries go', 'supabase/tests/ripples.sql › A deleted event: the cards that counted for it stay', `${'src/test/journeys/features.test.js'} › a sign-up competition: Delete, tap again, gone`] },
  { name: 'Office switches turned off', group: 'Ripples',
    says: 'The halfway hut, paper scorecards and the leaderboard of the day disappear everywhere when switched off.',
    tests: ['src/hut.test.js › hut switched off: no', 'src/test/journeys/paper.test.js › switched off, members don’t see it', 'src/test/journeys/features.test.js › off today: nobody sees today’s scores'] },
  { name: 'Every refusal is seen, the screen isn’t stuck, nothing is half-saved', group: 'People and refusals',
    says: 'Every action in the app, done by the person who does it (member, organiser, captain, club office, hut staff, visitor, new joiner), checked against every way the server can say no.',
    tests: ['src/test/journeys/refusals.test.js', 'src/test/journeys/coverage.test.js', 'src/test/journeys/people.test.js', 'src/test/journeys/seen.test.js'] },
  { name: 'The pretend server keeps the real database’s rules', group: 'People and refusals',
    says: 'Every rule the journeys rely on is also proved on the real test database.',
    tests: ['src/test/contract/rules.test.js'] },
  { name: 'Yesterday, today and tomorrow', group: 'Dates',
    says: 'Times that have passed can’t be booked; days not open yet are requests; yesterday’s unfinished card isn’t today’s; notices for past days aren’t shown.',
    tests: ['src/release.test.js', 'supabase/tests/requests.sql › Request: an open day is refused (book it instead)', 'src/screens/ko-card.test.js', 'src/alerts.test.js › a "booked you in" for a day that has passed is not shown', 'src/home-today.test.js'] },
  { name: 'Two phones on one card', group: 'Two phones',
    says: 'Scores typed on two phones merge; a clash is flagged for a second look; nobody’s save is lost.',
    tests: ['src/card-view.test.js', 'src/shared-card.test.js', 'supabase/tests/rounds_save_time.sql › Save time: a save gets a new time even if the phone sends an old one'] },
  { name: 'Data kept on the phone', group: 'The phone',
    says: 'A change on one phone is seen on the next check on another; signing in as someone else starts empty.',
    tests: ['src/test/journeys/caching.test.js', 'src/api/cache.test.js', 'src/sw.test.js'] },
  { name: 'Getting around', group: 'The phone',
    says: 'Every screen within two taps of Home draws without errors, and Back always gets home.',
    tests: ['src/test/journeys/wander.test.js'] },
]

