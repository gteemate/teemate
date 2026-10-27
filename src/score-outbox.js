// Scores kept on the phone when there's no signal (scores.js): the card, with what I've typed since its last save, is
// kept per member until it's sent, so a dead spot on the course or closing the app loses nothing. The card's own
// merge (api saveRound) only sends the cells I typed, so sending later can't wipe what the group saved meanwhile.
import { isoDate, today } from './dates.js'

const key = me => `tm-pending-card:${me}`

/** No signal (or no answer in time), as opposed to the server saying no. */
export const isSignalError = err => /failed to fetch|load failed|networkerror|network request failed|fetch failed|timed out|offline/i.test(String(err?.message ?? err))

/** A promise that gives up after ms (the request may still land later: the card's merge makes that harmless). */
export const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Timed out')), ms))])

export function keep(me, round) {
  try { localStorage.setItem(key(me), JSON.stringify({ ...round, changed: [...(round.changed ?? [])], keptOn: isoDate(today()) })) } catch { /* full or blocked: it stays in memory */ }
}
/** The card kept for me, or null. */
export function kept(me) {
  try {
    const r = JSON.parse(localStorage.getItem(key(me)) ?? 'null')
    return r ? { ...r, changed: new Set(r.changed ?? []) } : null
  } catch { return null }
}
export function drop(me) { try { localStorage.removeItem(key(me)) } catch { /* nothing kept */ } }
