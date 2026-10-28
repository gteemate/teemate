// Slow-network timings: how long each main step takes on a poor connection, as a member would feel it. Two connections
// (simulated in Chrome): poor club wifi, and one bar of 4G. Also checks scoring with no signal for real: a hole saved
// offline is kept on the phone and sent when the connection comes back. Results: test-results/slow-network.json.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

// latency (ms), down / up (bytes a second)
const NETS = {
  'poor club wifi': { latency: 300, downloadThroughput: 500 * 1024 / 8, uploadThroughput: 250 * 1024 / 8 },
  'one bar of 4G': { latency: 700, downloadThroughput: 250 * 1024 / 8, uploadThroughput: 100 * 1024 / 8 },
}
const HANG = 30000 // longer than this for one step counts as hanging
const results = []

const isHome = page => page.waitForSelector('#hdr .homedate', { timeout: HANG })
const dismissAlerts = async page => {
  await page.waitForTimeout(600) // one may still be dropping down
  for (let i = 0; i < 6; i++) {
    const b = page.locator('#alerts [data-al="ok"], #alerts [data-al="nothanks"], #alerts [data-al="later"]').first()
    if (!(await b.isVisible().catch(() => false))) break
    await b.click(); await page.waitForTimeout(300)
  }
}
const time = async (net, step, f) => {
  const t = Date.now()
  await f()
  const ms = Date.now() - t
  results.push({ net, step, ms })
  console.log(`${net.padEnd(15)} ${step.padEnd(42)} ${(ms / 1000).toFixed(1)} s`)
  expect(ms, `${step} on ${net}`).toBeLessThan(HANG)
}
const title = page => page.evaluate(() => (document.querySelector('#hdr .homedate') ? 'Home' : document.querySelector('#hdr h2')?.textContent ?? ''))
// Back to Home with the back arrow, waiting for each screen to change (on a slow connection that takes a moment).
const home = async page => {
  for (let i = 0; i < 10 && (await title(page)) !== 'Home'; i++) {
    await dismissAlerts(page)
    const was = await title(page)
    if (!(await page.locator('#back').isVisible())) break
    await page.click('#back')
    await page.waitForFunction(w => (document.querySelector('#hdr .homedate') ? 'Home' : document.querySelector('#hdr h2')?.textContent) !== w, was, { timeout: HANG }).catch(() => {})
  }
  await dismissAlerts(page)
  await isHome(page)
}

for (const [net, cond] of Object.entries(NETS)) {
  test(`timings on ${net}`, async ({ browser }) => {
    const context = await browser.newContext() // nothing kept from before: a first open
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    const conditions = offline => cdp.send('Network.emulateNetworkConditions', { offline, ...cond })
    await conditions(false)

    await time(net, 'first open (nothing kept yet)', async () => { await page.goto('./'); await page.waitForSelector('#to-in', { timeout: HANG }) })
    await page.click('#to-in')
    // the sign-in page puts the cursor in Email a moment after it shows: wait for that, as a person would, so it
    // can't jump back there while the password is being typed
    await page.waitForFunction(() => document.activeElement?.id === 'email', null, { timeout: HANG })
    await page.fill('#login #email', process.env.SCREENS_EMAIL)
    await page.fill('#login #pw', process.env.SCREENS_PASSWORD)
    await time(net, 'sign in → first screen', async () => { await page.click('#go'); await page.waitForSelector('#app:not(.signed-out) #main .screen', { timeout: HANG }) })
    await page.waitForTimeout(1500); await dismissAlerts(page)
    await home(page)
    await page.waitForTimeout(3000) // the app keeps itself on the phone in the background
    await time(net, 'reopen the app (kept on the phone)', async () => { await page.reload(); await page.waitForSelector('#app:not(.signed-out) #main .screen', { timeout: HANG }) })
    await page.waitForTimeout(800); await dismissAlerts(page); await home(page)

    await time(net, 'Home → Booking', async () => { await page.click('[data-tile="booking"]'); await page.waitForSelector('text=+ Add a booking', { timeout: HANG }) })
    await time(net, 'Booking → tee sheet', async () => { await page.click('text=+ Add a booking'); await page.waitForSelector('.dates .day', { timeout: HANG }) }) // (today may have no times left)
    await time(net, 'tee sheet → tomorrow', async () => { await page.click('[data-d="1"]'); await page.waitForFunction(() => document.querySelector('.day[aria-pressed="true"]')?.dataset.d === '1' && document.querySelector('.slot'), null, { timeout: HANG }) })
    await home(page)
    await time(net, 'Home → Competitions', async () => { await page.click('[data-tile="comp"]'); await page.waitForSelector('[data-tab]', { timeout: HANG }) })
    await home(page)
    await time(net, 'Home → Friends', async () => { await page.click('[data-tile="friends"]'); await page.waitForSelector('text=Find members', { timeout: HANG }) })
    await home(page)
    await time(net, 'Home → Scoring (round in progress)', async () => { await page.click('[data-tile="scoring"]'); await page.waitForSelector('button:has-text("Save hole")', { timeout: HANG }) })
    await dismissAlerts(page)
    await time(net, 'save a hole (until the server has it)', async () => {
      const saved = page.waitForResponse(r => /\/rest\/v1\/rounds/.test(r.url()) && r.request().method() === 'PATCH', { timeout: HANG })
      await page.locator('button:has-text("Save hole")').first().click()
      await saved
    })

    // No signal at all: the hole is kept on the phone, then sent when the signal comes back.
    await dismissAlerts(page)
    const save = page.locator('button:has-text("Save hole")').first()
    if (await save.isVisible()) {
      await conditions(true)
      await time(net, 'save a hole with no signal (kept on phone)', async () => { await save.click(); await page.waitForSelector('text=Saved on your phone', { timeout: HANG }) })
      await conditions(false)
      await time(net, 'signal back → scores sent', async () => { await page.evaluate(() => dispatchEvent(new Event('online'))); await page.waitForSelector('text=Saved on your phone', { state: 'detached', timeout: HANG }) })
    }
    await context.close()
  })
}

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/slow-network.json', JSON.stringify(results, null, 1))
})
