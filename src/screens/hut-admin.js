// Club admin → Halfway hut: switch ordering on or off, keep the menu (sections, prices, sold out), and choose
// the hut staff (members who see the Hut screen).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast } from '../ui.js'
import { toAdmin } from './nav.js'
import { SECTIONS, penceText } from '../hut.js'

export async function load() {
  const [hut, members, staff] = await Promise.all([api.getHut(), api.getMembers(), api.getHutStaff()])
  return { hut, members, staff }
}

/** '4.50' or '£4.5' → 450; null if it isn't a price. */
const toPence = t => { const m = String(t).trim().replace(/^£/, '').match(/^(\d{1,2})(?:\.(\d{1,2}))?$/); return m ? +m[1] * 100 + +(m[2] ?? '0').padEnd(2, '0') : null }

export function draw({ hut, members, staff }) {
  header('Halfway hut', 'Ordering from the course after hole 8', toAdmin)
  const q = (S.hutQ ?? '').trim().toLowerCase()
  const byId = new Map(members.map(m => [m.id, m]))
  const found = q ? members.filter(m => !staff.includes(m.id) && m.name.toLowerCase().includes(q)).slice(0, 8) : []
  const item = i => `<div class="lrow linkrow hutrow" data-item="${i.id}" role="button" tabindex="0"><span class="who"><strong>${esc(i.name)}</strong><small>${i.soldOut ? 'Sold out' : 'On the menu'}</small></span>
    <span style="display:flex;gap:12px;align-items:center"><b class="num">${penceText(i.pricePence)}</b><button type="button" class="chip" data-sold="${i.id}" aria-pressed="${i.soldOut}" aria-label="${esc(i.name)} sold out">Sold out</button></span></div>`
  $('main').innerHTML = `<div class="screen">
    <div class="card evsec"><div class="actrow"><span class="who"><strong>Halfway hut ordering</strong><small>${hut.on ? 'On: players are asked after hole 8' : 'Off: no prompt, no ordering'}</small></span>
      <button type="button" class="switch" role="switch" id="hut-on" aria-checked="${hut.on}" aria-label="Halfway hut ordering"><span></span></button></div></div>
    <h3>Menu</h3>
    <span class="hint">Players order <b>hot food</b> ahead, since it takes time. Drinks and snacks are listed so they know what’s there, and they buy them at the hut.</span>
    ${SECTIONS.map(sec => { const items = hut.menu.filter(i => i.section === sec); return items.length ? `<span class="kicker">${sec === 'Food' ? 'Hot food · ordered ahead' : `${sec} · at the hut`}</span><div class="card list">${items.map(item).join('')}</div>` : '' }).join('')}
    ${hut.menu.length ? '' : '<div class="empty-state">No menu yet. Add what the hut sells.</div>'}
    <button class="ghost dashed" id="hut-add">+ Add item</button>
    <h3>Hut staff</h3>
    <span class="hint">They see the orders on the Hut screen (Account → Halfway hut) and mark them ready. Admins can too. Bar staff who aren’t members: add them in Members &amp; access first.</span>
    ${staff.length ? `<div class="card list">${staff.map(id => byId.get(id)).filter(Boolean).map(m => `<div class="lrow"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong></span><button class="x" data-unstaff="${m.id}" aria-label="Remove ${esc(m.name)} from hut staff">×</button></div>`).join('')}</div>` : ''}
    <div class="search"><input id="hut-q" type="search" autocomplete="off" placeholder="Add hut staff: type a name" value="${esc(S.hutQ ?? '')}"></div>
    ${found.length ? `<div class="card list">${found.map(m => `<button class="brow" data-staff="${m.id}"><span class="av">${ini(m.name)}</span><span class="who"><strong>${esc(m.name)}</strong></span><span class="chev">+</span></button>`).join('')}</div>` : q ? '<div class="empty-state">No member matches.</div>' : ''}
  </div>`

  $('hut-on').onclick = async () => {
    try { await api.setHutOn(!hut.on) } catch (err) { toast(err.message); return }
    await keepScroll(render); toast(hut.on ? 'Halfway hut ordering off' : 'Halfway hut ordering on')
  }
  document.querySelectorAll('[data-sold]').forEach(b => (b.onclick = async e => {
    e.stopPropagation()
    const i = hut.menu.find(x => x.id === +b.dataset.sold)
    try { await api.saveHutItem({ ...i, soldOut: !i.soldOut }) } catch (err) { toast(err.message); return }
    keepScroll(render)
  }))
  document.querySelectorAll('[data-item]').forEach(r => {
    r.onclick = () => itemSheet(hut.menu.find(x => x.id === +r.dataset.item), hut.menu)
    r.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); r.click() } }
  })
  $('hut-add').onclick = () => itemSheet(null, hut.menu)
  const setStaff = async (id, on) => {
    try { await api.setHutStaff(id, on) } catch (err) { toast(err.message); return }
    if (on) S.hutQ = ''
    await keepScroll(render); toast(`${byId.get(id).name} ${on ? 'added to' : 'removed from'} hut staff`)
  }
  document.querySelectorAll('[data-staff]').forEach(b => (b.onclick = () => setStaff(+b.dataset.staff, true)))
  document.querySelectorAll('[data-unstaff]').forEach(b => (b.onclick = () => setStaff(+b.dataset.unstaff, false)))
  const qi = $('hut-q')
  qi.oninput = () => { S.hutQ = qi.value; S.hutCaret = qi.selectionStart; render() }
  if (S.hutCaret != null) { qi.focus(); qi.setSelectionRange(S.hutCaret, S.hutCaret); S.hutCaret = null }
}

