# Halfway Hut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players order from the halfway hut menu after hole 8. Hut staff see the orders and mark them ready.
Admins switch it on, and keep the menu and the staff list.

**Architecture:** Pure helpers in `src/hut.js`, tested with Vitest. Supabase tables for the menu and the orders,
changed only through security-definer functions (prices and totals worked out on the server). Three screens,
plus two new alert kinds in the existing alerts drop-down.

**Tech Stack:** Vite + plain JS, Vitest, Supabase Postgres (migrations, SQL tests).

**Spec:** `docs/superpowers/specs/2026-10-10-halfway-hut-design.md`

## Global Constraints

- Money is whole pence in the database. It shows as `£4.50`.
- Every new function: `revoke ... from public, anon` and `grant ... to authenticated`.
- "Asked" for the prompt: `localStorage['teemate.hutAsked']` (a list of card ids), with every access in try/catch.
- Build every task without stopping. Push only when the user says so.

## Review Focus

- **Two players on one card:** each is asked on their own phone (asked is per phone) and each can order for
  themselves. Covered by the hutPromptDue tests (orders filtered to mine).
- **A menu item edited after an order was placed:** the order keeps the old name and price (a snapshot). SQL test.
- **The hut switched off while an order is waiting:** staff can still finish it. SQL test (status move works when off).
- **A slow network on Send order:** the button is disabled while sending, so it can't send twice. Task 4.
- **Staff screen left open all day:** the refresh stops when you leave the screen. Task 5 (the timer is cleared
  when #hutstaff is gone).

---

### Task 1: hut.js
**Files:** Create `src/hut.js` and `src/hut.test.js`.

**Produces:**
- `penceText(p) → '£4.50'`
- `orderTotal(menu, picks: {[id]: qty}) → pence`
- `menuSections(menu) → [{ section, items }]` (Food, Drinks, Snacks order; sold-out items left out; empty sections left out)
- `hutPromptDue({ on, card, asked: number[], orders }) → bool`: true when the hut is on, the card has an id,
  `card.done[7]` is true, the card isn't finished, its id isn't in asked, and no order of mine has that `roundId`
  (cancelled ones aside)
- `nextStatuses(s)`: sent → ['ready', 'cancelled'], ready → ['collected', 'cancelled'], otherwise []

- [ ] Tests for each (including £0.00, £12.05, an unknown item id in picks being ignored, and every reason the
  prompt isn't due). RED, then implement, then GREEN, then commit.

### Task 2: Database and API
**Files:** `supabase/migrations/20261010180000_halfway_hut.sql`, `supabase/tests/hut.sql`, `src/api/hut.js`,
`src/api.js` (re-export), `src/api/client.js` (`MEMBER_COLS` + `hut_staff` → `hutStaff`).

**Produces (JS):**
- `getHut() → { on, menu: [{ id, section, name, pricePence, soldOut, sort }] }`
- `setHutOn(on)`, `saveHutItem(item)` (insert, or update when it has an id), `removeHutItem(id)`
- `getHutStaff() → member ids`, `setHutStaff(memberId, on)`
- `placeHutOrder(picks, note, roundId) → id`, `cancelMyHutOrder(id)`, `myHutOrders()`
- `hutOrdersToday()`, `setHutOrderStatus(id, status, note)`
- Orders are `{ id, memberName?, time?, items: [{ name, qty, pricePence }], totalPence, note, status, cancelNote, createdAt, roundId }`

- [ ] The SQL test cases come from spec section 6. RED, then migrate, then GREEN, with all DB tests passing.
- [ ] Commit.

### Task 3: Admin screen
**Files:** `src/screens/hut-admin.js` (aview `hutadmin`), `src/main.js` (route), `src/screens/account.js` (Club admin tile "Halfway hut").

- [ ] The switch, then the menu grouped by section. Each row shows name, price and a Sold out toggle, and tapping
  it opens an edit sheet (section select, name, price, Remove with tap-again). **+ Add item** opens the same sheet.
- [ ] Hut staff: the current staff with ×, and a search box (name) to add.
- [ ] Preview, then commit.

### Task 4: Ordering and the prompt
**Files:** `src/screens/hut-order.js` (aview `hutorder`), `src/alerts.js` + test, `src/alert-bar.js`,
`src/screens/scores.js` (force a check after hole 8 is saved), `src/screens/account.js` (a member tile while on).

- [ ] alerts tests:
  - The `hut` alert, with key `hut:<cardId>`, title "Halfway hut is open", detail "Would you like to place an
    order?", and actions order (primary) and nothanks.
  - A `hutready` alert per ready order of mine, with key `hutok:<orderId>`, title "Your halfway hut order is
    ready", the items as detail, and action ok.
  - Order: challenges, then requests, then hutready, then hut.
- [ ] alert-bar:
  - Order and No thanks both add the card id to asked.
  - Order also goes to `S.aview='hutorder'`, with `S.tab='home'` and the round kept.
  - OK on hutready is remembered in `teemate.hutSeen` (order ids).
- [ ] Order screen: sections with steppers, the note, the total, Send order (disabled while sending or when
  nothing is picked), today's orders with status and Cancel.
- [ ] scores.js: after saving index 7, call `checkAlerts(place, true)`. `checkAlerts` is exported already, and
  main passes `place`, so expose a `forceAlertCheck()` from alert-bar that reuses the last place.
- [ ] Preview, then commit.

### Task 5: Staff screen
**Files:** `src/screens/hut-staff.js` (aview `hutstaff`), `src/screens/account.js` (top tile for staff and admins), `src/main.js`.

- [ ] Waiting orders (oldest first) with Ready/Collected/Cancel, where Cancel opens a reason sheet, and a "Done
  today" fold. While `#hutstaff` is on screen, it refreshes every 15 s by calling `render` through keepScroll.
  The timer is cleared when the element is gone.
- [ ] Preview, then commit, then the final review.
