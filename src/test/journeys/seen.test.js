// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { whereSeen } from './seen.js'

const CSS = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8')
const OLD_CSS = CSS.replace(/\.toast\{position:(absolute|fixed);z-index:\d+;/, '.toast{position:absolute;') // before the fix (no z-index)
const MSG = 'Jacqueline Cochrane is already entered in Mixed Fourball. Pick another partner.'

describe('is a refusal seen where the person is looking?', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="main"></div><div id="modal"></div><div id="toast"></div>' })
  it('only in a notice while a pop-up is open, with notices under pop-ups: hidden (the Jacqueline bug)', () => {
    document.getElementById('modal').innerHTML = '<div class="overlay"><div class="sheet">Enter Mixed Fourball?</div></div>'
    document.getElementById('toast').textContent = MSG
    expect(whereSeen(MSG, OLD_CSS)).toBe('hidden')
  })
  it('the same with notices above pop-ups: seen in the notice', () => {
    document.getElementById('modal').innerHTML = '<div class="overlay"><div class="sheet">Enter Mixed Fourball?</div></div>'
    document.getElementById('toast').textContent = MSG
    expect(whereSeen(MSG, CSS)).toBe('notice')
  })
  it('inside the open pop-up: seen there', () => {
    document.getElementById('modal').innerHTML = `<div class="overlay"><div class="sheet"><p role="alert">${MSG}</p></div></div>`
    expect(whereSeen(MSG, CSS)).toBe('modal')
  })
  it('no pop-up: a notice or an alert line on the page', () => {
    document.getElementById('toast').textContent = MSG
    expect(whereSeen(MSG, CSS)).toBe('notice')
    document.getElementById('toast').textContent = ''
    document.getElementById('main').innerHTML = `<p class="gerr" role="alert">${MSG}</p>`
    expect(whereSeen(MSG, CSS)).toBe('page')
  })
  it('nowhere: not seen', () => {
    expect(whereSeen(MSG, CSS)).toBeNull()
  })
})

describe('found in review: a notice is on the screen at every width', () => {
  it('the notice is fixed to the screen (not the bottom of a long page), at every width', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8')
    const base = css.match(/\n\.toast\{([^}]*)\}/)?.[1] ?? '' // the rule for every width (not the phone-only one inside @media)
    expect(base).toMatch(/position:fixed/)
  })
})

describe('found in use: a long notice fits on a phone', () => {
  it('wraps onto more lines and never runs off the screen', async () => {
    const { readFileSync } = await import('node:fs')
    const base = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8').match(/\n\.toast\{([^}]*)\}/)?.[1] ?? ''
    expect(base).not.toMatch(/white-space:nowrap/)
    expect(base).toMatch(/max-width:/)
  })
})
