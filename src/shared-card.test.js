// One scorecard, several phones: each phone is its own copy of api.js signed in as a different
// player, all saving to the same (in-memory) database at the same time.
import { describe, it, expect, vi } from 'vitest'
import { fakeDb, phone } from './test/fake-supabase.js'
import { isoDate, today } from './dates.js'

vi.mock('@supabase/supabase-js', () => import('./test/fake-supabase.js'))

const HOLES = 18
const member = id => ({ id, name: `Player ${id}`, gui: null, hcp_index: 10, admin: false })
function fourBall() {
  return fakeDb({
    members: [1, 2, 3, 4, 5].map(member),
    rounds: [{
      id: 1, created_by: 1, date: isoDate(today()), updated_at: '2026-10-09T08:00:00Z',
      lineup: [{ m: 1 }, { m: 2 }, { m: 3 }, { m: 4 }], slot_id: 7, game: 'stab', pairing: 0, tee_time: null,
      scores: Array.from({ length: HOLES }, () => [4, 4, 4, 4]), entered: null, done: Array(HOLES).fill(false), submitted: {},
    }],
  })
}

// What the Scores screen does when a player steps a score and saves the hole (positions in my view).
function type(card, hole, k, v, by) {
  card.scores[hole][k] = v
  ;(card.entered ??= card.scores.map(r => r.map(() => null)))[hole][k] = by
  ;(card.changed ??= new Set()).add(`${hole}:${k}`)
  card.done[hole] = true
}
const stored = (db, id = 1) => db.tables.rounds.find(r => r.id === id)

describe('one shared scorecard, two phones', () => {
  it('both players save hole 1 at the same moment: both scores are kept', async () => {
    const db = fourBall()
    const p1 = await phone(db, 1), p2 = await phone(db, 2)
    const [c1, c2] = await Promise.all([p1.getCurrentRound(), p2.getCurrentRound()])
    type(c1, 0, 0, 5, 1) // Player 1 scores their own 5
    type(c2, 0, 0, 6, 2) // Player 2 scores their own 6
    await Promise.all([p1.saveRound(c1), p2.saveRound(c2)])
    expect(stored(db).scores[0].slice(0, 2)).toEqual([5, 6])
  })

  it('all four players save hole 1 at the same moment: all four scores are kept', async () => {
    const db = fourBall()
    const phones = []
    for (const id of [1, 2, 3, 4]) phones.push(await phone(db, id)) // one at a time: each import signs in as the next player
    const cards = await Promise.all(phones.map(p => p.getCurrentRound()))
    cards.forEach((c, n) => type(c, 0, 0, 3 + n, n + 1)) // each scores their own: 3, 4, 5, 6
    await Promise.all(phones.map((p, n) => p.saveRound(cards[n])))
    expect(stored(db).scores[0]).toEqual([3, 4, 5, 6])
  })

  it('saving a card someone has just deleted says so in plain words', async () => {
    const db = fourBall()
    const p1 = await phone(db, 1), p2 = await phone(db, 2)
    const c2 = await p2.getCurrentRound()
    await p1.deleteRound(1)
    type(c2, 0, 0, 6, 2)
    await expect(p2.saveRound(c2)).rejects.toThrow(/deleted/i)
  })

  it('two players tap "Start card" for the same tee time: the group gets one card', async () => {
    const db = fakeDb({ members: [1, 2, 3, 4].map(member) })
    const p1 = await phone(db, 1), p2 = await phone(db, 2)
    expect(await p1.getCurrentRound()).toBeNull() // no card yet: both phones offer "Start card for your 08:10"
    const fresh = me => ({ lineup: [me, ...[1, 2, 3, 4].filter(m => m !== me)].map(m => ({ m })), slotId: 7, game: 'stab', pairing: 0, submitted: {},
      scores: Array.from({ length: HOLES }, () => [4, 4, 4, 4]), done: Array(HOLES).fill(false) })
    const c1 = fresh(1), c2 = fresh(2)
    type(c1, 0, 0, 5, 1)
    type(c2, 0, 0, 6, 2)
    await p1.saveRound(c1) // Player 1 finishes hole 1 first
    await p2.saveRound(c2) // then Player 2, whose phone started its own card
    const cards = db.tables.rounds.filter(r => r.slot_id === 7)
    expect(cards).toHaveLength(1)
    expect(cards[0].scores[0].slice(0, 2)).toEqual([5, 6]) // both scores, each against the right player
    expect(c2.id).toBe(cards[0].id) // Player 2's phone is now on the group's card
  })

  it('two phones save their own new card for the tee time at the same instant: still one card, both scores', async () => {
    const db = fakeDb({ members: [1, 2, 3, 4].map(member) })
    const p1 = await phone(db, 1), p2 = await phone(db, 2)
    const fresh = me => ({ lineup: [me, ...[1, 2, 3, 4].filter(m => m !== me)].map(m => ({ m })), slotId: 7, game: 'stab', pairing: 0, submitted: {},
      scores: Array.from({ length: HOLES }, () => [4, 4, 4, 4]), done: Array(HOLES).fill(false) })
    const c1 = fresh(1), c2 = fresh(2)
    type(c1, 0, 0, 5, 1)
    type(c2, 0, 0, 6, 2)
    await Promise.all([p1.saveRound(c1), p2.saveRound(c2)])
    const cards = db.tables.rounds.filter(r => r.slot_id === 7)
    expect(cards).toHaveLength(1)
    expect([...cards[0].lineup.map(e => e.m)].sort()).toEqual([1, 2, 3, 4])
    const at = m => cards[0].lineup.findIndex(e => e.m === m)
    expect([cards[0].scores[0][at(1)], cards[0].scores[0][at(2)]]).toEqual([5, 6])
  })

  it('after the group finishes, "Start a new round" makes a new card rather than reopening the old one', async () => {
    const db = fourBall()
    db.tables.rounds[0].submitted = { stab: true }
    const p1 = await phone(db, 1)
    const c = { lineup: [1, 2, 3, 4].map(m => ({ m })), slotId: 7, game: 'stab', pairing: 0, submitted: {},
      scores: Array.from({ length: HOLES }, () => [4, 4, 4, 4]), done: Array(HOLES).fill(false) }
    await p1.saveRound(c)
    expect(db.tables.rounds.filter(r => r.slot_id === 7)).toHaveLength(2)
    expect(c.id).not.toBe(1)
  })
})

