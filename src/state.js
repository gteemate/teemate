// UI state only: which tab and screen, selections, and drafts not yet saved. Data lives behind api.js.
export const S = {
  loginMode: 'signin', loginEmail: '', // sign-in screen: 'signin' | 'create'
  tab: 'scores',
  sview: 'card',     // scores: 'card' | 'players'
  aview: 'home',     // admin: home | tee | book | booked | mine | buddies | pins | games | points | events | event | access

  // course
  hole: 0, cimg: 'hole',
  // scores
  ch: null, gmenu: false, pickTmp: null,
  // leaderboard
  lbm: 'net', lbv: 'event', evDay: 1,
  // tee times and booking
  day: 0, filter: 'all', slotId: null, picked: [], guests: [], gmodal: false, lastBooking: null,
  // buddies
  bseg: 'mine', q: '', qCaret: null, bfrom: null, // bfrom: where to offer a way back to ('book' | 'players')
  // games admin
  gedit: null,
  // members & access (admin)
  accEdit: null, accQ: '', accConfirm: false, // accEdit: null | 'new' | member id
  // events admin
  evId: null, evStep: 1,
}