// Add or change a menu item; Remove (tap again) for an existing one.
function itemSheet(i, menu) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="hut-form" novalidate aria-labelledby="hut-t">
    <h4 id="hut-t">${i ? 'Change item' : 'Add an item'}</h4>
    <label for="hut-sec">Section</label><select id="hut-sec" class="plainsel">${SECTIONS.map(s => `<option value="${s}" ${(i?.section ?? 'Food') === s ? 'selected' : ''}>${s === 'Food' ? 'Hot food (ordered ahead)' : `${s} (shown, bought at the hut)`}</option>`).join('')}</select>
    <label for="hut-name">Name</label><input id="hut-name" maxlength="40" autocomplete="off" placeholder="e.g. Bacon roll" value="${esc(i?.name ?? '')}">
    <label for="hut-price">Price (£)</label><input id="hut-price" inputmode="decimal" autocomplete="off" placeholder="e.g. 4.50" value="${i ? (i.pricePence / 100).toFixed(2) : ''}">
    <p class="gerr" id="hut-err" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="hut-cancel">Cancel</button><button type="submit" class="primary">${i ? 'Save' : 'Add'}</button></div>
    ${i ? '<button type="button" class="ghost accremove" id="hut-rm">Remove from the menu</button>' : ''}
  </form></div>`
  setTimeout(() => $('hut-name')?.focus(), 30)
  const close = () => { $('modal').innerHTML = '' }
  $('hut-cancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('hut-form').onsubmit = async e => {
    e.preventDefault()
    const name = $('hut-name').value.trim(), pence = toPence($('hut-price').value), section = $('hut-sec').value
    const err = !name ? 'Give it a name.' : pence == null ? 'Price in pounds, like 4.50 (up to 99.99).' : ''
    if (err) { $('hut-err').textContent = err; return }
    const sort = i?.sort ?? Math.max(0, ...menu.filter(x => x.section === section).map(x => x.sort)) + 1
    try { await api.saveHutItem({ ...(i ?? {}), section, name, pricePence: pence, sort }) } catch (er) { $('hut-err').textContent = er.message; return }
    close(); await keepScroll(render); toast(i ? `${name} saved` : `${name} added to the menu`)
  }
  if ($('hut-rm')) $('hut-rm').onclick = async () => {
    const b = $('hut-rm')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; return }
    try { await api.removeHutItem(i.id) } catch (er) { toast(er.message); return }
    close(); await keepScroll(render); toast(`${i.name} removed`)
  }
}
