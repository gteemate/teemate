// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { defaultBox, savedBox, saveBox, moveCorner, cropRect } from './crop.js'

describe('the box around the score grid', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* none */ } })
  it('starts inset from the names and signatures', () => {
    expect(defaultBox()).toEqual({ x: 0.04, y: 0.2, w: 0.92, h: 0.68 })
  })
  it('is remembered on this phone for next time', () => {
    expect(savedBox()).toEqual(defaultBox())
    saveBox({ x: 0.1, y: 0.25, w: 0.8, h: 0.6 })
    expect(savedBox()).toEqual({ x: 0.1, y: 0.25, w: 0.8, h: 0.6 })
  })
  it('a corner drag moves that corner and keeps the box on the photo', () => {
    const b = { x: 0.1, y: 0.2, w: 0.8, h: 0.6 }
    expect(moveCorner(b, 'tl', 0.05, -0.1)).toEqual({ x: 0.15, y: 0.1, w: 0.75, h: 0.7 })
    expect(moveCorner(b, 'br', 0.5, 0.5)).toEqual({ x: 0.1, y: 0.2, w: 0.9, h: 0.8 }) // stops at the edges
    expect(moveCorner(b, 'tr', -0.9, 0).w).toBe(0.2) // never smaller than a fifth
  })
})

describe('cutting it out', () => {
  it('scales the cut-out so its long edge is at most 1568px', () => {
    const r = cropRect({ x: 0, y: 0.2, w: 1, h: 0.5 }, 4000, 3000)
    expect(r).toMatchObject({ sx: 0, sy: 600, sw: 4000, sh: 1500 })
    expect(Math.max(r.dw, r.dh)).toBe(1568)
    expect(r.dw / r.dh).toBeCloseTo(4000 / 1500, 2)
  })
  it('leaves a small cut-out at its own size', () => {
    expect(cropRect({ x: 0, y: 0, w: 1, h: 1 }, 800, 600)).toMatchObject({ dw: 800, dh: 600 })
  })
})
