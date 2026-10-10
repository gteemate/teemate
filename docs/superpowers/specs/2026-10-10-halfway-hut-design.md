# Halfway hut: order from the course, collect at the hut

Date: 10 Oct 2026. Status: design agreed in chat ("Yes please").

## What and why

After saving hole 8, players are asked if they'd like to order from the halfway hut. They pick from the club's
menu in TeeMate, then pay and collect at the hut. Hut staff see the orders on a Hut screen and mark them ready,
which tells the player. Admins switch it on or off, and keep the menu and the list of hut staff.

Agreed in chat: order from a menu in TeeMate; **pay at the hut** (no payments in TeeMate); **hut staff log in**
to a Hut screen; asked **once per round**, only while the hut is switched on.

## 1. Admin: Club admin → Halfway hut

- **Switch:** "Halfway hut ordering" on/off. When off, there's no prompt, no ordering, and the staff screen says
  it's off.
- **Menu:** items with section (Food / Drinks / Snacks), name (1–40 characters) and price (£0.00–£99.99).
  Add, edit and remove items, and tick **Sold out** (hidden from players until unticked).
- **Hut staff:** a list of members marked as hut staff, plus a search to add more and × to remove. Bar staff who
  aren't members are added in Members & access first, as usual.

## 2. Player

- **The prompt.** When I save hole 8 on a card, the hut is on, I haven't been asked on this card, and I have no
  order on it, the alerts drop-down shows "Halfway hut is open. Would you like to place an order?" with
  **Order** and **No thanks**. Either answer counts as asked. "Asked" is kept on the phone, per card.
- **Order screen** ("Halfway hut"):
  - The menu by section, each item with − / count / + (0–20).
  - An optional note (200 characters, e.g. "no onions").
  - The total in £, and the line "Pay when you collect at the hut".
  - **Send order** is disabled until something is picked. Sending places the order, shows the toast
    "Order sent to the hut", and goes back to the scorecard.
- **My order:** the order screen shows today's orders with their status: Sent (with **Cancel**, which only works
  while it's still Sent), Ready to collect, Collected, or Cancelled (with the hut's note).
- **Ready:** when the hut marks it ready, the alerts drop-down shows "Your halfway hut order is ready", with the
  items and **OK**. The order screen is also reachable from Account → Halfway hut while the hut is on.

## 3. Hut staff: the Hut screen

- Hut staff and admins see a **Halfway hut** tile at the top of Account. It opens the Hut screen.
- **Waiting:** Sent and Ready orders, oldest first. Each shows the name, tee time (if the card has one), the
  items × count, the note, the total, "4 min ago", and buttons:
  - Sent: **Ready** and **Cancel**.
  - Ready: **Collected** and **Cancel**.
  - **Cancel** asks for a reason (required).
- **Done today:** collected and cancelled orders, folded away.
- The screen refreshes itself every 15 seconds while it's open.

## 4. Database

- `club_settings.hut_on boolean not null default false`.
- `members.hut_staff boolean not null default false`. `is_hut_staff()` = admin or hut_staff.
- `hut_menu(id, section text check in ('Food','Drinks','Snacks'), name text 1–40, price_pence int 0–9999, sold_out bool, sort int)`.
  RLS: signed-in members read it, and only admins change it.
- `hut_orders(id, member_id, round_id null, slot_id null, items jsonb, total_pence int, note text ≤200, status text check in ('sent','ready','collected','cancelled'), cancel_note text, created_at, updated_at)`.
  RLS: members read their own, and hut staff read all. There's no direct insert or update: everything goes
  through the functions below.
- Functions (security definer; grants to `authenticated` only):
  - `get_hut()` returns `{ on, menu: [...] }` (sold-out items included, flagged).
  - `admin_set_hut_on(bool)` and `admin_set_hut_staff(member, bool)`: admins only.
  - `place_hut_order(p_items jsonb [{id, qty}], p_note text, p_round bigint)`:
    - Refused when the hut is off, an item is missing or sold out, a quantity isn't 1–20, the order is empty, or
      the round isn't one I'm on.
    - The total and the item names and prices are taken from the menu at that moment (stored on the order).
    - At most 3 orders that are still Sent per member.
  - `cancel_my_hut_order(id)`: my own order, only while Sent.
  - `hut_set_order_status(id, status, note)`: hut staff only. Allowed moves are sent→ready, ready→collected,
    and sent/ready→cancelled (note required).
  - `hut_orders_today()`: hut staff only. Today's orders with member name and tee time.
  - `my_hut_orders()`: my orders today.

## 5. Code

- `src/hut.js` (pure):
  - `penceText(p)` gives "£4.50".
  - `orderTotal(menu, picks)` and `menuSections(menu)` (in Food, Drinks, Snacks order, sold-out items hidden).
  - `hutPromptDue({ on, card, asked, orders })`.
  - `nextStatuses(status)`.
- `src/api/hut.js` (re-exported through `api.js`).
- Screens: `screens/hut-admin.js` (aview `hutadmin`), `screens/hut-order.js` (aview `hutorder`),
  `screens/hut-staff.js` (aview `hutstaff`).
- `alerts.js`: `pickAlerts` gains `hut: { on, card, asked, orders }`. It gives a `hut` alert (Order / No thanks) and
  `hutready` alerts (OK). `alert-bar.js` handles their actions.
- Scores: saving hole 8 forces an alert check.

## 6. Testing

- `src/hut.test.js`: prices and totals, sections and sold-out items, when the prompt is due (before hole 8, hut
  off, asked already, an order on this card, a finished round), and status moves.
- `alerts.test.js`: the hut prompt and ready alerts, and their order after challenges and requests.
- `supabase/tests/hut.sql`:
  - Admin switches the hut on and adds items; a member can't.
  - A member orders: total from the menu, refused when off, sold out, empty, qty 21, or for a card they're not on.
  - A 4th waiting order is refused.
  - A member sees only their own orders, and can cancel only while it's Sent.
  - Staff can see all and move statuses; a member can't move a status; a bad move (collected→ready) is refused;
    cancel needs a note.
  - Visitors can't order.
- Preview at phone size with sample data: the admin screen, the order screen, the staff screen and the prompt.
- Before pushing: curl each new function with the publishable key, expecting a permission error rather than
  "not found".

## Not included

Paying in the app, opening hours, printed tickets, lock-screen notifications, and stock counts.
