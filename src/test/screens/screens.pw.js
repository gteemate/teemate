// Screen-size checks: every main screen, reached by tapping like a member, at each size in playwright.config.js.
// On each screen: no sideways scrolling, nothing off the edge, every button big enough to tap and not covered by
// something else (a bar, a banner). A screenshot of each goes into test-results/screens/<size>/.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const MIN_TAP = 24 // smaller than this is a problem (fingers miss it)
const COMFY_TAP = 40 // smaller than this is noted (Apple suggests 44)
const results = []

// What's wrong on the screen as it is now (run in the page).
function inspect({ min, comfy }) {
  const W = innerWidth, norm = t => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const label = el => norm(el.getAttribute('aria-label') || el.textContent || el.placeholder || el.id || el.tagName)
  const inScroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true } return false }
  const shown = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') }
  const sheetOpen = !!document.querySelector('#modal .overlay') // a pop-up sheet is meant to cover the page behind it
  const els = [...document.querySelectorAll('#app button, #app a[href], #app [role="button"], #app input:not([type="hidden"]), #app select, #app textarea')].filter(shown)
    .filter(el => !sheetOpen || el.closest('#modal'))
  const out = { sideways: document.scrollingElement.scrollWidth > W + 1 ? `the page is ${document.scrollingElement.scrollWidth}px wide on a ${W}px screen` : null, offEdge: [], tooSmall: [], small: [], covered: [], underAlert: [], cutOff: [] }
  for (const el of els) {
    if (inScroller(el)) continue // date strips, brackets: meant to scroll sideways
    let r = el.getBoundingClientRect()
    if (r.left < -1 || r.right > W + 1) out.offEdge.push(label(el))
    const size = Math.min(r.width, r.height), tag = `${label(el)} (${Math.round(r.width)}×${Math.round(r.height)})`
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) { if (size < min) out.tooSmall.push(tag); else if (size < comfy) out.small.push(tag) }
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    // Under an alert dropping down is how alerts work (answer it, or Later): noted, not a failure.
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) (hit.closest('#alerts') ? out.underAlert : out.covered).push(`${label(el)} under ${label(hit) || hit.className || hit.tagName}`)
  }
  for (const el of document.querySelectorAll('#app h2, #app h3, #app h4, #app button, #app .pill')) {
    if (!shown(el)) continue
    const s = getComputedStyle(el)
    if (s.overflow === 'hidden' && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) out.cutOff.push(label(el))
  }
  window.scrollTo(0, 0); document.getElementById('main')?.scrollTo?.(0, 0)
  return out
}

async function check(page, name, testInfo) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  const size = testInfo.project.name
  const found = await page.evaluate(inspect, { min: MIN_TAP, comfy: COMFY_TAP })
  mkdirSync(`test-results/screens/${size}`, { recursive: true })
  const file = `${size}/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
  await page.screenshot({ path: `test-results/screens/${file}`, fullPage: true })
  results.push({ size, name, file, ...found })
  const hard = [found.sideways, ...found.offEdge, ...found.tooSmall, ...found.covered].filter(Boolean)
  expect.soft(hard, `${name} at ${size}: ${hard.join(' · ')}`).toEqual([])
}

// Back to Home with the back arrow (or Back to TeeMate in the office), waiting for each screen to change.
const title = page => page.evaluate(() => document.querySelector('#hdr .homedate') ? 'Home' : (document.querySelector('#hdr h2')?.textContent ?? ''))
const home = async page => {
  await dismissAlerts(page)
  const trail = []
  for (let i = 0; i < 10 && (await title(page)) !== 'Home'; i++) {
    const was = await title(page)
    trail.push(was)
    const changed = () => page.waitForFunction(w => (document.querySelector('#hdr .homedate') ? 'Home' : document.querySelector('#hdr h2')?.textContent) !== w, was, { timeout: 5000 }).then(() => true, () => false)
    const press = async () => {
      if (await page.locator('#o-back').isVisible()) await page.click('#o-back')
      else if (await page.locator('#back').isVisible()) await page.click('#back')
      else throw new Error(`Stuck on "${was}": no way back (came via ${trail.join(' → ')})`)
    }
    await press()
    // A press that lands mid-redraw can miss: try once more; a screen that really doesn't go back fails twice.
    if (!(await changed())) { await page.waitForLoadState('networkidle'); await press(); if (!(await changed())) throw new Error(`Back on "${was}" didn't change the screen (came via ${trail.join(' → ')})`) }
    await page.waitForLoadState('networkidle')
  }
  expect(await title(page), `never got Home (via ${trail.join(' → ')})`).toBe('Home')
}
// Answer whatever has dropped down, as a member would (OK, No thanks or Later), so the screen behind can be used.
const dismissAlerts = async page => {
  await page.waitForTimeout(800)
  for (let i = 0; i < 5; i++) {
    const b = page.locator('#alerts [data-al="ok"], #alerts [data-al="nothanks"], #alerts [data-al="later"]').first()
    if (!(await b.isVisible())) break
    await b.click(); await page.waitForTimeout(300)
  }
}
const tap = async (page, sel) => { await page.locator(sel).first().click(); await page.waitForLoadState('networkidle') }
const cardWith = (page, sel, text) => page.locator(sel).filter({ hasText: text }).first()
// Open a card (a competition, an event) and wait for its screen; once more if the tap landed mid-redraw.
const openCard = async (page, sel, text) => {
  const before = await title(page)
  for (let i = 0; i < 2; i++) {
    await page.waitForLoadState('networkidle')
    await cardWith(page, sel, text).click()
    if (await page.waitForFunction(w => document.querySelector('#hdr h2')?.textContent !== w, before, { timeout: 5000 }).then(() => true, () => false)) break
  }
  await page.waitForLoadState('networkidle')
}

