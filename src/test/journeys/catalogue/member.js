// Journeys for a member (Declan Murphy, id 1, not an admin). See ../catalogue.js for the shape.
export default [
  {
    id: 'enter-pairs', who: 'member', title: 'Enter a pairs competition with a partner',
    steps: [{ tap: 'Competition' }, { tap: 'Events' }, { tap: '[data-sign="2"]' }, { tap: "Ciarán O'Neill" }, { tap: 'Enter as a pair' }],
    action: 'enterSignup',
    expect: db => db.signupEntries.some(e => e.compId === 2 && e.memberId === 1 && e.partnerId === 3),
    refusals: 'all',
  },
]
