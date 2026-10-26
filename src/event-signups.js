// Leagues and club events open for sign-up (events.signup): advertised from a date, entries until a closing date (or
// the day before the first day), and an optional number of places. The database enforces the same rules.
import { addDaysIso, eventDates } from './dates.js'

/** The last day members can enter. */
export const closesOn = e => {
  const dayBefore = addDaysIso(e.startDate, -1)
  return e.entriesClose && e.entriesClose < dayBefore ? e.entriesClose : dayBefore
}

/** Open for members to enter on this day. */
export const signupOpen = (e, iso) => !!e.club && !!e.signup && (!e.advertiseFrom || e.advertiseFrom <= iso) && iso <= closesOn(e)

/** Places left (null: no limit). The office can add beyond the limit, so never below 0. */
export const spacesLeft = e => (e.maxEntries == null ? null : Math.max(0, e.maxEntries - e.players.length))

export const spacesText = n => `${n} space${n === 1 ? '' : 's'} remaining`

/** The office's line under the sign-up settings. */
export const signupLine = e => [
  e.advertiseFrom ? `Members see it from ${eventDates(e.advertiseFrom, 1)}` : 'Members see it straight away',
  `entries close ${eventDates(closesOn(e), 1)}`,
  e.maxEntries ? `${e.maxEntries} places` : 'no limit',
].join(' · ')
