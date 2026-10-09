import { describe, it, expect } from 'vitest'
import { navStack } from './nav-stack.js'

const HOME = { tab: 'home', aview: 'home', sview: 'card' }
const at = (tab, aview = 'home', sview = 'card') => ({ tab, aview, sview })

describe('navStack: where the back arrow goes', () => {
  it('starts at Home with nowhere to go back to', () => {
    const n = navStack(HOME)
    expect(n.current()).toEqual(HOME)
    expect(n.canGoBack()).toBe(false)
  })
  it('visiting screens builds a trail; back retraces it', () => {
    const n = navStack(HOME)
    n.visit(at('home', 'account')); n.visit(at('home', 'events')); n.visit(at('home', 'event'))
    expect(n.back()).toEqual(at('home', 'events'))
    expect(n.back()).toEqual(at('home', 'account'))
    expect(n.back()).toEqual(HOME)
  })
  it('back at Home stays at Home', () => {
    const n = navStack(HOME)
    expect(n.back()).toEqual(HOME)
    expect(n.canGoBack()).toBe(false)
  })
  it('redrawing the same screen adds nothing', () => {
    const n = navStack(HOME)
    n.visit(at('home', 'tee')); n.visit(at('home', 'tee'))
    expect(n.back()).toEqual(HOME)
  })
  it('a screen\'s own back button to where you just were counts as going back (no loop)', () => {
    const n = navStack(HOME)
    n.visit(at('home', 'tee')); n.visit(at('home', 'book'))
    n.visit(at('home', 'tee')) // booking's own ‹ Back goes to the tee sheet
    expect(n.back()).toEqual(HOME) // not back to the booking screen
  })
  it('going Home from anywhere clears the trail', () => {
    const n = navStack(HOME)
    n.visit(at('home', 'account')); n.visit(at('home', 'access')); n.visit(HOME)
    expect(n.canGoBack()).toBe(false)
  })
  it('reset (e.g. after signing in) starts again at a given place', () => {
    const n = navStack(HOME)
    n.visit(at('home', 'account')); n.reset(at('scores'))
    expect(n.current()).toEqual(at('scores'))
    expect(n.back()).toEqual(HOME) // Home is always underneath
  })
})

describe('navStack: jumping back to a screen further up the trail', () => {
  it('after booking, Booked → your bookings → back goes Home (no loop)', () => {
    const n = navStack(HOME)
    for (const v of ['mine', 'tee', 'book', 'booked']) n.visit(at('home', v)) // Booking → Add → time → Booked
    n.visit(at('home', 'mine')) // Booked's own back arrow: to your bookings
    expect(n.back()).toEqual(HOME)
  })
  it('going to any screen already on the trail returns to it (drops what came after)', () => {
    const n = navStack(HOME)
    for (const v of ['account', 'events', 'event', 'evboard']) n.visit(at('home', v))
    n.visit(at('home', 'account'))
    expect(n.back()).toEqual(HOME)
  })
})
