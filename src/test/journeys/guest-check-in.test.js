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
    // handed to the member: just their points, the cost and their guests; the office menu is hidden
    expect(document.getElementById('app').classList.contains('kiosk')).toBe(true)
    expect(app.text()).toContain("Ciarán O'Neill")
    expect(app.text()).toContain('36 points left this year')
    expect(app.text()).toContain('Each guest is 3 points')
    expect(app.text()).not.toContain('Checked in today')
    await guest(0, 'Sam Guest', 'Portrush')
    await app.tap('+ Add another guest')
    await guest(1, 'Alex Moore')
    await app.tap('Done: hand back to the club')
    // back to the staff: what's to be charged, and Charge
    expect(app.text()).toContain('Sam Guest')
    expect(app.text()).toContain('Portrush')
    await app.tap('Charge 6 points · 2 guests')
    expect(app.toast()).toBe("6 points charged to Ciarán O'Neill · 30 left")
    expect(app.db.guestVisits.filter(v => v.member === 3 && v.by != null).map(v => v.guest)).toEqual(['Sam Guest', 'Alex Moore'])
    expect(document.getElementById('app').classList.contains('kiosk')).toBe(false)
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
    await app.tap('Done: hand back to the club')
    await app.tap('Charge 6 points · 2 guests')
    expect(app.toast()).toBe('Not enough guest points: Ciarán has 3 left.')
    expect(app.db.guestVisits).toHaveLength(1)
  })
  it('find a member by name, then charge', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await guest(0, 'Sam Guest')
    await app.tap('Done: hand back to the club')
    await app.tap('Charge 3 points · 1 guest')
    expect(app.toast()).toBe("3 points charged to Ciarán O'Neill · 33 left")
  })
  it('a guest’s name is needed before charging', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await app.tap('Done: hand back to the club')
    expect(app.toast()).toBe('Add the guest’s name.')
    expect(app.db.guestVisits).toHaveLength(0)
  })
  it('Charge is disabled while sending (a double tap charges once)', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await guest(0, 'Sam Guest')
    await app.tap('Done: hand back to the club')
    const btn = document.getElementById('ci-go')
    btn.click(); btn.click()
    await app.settle()
    expect(app.db.guestVisits).toHaveLength(1)
  })
  it('while a charge is sending: Charging…, and Back to the member can’t be tapped (no double charge on slow wifi)', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await guest(0, 'Sam Guest')
    await app.tap('Done: hand back to the club')
    const w = globalThis.__world.wrapped, real = w.chargeGuests
    let release
    w.chargeGuests = (...a) => new Promise(r => { release = () => r(real(...a)) })
    document.getElementById('ci-go').click()
    await Promise.resolve()
    expect(document.getElementById('ci-go').textContent).toBe('Charging…')
    expect(document.getElementById('ci-go').disabled).toBe(true)
    expect(document.getElementById('ci-back').disabled).toBe(true)
    release()
    await app.settle()
    expect(app.toast()).toBe("3 points charged to Ciarán O'Neill · 33 left")
    expect(app.db.guestVisits).toHaveLength(1)
  })
  it('find by name filters as you type without asking the server again', async () => {
    await office()
    const before = app.db.calls.filter(c => c === 'getGuestChargesToday').length
    await app.type('#ci-find', 'ciar')
    expect(document.querySelector('[data-ci-m="3"]')).not.toBeNull()
    expect(app.db.calls.filter(c => c === 'getGuestChargesToday').length).toBe(before)
    expect(document.activeElement?.id).toBe('ci-find')
  })
  it('staff can send it back to the member to change something', async () => {
    await office()
    await app.type('#ci-find', 'ciar')
    await app.tap('[data-ci-m="3"]')
    await guest(0, 'Sam Gest')
    await app.tap('Done: hand back to the club')
    await app.tap('#ci-back')
    expect(document.getElementById('ci-n0').value).toBe('Sam Gest')
    expect(document.getElementById('app').classList.contains('kiosk')).toBe(true)
  })
  it('Checked in today is on the staff’s Today page (not Guests): Remove, Sure?, and the points come back', async () => {
    app = await boot(db => db.guestVisits.push({ id: 77, member: 3, date: db.today, guest: 'Sam Guest', club: '', points: 3, playerId: null, by: 0 }), { as: 'office' })
    await app.tap('[data-ov="guests"]')
    expect(document.querySelector('[data-ci-rm]')).toBeNull()
    await app.tap('[data-ov="today"]')
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
    expect(document.getElementById('app').classList.contains('kiosk')).toBe(false)
    expect(app.db.guestVisits).toHaveLength(0)
  })
})