test('every main screen', async ({ page }, testInfo) => {
  test.setTimeout(240000)
  await page.goto('/')
  await check(page, '01 welcome (signed out)', testInfo)
  await tap(page, '#to-in')
  await check(page, '02 sign in', testInfo)
  await page.fill('#login #email', process.env.SCREENS_EMAIL)
  await page.fill('#login #pw', process.env.SCREENS_PASSWORD)
  await tap(page, '#go')
  await page.waitForSelector('#app:not(.signed-out)')
  await page.waitForTimeout(1200)
  if (await page.locator('#alerts [data-al]').first().isVisible()) await check(page, '03 an alert dropping down', testInfo)
  await dismissAlerts(page)
  await check(page, '04 scorecard (round in progress)', testInfo)
  await dismissAlerts(page) // the halfway hut asks once hole 8 is done
  await home(page)
  await check(page, '05 home', testInfo)

  await tap(page, '[data-tile="booking"]'); await check(page, '06 bookings', testInfo)
  await tap(page, 'text=+ Add a booking'); await check(page, '07 tee sheet', testInfo)
  await tap(page, '[data-d="1"]')
  await page.locator('.slot:not(.full)').filter({ hasText: 'Open tee' }).first().click(); await page.waitForLoadState('networkidle')
  await check(page, '08 book a time', testInfo)
  await home(page)

  await tap(page, '[data-tile="comp"]')
  await tap(page, '[data-tab="entered"]'); await check(page, '09 competitions · entered', testInfo)
  await tap(page, '[data-tab="events"]'); await check(page, '10 competitions · events', testInfo)
  await tap(page, '[data-sign]'); await check(page, '11 enter a competition (sheet)', testInfo)
  await page.click('#sg-no')
  await tap(page, '[data-tab="history"]'); await check(page, '12 competitions · history', testInfo)
  await tap(page, '[data-tab="entered"]')
  await openCard(page, '[data-ko]', 'Club Singles')
  await check(page, '13 knockout · my match', testInfo)
  await tap(page, '[data-kv="all"]'); await check(page, '14 knockout · whole draw', testInfo)
  await home(page)
  await tap(page, '[data-tile="comp"]'); await tap(page, '[data-tab="entered"]')
  await openCard(page, '.card.comp', 'Christmas Cup')
  await check(page, '15 event leaderboard (Ryder Cup)', testInfo)
  if (await page.locator('[data-match]').count()) { await tap(page, '[data-match]'); await check(page, '16 a match and its scorecard', testInfo) }
  await home(page)
  await tap(page, '[data-tile="comp"]'); await tap(page, '[data-tab="entered"]')
  await openCard(page, '.card.comp', 'Winter League')
  await check(page, '17 league table', testInfo)
  await home(page)

  await tap(page, '[data-tile="friends"]'); await check(page, '18 friends', testInfo)
  await home(page)
  await tap(page, '#account'); await check(page, '19 account', testInfo)
  await tap(page, '[data-a="course"]'); await check(page, '20 course guide', testInfo)
  await home(page)
  await tap(page, '#account'); await tap(page, '[data-a="hutorder"]'); await check(page, '21 halfway hut order', testInfo)
  await home(page)
  await tap(page, '#account'); await tap(page, '[data-a="mygames"]'); await check(page, '22 game preferences', testInfo)
  await home(page)

  await tap(page, '#account'); await tap(page, '[data-a="office"]')
  for (const [k, n] of [['today', 'today'], ['members', 'members'], ['tee', 'tee sheet'], ['comps', 'competitions'], ['club', 'club']]) {
    await tap(page, `[data-ov="${k}"]`); await check(page, `3${['today', 'members', 'tee', 'comps', 'club'].indexOf(k)} club office · ${n}`, testInfo)
  }
  await tap(page, '[data-ov="members"]'); await tap(page, '[data-o-m]'); await check(page, '35 club office · a member (side panel)', testInfo)
})

test.afterAll(async ({}, testInfo) => {
  mkdirSync('test-results/screens', { recursive: true })
  writeFileSync(`test-results/screens/results-${testInfo.project.name}.json`, JSON.stringify(results, null, 1))
})
