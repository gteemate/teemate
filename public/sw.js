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

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', ev => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', ev => {
  const how = self.swRoute(ev.request.url, self.registration.scope, ev.request.method)
  if (how === 'skip') return
  ev.respondWith((async () => {
    const kept = await caches.open(CACHE)
    if (how === 'cache-first') {
      const hit = await kept.match(ev.request)
      if (hit) return hit
      const res = await fetch(ev.request)
      if (res.ok) kept.put(ev.request, res.clone())
      return res
    }
    try {
      const res = await fetch(ev.request)
      if (res.ok) kept.put(ev.request, res.clone())
      return res
    } catch (err) {
      return (await kept.match(ev.request)) ?? Promise.reject(err)
    }
  })())
})
