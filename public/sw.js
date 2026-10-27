// Keeps the app and its pictures on the phone or iPad, so reopening is near-instant and works on a weak signal.
// The page itself is fetched fresh first (so a new version shows on the next open, falling back to the kept copy
// offline); the app's files (named by their content) and pictures are kept after the first load. Database requests
// and other sites are never touched. Registered from main.js in production builds.
const CACHE = 'tm-v1'
const PICTURE = /\.(png|jpe?g|svg|webp|ico)$/i

/** How to answer a request: 'network-first' (the page), 'cache-first' (files and pictures) or 'skip'. */
self.swRoute = (url, scope, method = 'GET') => {
  if (method !== 'GET') return 'skip'
  const u = new URL(url), s = new URL(scope)
  if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return 'skip'
  const path = u.pathname.slice(s.pathname.length)
  if (path.startsWith('assets/') || PICTURE.test(path)) return 'cache-first'
  return 'network-first'
}

// Keep a response. An app file (assets/name-HASH.ext) replaces older versions of the same file, so they don't pile up.
// (Pictures keep their names: to send a replaced picture to devices, change CACHE above.)
async function keep(kept, req, res) {
  const m = new URL(req.url).pathname.match(/^(.*\/assets\/.+)-[^-/]+(\.[a-z]+)$/i)
  if (m) for (const old of await kept.keys()) {
    const p = new URL(old.url).pathname
    if (p !== new URL(req.url).pathname && p.startsWith(m[1] + '-') && p.endsWith(m[2]) && !p.slice(m[1].length + 1).includes('-')) await kept.delete(old)
  }
  await kept.put(req, res)
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', ev => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

const QUICK = 2000 // on a weak signal, how long the page waits for a newer version before showing the kept one

self.addEventListener('fetch', ev => {
  const how = self.swRoute(ev.request.url, self.registration.scope, ev.request.method)
  if (how === 'skip') return
  if (how === 'network-first') {
    // The page: a newer version if it comes quickly; on a weak signal, the kept one after 2 seconds (the newer one is
    // still kept when it arrives, for next time). With nothing kept yet (the first open), wait however long it takes.
    const net = fetch(ev.request, { cache: 'no-cache' }).then(res => ({ res, copy: res.ok ? res.clone() : null })) // past the browser's own cache
    ev.waitUntil(net.then(async ({ copy }) => { if (copy) await keep(await caches.open(CACHE), ev.request, copy) }).catch(() => {}))
    ev.respondWith((async () => {
      const hit = await (await caches.open(CACHE)).match(ev.request)
      const fresh = net.then(x => x.res)
      if (!hit) return fresh
      return Promise.race([fresh.catch(() => hit), new Promise(r => setTimeout(() => r(hit), QUICK))])
    })())
    return
  }
  ev.respondWith((async () => {
    const kept = await caches.open(CACHE)
    const hit = await kept.match(ev.request) // cache-first: the app's files and pictures
    if (hit) return hit
    const res = await fetch(ev.request)
    if (res.ok) ev.waitUntil(keep(kept, ev.request, res.clone()))
    return res
  })())
})
