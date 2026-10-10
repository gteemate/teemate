import { describe, it, expect } from 'vitest'
import { requestStatus } from './requests.js'

describe('requestStatus: how a tee time request reads', () => {
  it('waiting', () => expect(requestStatus({ status: 'pending' })).toEqual({ text: 'Waiting for an admin', tone: 'wait' }))
  it('approved', () => expect(requestStatus({ status: 'approved', bookingId: 9 })).toEqual({ text: 'Approved: booked', tone: 'ok' }))
  it('approved, but the booking has since been cancelled', () => expect(requestStatus({ status: 'approved', bookingId: null })).toEqual({ text: 'Approved, then cancelled', tone: 'off' }))
  it('declined, with the admin\'s note', () => expect(requestStatus({ status: 'declined', note: 'Full that day, sorry' })).toEqual({ text: 'Declined: Full that day, sorry', tone: 'no' }))
  it('cancelled', () => expect(requestStatus({ status: 'cancelled' })).toEqual({ text: 'Cancelled', tone: 'off' }))
})
