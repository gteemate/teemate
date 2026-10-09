// The trail of screens the member has been through, so every screen's back arrow returns to where they
// came from. A screen is a place { tab, aview, sview } (the existing screen state). Home is always at the
// bottom. A screen's own back button that goes to the previous place counts as going back, so the trail
// never loops.
const same = (a, b) => a.tab === b.tab && a.aview === b.aview && a.sview === b.sview
const isHome = p => p.tab === 'home' && p.aview === 'home'

export function navStack(home) {
  let trail = [home]
  const current = () => trail[trail.length - 1]
  return {
    current,
    canGoBack: () => trail.length > 1,
    visit(place) {
      if (same(place, current())) return
      if (isHome(place)) { trail = [home]; return }
      if (trail.length > 1 && same(place, trail[trail.length - 2])) { trail.pop(); return }
      trail.push({ ...place })
    },
    back() {
      if (trail.length > 1) trail.pop()
      return current()
    },
    reset(place) { trail = isHome(place) ? [home] : [home, { ...place }] },
  }
}
