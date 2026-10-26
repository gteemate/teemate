// Data kept on the device (phone or club office iPad), so screens draw at once and only what changed is fetched.
// Slow-changing kinds of data (members, course, events …, see cache-rules.js) are kept in memory and localStorage,
// per signed-in user. The database keeps a stamp per kind (data_versions); check() asks for them all in one call
// and drops the kinds whose stamp moved, so the next read fetches them fresh. A change made here drops the kinds it
// touches straight away. Everything that must be live (cards, tee sheet, bookings …) is never kept.
import { RULES } from './cache-rules.js'

const CHECK_EVERY = 30_000
const keyOf = user => `tm-cache:${user}`

export function createCache({ storage, getStamps, now = Date.now }) {
  let user = null, kept = {}, known = {}, lastCheck = -Infinity, read = new Set(), generation = 0
  // localStorage can be missing or refuse (private browsing): keep working from memory only.
  const load = () => { try { return JSON.parse(storage?.getItem(keyOf(user)) ?? 'null') } catch { return null } }
  const save = () => { try { if (user) storage?.setItem(keyOf(user), JSON.stringify({ kept, known })) } catch { /* memory only */ } }
  // Remove every other person's kept data from this device (also after a reload, when we don't know who was last).
  const forgetOthers = keep => {
    try {
      const keys = Array.from({ length: storage?.length ?? 0 }, (_, i) => storage.key(i))
      for (const k of keys) if (k?.startsWith('tm-cache:') && k !== keep) storage.removeItem(k)
    } catch { /* nothing kept */ }
  }

  return {
    getStampsFn: getStamps,
    /** The signed-in user (null when signed out). Someone else: start empty, and remove the last user's data. */
    setUser(id) {
      if (id === user && generation) return
      forgetOthers(id ? keyOf(id) : null)
      user = id; kept = {}; known = {}; lastCheck = -Infinity; generation++
      const saved = id ? load() : null
      if (saved) { kept = saved.kept ?? {}; known = saved.known ?? {} }
    },
    /** Kept data for (kind, key), or fetch() it and keep it. Always a copy, so a screen can change what it gets. */
    async get(kind, key, fetch) {
      read.add(kind)
      const hit = kept[kind]?.data?.[key]
      if (hit !== undefined) return structuredClone(hit)
      const stamp = known[kind] ?? null, gen = generation // as they were when the fetch started
      const data = await fetch()
      if (gen !== generation) return data // someone else signed in meanwhile: not theirs to keep
      if (kept[kind] && kept[kind].stamp !== stamp) delete kept[kind] // the server moved on while we fetched
      kept[kind] ??= { stamp, data: {} }
      kept[kind].data[key] = structuredClone(data)
      save()
      return data
    },
    /** Forget these kinds (after a change made here). */
    drop(kinds) { for (const k of kinds) delete kept[k]; save() },
    /**
     * Ask the server which kinds changed (at most every 30 s unless forced). Kinds kept with an older stamp are
     * dropped and returned. Data kept before any stamps were known takes the stamps as they are now.
     */
    async check(force = false) {
      if (!force && now() - lastCheck < CHECK_EVERY) return []
      lastCheck = now()
      let stamps
      try { stamps = await getStamps() } catch { return [] }
      const moved = Object.keys(kept).filter(k => kept[k].stamp != null && kept[k].stamp !== stamps[k])
      for (const k of Object.keys(kept)) if (kept[k].stamp == null) kept[k].stamp = stamps[k] ?? null
      for (const k of moved) delete kept[k]
      known = stamps
      save()
      return moved
    },
    /** The kinds read since resetReads() (what the screen showing depends on). */
    reads: () => read,
    resetReads() { read = new Set() },
    /** The data functions, with getters kept and changes dropping what they touch, by the rules. */
    wrap(api, rules) {
      const out = { ...api }
      for (const [name, rule] of Object.entries(rules)) {
        const f = api[name]
        if (!f) continue
        out[name] = rule.kind
          ? (...a) => this.get(rule.kind, name + JSON.stringify(a), () => f(...a))
          : async (...a) => { try { return await f(...a) } finally { this.drop(rule.changes) } }
      }
      return out
    },
  }
}

let storage = null
try { storage = globalThis.localStorage ?? null } catch { /* none */ }
let stampsFn = async () => ({})
/** The app's cache. Its stamps come from the data layer (setStampSource), set once at start-up. */
export const cache = createCache({ storage, getStamps: () => stampsFn() })
export const setStampSource = f => { stampsFn = f }
export const wrapApi = api => cache.wrap(api, RULES)
