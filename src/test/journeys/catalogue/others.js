// Journeys for the other people: halfway hut staff (Tom Byrne, id 10), a league captain (Orla Ryan, id 12), a visitor
// asking to join, and a new joiner whose email the club has approved. See ../catalogue.js for the shape.
import { NEW_JOINER_EMAIL } from '../fake-api.js'
const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)

export default [
  {
    id: 'hut-order-making', who: 'hut', title: 'Start making a halfway hut order',
    setup: db => db.orders.push({ id: 900, memberId: 3, items: [{ id: 1, name: 'Bacon roll', qty: 1, pricePence: 450 }], totalPence: 450, note: null, status: 'sent', cancelNote: null, createdAt: new Date().toISOString(), roundId: null }),
    steps: [{ tap: '#account' }, { tap: 'Halfway hut orders' }, { tap: '[data-o="900"].primary' }],
    action: 'setHutOrderStatus', expect: db => db.orders[0].status !== 'sent', refusals: 'all',
  },
  {
    id: 'captain-counts-round', who: 'captain', title: 'A league captain counts their round for the league as they start',
    setup: db => {
      const lg = db.events.find(e => e.name === 'Winter League'); lg.players.push(12); lg.team[12] = 0
      db.book(12, at(db, 570).id, [1])
    },
    steps: [{ tap: 'Scoring' }, { tap: '09:30' }, { tap: 'Winter League' }, { tap: '#start' }],
    keeps: { rounds: 'the card is made first; a refused count leaves a general-play card, which can still be counted before hole 1' },
    action: 'enterLeague', expect: db => db.leagueEntries.some(x => x.memberId === 12), refusals: 'all',
  },
  {
    id: 'visitor-asks-to-join', who: 'visitor', title: 'Ask to join the club’s app',
    steps: [{ tap: '#to-up' }, { type: ['#name', 'Pete Reid'] }, { type: ['#email', 'pete@example.invalid'] }, { type: ['#pw', 'a-long-password-1'] }, { tap: '#go' }],
    action: 'requestAccess', expect: db => db.joins.some(j => j.email === 'pete@example.invalid'), refusals: 'all',
  },
  {
    id: 'new-joiner-signs-up', who: 'newjoiner', title: 'Sign up with the email the club approved',
    steps: [{ tap: '#to-up' }, { type: ['#name', 'New Joiner'] }, { type: ['#email', NEW_JOINER_EMAIL] }, { type: ['#pw', 'a-long-password-1'] }, { tap: '#go' }],
    action: 'createAccount', expect: db => db.calls.includes('createAccount') && !db.signedOut, refusals: { none: 'making the account is Supabase sign-up, not one of our database functions; its messages show in the form (checked by the people tests)' },
  },
]
