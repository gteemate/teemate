// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
vi.mock('../api.js', () => ({}))
import { fieldHtml } from './leaderboard.js'
import { S } from '../state.js'
import { COURSE } from '../sample-data.js'

describe('found in review: today’s scores on a short round', () => {
  it('a card on the back 9 is thru 9 and scored against those holes’ pars (level par, not +1 on the front 9’s)', () => {
    S.lbm = 'gross'
    const holes = [9, 10, 11, 12, 13, 14, 15, 16, 17]
    const html = fieldHtml({ course: COURSE, me: { id: 2 }, rounds: [{ member: { id: 1, name: 'Ann Lee', hcp: 0 }, holes, gross: holes.map(i => COURSE.holes[i].par), live: true }] })
    expect(html).toContain('thru 9')
    expect(html).toMatch(/class="lval[^"]*">E</)
  })
})

describe('paper scorecards: an unconfirmed score counts, with a mark', () => {
  it('awaiting confirmation, or sent back', () => {
    S.lbm = 'gross'
    const gross = COURSE.holes.map(h => h.par)
    const row = paper => ({ member: { id: 1, name: 'Ann Lee', hcp: 0 }, gross, paper, live: true })
    expect(fieldHtml({ course: COURSE, me: { id: 2 }, rounds: [row('waiting')] })).toContain('Awaiting confirmation')
    expect(fieldHtml({ course: COURSE, me: { id: 2 }, rounds: [row('sent_back')] })).toContain('Sent back')
    expect(fieldHtml({ course: COURSE, me: { id: 2 }, rounds: [row(null)] })).not.toContain('confirmation')
  })
})
