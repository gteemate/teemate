import { describe, it, expect } from 'vitest'
import { NO_GAME, SCORES_ONLY, oneOnOneKey, parseGame, oneOnOneGames, cardSpec, gameName, buildLibrary, gameSpec } from './games.js'
import { GAME_SETTINGS } from './sample-data.js'

const L = buildLibrary(GAME_SETTINGS)

describe("a card's game", () => {
  it('scores only: no game, everyone at full handicap', () => {
    expect(parseGame(NO_GAME)).toEqual({ base: 'none', pair: null })
    expect(parseGame(undefined)).toEqual({ base: 'none', pair: null })
    expect(cardSpec(L, NO_GAME, 4)).toEqual(SCORES_ONLY)
    expect(gameName(L, NO_GAME)).toBe('Scores only')
  })
  it('a game for the group', () => {
    expect(parseGame('bbl')).toEqual({ base: 'bbl', pair: null })
    expect(cardSpec(L, 'bbl', 4)).toEqual(gameSpec(L.lib.bbl))
    expect(gameName(L, 'bbl')).toBe(L.lib.bbl.name)
  })
  it('a one-on-one within the card names both players (members or guests), the same on every phone', () => {
    const key = oneOnOneKey('kos', { m: 0 }, { g: 7 })
    expect(key).toBe('kos:m0:g7')
    expect(parseGame(key)).toEqual({ base: 'kos', pair: [{ m: 0 }, { g: 7 }] })
    expect(cardSpec(L, key, 4)).toEqual(gameSpec(L.lib.kos))
    expect(gameName(L, key)).toBe('Handicap match play')
  })
  it('one-on-ones are the two-player match play games', () => {
    expect(oneOnOneGames(L).map(x => x.k)).toEqual(['sm2', 'sc2', 'kos'])
  })
})
