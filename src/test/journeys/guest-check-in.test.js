// @vitest-environment happy-dom
// Guest check-in: the club office scans a member's card (or finds them by name) and charges walk-in guests to their
// guest points; members see the charge and can show their card. The camera is replaced: openScanner hands over
// whatever the test says was scanned.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'
import { friendLink } from '../../friend-link.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())
vi.mock('../../scan-qr.js', () => ({ NO_CAMERA: 'Can’t use the camera: find the member by name instead', openScanner: vi.fn() }))
const { openScanner } = await import('../../scan-qr.js')

let app
afterEach(() => { app?.done(); app = null; openScanner.mockReset() })

const CIARAN = { id: 3, name: "Ciarán O'Neill", hcp: 12.4 }
const card = m => friendLink(m, 'Royal TeeMate', 'https://gteemate.github.io/teemate/')
const scans = text => openScanner.mockImplementation(({ onText }) => { onText(text); return { stop: vi.fn() } })
const office = async setup => { app = await boot(setup, { as: 'office' }); await app.tap('[data-ov="guests"]') }
const guest = async (i, name, club) => { await app.type(`#ci-n${i}`, name); if (club) await app.type(`#ci-c${i}`, club) }

describe('Club office → Guests', () => {
  it('the office scans a card, adds two guests, and 6 points are charged', async () => {
    await office()
    scans(card(CIARAN))
    await app.tap('Scan a member’s card')
    expect(app.text()).toContain("Ciarán O'Neill")
    expect(app.text()).toContain('36 points left this year')
    await guest(0, 'Sam Guest', 'Portrush')
    await app.tap('+ Add another guest')
    await guest(1, 'Alex Moore')
    await app.tap('Charge 6 points · 2 guests')
    expect(app.toast()).toBe("6 points charged to Ciarán O'Neill · 30 left")
    expect(app.db.guestVisits.filter(v => v.member === 3 && v.by != null).map(v => v.guest)).toEqual(['Sam Guest', 'Alex Moore'])
    expect(app.text()).toContain('Checked in today')
    expect(document.querySelectorAll('[data-ci-rm]')).toHaveLength(2)
    expect(document.getElementById('ci-scan')).not.toBeNull() // ready for the next member
  })
  it('a card that isn’t ours is refused', async () => {
    await office()
    scans('https://example.com/menu')
    await app.tap('Scan a member’s card')
    expect(app.toast()).toBe('That isn’t a TeeMate member card.')
    expect(document.getElementById('ci-go')).toBeNull()
  })
  it('not enough points: refused with the points left, nothing charged', async () => {
    await office(db => db.guestVisits.push({ member: 3, date: db.today, guest: 'Earlier', club: '', points: 33, playerId: null }))
    scans(card(CIARAN))
    await app.tap('Scan a member’s card')
    await guest(0, 'One'); await app.tap('+ Add another guest'); await guest(1, 'Two')
    await app.tap('Charge 6 points · 2 guests')
    expect(app.toast()).toBe('Not enough guest points: Ciarán has 3 left.')
    expect(app.db.guestVisits).toHaveLength(1)
  })
  it('find a member by name, then charge', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await guest(0, 'Sam Guest')
    await app.tap('Charge 3 points · 1 guest')
    expect(app.toast()).toBe("3 points charged to Ciarán O'Neill · 33 left")
  })
  it('a guest’s name is needed before charging', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await app.tap('Charge 3 points · 1 guest')
    expect(app.toast()).toBe('Add the guest’s name.')
    expect(app.db.guestVisits).toHaveLength(0)
  })
  it('Charge is disabled while sending (a double tap charges once)', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await guest(0, 'Sam Guest')
    const btn = document.getElementById('ci-go')
    btn.click(); btn.click()
    await app.settle()
    expect(app.db.guestVisits).toHaveLength(1)
  })
  it('Checked in today: Remove, Sure?, and the points come back', async () => {
    await office(db => db.guestVisits.push({ id: 77, member: 3, date: db.today, guest: 'Sam Guest', club: '', points: 3, playerId: null, by: 0 }))
    await app.tap('[data-ci-rm="77"]')
    expect(document.querySelector('[data-ci-rm="77"]').textContent).toBe('Sure?')
    await app.tap('[data-ci-rm="77"]')
    expect(app.toast()).toBe("Sam Guest removed · 3 points back to Ciarán O'Neill")
    expect(app.db.guestVisits).toHaveLength(0)
  })
  it('the camera can’t be used: the message, and find by name still works', async () => {
    await office()
    openScanner.mockImplementation(({ onError }) => { onError('Can’t use the camera: find the member by name instead'); return { stop: vi.fn() } })
    await app.tap('Scan a member’s card')
    expect(app.toast()).toBe('Can’t use the camera: find the member by name instead')
    await app.type('#ci-find', 'ciar')
    expect(document.querySelector('[data-ci-m="3"]')).not.toBeNull()
  })
  it('Cancel goes back to scan or find, nothing charged', async () => {
    await office()
    scans(card(CIARAN))
    await app.tap('Scan a member’s card')
    await app.tap('#ci-cancel')
    expect(document.getElementById('ci-scan')).not.toBeNull()
    expect(app.db.guestVisits).toHaveLength(0)
  })
})
