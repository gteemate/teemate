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
  it('the member’s Cancel doesn’t show the office: it says hand back, and only staff go back to Guests', async () => {
    await office()
    scans(card(CIARAN))
    await app.tap('Scan a member’s card')
    await app.tap('#ci-cancel')
    expect(document.getElementById('ci-scan')).toBeNull()
    expect(document.getElementById('app').classList.contains('kiosk')).toBe(true) // still no office menu
    expect(app.text()).toContain('Please hand the iPad back to the club')
    await app.tap('Staff: back to Guests')
    expect(document.getElementById('ci-scan')).not.toBeNull()
    expect(document.getElementById('app').classList.contains('kiosk')).toBe(false)
    expect(app.db.guestVisits).toHaveLength(0)
  })
  it('find by name ignores accents: “ciaran” finds Ciarán', async () => {
    await office()
    await app.type('#ci-find', 'ciaran')
    expect(document.querySelector('[data-ci-m="3"]')).not.toBeNull()
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
  it('Members → a member’s page: guests this year, each counted out of 6, with the points used', async () => {
    app = await boot(visits, { as: 'office' })
    await app.tap('[data-ov="members"]')
    await app.tap('[data-o-m="3"]')
    const rows = [...document.querySelectorAll('.otable tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim())
    expect(rows[0]).toContain('Sam Guest')
    expect(rows[0]).toContain('2 of 6')
    expect(rows[1]).toContain('Alex Moore')
    expect(rows[1]).toContain('1 of 6')
    expect(app.text()).toContain('3 visits · 9 points used')
    expect(document.getElementById('modal').innerHTML).toBe('') // its own page, not a panel
    await app.tap('#o-mback')
    expect(document.querySelector('[data-o-m="3"]')).not.toBe(null)
  })
  it('names that may be the same person are flagged; the office merges them', async () => {
    app = await boot(db => { visits(db); db.guestVisits.push({ id: 81, member: 3, date: db.today, guest: 'G Cochrane', club: '', points: 3, playerId: null, by: 0 }, { id: 82, member: 3, date: db.today, guest: 'Gary Cochrane', club: 'Ballymena', points: 3, playerId: null, by: 0 }) }, { as: 'office' })
    await app.tap('[data-ov="members"]'); await app.tap('[data-o-m="3"]')
    expect(document.querySelector('.oflag').textContent).toContain('May be the same person: 2 of 6 together')
    await app.tap('[data-o-merge="0"]')
    expect(app.db.guestVisits.filter(v => v.member === 3 && /cochrane/i.test(v.guest)).map(v => v.guest)).toEqual(['Gary Cochrane', 'Gary Cochrane'])
    expect(document.querySelector('.oflag')).toBe(null)
    expect([...document.querySelectorAll('.otable tbody tr')].find(r => r.textContent.includes('Gary Cochrane')).textContent).toContain('2 of 6')
  })
  it('Different people: the pair isn’t flagged again', async () => {
    app = await boot(db => { visits(db); db.guestVisits.push({ id: 81, member: 3, date: db.today, guest: 'G Cochrane', club: '', points: 3, playerId: null, by: 0 }, { id: 82, member: 3, date: db.today, guest: 'Gary Cochrane', club: 'Ballymena', points: 3, playerId: null, by: 0 }) }, { as: 'office' })
    await app.tap('[data-ov="members"]'); await app.tap('[data-o-m="3"]')
    await app.tap('[data-o-apart="0"]')
    expect(app.db.guestNotSame).toEqual([{ memberId: 3, a: 'g cochrane', b: 'gary cochrane' }])
    expect(document.querySelector('.oflag')).toBe(null)
  })
  it('Admin → Guest points: under each member, their guests with counts', async () => {
    app = await boot(visits)
    await app.tap('#account'); await app.tap('[data-a="points"]')
    const row = [...document.querySelectorAll('.ptsline')].find(r => r.textContent.includes(app.db.members.find(m => m.id === 3).name))
    expect(row.textContent).toContain('Sam Guest ×2 · Alex Moore ×1')
  })
})

describe('the member is told when the office charges their guests', () => {
  it('the office charges; the member’s drop-down says the points used and what’s left; OK clears it', async () => {
    app = await boot(() => {}, { as: 'office' })
    await app.tap('[data-ov="guests"]')
    await app.type('#ci-find', 'declan')
    await app.tap('[data-ci-m="1"]')
    await guest(0, 'Sam Guest'); await app.tap('+ Add another guest'); await guest(1, 'Alex Moore')
    await app.tap('Done: hand back to the club')
    await app.tap('Charge 6 points · 2 guests')
    const notice = app.db.notices.find(n => n.memberId === 1 && n.kind === 'guests')
    app.done()
    app = await boot(db => db.notices.push({ ...notice }), { as: 'member' }) // Declan opens the app
    const drop = document.getElementById('alerts').textContent
    expect(drop).toContain('6 guest points used today · 30 of 36 left')
    expect(drop).toContain('Checked in at the club office: Sam Guest, Alex Moore')
    await app.tap('[data-al="ok"]')
    expect(app.db.notices.find(n => n.kind === 'guests').seen).toBe(true)
  })
})

describe('adding playing partners by scanning their QR code', () => {
  const ALEX = friendLink({ id: 44, name: 'Alex Moore', hcp: 9.1, gui: '10855555' }, 'Portrush', 'https://x.example/') // another club's TeeMate
  const scansInTurn = (...texts) => { for (const t of texts) openScanner.mockImplementationOnce(({ onText }) => { onText(t); return { stop: vi.fn() } }) }
  it('booking: scan a club member, then a player from another club (a guest, details filled in); the camera opens again for each', async () => {
    app = await boot()
    await app.tap('Booking'); await app.tap('+ Add a booking')
    await app.tap(`[data-id="${app.db.slotsOn(app.db.today).find(s => s.time === 600).id}"]`)
    await app.tap('[data-open]')
    scansInTurn(card(CIARAN), ALEX)
    await app.tap('Scan their QR code')
    await app.settle(); await app.settle()
    expect(openScanner).toHaveBeenCalledTimes(3) // Ciarán, Alex, then open for a third
    expect(app.text()).toContain("Ciarán O'Neill")
    expect(app.text()).toContain('Alex Moore')
    expect(app.db.buddies.some(b => b.id === 3)).toBe(true) // saved as friends for next time
    expect(app.db.calls).toContain('saveContact')
    await app.tap('Confirm booking')
    const s = app.db.slotsOn(app.db.today).find(x => x.time === 600)
    expect(s.players.map(p => p.name)).toEqual(['Gary Cochrane', "Ciarán O'Neill", 'Alex Moore'])
    expect(s.players.find(p => p.name === 'Alex Moore')).toMatchObject({ guest: true, club: 'Portrush' })
  })
  it('booking: scanning someone already in the group says so', async () => {
    app = await boot()
    await app.tap('Booking'); await app.tap('+ Add a booking')
    await app.tap(`[data-id="${app.db.slotsOn(app.db.today).find(s => s.time === 600).id}"]`)
    await app.tap('[data-open]')
    scansInTurn(card(CIARAN), card(CIARAN))
    await app.tap('Scan their QR code')
    await app.settle(); await app.settle()
    expect(app.toast()).toBe("Ciarán O'Neill is already in your group")
  })
  it('Scoring → Players: scan club members onto the card, one after another', async () => {
    app = await boot()
    await app.tap('Scoring')
    await app.tap('#pick')
    scansInTurn(card(CIARAN), card({ id: 5, name: app.db.members.find(m => m.id === 5).name, hcp: 10 }))
    await app.tap('Scan their QR code')
    await app.settle(); await app.settle()
    expect(app.text()).toContain('Use these 3 players')
  })
  it('Scoring → Players: someone from another club is told how they join a card', async () => {
    app = await boot()
    await app.tap('Scoring')
    await app.tap('#pick')
    scansInTurn(ALEX)
    await app.tap('Scan their QR code')
    await app.settle()
    expect(app.toast()).toBe('Alex Moore is from another club: add them to your booking as a guest, and they join your card from there.')
  })
  it('Friends → Find members: scan to add friends, one after another', async () => {
    app = await boot()
    await app.tap('Friends')
    await app.tap('Find members')
    scansInTurn(card(CIARAN), ALEX)
    await app.tap('Scan a QR code')
    await app.settle(); await app.settle()
    expect(app.db.buddies.some(b => b.id === 3)).toBe(true)
    expect(app.db.calls).toContain('saveContact')
  })
})

describe('name searches ignore accents', () => {
  it('Club office → Members: “ciaran” finds Ciarán', async () => {
    app = await boot(() => {}, { as: 'office' })
    await app.tap('[data-ov="members"]')
    await app.type('#o-q', 'ciaran')
    expect(document.querySelector('[data-o-m="3"]')).not.toBeNull()
  })
  it('Friends → Find members: “ciaran” finds Ciarán', async () => {
    app = await boot()
    await app.tap('Friends'); await app.tap('Find members')
    await app.type('#q', 'ciaran')
    expect(app.text()).toContain("Ciarán O'Neill")
  })
})
