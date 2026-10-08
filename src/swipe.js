// Swipe a list row left to reveal an action button behind it (e.g. Delete).
// Markup: <div class="swipe"><button class="swdel">…</button><div class="swrow" data-swipe>…</div></div>
// Pointer events, so it works with a finger or a mouse drag. One row open at a time.
export const OPEN = -92

export function slide(row, x) {
  row.style.transform = x ? `translateX(${x}px)` : ''
  row.classList.toggle('open', x !== 0)
}

/** Wire up every [data-swipe] row. A drag sets row.dataset.swiped so the row's click can ignore it. */
export function bindSwipes() {
  document.querySelectorAll('[data-swipe]').forEach(row => {
    let start = null, base = 0, x = 0
    row.onpointerdown = e => { start = e.clientX; base = row.classList.contains('open') ? OPEN : 0; x = base; row.style.transition = 'none' }
    row.onpointermove = e => {
      if (start == null) return
      const dx = e.clientX - start
      if (Math.abs(dx) > 8) { row.dataset.swiped = '1'; try { row.setPointerCapture(e.pointerId) } catch {} } // keep following the finger off the row
      x = Math.max(OPEN, Math.min(0, base + dx))
      row.style.transform = `translateX(${x}px)`
    }
    const end = () => {
      if (start == null) return
      start = null
      row.style.transition = ''
      if (row.dataset.swiped !== '1') return
      const open = x < OPEN / 2
      document.querySelectorAll('[data-swipe].open').forEach(r => r !== row && slide(r, 0))
      slide(row, open ? OPEN : 0)
    }
    row.onpointerup = end
    row.onpointercancel = end
  })
}

/** For a row's click handler: true if this "click" was really the end of a swipe (or closed an open row). */
export function swipeSwallowsClick(row) {
  if (row.dataset.swiped === '1') { row.dataset.swiped = ''; return true }
  if (row.classList.contains('open')) { slide(row, 0); return true }
  return false
}
