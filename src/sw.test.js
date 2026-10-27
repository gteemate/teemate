import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// The service worker (public/sw.js) runs in a pretend worker: its own `self`, `caches` and `fetch`.
function loadWorker(fetchFn = async () => new Response('net')) {
  const handlers = {}, store = new Map([['tm-v0', new Map()], ['tm-v1', new Map()]])
  const caches = {
    keys: async () => [...store.keys()],
    delete: async k => store.delete(k),
    open: async k => { if (!store.has(k)) store.set(k, new Map()); const m = store.get(k); return { match: async r => m.get(r.url ?? r), put: async (r, res) => m.set(r.url ?? r, res), keys: async () => [...m.keys()].map(url => ({ url })), delete: async r => m.delete(r.url ?? r) } },
  }
  const self = { addEventListener: (t, f) => (handlers[t] = f), registration: { scope: 'https://gteemate.github.io/teemate/' }, skipWaiting: () => {}, clients: { claim: async () => {} } }
  new Function('self', 'caches', 'fetch', readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'))(self, caches, fetchFn)
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

describe('the service worker, found in review', () => {
  const run = async (w, url) => {
    let answer; const waits = []
    w.handlers.fetch({ request: { url, method: 'GET' }, respondWith: p => (answer = p), waitUntil: p => waits.push(p) })
    await answer; await Promise.all(waits)
  }
  it('a new version of an app file replaces the old one (no pile-up)', async () => {
    const w = loadWorker()
    const scope = 'https://gteemate.github.io/teemate/'
    await run(w, scope + 'assets/index-old1.js')
    await run(w, scope + 'assets/leaflet-src-aaa.js')
    await run(w, scope + 'assets/index-new2.js')
    expect([...w.store.get('tm-v1').keys()].sort()).toEqual([scope + 'assets/index-new2.js', scope + 'assets/leaflet-src-aaa.js'])
  })
  it('the page skips the browser’s own cache, so a new version shows straight away', async () => {
    const seen = []
    const w = loadWorker(async (req, opts) => { seen.push(opts?.cache); return new Response('page') })
    await run(w, 'https://gteemate.github.io/teemate/')
    expect(seen).toEqual(['no-cache'])
  })
  it('on a slow connection the kept page shows within 2 seconds; the newer one is kept for next time', async () => {
    vi.useFakeTimers()
    try {
      let arrive
      const w = loadWorker(() => new Promise(r => { arrive = () => r(new Response('new page')) }))
      const url = 'https://gteemate.github.io/teemate/'
      w.store.get('tm-v1').set(url, new Response('kept page'))
      let answer; const waits = []
      w.handlers.fetch({ request: { url, method: 'GET' }, respondWith: p => (answer = p), waitUntil: p => waits.push(p) })
      await vi.advanceTimersByTimeAsync(2100)
      expect(await (await answer).text()).toBe('kept page') // didn't wait for the slow network
      arrive()
      await vi.runAllTimersAsync(); await Promise.all(waits)
      expect(await w.store.get('tm-v1').get(url).text()).toBe('new page') // kept for the next open
    } finally { vi.useRealTimers() }
  })
  it('with nothing kept yet it waits for the network, however slow', async () => {
    vi.useFakeTimers()
    try {
      let arrive
      const w = loadWorker(() => new Promise(r => { arrive = () => r(new Response('page')) }))
      let answer, done = false
      w.handlers.fetch({ request: { url: 'https://gteemate.github.io/teemate/', method: 'GET' }, respondWith: p => (answer = p.then(r => { done = true; return r })), waitUntil: () => {} })
      await vi.advanceTimersByTimeAsync(5000)
      expect(done).toBe(false)
      arrive()
      expect(await (await answer).text()).toBe('page')
    } finally { vi.useRealTimers() }
  })
})
