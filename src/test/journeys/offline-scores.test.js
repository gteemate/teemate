// @vitest-environment happy-dom
// Scoring with no signal: each hole is kept on the phone when it can't be sent, the card says so, and it's sent when
// the signal comes back (or the next time the app opens). A real refusal from the server still shows as before.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => { app?.done(); app = null })

const at = (db, time) => db.slotsOn(db.today).find(s => s.time === time)
const teeTimeToday = db => db.book(0, at(db, 570).id, [1]) // 09:30 with Declan Murphy
const start = async () => {
  app = await boot(teeTimeToday)
  await app.tap('Scoring')
  await app.tap('09:30')
  await app.tap('Start round · General play')
}
const card = () => app.db.rounds.find(r => r.lineup.some(x => x.m === 0))
// No signal at all: every call to the server fails (what a phone in a dead spot gets).
const nothingWorks = () => {
  const w = globalThis.__world.wrapped, real = { ...w }
  const onPhone = new Set(['getSession', 'getMe']) // kept on the phone in the real app (no trip to the server)
  for (const k of Object.keys(w)) if (typeof w[k] === 'function' && !onPhone.has(k)) w[k] = () => Promise.reject(new Error('TypeError: Failed to fetch'))
  return () => Object.assign(w, real)
}
const noSignal = () => { const w = globalThis.__world.wrapped, real = w.saveRound; w.saveRound = () => Promise.reject(new Error('TypeError: Failed to fetch')); return () => { w.saveRound = real } }

describe('scoring with no signal', () => {
  it('a hole is kept on the phone, the card says so, and it’s sent when the signal comes back', async () => {
    await start()
    const signal = noSignal()
    await app.tap('Save hole 1')
    expect(app.text()).toContain('Saved on your phone · sending when you have signal')
    expect(app.text()).toContain('Save hole 2') // moved on: not stuck on hole 1
    expect(card().done[0]).toBe(false) // not on the server yet
    await app.tap('Save hole 2')
    signal()
    window.dispatchEvent(new Event('online'))
    await app.settle()
    expect(card().done.slice(0, 2)).toEqual([true, true])
    expect(app.text()).not.toContain('Saved on your phone')
    expect(app.toast()).toBe('Your scores have been sent')
  })
  it('with no signal at all the card carries on (no “Something went wrong”), and catches up when it’s back', async () => {
    await start()
    const signal = nothingWorks()
    await app.tap('Save hole 1')
    expect(app.text()).not.toContain('Something went wrong')
    expect(app.text()).toContain('Saved on your phone · sending when you have signal')
    await app.tap('Save hole 2')
    expect(app.text()).toContain('Save hole 3')
    signal()
    window.dispatchEvent(new Event('online'))
    await app.settle()
    expect(card().done.slice(0, 2)).toEqual([true, true])
  })
  it('when the phone knows it’s offline, the hole is kept straight away (no waiting on the green)', async () => {
    await start()
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    try {
      const before = app.db.calls.filter(c => c === 'saveRound').length
      await app.tap('Save hole 1')
      expect(app.text()).toContain('Saved on your phone')
      expect(app.db.calls.filter(c => c === 'saveRound').length).toBe(before) // didn't even try
    } finally { Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }) }
  })
  it('it keeps trying by itself every 20 seconds', async () => {
    await start()
    const signal = noSignal()
    await app.tap('Save hole 1')
    signal()
    await vi.advanceTimersByTimeAsync(21000)
    await app.settle()
    expect(card().done[0]).toBe(true)
  })
  it('closing the app doesn’t lose them: the next time Scoring opens, they’re sent', async () => {
    await start()
    noSignal()
    await app.tap('Save hole 1')
    const kept = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('tm-pending-card')).map(k => [k, localStorage.getItem(k)]))
    expect(Object.keys(kept)).toHaveLength(1)
    const rounds = app.db.rounds
    app.done()
    app = await boot(db => { teeTimeToday(db); db.rounds = rounds }) // the app opened again (the server has the card, hole 1 not done)
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v)
    await app.tap('Scoring')
    await app.settle()
    expect(card().done[0]).toBe(true)
  })
  it('a refusal from the server (not the signal) still says why and keeps the hole open', async () => {
    await start()
    app.db.refuse = { saveRound: 'This card has been deleted by someone in your group.' }
    await app.tap('Save hole 1')
    expect(app.toast()).toBe('This card has been deleted by someone in your group.')
    expect(app.text()).not.toContain('Saved on your phone')
    expect(app.text()).toContain('Save hole 1')
  })
})
