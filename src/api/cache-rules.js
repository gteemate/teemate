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
  getEvents: kept('events'), getEventTemplates: kept('templates'),
  getTheme: kept('club'), // not getBookingRules: it carries the server's clock for tee time release, so it's always fresh
  getSignups: kept('comps'), getSignupCounts: kept('comps'), getKnockout: kept('comps'),
  getAccessRequests: kept('requests'), getTeeTimeRequests: kept('requests'),
  getBuddies: kept('friends'), getFriends: kept('friends'), getFavourites: kept('friends'),

  // Changes: what each one makes out of date.
  setTheme: changes('club'), setClubName: changes('club'), setFeePayment: changes('club'), setHutOn: changes('club'), setBookingRules: changes('club'),
  setDayBoardDays: changes('club'), setDayBoardToday: changes('club'), setPaperCards: changes('club'),
  setCourseLocation: changes('club'), setGreenWidth: changes('course', 'pins'), publishPins: changes('pins'),
  saveEvent: changes('events'), saveEvents: changes('events'), enterEvent: changes('events'), withdrawEvent: changes('events'), removeEventEntrant: changes('events'), saveEventTemplate: changes('templates'), deleteEventTemplate: changes('templates'),
  saveSeason: changes('events'), deleteEvent: changes('events'), enterEventToday: changes('events'),
  startLeagueKnockout: changes('events', 'comps'),
  setMyGamePref: changes('games'),
  setHutStaff: changes('members'), saveMember: changes('members', 'requests'), setOfficeLogin: changes('members', 'requests'),
  deleteMember: changes('members', 'friends', 'games', 'comps', 'requests', 'events'), // its rows elsewhere go with it, and it's taken off every event
  resetLogin: changes('members'),
  declineRequest: changes('requests'), requestAccess: changes('requests'),
  addBuddy: changes('friends'), removeBuddy: changes('friends'), saveContact: changes('friends'), removeContact: changes('friends'),
  setFriendFavourite: changes('friends'), setFavourite: changes('friends'),
  setMyPlaysIn: changes('members', 'comps'), adminSetPlaysIn: changes('members', 'comps'),
  ...Object.fromEntries(['declineSignup', 'undeclineSignup', 'runSignup', 'enterSignup', 'withdrawSignup', 'saveSignup',
    'createMemberKnockout', 'deleteMemberKnockout', 'makeDraw', 'swapDraw', 'setRoundDeadlines', 'setKoRoundHoles', 'publishDraw', 'linkKoCard',
    'reportKoResult', 'confirmKoResult', 'disputeKoResult', 'adminSetKoResult'].map(n => [n, changes('comps')])),
  deleteSignup: changes('comps', 'events'), // a league's knockout link goes with it
  // Bookings and cards aren't kept, but losing one clears a tee time request's booking or a knockout's scorecard link.
  deleteRound: changes('comps'), cancelBooking: changes('requests', 'comps'), adminCancelBooking: changes('requests'), adminMoveBooking: changes('requests'),
  ...Object.fromEntries(['requestTeeTime', 'cancelTeeTimeRequest', 'dismissTeeTimeRequest', 'decideTeeTimeRequest', 'markTeeTimeRequestsSeen']
    .map(n => [n, changes('requests')])),
}
