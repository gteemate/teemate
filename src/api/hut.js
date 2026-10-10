import { must, sb } from './client.js'

/* ---------- Halfway hut ---------- */

const toItem = i => ({ id: i.id, section: i.section, name: i.name, pricePence: i.pricePence ?? i.price_pence, soldOut: i.soldOut ?? i.sold_out, sort: i.sort })

/** { on, menu: [{ id, section, name, pricePence, soldOut, sort }] } */
export async function getHut() {
  const h = must(await sb.rpc('get_hut'))
  return { on: !!h.on, menu: h.menu.map(toItem) }
}

/* Admins: the switch, the menu, the hut staff. */
export async function setHutOn(on) { must(await sb.rpc('admin_set_hut_on', { p_on: on })) }

/** Add an item, or change it when it has an id. */
export async function saveHutItem({ id, section, name, pricePence, soldOut = false, sort = 0 }) {
  const row = { section, name: name.trim(), price_pence: pricePence, sold_out: soldOut, sort }
  if (id) must(await sb.from('hut_menu').update(row).eq('id', id).select('id'))
  else must(await sb.from('hut_menu').insert(row))
}
export async function removeHutItem(id) { must(await sb.from('hut_menu').delete().eq('id', id)) }

/** Ids of the members who are hut staff. */
export async function getHutStaff() {
  return must(await sb.from('members').select('id').eq('hut_staff', true)).map(m => m.id)
}
export async function setHutStaff(memberId, on) { must(await sb.rpc('admin_set_hut_staff', { p_member: memberId, p_on: on })) }

/* Players: order (names and prices come from the menu on the server), see and cancel today's orders. */
/** picks = { [itemId]: count } → the new order's id. */
export async function placeHutOrder(picks, note, roundId = null) {
  const items = Object.entries(picks).filter(([, q]) => q > 0).map(([id, qty]) => ({ id: +id, qty }))
  return must(await sb.rpc('place_hut_order', { p_items: items, p_note: note || null, p_round: roundId }))
}
export async function cancelMyHutOrder(id) { must(await sb.rpc('cancel_my_hut_order', { p_order: id })) }
/** Today's: [{ id, items: [{ id, name, qty, pricePence }], totalPence, note, status, cancelNote, createdAt, roundId }], newest first. */
export async function myHutOrders() { return must(await sb.rpc('my_hut_orders')) }

/* Hut staff. */
/** Today's, oldest first, with memberName and time (tee time, minutes) as well. */
export async function hutOrdersToday() { return must(await sb.rpc('hut_orders_today')) }
export async function setHutOrderStatus(id, status, note = null) { must(await sb.rpc('hut_set_order_status', { p_order: id, p_status: status, p_note: note })) }
