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
})
