import { describe, it, expect } from 'vitest'
import { gaps } from './coverage.js'

const index = {
  db: { enter_signup: ['Entries have closed for %.', 'Only members can enter.'], book_tee_time: ['That tee time is full.'], get_tee_sheet: ['Only members can see the tee sheet.'] },
  api: { enterSignup: { rpc: ['enter_signup'], tables: [] }, bookTeeTime: { rpc: ['book_tee_time'], tables: [] }, getTeeSheet: { rpc: ['get_tee_sheet'], tables: [] }, saveNote: { rpc: [], tables: ['notes'] } },
}

describe('journey coverage', () => {
  it('reports actions with no journey, messages with no refusal, people with no journey', () => {
    const journeys = [{ id: 'j', who: 'member', action: 'enterSignup', refusals: ['Entries have closed for %.'] }]
    expect(gaps(journeys, index, ['member', 'office'])).toEqual({
      actions: ['bookTeeTime', 'saveNote'], // getTeeSheet only reads; an action with no journey isn't listed again under messages
      messages: { enter_signup: ['Only members can enter.'] }, // neither checked nor given a reason
      people: ['office'],
    })
    const withReason = [{ ...journeys[0], unreachable: { 'Only members can enter.': 'signed-in members only reach this' } }]
    expect(gaps(withReason, index, ['member']).messages).toEqual({})
  })
  it('a journey that can’t be refused covers its action and asks for no messages', () => {
    const journeys = [{ id: 'n', who: 'member', action: 'saveNote', refusals: { none: 'a plain table write: no messages' } }]
    expect(gaps(journeys, { db: {}, api: { saveNote: index.api.saveNote } }, ['member'])).toEqual({ actions: [], messages: {}, people: [] })
  })
  it('an action the app never offers anyone is listed with why, not as a gap', () => {
    expect(gaps([], index, [], {}, { saveNote: 'no screen saves notes' }).actions).toEqual(['enterSignup', 'bookTeeTime'])
  })
})

import { readFileSync } from 'node:fs'
import { JOURNEYS, PEOPLE, ALSO_UNREACHABLE, NOT_OFFERED } from './catalogue.js'
describe('the journey list is complete', () => {
  it('every action, every refusal and every kind of person has a journey (or a reason it can’t)', () => {
    const real = JSON.parse(readFileSync(`${process.cwd()}/src/test/journeys/refusal-index.json`, 'utf8'))
    expect(gaps(JOURNEYS, real, PEOPLE, ALSO_UNREACHABLE, NOT_OFFERED)).toEqual({ actions: [], messages: {}, people: [] })
  })
})
