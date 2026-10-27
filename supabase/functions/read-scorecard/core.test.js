import { describe, it, expect } from 'vitest'
import { buildRequest, checkReply, READING_SCHEMA } from './core.js'
import { PAPER_READING } from '../../../src/test/journeys/fake-api.js'

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 5, 3, 4, 4, 4, 3, 5, 4]

describe('the request sent to Claude', () => {
  const req = buildRequest({ images: ['AAAA', 'BBBB'], pars: PARS, open: [...Array(18).keys()], players: 4 })
  it('uses Opus 5.5 at low effort, with the reading schema and refusal fallbacks', () => {
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: READING_SCHEMA } })
    expect(req.fallbacks).toBe('default')
  })
  it('sends one image block per card photo, then the instructions', () => {
    const blocks = req.messages[0].content
    expect(blocks.filter(b => b.type === 'image').map(b => b.source)).toEqual([
      { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' }, { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' }])
    expect(blocks.at(-1).type).toBe('text')
  })
  it('gives the course pars to check against, and says what to read', () => {
    const text = req.messages[0].content.at(-1).text
    expect(text).toContain(PARS.join(', '))
    expect(text).toContain('Score')
    expect(text).toMatch(/null/)
  })
})

describe('checking the reply', () => {
  it('accepts a well-formed reading', () => {
    expect(checkReply(PAPER_READING)).toEqual(PAPER_READING)
  })
  it('refuses a column without 18 holes', () => {
    const bad = structuredClone(PAPER_READING); bad.cards[0].columns[0].holes.pop()
    expect(() => checkReply(bad)).toThrow('The card couldn’t be read. Retake the photo or enter the scores by hand.')
  })
  it('refuses a score that isn’t a whole number', () => {
    const bad = structuredClone(PAPER_READING); bad.cards[0].columns[0].holes[0].score = '5'
    expect(() => checkReply(bad)).toThrow('couldn’t be read')
  })
  it('refuses no cards at all', () => {
    expect(() => checkReply({ parMatches: true, cards: [] })).toThrow('couldn’t be read')
  })
})
