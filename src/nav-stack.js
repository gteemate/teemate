// The trail of screens the member has been through, so every screen's back arrow returns to where they
// came from. A screen is a place { tab, aview, sview } (the existing screen state). Home is always at the
// bottom. Going to a screen already on the trail (e.g. a screen's own back button to an earlier screen)
// returns to it and drops what came after, so the trail never loops. A finished booking resets the trail
// (reset), so back goes Home from there.
const same = (a, b) => a.tab === b.tab && a.aview === b.aview && a.sview === b.sview
const isHome = p => p.tab === 'home' && p.aview === 'home'

/** passing(place): a screen you pass through (Booked); going on from it replaces it, so back never returns to it. */
export function navStack(home, { passing = () => false } = {}) {
  let trail = [home]
  const current = () => trail[trail.length - 1]
  return {
    current,
    canGoBack: () => trail.length > 1,
    visit(place) {
      if (same(place, current())) return
      if (isHome(place)) { trail = [home]; return }
      const i = trail.findIndex(p => same(p, place)) // already on the trail: go back to it (no loops)
      if (i >= 0) { trail = trail.slice(0, i + 1); return }
      if (passing(current())) trail.pop()
      trail.push({ ...place })
    },
    back() {
      if (trail.length > 1) trail.pop()
      return current()
    },
    reset(place) { trail = isHome(place) ? [home] : [home, { ...place }] },
  }
}
