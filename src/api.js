// Every data call the app makes goes through this file, so the backend can be swapped
// (Supabase today, AWS later) without touching the screens.
//
// Functions return plain objects in the shapes the screens use (camelCase, no database
// column names) and throw an Error with a message fit to show the user.
//
// Each area lives in its own file in src/api/; this file is the one front door the screens import.
export * from './api/all.js'

// Data kept on the device: the getters in api/cache-rules.js answer from it, and the changes there drop what they
// touch. These wrapped functions take the place of the plain ones above (a module's own exports win over export *).
import * as raw from './api/all.js'
import { cache, wrapApi, setStampSource } from './api/cache.js'
setStampSource(raw.getStamps)
const w = wrapApi(raw)
export { cache }
export const {
  getMembers, getAccessList, getCourse, getPins, getGameSettings, getEvents,
  getTheme, getSignups, getSignupCounts, getKnockout, getAccessRequests, getTeeTimeRequests,
  getBuddies, getFriends, getFavourites, setTheme, setClubName, setFeePayment,
  setHutOn, setBookingRules, setDayBoardDays, setDayBoardToday, setCourseLocation, setGreenWidth,
  publishPins, saveEvent, saveSeason, deleteEvent, enterEventToday, startLeagueKnockout,
  setMyGamePref, setHutStaff, saveMember, setOfficeLogin, deleteMember, resetLogin,
  declineRequest, requestAccess, addBuddy, removeBuddy, saveContact, removeContact,
  setFriendFavourite, setFavourite, setMyPlaysIn, adminSetPlaysIn, declineSignup, undeclineSignup,
  runSignup, enterSignup, withdrawSignup, saveSignup, createMemberKnockout, deleteMemberKnockout,
  makeDraw, swapDraw, setRoundDeadlines, publishDraw, linkKoCard, reportKoResult,
  confirmKoResult, disputeKoResult, adminSetKoResult, deleteSignup, deleteRound, cancelBooking,
  adminCancelBooking, adminMoveBooking, requestTeeTime, cancelTeeTimeRequest, dismissTeeTimeRequest, decideTeeTimeRequest,
  markTeeTimeRequestsSeen,
} = w
