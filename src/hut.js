// Halfway hut: prices, totals, the menu by section, when to ask after hole 8, and how an order moves along.
// Plain functions, tested in hut.test.js.

export const SECTIONS = ['Food', 'Drinks', 'Snacks']

/** 450 → '£4.50' */
export const penceText = p => `£${(p / 100).toFixed(2)}`

/** picks = { [itemId]: count } → total in pence (items not on the menu ignored). */
export function orderTotal(menu, picks) {
  return menu.reduce((t, i) => t + i.pricePence * (picks[i.id] ?? 0), 0)
}

/** The menu players see: Food, Drinks, Snacks (empty ones left out), sold-out items hidden, in the admin's order. */
export function menuSections(menu) {
  return SECTIONS.map(section => ({ section, items: menu.filter(i => i.section === section && !i.soldOut).sort((a, b) => a.sort - b.sort || a.id - b.id) }))
    .filter(s => s.items.length)
}

/** Ask "would you like to order?" — hut on, hole 8 saved on a saved card not finished, not asked on it, no order on it. */
export function hutPromptDue({ on, card, asked, orders }) {
  if (!on || !card?.id || !card.done?.[7] || card.submitted?.[card.game]) return false
  return !asked.includes(card.id) && !orders.some(o => o.roundId === card.id && o.status !== 'cancelled')
}

const NEXT = { sent: ['ready', 'cancelled'], ready: ['collected', 'cancelled'] }
/** Where an order can go next (hut staff). */
export const nextStatuses = s => NEXT[s] ?? []
