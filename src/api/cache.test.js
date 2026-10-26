import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { createCache } from './cache.js'
import { RULES } from './cache-rules.js'

// A pretend localStorage (Map-backed) shared across "restarts", and pretend server stamps.
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const setup = (over = {}) => {
  let t = 1_000_000
  const stamps = { members: 's1', events: 's1' }
  const storage = over.storage ?? store()
  const c = createCache({ storage, getStamps: vi.fn(async () => ({ ...stamps })), now: () => t, ...over })
  return { c, stamps, storage, tick: ms => (t += ms) }
}

describe('the device cache', () => {
  it('returns kept data without fetching again', async () => {
    const { c } = setup(); c.setUser('u1')
    const fetch = vi.fn(async () => [{ id: 1 }])
    expect(await c.get('members', 'getMembers[]', fetch)).toEqual([{ id: 1 }])
    expect(await c.get('members', 'getMembers[]', fetch)).toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('returns copies', async () => {
    const { c } = setup(); c.setUser('u1')
    const first = await c.get('members', 'k', async () => [{ id: 1 }])
    first[0].id = 99
    expect(await c.get('members', 'k', async () => [])).toEqual([{ id: 1 }])
  })
  it('a moved stamp drops that kind only', async () => {
    const { c, stamps } = setup(); c.setUser('u1')
    await c.check(true)
    const members = vi.fn(async () => ['m']), events = vi.fn(async () => ['e'])
    await c.get('members', 'm', members); await c.get('events', 'e', events)
    stamps.events = 's2'
    expect(await c.check(true)).toEqual(['events'])
    await c.get('members', 'm', members); await c.get('events', 'e', events)
    expect(members).toHaveBeenCalledTimes(1)
    expect(events).toHaveBeenCalledTimes(2)
  })
  it('checks at most every 30 s unless forced', async () => {
    const { c, tick } = setup(); c.setUser('u1')
    const get = c.getStampsFn
    await c.check(); await c.check()
    tick(29_000); await c.check()
    expect(get).toHaveBeenCalledTimes(1)
    tick(2_000); await c.check()
    expect(get).toHaveBeenCalledTimes(2)
    await c.check(true)
    expect(get).toHaveBeenCalledTimes(3)
  })
  it('a different user starts empty, and the last user’s kept data is removed', async () => {
    const { c, storage } = setup(); c.setUser('u1')
    await c.get('members', 'm', async () => ['mine'])
    expect(storage.m.has('tm-cache:u1')).toBe(true)
    c.setUser('u2')
    expect(storage.m.has('tm-cache:u1')).toBe(false)
    const fetch = vi.fn(async () => ['theirs'])
    expect(await c.get('members', 'm', fetch)).toEqual(['theirs'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('reloads from storage after a restart', async () => {
    const storage = store()
    const a = setup({ storage }); a.c.setUser('u1'); await a.c.check(true)
    await a.c.get('members', 'm', async () => ['kept'])
    const b = setup({ storage }); b.c.setUser('u1')
    const fetch = vi.fn(async () => ['fresh'])
    expect(await b.c.get('members', 'm', fetch)).toEqual(['kept'])
    expect(fetch).not.toHaveBeenCalled()
  })
  it('works when storage throws', async () => {
    const bad = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    const { c } = setup({ storage: bad }); c.setUser('u1')
    expect(await c.get('members', 'm', async () => ['ok'])).toEqual(['ok'])
    expect(await c.check(true)).toEqual([])
  })
  it('records which kinds a screen read', async () => {
    const { c } = setup(); c.setUser('u1')
    c.resetReads()
    await c.get('events', 'e', async () => [])
    expect([...c.reads()]).toEqual(['events'])
  })
})

describe('wrapping the data functions by the rules', () => {
  it('getters are kept per arguments; a change drops its kinds, even when it fails', async () => {
    const { c } = setup(); c.setUser('u1')
    const api = { getPins: vi.fn(async d => [d]), getEvents: vi.fn(async () => []), saveEvent: vi.fn(async () => { throw new Error('no') }) }
    const w = c.wrap(api, { getPins: { kind: 'pins' }, getEvents: { kind: 'events' }, saveEvent: { changes: ['events'] } })
    await w.getPins('2026-10-26'); await w.getPins('2026-10-26'); await w.getPins('2026-10-27')
    expect(api.getPins).toHaveBeenCalledTimes(2)
    await w.getEvents()
    await expect(w.saveEvent({})).rejects.toThrow('no')
    await w.getEvents()
    expect(api.getEvents).toHaveBeenCalledTimes(2)
  })
  it('the app’s front door hands out the wrapped function for every rule', () => {
    const front = readFileSync(new URL('../api.js', import.meta.url), 'utf8')
    const listed = front.slice(front.indexOf('export const {')).split('}')[0]
    for (const name of Object.keys(RULES)) expect(listed, name).toMatch(new RegExp(`\\b${name}\\b`))
  })
  it('every rule names a function the data layer has', () => {
    const dir = new URL('.', import.meta.url).pathname
    const text = readdirSync(dir).filter(f => f.endsWith('.js') && !f.includes('cache')).map(f => readFileSync(dir + f, 'utf8')).join('\n')
    for (const name of Object.keys(RULES)) expect(text, name).toMatch(new RegExp(`export (async )?function ${name}\\b|export const ${name}\\b`))
  })
})
