// Home's Scoring tile while a round is on the go: "Hole 4 · +1" — the next hole to play and my score against par
// so far (net when the game gives shots). Plain function of the card, tested in round-pill.test.js.
import { toPar } from './scoring.js'

/** { done[], gross[], pars[], shots[] } are per hole for me (the holes the card plays: nums are their numbers, else
 * 1–18); → 'Hole N · ±X', or null (nothing saved, or finished). */
export function roundPill({ done, gross, pars, shots, nums, finished }) {
  if (finished || !done.some(Boolean)) return null
  const next = done.indexOf(false)
  const vsPar = done.reduce((t, d, i) => (d && gross[i] != null ? t + gross[i] - (shots[i] ?? 0) - pars[i] : t), 0)
  const num = j => (nums ? nums[j] : j + 1)
  return `Hole ${num(next === -1 ? done.length - 1 : next)} · ${toPar(vsPar)}`
}
