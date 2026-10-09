// Home's Scoring tile while a round is on the go: "Hole 4 · +1" — the next hole to play and my score against par
// so far (net when the game gives shots). Plain function of the card, tested in round-pill.test.js.
import { toPar } from './scoring.js'

/** { done[], gross[], pars[], shots[] } are per hole for me; → 'Hole N · ±X', or null (nothing saved, or finished). */
export function roundPill({ done, gross, pars, shots, finished }) {
  if (finished || !done.some(Boolean)) return null
  const next = done.indexOf(false)
  const vsPar = done.reduce((t, d, i) => (d && gross[i] != null ? t + gross[i] - (shots[i] ?? 0) - pars[i] : t), 0)
  return `Hole ${next === -1 ? done.length : next + 1} · ${toPar(vsPar)}`
}