describe('the member’s Guest points page', () => {
  const points = async setup => { app = await boot(setup, { as: 'member' }); await app.tap('#account'); await app.tap('[data-a="points"]') }
  it('Guest points: Show my card shows my QR code', async () => {
    await points()
    await app.tap('Show my card')
    const sheet = document.querySelector('.sheet')
    expect(sheet.querySelector('.qr svg')).not.toBeNull()
    expect(sheet.textContent).toContain(app.db.members.find(m => m.id === 1).name)
    expect(sheet.textContent).toContain('Show this at the club office to check in your guests')
  })
  it('a guest checked in at the office shows in my guest list', async () => {
    await points(db => db.guestVisits.push({ id: 78, member: 1, date: db.today, guest: 'Sam Guest', club: 'Portrush', points: 3, playerId: null, by: 9000 }))
    const row = [...document.querySelectorAll('.lrow')].find(r => r.textContent.includes('Sam Guest'))
    expect(row.textContent).toContain('Checked in at the club office')
    expect(row.textContent).toContain('−3')
  })
})

describe('Club office → Members → Update handicaps (a CSV from the club’s system)', () => {
  const upload = async text => {
    const input = document.getElementById('o-hfile')
    Object.defineProperty(input, 'files', { value: [new File([text], 'handicaps.csv', { type: 'text/csv' })], configurable: true })
    input.dispatchEvent(new Event('change'))
    await app.settle()
  }
  it('upload, see what changes and who wasn’t found, then update them all', async () => {
    app = await boot(() => {}, { as: 'office' })
    await app.tap('[data-ov="members"]')
    await app.tap('Update handicaps')
    const ciaran = app.db.members.find(m => m.id === 3)
    await upload(`Name,Handicap Index\n${ciaran.name},+1.2\nSean Nobody,8.0\n`)
    expect(app.text()).toContain(`${ciaran.name}`)
    expect(app.text()).toContain('+1.2')
    expect(app.text()).toContain('Not found (1): Sean Nobody')
    await app.tap('Update 1 handicap')
    expect(app.toast()).toBe('1 handicap updated')
    expect(app.db.members.find(m => m.id === 3).hcp).toBe(-1.2)
  })
  it('a file without a handicap column says so, and nothing is updated', async () => {
    app = await boot(() => {}, { as: 'office' })
    await app.tap('[data-ov="members"]')
    await app.tap('Update handicaps')
    await upload('Name,Email\nPat Reid,p@x.ie\n')
    expect(app.text()).toContain('Couldn’t find a handicap column')
    expect(document.getElementById('o-hgo')).toBeNull()
  })
})

describe('the club office sees each member’s guests, with how often each has come', () => {
  const visits = db => db.guestVisits.push(
    { member: 3, date: '2026-05-01', guest: 'Sam Guest', club: 'Portrush', points: 3, playerId: null },
    { member: 3, date: '2026-08-01', guest: 'Sam Guest', club: 'Portrush', points: 3, playerId: null },
    { member: 3, date: '2026-09-01', guest: 'Alex Moore', club: '', points: 3, playerId: null })
  it('Members → a member: guests this year, each with ×times and points', async () => {
    app = await boot(visits, { as: 'office' })
    await app.tap('[data-ov="members"]')
    await app.tap('[data-o-m="3"]')
    const rows = [...document.querySelectorAll('.oguests .orow')].map(r => r.textContent.replace(/\s+/g, ' ').trim())
    expect(rows[0]).toContain('Sam Guest')
    expect(rows[0]).toContain('×2')
    expect(rows[0]).toContain('6 pts')
    expect(rows[1]).toContain('Alex Moore')
    expect(rows[1]).toContain('×1')
  })
  it('Admin → Guest points: under each member, their guests with counts', async () => {
    app = await boot(visits)
    await app.tap('#account'); await app.tap('[data-a="points"]')
    const row = [...document.querySelectorAll('.ptsline')].find(r => r.textContent.includes(app.db.members.find(m => m.id === 3).name))
    expect(row.textContent).toContain('Sam Guest ×2 · Alex Moore ×1')
  })
})
