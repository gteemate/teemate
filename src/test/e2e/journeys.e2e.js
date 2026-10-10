// @vitest-environment happy-dom
// End-to-end: real taps in the real app against the test database. First every main screen loads (catching the
// database refusing something the app asks for), then journeys, each checked in the database after.
// Runs on the scenario data (see supabase/scenarios.sql); the tests share it, so each uses its own competition,
// request or tee time.
import { describe, it, expect, inject, afterEach } from 'vitest'
import { boot, sql } from './driver.js'

let app
afterEach(() => app?.done())

const e2e = () => inject('e2e')
// The button inside the card that mentions `name` (e.g. a competition's Enter button).
const inCard = (sel, name) => { const b = [...document.querySelectorAll(sel)].find(x => (x.closest('.orow, .card') ?? x).textContent.includes(name)); return b && `${sel.replace(/\]$/, '')}="${b.getAttribute(sel.slice(1, -1))}"]` }
const signedInAsGary = async () => { app = await boot(); await app.signIn(e2e().gary, e2e().password); await dismissAlerts(); await app.home() }
const dismissAlerts = async () => { await app.settle(); for (let i = 0; i < 4 && document.querySelector('#alerts [data-al="ok"]'); i++) await app.tap('#alerts [data-al="ok"]') }

describe('journeys against the test database', () => {
  // First, before any journey changes things: every main screen loads (the database refuses nothing the app asks for).
  it('Gary (admin): Home, Booking, Competitions, Friends, Scoring, Account, the club office', async () => {
    app = await boot()
    await app.signIn(e2e().gary, e2e().password)
    expect(app.screen()).toMatch(/^Hole \d+$/) // his round today is in progress, so the app opens on his card
    await app.waitFor(() => app.text().includes('has moved to 08:20'), 'the club office’s notice to drop down')
    await app.tap('OK')
    await app.home()
    expect(app.text()).toContain('Gary Cochrane')

    const visit = async tile => { await app.tap(tile); app.check(); await app.home() }
    await visit('[data-tile="booking"]')
    await app.tap('[data-tile="comp"]')
    for (const tab of ['Entered', 'Events', 'History']) {
      await app.tap(`[data-tab="${tab.toLowerCase()}"]`)
      app.check()
    }
    await app.tap('[data-tab="events"]')
    expect(app.main()).toContain('Autumn Singles') // open, with a fee
    expect(app.main()).toContain('Declined (1)') // Mixed Foursome
    await app.home()
    await visit('[data-tile="friends"]')
    await visit('[data-tile="scoring"]')

    await app.tap('#account')
    expect(app.main()).toContain('Competition purse')
    expect(app.main()).toContain('£42.50')
    await app.tap('Club office')
    for (const sec of ['today', 'members', 'tee', 'comps', 'club']) {
      await app.tap(`[data-ov="${sec}"]`)
      app.check()
    }
    await app.tap('[data-ov="today"]')
    expect(app.main()).toContain('Sean Byrne is asking to join')
    expect(app.main()).toContain('the result was questioned') // Winter Foursomes, disputed
  })

  it('books a tee time with a friend', async () => {
    await signedInAsGary()
    await app.tap('[data-tile="booking"]')
    await app.tap('+ Add a booking')
    await app.tap('[data-d="1"]') // tomorrow
    const open = [...document.querySelectorAll('.slot:not(.full)')].find(b => b.textContent.includes('Open tee'))
    expect(open, 'a free tee time tomorrow').toBeTruthy()
    await app.tap(`.slot[data-id="${open.dataset.id}"]`)
    await app.tap('[data-open]')
    await app.tap('Declan Murphy')
    await app.tap('Confirm booking')
    expect(app.screen()).toBe('Booked')
    const [b] = await sql(`select array_agg(bp.member_id::int order by bp.member_id) as who from public.bookings b join public.booking_players bp on bp.booking_id = b.id where b.slot_id = ${open.dataset.id} group by b.id`)
    expect(b.who).toEqual([0, 1])
  })

  it('enters a competition with a fee, seeing what is left in the purse', async () => {
    await signedInAsGary()
    await app.tap('[data-tile="comp"]')
    await app.tap('[data-tab="events"]')
    await app.tap(inCard('[data-sign]', 'Autumn Singles'))
    expect(app.text()).toContain('Entry £5 · £37.50 left in your competition purse after this')
    await app.tap('#sg-go')
    const [r] = await sql(`select count(*)::int as n from public.signup_entries e join public.signup_comps c on c.id = e.comp_id where c.name = 'Autumn Singles' and e.member_id = 0`)
    expect(r.n).toBe(1)
  })

  it('starts the scorecard for a knockout match from the draw, linked to the fixture', async () => {
    await signedInAsGary()
    await app.tap('[data-tile="comp"]')
    await app.tap(inCard('[data-ko]', 'Club Singles'))
    await app.tap('Score this match')
    const [m] = await sql(`select m.round_id is not null as linked, r.game, r.lineup from public.ko_matches m join public.signup_comps c on c.id = m.comp_id left join public.rounds r on r.id = m.round_id where c.name = 'Club Singles' and m.round = 1 and m.slot = 0`)
    expect(m).toMatchObject({ linked: true, game: 'kos', lineup: [{ m: 0 }, { m: 9 }] })
  })

  it('confirms a result the other side entered', async () => {
    await signedInAsGary()
    await app.tap('[data-tile="comp"]')
    await app.tap(inCard('[data-ko]', 'Winter Foursomes'))
    await app.tap('#ko-confirm')
    const [m] = await sql(`select m.status from public.ko_matches m join public.signup_comps c on c.id = m.comp_id where c.name = 'Winter Foursomes' and m.round = 1 and m.slot = 0`)
    expect(m.status).toBe('confirmed')
  })

  it('the club office lets someone in and declines a tee time request with a note', async () => {
    await signedInAsGary()
    await app.tap('#account')
    await app.tap('Club office')
    await app.tap(inCard('[data-o-letin]', 'Sean Byrne'))
    await app.tap(inCard('[data-o-decline]', 'Mark Doherty'))
    await app.type('#o-note', 'Society day is full. Try the Sunday?')
    await app.tap('#o-dec')
    const [r] = await sql(`select (select count(*)::int from public.members where email = 'sean.byrne@example.invalid') as let_in,
      (select status || ': ' || admin_note from public.tee_time_requests where member_id = 5) as request`)
    expect(r).toEqual({ let_in: 1, request: 'declined: Society day is full. Try the Sunday?' })
  })

  it('an ordinary member: no club office, their own balance, and the database refuses office actions', async () => {
    app = await boot()
    await app.signIn(e2e().declan, e2e().password)
    await dismissAlerts()
    await app.home()
    await app.tap('#account')
    expect(app.labels()).not.toContain('Club office')
    expect(app.main()).toContain('£3')
    const api = await import('../../api.js')
    await expect(api.setFeePayment('shop')).rejects.toThrow(/Only the club office/)
    await expect(api.adminCancelBooking(1)).rejects.toThrow(/Only the club office/)
    const [r] = await sql(`select fee_payment from public.club_settings where id = 1`)
    expect(r.fee_payment).toBe('purse')
  })
})
