// The journey driver: boots the real app (index.html + main.js) in the simulated browser against a pretend server
// (fake-api.js), and taps through it like a member. After every tap it settles the app and checks for errors, so a
// journey reads as the member's steps: tap('Booking'), tap('08:20'), tap('Confirm booking') …
// The test file must mock the api first:  vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())
import { vi, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeWorld } from './fake-api.js'

const INDEX = readFileSync(`${process.cwd()}/index.html`, 'utf8') // tests run from the project folder
export const TODAY = '2026-10-10' // a Saturday; the clock reads 09:00
const norm = t => (t ?? '').replace(/\s+/g, ' ').trim()

// A sample forecast for the weather (the only outside request the app makes).
const FORECAST = { current: { time: '2026-10-10T09:00', wind_speed_10m: 12, wind_gusts_10m: 20, wind_direction_10m: 250 }, daily: { precipitation_sum: [1] },
  hourly: { time: Array.from({ length: 24 }, (_, h) => `2026-10-10T${String(h).padStart(2, '0')}:00`), wind_speed_10m: Array(24).fill(12),
    wind_gusts_10m: Array(24).fill(20), wind_direction_10m: Array(24).fill(250), precipitation: Array(24).fill(0), precipitation_probability: Array(24).fill(10) } }

/** Start the app on a fresh club. setup(db, helpers) changes the club before the app starts. → the driver. */
export async function boot(setup, { hash = '' } = {}) {
  vi.useFakeTimers({ now: new Date(2026, 9, 10, 9, 0), toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  const world = makeWorld(TODAY, setup)
  globalThis.__world = world
  document.documentElement.innerHTML = INDEX.replace(/<script[\s\S]*?<\/script>/g, '').replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>[\s\S]*$/, '')
  try { localStorage.clear() } catch { /* none */ }
  if (hash) history.replaceState(null, '', `/${hash}`); else history.replaceState(null, '', '/')
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} }
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => FORECAST }))
  window.scrollTo = () => {}
  const errors = []
  const onError = e => errors.push(String(e.reason?.message ?? e.reason ?? e.message ?? e))
  window.addEventListener('unhandledrejection', onError)
  window.addEventListener('error', onError)
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.resetModules()
  await import('../../main.js')

  const d = {
    db: world.db, taps: 0, visited: [], errors,
    async settle() { for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(150) },
    /** The screen's title ('Home' on Home). */
    screen() {
      if (document.querySelector('#hdr .homedate')) return 'Home'
      return norm(document.querySelector('#hdr h2')?.textContent) || '(no title)'
    },
    text: () => norm(document.getElementById('app').textContent),
    toast: () => norm(document.getElementById('toast').textContent),
    /** Everything tappable on screen, by its words. */
    tappables() {
      return [...document.querySelectorAll('#app button, #app [role="button"], #app a, #app .slot')]
        .filter(el => !el.disabled && !el.closest('[hidden]') && norm(el.textContent || el.getAttribute('aria-label')))
    },
    labels() { return [...new Set(d.tappables().map(el => norm(el.textContent) || el.getAttribute('aria-label')))] },
    /** Tap something by its words (exact first, then the only one containing them) or a CSS selector. */
    async tap(what, { count = true } = {}) {
      const all = d.tappables()
      const el = /^[#.[]/.test(what) ? document.querySelector(what)
        : all.find(x => norm(x.textContent) === what || x.getAttribute('aria-label') === what)
          ?? (cands => (cands.length === 1 ? cands[0] : null))(all.filter(x => norm(x.textContent).includes(what)))
      if (!el) throw new Error(`On "${d.screen()}" there's nothing to tap called "${what}". On screen: ${d.labels().slice(0, 40).join(' · ')}`)
      el.click()
      if (count) d.taps++
      await d.settle()
      d.check()
      d.visited.push(d.screen())
    },
    async type(selector, value) {
      const el = document.querySelector(selector)
      if (!el) throw new Error(`On "${d.screen()}" there's no field ${selector}`)
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      await d.settle()
    },
    async back() {
      if (!document.getElementById('back')) throw new Error(`"${d.screen()}" has no back arrow`)
      await d.tap('#back')
    },
    /** No errors so far, and the screen drew. */
    check() {
      expect(errors, `errors on "${d.screen()}"`).toEqual([])
      expect(d.screen(), 'a screen that failed to load').not.toBe('Something went wrong')
    },
    /** Press back until Home: every screen on the way has a back arrow (or, in the club office, Back to TeeMate in the
     *  sidebar), and none comes round twice. */
    async homeFromHere() {
      const seen = []
      for (let i = 0; i < 10 && d.screen() !== 'Home'; i++) {
        seen.push(d.screen())
        if (!document.getElementById('back') && document.getElementById('o-back')) { await d.tap('#o-back', { count: false }); continue }
        if (!document.getElementById('back')) throw new Error(`Stuck: "${d.screen()}" has no back arrow (came via ${seen.join(' → ')})`)
        await d.tap('#back', { count: false })
        if (seen.includes(d.screen()) && d.screen() !== 'Home') throw new Error(`Going round in circles: ${[...seen, d.screen()].join(' → ')}`)
      }
      expect(d.screen(), `back from ${seen.join(' → ')} never reached Home`).toBe('Home')
    },
    done() {
      spy.mockRestore()
      window.removeEventListener('unhandledrejection', onError)
      window.removeEventListener('error', onError)
      vi.useRealTimers()
    },
  }
  await d.settle()
  d.check()
  return d
}
