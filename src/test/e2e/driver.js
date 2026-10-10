// The end-to-end driver: the real app (index.html + main.js + the real api.js) against the TEST database, in the
// simulated browser. Like the journey driver, a test reads as a member's taps; but nothing is pretend, so it waits for
// the network to go quiet instead of skipping time. Sign in through the real sign-in screen.
import { expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { request } from 'node:https'

// The simulated browser's own network code loses the sign-in token on calls to the database, so the app's calls go
// out through Node's HTTPS instead (the answer comes back as the browser's Response, as the app expects).
export function nodeFetch(input, init = {}) {
  const url = new URL(String(input?.url ?? input))
  const headers = {}
  const h = init.headers ?? input?.headers
  if (h?.forEach) h.forEach((v, k) => (headers[k] = v)); else Object.assign(headers, h ?? {})
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? input?.method ?? 'GET', headers }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        const out = new Headers()
        for (const [k, v] of Object.entries(res.headers)) out.set(k, Array.isArray(v) ? v.join(', ') : String(v))
        resolve(new Response(res.statusCode === 204 || res.statusCode === 205 ? null : body.toString('utf8'), { status: res.statusCode, statusText: res.statusMessage, headers: out }))
      })
    })
    req.on('error', reject)
    if (init.signal) init.signal.addEventListener?.('abort', () => req.destroy(new Error('aborted')))
    if (init.body != null) req.write(typeof init.body === 'string' ? init.body : Buffer.from(init.body))
    req.end()
  })
}

const INDEX = readFileSync(`${process.cwd()}/index.html`, 'utf8')
const norm = t => (t ?? '').replace(/\s+/g, ' ').trim()
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Start the app signed out. → the driver. */
export async function boot() {
  document.documentElement.innerHTML = INDEX.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '') // (no fonts or icons to fetch)
    .replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>[\s\S]*$/, '')
  try { localStorage.clear() } catch { /* none */ }
  history.replaceState(null, '', '/')
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} }
  globalThis.WebSocket ??= class { close() {} } // the database library wants one for live updates; TeeMate doesn't use them
  window.scrollTo = () => {}
  // Count requests in flight, so a step can wait until the app has finished talking to the database.
  let inflight = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async (...a) => {
    const url = String(a[0]?.url ?? a[0])
    if (url.includes('open-meteo')) return { ok: true, json: async () => ({ current: {}, daily: {}, hourly: { time: [] } }) } // no weather in tests
    inflight++
    if (process.env.E2E_DEBUG) {
      const h = a[1]?.headers, auth = h?.get?.('Authorization') ?? h?.Authorization ?? h?.authorization ?? (a[0]?.headers?.get?.('Authorization'))
      const role = auth?.startsWith('Bearer ey') ? JSON.parse(Buffer.from(auth.split('.')[1], 'base64url')).role : auth ? 'publishable key' : 'none'
      process.stderr.write(`[fetch] ${url.replace(/^https:\/\/[^/]+/, '')} as ${role}\n`)
    }
    try { return await (url.includes('.supabase.co') ? nodeFetch(...a) : realFetch(...a)) } finally { inflight-- }
  }
  const errors = []
  const onError = e => errors.push(String(e.reason?.message ?? e.reason ?? e.message ?? e))
  window.addEventListener('unhandledrejection', onError)
  window.addEventListener('error', onError)
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.resetModules()
  await import('../../main.js')

  const d = {
    errors,
    /** Wait until no request has been in flight for a moment (the screen has loaded and drawn). */
    async settle() {
      let quiet = 0
      for (let t = 0; t < 300 && quiet < 4; t++) { await sleep(50); quiet = inflight ? 0 : quiet + 1 }
    },
    async waitFor(test, what, ms = 15000) {
      for (let t = 0; t < ms; t += 100) { if (test()) return; await sleep(100) }
      throw new Error(`Waited ${ms / 1000}s for ${what}. On "${d.screen()}": ${d.text().slice(0, 300)}`)
    },
    screen() {
      if (document.querySelector('#hdr .homedate')) return 'Home'
      return norm(document.querySelector('#hdr h2')?.textContent) || '(no title)'
    },
    text: () => norm(document.getElementById('app').textContent),
    main: () => norm(document.getElementById('main').textContent),
    toast: () => norm(document.getElementById('toast').textContent),
    tappables() {
      return [...document.querySelectorAll('#app button, #app [role="button"], #app a')]
        .filter(el => !el.disabled && !el.closest('[hidden]') && norm(el.textContent || el.getAttribute('aria-label')))
    },
    labels() { return [...new Set(d.tappables().map(el => norm(el.textContent) || el.getAttribute('aria-label')))] },
    async tap(what) {
      const all = d.tappables()
      const el = /^[#.[]/.test(what) ? document.querySelector(what)
        : all.find(x => norm(x.textContent) === what || x.getAttribute('aria-label') === what)
          ?? (cands => (cands.length === 1 ? cands[0] : null))(all.filter(x => norm(x.textContent).includes(what)))
      if (!el) throw new Error(`On "${d.screen()}" there's nothing to tap called "${what}". On screen: ${d.labels().slice(0, 40).join(' · ')}`)
      el.click()
      await d.settle()
      d.check()
    },
    async type(selector, value) {
      const el = document.querySelector(selector)
      if (!el) throw new Error(`On "${d.screen()}" there's no field ${selector}`)
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      await d.settle()
    },
    /** No errors so far, and the screen drew (the database didn't refuse anything the app asked for). */
    check() {
      expect(errors, `errors on "${d.screen()}"`).toEqual([])
      expect(d.screen(), `a screen that failed to load: ${d.main().slice(0, 200)}`).not.toBe('Something went wrong')
    },
    /** Sign in through the sign-in screen. */
    async signIn(email, password) {
      await d.waitFor(() => document.getElementById('to-in'), 'the welcome screen')
      await d.tap('#to-in')
      await d.waitFor(() => document.querySelector('#login #email'), 'the sign-in form')
      await d.type('#login #email', email)
      await d.type('#login input[type="password"]', password)
      document.getElementById('login').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await d.waitFor(() => !document.getElementById('app').classList.contains('signed-out') && d.screen() !== 'Sign in', 'the app after signing in', 20000)
      await d.settle()
      d.check()
    },
    /** Back to Home (from a round's screens, or anywhere with a back arrow). */
    async home() {
      for (let i = 0; i < 8 && d.screen() !== 'Home'; i++) {
        if (document.getElementById('o-back')) await d.tap('#o-back')
        else if (document.getElementById('back')) await d.tap('#back')
        else break
      }
      expect(d.screen()).toBe('Home')
    },
    done() {
      spy.mockRestore()
      window.removeEventListener('unhandledrejection', onError)
      window.removeEventListener('error', onError)
      globalThis.fetch = realFetch
    },
  }
  await d.settle()
  return d
}

/** Run SQL on the test database (to check what a journey did). → rows */
export async function sql(text) {
  const db = await import('../../../scripts/db.mjs')
  if (db.target !== 'test') throw new Error('End-to-end checks only read the test database.')
  db.useFetch(nodeFetch)
  return db.query(text)
}
