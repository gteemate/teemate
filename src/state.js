// UI state only: which tab and screen, selections, and drafts not yet saved. Data lives behind api.js.
export const S = {
  loginMode: 'signin', loginEmail: '', requestName: '', // sign-in screen: 'signin' | 'create' | 'request' | 'requested'
  tab: 'scores',
  sview: 'card',     // scores: 'card' | 'players' | 'challenge' | 'pevent'
  aview: 'home',     // admin: home | tee | book | booked | mine | buddies | pins | games | points | events | event | access

  // course
  hole: 0, cimg: 'hole',
  // scores
  ch: null, gmenu: false, pickTmp: null,
  // player events: draft being set up, and invitations put off this session
  pe: null, peDismissed: new Set(), peId: null, // peId: event shown on the live board
  // leaderboard
  lbm: 'net', lbv: 'event', evDay: 1, lgView: 'teams', lgWeek: null, // league board: 'teams' or 'individual'; lgWeek null = whole season
  // tee times and booking
  day: 0, filter: 'all', slotId: null, picked: [], guests: [], gmodal: false, lastBooking: null,
  // buddies
  bseg: 'mine', q: '', qCaret: null, bfrom: null, // bfrom: where to offer a way back to ('book' | 'players')
  // games admin
  gedit: null,
  // members & access (admin)
  accEdit: null, accQ: '', accConfirm: false, accPrefill: null, // accEdit: null | 'new' | member id
  // events admin
  evId: null, evStep: 1, ev: null, evQ: '', evSwap: null, evTeam: 0, // event being set up (draft), its step, player search, a pending swap
}
