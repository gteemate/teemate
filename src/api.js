// Every data call the app makes goes through this file, so the backend can be swapped
// (Supabase today, AWS later) without touching the screens.
//
// Functions return plain objects in the shapes the screens use (camelCase, no database
// column names) and throw an Error with a message fit to show the user.
//
// Each area lives in its own file in src/api/; this file is the one front door the screens import.
export { getMe, forgetMe } from './api/client.js'
export * from './api/auth.js'
export * from './api/club.js'
export * from './api/hut.js'
export * from './api/signups.js'
export * from './api/members.js'
export * from './api/course.js'
export * from './api/tee-times.js'
export * from './api/game-prefs.js'
export * from './api/cards.js'
export * from './api/player-events.js'
export * from './api/events.js'
export * from './api/balances.js'
