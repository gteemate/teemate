// A member's guests, counted: the club office sees who each member brings and how often. Pure, tested in
// guest-counts.test.js. The same guest is the same name, ignoring case and spacing.

const key = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** visits [{ guest, club, points, date }] → [{ guest, club, times, points, last }], most often first, then most recent. */
export function guestCounts(visits) {
  const by = new Map()
  for (const v of visits) {
    const k = key(v.guest), g = by.get(k)
    if (!g) by.set(k, { guest: v.guest.trim(), club: v.club ?? '', times: 1, points: v.points, last: v.date })
    else { g.times++; g.points += v.points; if (v.date > g.last) g.last = v.date; if (!g.club && v.club) g.club = v.club }
  }
  return [...by.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last))
}
