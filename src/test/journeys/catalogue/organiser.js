// Journeys for an organiser: Peter Walsh (id 7), an ordinary member running his own knockout, league or event.
// See ../catalogue.js for the shape.

// Peter's own knockout, "Pals Knockout", drawn: Peter (entry 200) v Declan (201), Ciarán (202) v Siobhán (203).
const palsKo = db => {
  db.signups.push({ id: 60, name: 'Pals Knockout', category: 'open', kind: 'singles', closesOn: db.today, notes: null, open: false, drawPublished: true, roundDeadlines: ['2026-11-15', '2026-12-06'], maxEntries: null, createdBy: 7 })
  db.signupEntries.push(...[7, 1, 3, 5].map((m, i) => ({ id: 200 + i, compId: 60, memberId: m, partnerId: null })))
  db.koMatches.push({ id: 61, compId: 60, round: 1, slot: 0, aEntry: 200, bEntry: 201, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 62, compId: 60, round: 1, slot: 1, aEntry: 202, bEntry: 203, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 63, compId: 60, round: 2, slot: 0, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
}
const openPalsKo = [{ tap: 'Competition' }, { tap: 'Pals Knockout' }]
// Peter's Pals League, over: five played rounds counted, top 4 into a knockout.
const palsLeague = db => {
  const card = (rid, m, score) => db.rounds.push({ id: rid, date: '2026-08-10', lineup: [{ m }], scores: Array.from({ length: 18 }, () => [score]), done: Array(18).fill(true), game: 'stab', submitted: {}, pairing: 0 })
  db.events.push({ id: 30, name: 'Pals League', style: 'league', fmt: 'beststab', club: false, everyone: false, startDate: '2026-08-01', days: 1, weeks: 8, bestOf: 4, teams: [], team: {},
    players: [0, 1, 3, 5, 7], matches: {}, koTop: 4, koFinish: '2026-12-20', koComp: null, leaguePairs: null, createdBy: { id: 7, name: 'Peter Walsh' }, entryRequired: false })
  ;[[0, 4], [1, 3], [3, 5], [5, 4], [7, 6]].forEach(([m, sc], i) => { card(900 + i, m, sc); db.leagueEntries.push({ eventId: 30, week: 2, memberId: m, roundId: 900 + i }) })
}

export default [
  {
    id: 'make-own-knockout', who: 'organiser', title: 'Make my own knockout for a group of friends',
    steps: [{ tap: 'Competition' }, { tap: 'Events' }, { tap: '+ Create your own event' }, { tap: '#cr-ko' }, { type: ['#kn-name', 'Pals Knockout'] },
      { tap: '[data-kp="1"]' }, { tap: '[data-kp="3"]' }, { tap: '[data-kp="5"]' }, { type: ['#kn-fin', '2026-12-20'] }, { tap: '#kn-go' }],
    action: 'createMemberKnockout', expect: db => db.signups.some(c => c.name === 'Pals Knockout' && c.createdBy === 7), refusals: 'all',
  },
  {
    id: 'delete-own-knockout', who: 'organiser', title: 'Delete my own knockout',
    setup: palsKo, steps: [...openPalsKo, { tap: '#ko-del' }, { tap: '#ko-del' }],
    action: 'deleteMemberKnockout', expect: db => !db.signups.some(c => c.id === 60), refusals: 'all',
  },
  {
    id: 'own-knockout-holes', who: 'organiser', title: 'Play a round of my knockout over fewer holes',
    setup: palsKo, steps: [...openPalsKo, { tap: '[data-krh="1"]' }, { tap: '[data-hp="kr1:18"]' }],
    action: 'setKoRoundHoles', expect: db => db.calls.includes('setKoRoundHoles'), refusals: 'all',
  },
  {
    id: 'start-league-knockout', who: 'organiser', title: 'At the end of my league, start its seeded knockout',
    setup: palsLeague, steps: [{ tap: 'Competition' }, { tap: 'Pals League' }, { tap: '#lg-kostart' }, { tap: '#lg-kostart' }],
    action: 'startLeagueKnockout', expect: db => db.events.find(e => e.id === 30).koComp != null, refusals: 'all',
  },
  {
    id: 'edit-begun-season', who: 'organiser', title: 'Change my team season after it has started',
    setup: db => db.events.push({ id: 900, name: 'Pals Season', A: { name: 'Blues', col: '#19335A' }, B: { name: 'Reds', col: '#762A43' },
      club: false, everyone: false, startDate: '2026-10-07', days: 176, season: true, style: 'ryder', fmt: 'bbl', entryRequired: true,
      players: [7, 9, 11, 10, 12, 1], team: { 7: 'A', 9: 'A', 11: 'A', 10: 'B', 12: 'B', 1: 'B' }, matches: { 1: [{ a: [7, 9], b: [10, 12] }] }, createdBy: { id: 7, name: 'Peter Walsh' } }),
    steps: [{ tap: 'Competition' }, { tap: '[data-tab="entered"]' }, { tap: '[data-edit="900"]' }, { tap: '#ev-next' }, { tap: '#ev-next' }, { tap: '#ev-next' }, { tap: '#ev-next' }, { tap: '#ev-next' }],
    action: 'saveSeason', expect: db => db.calls.includes('saveSeason'), refusals: 'all',
  },
]
