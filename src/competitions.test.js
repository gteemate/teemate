import { describe, it, expect } from 'vitest'
import { competitionLists } from './competitions.js'

const D = '2026-10-09', me = { id: 1 }
const ev = over => ({ id: 1, name: 'E', club: false, style: 'individual', startDate: D, days: 1, players: [1], selfEntry: false, ...over })
const league = over => ev({ id: 2, name: 'Winter League', club: true, style: 'league', startDate: '2026-10-05', weeks: 6, ...over })
const pe = over => ({ id: 5, date: D, status: 'accepted', proposerSlot: 20, players: [{ memberId: 1, slot: 10 }],
  groups: [{ slot: 20, time: 470, host: true, answer: 'accepted' }, { slot: 10, time: 490, answer: null }], ...over })
const ids = xs => xs.map(x => x.e.id)

describe('competitionLists: Entered, Open, Events, History', () => {
  it('nothing: two empty lists', () => expect(competitionLists({ me, events: [], playerEvents: [], date: D })).toEqual({ entered: [], history: [] }))

  it('Entered: running and coming up that I\'m in, running first', () => {
    const r = competitionLists({ me, date: D, playerEvents: [], events: [ev({ id: 3, startDate: '2026-10-20' }), league(), ev({ id: 4, players: [2] })] })
    expect(ids(r.entered)).toEqual([2, 3])
    expect(r.entered[0]).toMatchObject({ kind: 'league', running: true, week: 1, weeks: 6 })
    expect(r.entered[1]).toMatchObject({ kind: 'event', running: false })
  })
  it('Entered: a match today that has been accepted', () => {
    const r = competitionLists({ me, date: D, events: [], playerEvents: [pe()] })
    expect(r.entered).toMatchObject([{ kind: 'match' }])
  })

  it("club competitions open for entry that I'm not in aren't listed (you join on the day, as you start your round)", () => {
    const r = competitionLists({ me, date: D, playerEvents: [], events: [
      ev({ id: 6, club: true, selfEntry: true, startDate: '2026-10-24', players: [] }),
      ev({ id: 9, club: true, selfEntry: true, startDate: '2026-10-24', players: [1] }), // already in → Entered
    ] })
    expect(ids(r.entered)).toEqual([9])
    expect(r).not.toHaveProperty('open')
  })

  it('Entered: invitations to answer first, then events set up by players that I\'m in or made', () => {
    const invite = pe({ id: 11, status: 'pending', groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, answer: null }] })
    const r = competitionLists({ me, date: D, playerEvents: [invite], events: [ev({ id: 12, startDate: '2026-10-16' }), ev({ id: 13, club: true, startDate: '2026-10-16' })] })
    expect(r.entered.map(x => x.kind)).toEqual(['invite', 'event', 'event'])
    expect(r.entered[0].kind).toBe('invite') // invitations to answer come first
  })

  it('History: finished competitions I was in, newest first', () => {
    const r = competitionLists({ me, date: D, playerEvents: [], events: [
      ev({ id: 21, startDate: '2026-09-26' }), ev({ id: 22, startDate: '2026-10-03', club: true }), league({ id: 23, startDate: '2026-06-01', weeks: 8 }), ev({ id: 24, startDate: '2026-10-01', players: [2] }),
    ] })
    expect(ids(r.history)).toEqual([22, 21, 23])
  })
})

describe('a league waiting for its knockout finish', () => {
  it('stays in Entered (not History) until the knockout starts', () => {
    const lg = { id: 30, name: 'Pals League', style: 'league', club: false, startDate: '2026-08-01', weeks: 8, players: [1], koTop: 4, koComp: null }
    const me = { id: 1 }
    const r = competitionLists({ me, date: '2026-10-11', events: [lg], playerEvents: [] })
    expect(r.entered.map(x => x.e.id)).toEqual([30])
    expect(r.history).toEqual([])
    const done = competitionLists({ me, date: '2026-10-11', events: [{ ...lg, koComp: 99 }], playerEvents: [] })
    expect(done.history.map(x => x.id ?? x.e.id)).toEqual([30])
  })
})
