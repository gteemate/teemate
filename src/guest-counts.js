// A member's guests, counted: the club office sees who each member brings and how often. Pure, tested in
// guest-counts.test.js. The same guest is the same name, ignoring case and spacing; a guest can come GUEST_VISITS
// times a year, so names that may be the same person ("G Cochrane", "Gary Cochrane") are flagged for the office.
import { fold } from './fold.js'

/** How many times a year the same guest can come. */
export const GUEST_VISITS = 6

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

// "G. Cochrane" → { first: 'g', rest: 'cochrane' } (accents, case and full stops ignored); one word: no surname.
const parts = name => { const w = fold(name).replace(/\./g, ' ').trim().split(/\s+/); return w.length > 1 ? { first: w[0], rest: w.slice(1).join(' ') } : null }

/**
 * Guests who may be the same person: the same surname and the same first letter (an initial counts), e.g. G Cochrane,
 * Gary and Gareth Cochrane. counts: guestCounts(); notSame: [{ a, b }] pairs the office said are different people
 * (tidied names, as the database keeps them). → [{ names, times }] (times: their visits together).
 */
export function likelySame(counts, notSame = []) {
  const apart = new Set(notSame.map(p => `${p.a}|${p.b}`))
  const near = (x, y) => { const p = parts(x.guest), q = parts(y.guest); return !!p && !!q && p.rest === q.rest && p.first[0] === q.first[0] }
  const split = (x, y) => { const [a, b] = [key(x.guest), key(y.guest)].sort(); return apart.has(`${a}|${b}`) }
  const group = counts.map((_, i) => i), root = i => (group[i] === i ? i : (group[i] = root(group[i])))
  counts.forEach((x, i) => counts.forEach((y, j) => { if (j > i && near(x, y) && !split(x, y)) group[root(j)] = root(i) }))
  const sets = new Map()
  counts.forEach((x, i) => sets.set(root(i), [...(sets.get(root(i)) ?? []), x]))
  return [...sets.values()].filter(s => s.length > 1).map(s => ({ names: s.map(x => x.guest), times: s.reduce((t, x) => t + x.times, 0) }))
}
