// UI state only: which tab and screen, selections, and drafts not yet saved. Data lives behind api.js.
export const S = {
  friendHash: null, // a friend link being looked at (screens/friend.js)
  loginMode: 'welcome', loginEmail: '', requestName: '', loginNotice: '', // signed out: 'welcome' | 'signin' | 'signup'
  tab: 'home',
  sview: 'card',     // scores: 'card' | 'players' | 'challenge' | 'pevent'
  aview: 'home',     // home tab: home (Home) | account (the old Admin screen) | tee | book | booked | mine | buddies | pins | points | events | event | access | colours | mygames

  // course
  hole: 0, cimg: 'hole',
  // scores
  ch: null, gmenu: false, pickTmp: null,
  // player events: draft being set up, and invitations put off this session
  pe: null, peDismissed: new Set(), peId: null, // peId: event shown on the live board
  // leaderboard
  lbm: 'net', lbv: 'event', evDay: 1, lgView: 'teams', lgWeek: null, // league board: 'teams' or 'individual'; lgWeek null = whole season
  // tee times and booking
  day: 0, filter: 'all', slotId: null, picked: [], guests: [], gmodal: false, lgAns: {}, lgLater: null, lgOpenSheet: false, lastBooking: null,
  // buddies
  bseg: 'mine', q: '', qCaret: null, bfrom: null, // bfrom: where to offer a way back to ('book' | 'players')
  // games admin
  gedit: null,
  // members & access (admin)
  accEdit: null, accQ: '', accConfirm: false, accPrefill: null, // accEdit: null | 'new' | member id
  // events admin
  trqDecline: null, // Club admin → Tee time requests: the one being declined
  reqMode: false, reqDate: null, reqReason: '', // Request a tee time: on, the day, the reason being typed
  compTab: 'entered', // Competitions: entered | open | events | history
  evScope: 'player', // events area: 'player' (Admin → Events) or 'club' (Club admin → Club events)
  evId: null, evStep: 1, evNew: null, // evNew: 'league' when starting a new league
  ev: null, evQ: '', evSwap: null, evTeam: null, // event draft, player search, pending swap; league setup: null = entrants, 0.. = a team
}
