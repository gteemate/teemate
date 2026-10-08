// Presentation helpers for greens and pins (image crops, flag colours).
import { asset, nn } from './ui.js'

// Where the green sits in each green photo: [centre x, centre y, half-width, half-height] as fractions
const GREENBOX = [[.55, .44, .25, .29], [.38, .49, .30, .32], [.52, .40, .33, .30], [.51, .41, .24, .16], [.41, .28, .32, .23], [.61, .30, .24, .20], [.38, .49, .33, .28], [.42, .45, .33, .22], [.36, .51, .21, .23], [.38, .59, .30, .31], [.57, .41, .21, .21], [.50, .47, .29, .34], [.43, .41, .36, .24], [.49, .35, .27, .25], [.71, .37, .25, .21], [.50, .41, .29, .26], [.54, .40, .32, .29], [.45, .36, .29, .24]]

export const flagOf = (d, g) => (d < g / 3 ? 'front' : d < (2 * g) / 3 ? 'middle' : 'back')
export const FLAGCOL = { front: '#d23b2f', middle: '#ffffff', back: '#2a5bd7' }
export const FLAGNAME = { front: 'Red · front', middle: 'White · middle', back: 'Blue · back' }
export const SIDE = { L: 'Left', C: 'Centre', R: 'Right' }

export function greenPic(hole, pin) {
  const i = hole.n - 1, d = pin.yardsOn, g = hole.greenDepth, s = pin.side
  const [cx, cy, rx, ry] = GREENBOX[i], f = flagOf(d, g)
  const x = (cx + { L: -1, C: 0, R: 1 }[s] * rx * 0.55) * 100, y = (cy + ry * (0.65 - (1.3 * d) / g)) * 100
  return `<div class="greenpic"><img src="${asset(`greens/g${nn(hole.n)}.jpg`)}" alt="Green on hole ${hole.n} with surrounding bunkers"><span class="pin" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"><i style="background:${FLAGCOL[f]}"></i></span><span class="frontlbl">Front ↓</span></div>`
}

// 18-hole picker used by the Course and Scores screens. extra(j) adds a line under each number.
export function holeGrid(cur, extra, attr) {
  const cell = j => `<button class="hc ${j === cur ? 'cur' : ''}" ${attr}="${j}" aria-label="Hole ${j + 1}"><span class="num">${j + 1}</span>${extra(j)}</button>`
  const row = from => [...Array(9)].map((_, j) => cell(j + from)).join('')
  return `<div class="card hgrid"><div class="row">${row(0)}</div><hr><div class="row">${row(9)}</div></div>`
}
