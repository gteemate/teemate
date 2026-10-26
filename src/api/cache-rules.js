// Which data functions read kept kinds of data, and which change them (see cache.js). Kinds match the database's
// data_versions stamps (supabase/migrations/20261026150000_data_versions.sql).
const kept = kind => ({ kind })
const changes = (...kinds) => ({ changes: kinds })

export const RULES = {
  // Getters: kept on the device.
  getMembers: kept('members'), getAccessList: kept('members'),
  getCourse: kept('course'),
  getPins: kept('pins'),
  getGameSettings: kept('games'),
  getEvents: kept('events'),
  getTheme: kept('club'), getBookingRules: kept('club'),
  getSignups: kept('comps'), getSignupCounts: kept('comps'), getKnockout: kept('comps'),
  getAccessRequests: kept('requests'), getTeeTimeRequests: kept('requests'),
  getBuddies: kept('friends'), getFriends: kept('friends'), getFavourites: kept('friends'),

  // Changes: what each one makes out of date.
  setTheme: changes('club'), setClubName: changes('club'), setFeePayment: changes('club'), setHutOn: changes('club'), setBookingRules: changes('club'),
  setCourseLocation: changes('course'), setGreenWidth: changes('course', 'pins'), publishPins: changes('pins'),
  saveEvent: changes('events'), saveSeason: changes('events'), deleteEvent: changes('events'), enterEventToday: changes('events'),
  startLeagueKnockout: changes('events', 'comps'),
  setMyGamePref: changes('games'),
  setHutStaff: changes('members'), saveMember: changes('members', 'requests'), setOfficeLogin: changes('members'),
  deleteMember: changes('members'), resetLogin: changes('members'),
  declineRequest: changes('requests'), requestAccess: changes('requests'),
  addBuddy: changes('friends'), removeBuddy: changes('friends'), saveContact: changes('friends'), removeContact: changes('friends'),
  setFriendFavourite: changes('friends'), setFavourite: changes('friends'),
  setMyPlaysIn: changes('members', 'comps'), adminSetPlaysIn: changes('members', 'comps'),
  ...Object.fromEntries(['declineSignup', 'undeclineSignup', 'runSignup', 'enterSignup', 'withdrawSignup', 'saveSignup', 'deleteSignup',
    'createMemberKnockout', 'deleteMemberKnockout', 'makeDraw', 'swapDraw', 'setRoundDeadlines', 'publishDraw', 'linkKoCard',
    'reportKoResult', 'confirmKoResult', 'disputeKoResult', 'adminSetKoResult'].map(n => [n, changes('comps')])),
  ...Object.fromEntries(['requestTeeTime', 'cancelTeeTimeRequest', 'dismissTeeTimeRequest', 'decideTeeTimeRequest', 'markTeeTimeRequestsSeen']
    .map(n => [n, changes('requests')])),
}
