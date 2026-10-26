import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The service worker (public/sw.js) runs in a pretend worker: its own `self`, `caches` and `fetch`.
function loadWorker() {
  const handlers = {}, store = new Map([['tm-v0', new Map()], ['tm-v1', new Map()]])
  const caches = {
    keys: async () => [...store.keys()],
    delete: async k => store.delete(k),
    open: async k => { if (!store.has(k)) store.set(k, new Map()); return { match: async r => store.get(k).get(r.url ?? r), put: async (r, res) => store.get(k).set(r.url ?? r, res) } },
  }
  const self = { addEventListener: (t, f) => (handlers[t] = f), registration: { scope: 'https://gteemate.github.io/teemate/' }, skipWaiting: () => {}, clients: { claim: async () => {} } }
  new Function('self', 'caches', 'fetch', readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'))(self, caches, async () => new Response('net'))
  return { self, handlers, store }
}

describe('the service worker', () => {
  const { self } = loadWorker(), scope = 'https://gteemate.github.io/teemate/'
  const route = (u, m) => self.swRoute(u, scope, m)
  it('the page itself: network first (a new version shows on the next open)', () => {
    expect(route(scope)).toBe('network-first')
    expect(route(scope + 'index.html')).toBe('network-first')
    expect(route(scope + 'manifest.webmanifest')).toBe('network-first')
  })
  it('the app’s files and pictures: kept after the first load', () => {
    for (const p of ['assets/index-abc.js', 'assets/index-abc.css', 'holes/1.jpg', 'greens/1.png', 'icon-192.png', 'club-crest.svg']) expect(route(scope + p), p).toBe('cache-first')
  })
  it('never the database, other sites, or anything but reading', () => {
    expect(route('https://abc.supabase.co/rest/v1/members')).toBe('skip')
    expect(route('https://api.open-meteo.com/v1/forecast')).toBe('skip')
    expect(route(scope + 'assets/index-abc.js', 'POST')).toBe('skip')
  })
  it('a new version clears the old kept files', async () => {
    const w = loadWorker()
    let done
    w.handlers.activate({ waitUntil: p => (done = p) })
    await done
    expect([...w.store.keys()]).toEqual(['tm-v1'])
  })
})
