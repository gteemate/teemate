// Paper scorecards: the box around the score grid. Only what's inside it is cut out on the phone and sent to be
// read, so names, handicaps and signatures never leave it. Fractions of the photo, so one box fits any photo size.
const KEY = 'teemate.cropBox'
const MIN = 0.2
const r4 = v => Math.round(v * 1e4) / 1e4

export const defaultBox = () => ({ x: 0.04, y: 0.2, w: 0.92, h: 0.68 })

/** The box used last time on this phone (cards at one club are all the same layout), else the default. */
export function savedBox() {
  try { const b = JSON.parse(localStorage.getItem(KEY)); if (b && ['x', 'y', 'w', 'h'].every(k => typeof b[k] === 'number')) return b } catch { /* none */ }
  return defaultBox()
}
export function saveBox(box) { try { localStorage.setItem(KEY, JSON.stringify(box)) } catch { /* no storage */ } }

/** Drag one corner ('tl' | 'tr' | 'bl' | 'br') by dx, dy (fractions); the box stays on the photo and at least a fifth across. */
export function moveCorner(box, corner, dx, dy) {
  let x1 = box.x, y1 = box.y, x2 = box.x + box.w, y2 = box.y + box.h
  if (corner[1] === 'l') x1 = Math.min(Math.max(0, x1 + dx), x2 - MIN); else x2 = Math.max(Math.min(1, x2 + dx), x1 + MIN)
  if (corner[0] === 't') y1 = Math.min(Math.max(0, y1 + dy), y2 - MIN); else y2 = Math.max(Math.min(1, y2 + dy), y1 + MIN)
  return { x: r4(x1), y: r4(y1), w: r4(x2 - x1), h: r4(y2 - y1) }
}

/** Where to cut in a w × h photo, and the size to draw it at (long edge at most maxEdge). */
export function cropRect(box, w, h, maxEdge = 1568) {
  const sx = Math.round(box.x * w), sy = Math.round(box.y * h), sw = Math.round(box.w * w), sh = Math.round(box.h * h)
  const k = Math.min(1, maxEdge / Math.max(sw, sh))
  return { sx, sy, sw, sh, dw: Math.round(sw * k), dh: Math.round(sh * k) }
}

/** Cut the box out of a loaded image as a JPEG. */
export function cropToBlob(img, box) {
  const r = cropRect(box, img.naturalWidth, img.naturalHeight)
  const c = document.createElement('canvas')
  c.width = r.dw; c.height = r.dh
  c.getContext('2d').drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.dw, r.dh)
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('The photo couldn’t be prepared. Try another photo.'))), 'image/jpeg', 0.85))
}
