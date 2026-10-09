// An in-memory stand-in for Supabase so tests can run several "phones" (separate copies of api.js,
// each signed in as a different member) against one shared database. Only the query features
// api.js uses are here. Every call takes a trip through the event loop, like a network request,
// so calls started together interleave the way they would on real phones.
import { vi } from 'vitest'

const copy = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)))
const trip = () => new Promise(r => setTimeout(r, 0))

/** A database shared by every phone: { tables: { rounds: [...], members: [...] }, log: [...] } */
export function fakeDb(tables = {}) {
  return { tables: { rounds: [], members: [], ...copy(tables) }, nextId: 1000, saves: 0, log: [] }
}

// jsonb @> for arrays of objects: every wanted object is matched by some element.
const contains = (have, want) => want.every(w => have.some(h => Object.entries(w).every(([k, v]) => h[k] === v)))

function query(db, phone, table) {
  const q = { filters: [], op: 'select', one: null, rows: null, limit: null }
  const b = {
    select() { return b },
    eq(col, v) { q.filters.push(r => r[col] === v); return b },
    in(col, vs) { q.filters.push(r => vs.includes(r[col])); return b },
    gte(col, v) { q.filters.push(r => r[col] >= v); return b },
    contains(col, v) { const want = typeof v === 'string' ? JSON.parse(v) : v; q.filters.push(r => contains(r[col] ?? [], want)); return b },
    order() { return b },
    limit(n) { q.limit = n; return b },
    maybeSingle() { q.one = 'maybe'; return b },
    single() { q.one = 'single'; return b },
    update(row) { q.op = 'update'; q.rows = row; return b },
    insert(row) { q.op = 'insert'; q.rows = row; return b },
    delete() { q.op = 'delete'; return b },
    then(ok, fail) { return run().then(ok, fail) },
  }
  async function run() {
    await trip()
    const t = (db.tables[table] ??= [])
    let hit = t.filter(r => q.filters.every(f => f(r)))
    // Like the rounds_stamp_save trigger: the database sets updated_at on every write, and each differs.
    const stamp = () => new Date(Date.parse('2026-01-01') + ++db.saves).toISOString()
    if (q.op === 'insert') {
      const row = { id: db.nextId++, created_by: phone.memberId, ...copy(q.rows), updated_at: stamp() }
      t.push(row); hit = [row]
    } else if (q.op === 'update') hit.forEach(r => Object.assign(r, copy(q.rows), { updated_at: stamp() }))
    else if (q.op === 'delete') db.tables[table] = t.filter(r => !hit.includes(r))
    db.log.push({ phone: phone.memberId, table, op: q.op, ids: hit.map(r => r.id) })
    if (q.op === 'select' && table === 'rounds') hit = [...hit].sort((a, b) => b.id - a.id) // api.js orders newest first
    if (q.limit != null) hit = hit.slice(0, q.limit)
    let data = copy(hit)
    if (q.one === 'maybe') data = data[0] ?? null
    if (q.one === 'single') {
      if (data.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
      data = data[0]
    }
    return { data, error: null }
  }
  return b
}

function client(db, phone) {
  return {
    from: table => query(db, phone, table),
    async rpc(name) {
      await trip()
      if (name === 'current_member_id') return { data: phone.memberId, error: null }
      throw new Error(`fake-supabase: rpc ${name} not faked`)
    },
    auth: {
      async getSession() { return { data: { session: { user: { id: `u${phone.memberId}` } } }, error: null } },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } },
    },
  }
}

// Which phone the next import of api.js belongs to (createClient runs once per import). Kept on
// globalThis because vi.resetModules() gives each phone fresh module copies.
/** For the test file's vi.mock('@supabase/supabase-js', ...): a client for the phone signing in. */
export const createClient = () => client(globalThis.__signingIn.db, globalThis.__signingIn)

/**
 * A fresh copy of api.js signed in as memberId, sharing db with the other phones.
 * Create phones one at a time (await each); started together they'd all sign in as the last one.
 * The test file must mock Supabase first:
 *   vi.mock('@supabase/supabase-js', () => import('./test/fake-supabase.js'))
 */
export async function phone(db, memberId) {
  vi.resetModules()
  globalThis.__signingIn = { db, memberId }
  return import('../api.js')
}
