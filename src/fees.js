// Entry fees: how a fee reads to a member when they enter. Plain functions, tested in fees.test.js.
// payment: how the club takes fees ('purse' = from the competition purse, 'shop' = paid in the pro shop).
// purse: the member's competition purse balance in pence, once the club's own system is linked (null until then).

/** Pence as money: 500 → '£5', 3750 → '£37.50'. */
export const money = p => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`

/** The line shown when entering: null when there's no fee. */
export function feeLine(fee, payment, purse = null) {
  if (!fee) return null
  if (payment !== 'purse') return `Entry ${money(fee)}, paid in the pro shop`
  if (purse == null) return `Entry ${money(fee)}, taken from your competition purse`
  if (purse < fee) return `Entry ${money(fee)}. Your competition purse has ${money(purse)}: top it up before entries close`
  return `Entry ${money(fee)} · ${money(purse - fee)} left in your competition purse after this`
}

/** Fees for a competition, for the club office: '12 entries · £60 in fees'. */
export const feeTotal = (fee, entries) => `${entries} entr${entries === 1 ? 'y' : 'ies'}${fee ? ` · ${money(fee * entries)} in fees` : ''}`
