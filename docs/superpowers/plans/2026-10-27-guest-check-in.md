# Guest Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The club office scans a member's Account-card QR code (or finds them by name), adds walk-in guests, and
charges guest points. Members see these charges and get a "Show my card" button.

**Architecture:** Three security-definer database functions on `guest_visits` (with a new `checked_in_by` column), API
wrappers with cache rules, and a pretend-server twin. A camera scanner module (`jsqr` over `getUserMedia`) that the
tests replace with `vi.mock`. A new Club office section, `guests`, and small changes to the member's Guest points page.

**Tech Stack:** Vite + plain JS, Supabase Postgres (plpgsql), vitest + happy-dom journeys, `jsqr`.

**Spec:** docs/superpowers/specs/2026-10-27-guest-check-in-design.md

## Global Constraints

- Admins only (`public.is_admin()`); the office login is an admin.
- A card is a friend link (`readFriendLink` in `src/friend-link.js`). Its member number **and** name must match a
  member, or it's refused: "That isn't a TeeMate member card."
- Each guest costs the course's guest points (`courses.guest_points`, the same value used at booking). There are 1 to 3
  guests per charge, and each name is required (trimmed, 1–100 characters). The club is optional.
- The yearly cap (`guest_balance_never_negative` trigger) still holds. Over the cap is refused, with the points left:
  "Not enough guest points: Pat has 3 left."
- Remove: only office charges (`checked_in_by is not null`), only on the day they were made (`date = club_today()`).
- Copy:
  - "Scan a member's card"
  - "Find a member by name"
  - "Charge N points · G guests"
  - "Checked in today"
  - "Checked in at the club office"
  - "Show my card"
- Database changes go to the test database first. The live database is migrated only with the user's go-ahead, at
  push time.

## Review Focus

1. A QR code that isn't ours (any website, or a TeeMate link that isn't a card) gives "That isn't a TeeMate member
   card." It doesn't crash or show someone else.
2. If camera permission is denied or there's no camera, a clear message ("Can't use the camera: find the member by
   name instead"), and Find by name still works.
3. A double tap on Charge charges once: the button is disabled while sending.
4. Closing the scanner, or leaving the section, stops the camera (all tracks stopped).
5. A member with 0 points left is refused with the message, and nothing is half-saved: none of the guests are charged.

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/20261028140000_guest_check_in.sql`
- Create: `supabase/tests/guest_check_in.sql` (same harness as `supabase/tests/remove_from_booking.sql`)

**Interfaces:**
- Produces:
  - `guest_visits.checked_in_by bigint references members on delete set null`
  - `office_charge_guests(p_member bigint, p_name text, p_guests jsonb) → { charged int, pointsLeft int }`.
    `p_name` is the name read from the card, or null when found by name; when given, it must match the member's
    name (case and spaces ignored). `p_guests` is `[{name, club?}]`.
  - `office_remove_guest_charge(p_visit bigint) → { pointsBack int }`
  - `office_guest_charges_today() → [{ id, memberId, memberName, guest, club, points }]`, newest first

- [ ] **Step 1: Write the failing database tests.** Each is a `t.ok` with one of these names (prefix "Check-in:"):
  - "Check-in: only admins can charge"
  - "Check-in: two guests charged, points left is right"
  - "Check-in: the card's name must match the member"
  - "Check-in: a blank guest name is refused"
  - "Check-in: more than 3 guests is refused"
  - "Check-in: over the allowance is refused, nothing charged"
  - "Check-in: remove gives the points back"
  - "Check-in: a booked guest can't be removed here"
  - "Check-in: yesterday's charge can't be removed"
  - "Check-in: today's list shows office charges only"
  - "Check-in: members see only their own charges"

  Exact refusals:
  - 'Only the club office can check in guests.'
  - "That isn't a TeeMate member card."
  - 'Add the guest''s name.'
  - 'Check in 1 to 3 guests at a time.'
  - 'Not enough guest points: <first name> has <n> left.'
  - 'Only today''s check-ins at the office can be removed here.'
- [ ] **Step 2:** Run `npm run db:test`. Expected: guest_check_in.sql stops with "function … does not exist".
- [ ] **Step 3:** Write the migration. Check the points left before inserting, so the friendly message wins over the
  trigger's message. Insert rows with `date = public.club_today()`, `course_id` = the club's course,
  `points = guest_points` and `checked_in_by = current_member_id()`.
- [ ] **Step 4:** Run `npm run db:migrate && npm run db:test`. Expected: "All database tests passed".
- [ ] **Step 5:** Commit.

### Task 2: API, cache, and pretend server

**Files:**
- Modify:
  - `src/api/tee-times.js`: add 3 functions. Also add `checked_in_by` to the `getGuestPoints` select. Each `mine`
    entry gets `office: boolean`.
  - `src/api.js`: exports.
  - `src/api/cache-rules.js` and `src/api/cache.test.js`: `chargeGuests` and `removeGuestCharge` change nothing
    kept. Add them as no-change rules only if the file requires every write to be listed; otherwise leave them out.
    Rule on what cache.test.js enforces.
  - `src/test/journeys/fake-api.js`: the same 3 functions, with the same refusals. `getGuestPoints.mine[].office`.
  - `src/test/journeys/refusal-index.json`: regenerate it.
- Produces:
  - `chargeGuests(memberId: number, cardName: string|null, guests: {name, club?}[]) → { charged, pointsLeft }`
  - `removeGuestCharge(visitId: number) → { pointsBack }`
  - `getGuestChargesToday() → [{ id, memberId, memberName, guest, club, points }]`
- [ ] **Step 1:** Add contract rules to `src/test/contract/rules.js`:
  - `checkin-admin-only` → "Check-in: only admins can charge"
  - `checkin-over-allowance` → "Check-in: over the allowance is refused, nothing charged"
  - `checkin-card-name` → "Check-in: the card's name must match the member"
- [ ] **Step 2:** Run `npx vitest run src/test/contract`. Expected: FAIL (not faked).
- [ ] **Step 3:** Implement the API and the pretend server.
- [ ] **Step 4:** Run `npm run journeys:index && npx vitest run src/test/contract src/api`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3: The scanner

**Files:**
- Create:
  - `src/scan-qr.js`
  - `src/member-card.js` (pure)
  - `src/member-card.test.js`
- Modify: `package.json` (`jsqr`, exact version)
- Produces:
  - `memberFromCard(text: string, members: {id, name}[]) → { id, name } | null`. It uses `readFriendLink` on the
    part from `#`, and requires the id and name to match (case and spaces ignored).
  - `openScanner(onText: (text) => void) → { stop() }`. It opens an overlay with a `<video>` and a frame, calls
    `getUserMedia({ video: { facingMode: 'environment' } })`, reads frames with jsQR (requestAnimationFrame, about
    every 200ms), and calls `onText` once, then stops. `stop()` stops every track and removes the overlay. If the
    camera is refused, it rejects with "Can't use the camera: find the member by name instead".
- [ ] **Step 1:** Write tests in `member-card.test.js`:
  - a real friend link → the member;
  - the id matches but the name differs → null;
  - `https://example.com` → null;
  - an empty string → null;
  - a 10 KB string → null.
- [ ] **Step 2:** Run them. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement both modules and `npm install jsqr@1.4.0`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 4: Club office → Guests

**Files:**
- Create: `src/office/guests.js` (load / draw, the same pattern as `src/office/club.js`)
- Modify:
  - `src/office/shell.js`: add `['guests', 'Guests', <a person+ icon>]` to SECTIONS, after `tee`.
  - `src/main.js`: OFFICE map.
  - `src/styles.css`.
- Test: `src/test/journeys/guest-check-in.test.js`. It has the same header as features.test.js, plus
  `vi.mock('../../scan-qr.js')`. The fake `openScanner` hands over a `friendLink(...)` of a chosen member.
- Consumes: Tasks 2 and 3.
- [ ] **Step 1:** Write the tests:
  - "the office scans a card, adds two guests, and 6 points are charged". The toast is "6 points charged to <name>
    · <n> left", and `db.guestVisits` has 2 rows with `office: true`.
  - "a card that isn't ours is refused". The toast is "That isn't a TeeMate member card.", and no member is shown.
  - "not enough points: refused with the points left, nothing charged".
  - "find a member by name, then charge".
  - "Charge is disabled while sending (a double tap charges once)".
  - "Checked in today: Remove, Sure?, and the points come back".
  - "the camera can't be used: the message, and find by name still works". `openScanner` rejects.
  - "leaving Guests stops the scanner". `stop` is called.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. The member panel shows initials, name and "<n> points left this year". Guest rows have a
  name and a club, "+ Add another guest" up to 3, and the Charge button is labelled per the Global Constraints. Then
  "Checked in today".
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 5: Member side

**Files:**
- Modify:
  - `src/screens/points.js`: a "Show my card" button opens a sheet with `qrSvg(friendLink(...))` at full width and
    the member's name. In the guest list, office charges are labelled "Checked in at the club office".
  - `src/styles.css`.
- Test: add to `src/test/journeys/guest-check-in.test.js`:
  - "Guest points: Show my card shows my QR code"
  - "a guest checked in at the office shows in my guest list"
- [ ] **Steps 1–5:** Test (watch it fail), implement, test (watch it pass), commit.

### Task 6: Wiring and checks

- [ ] **Step 1:** Add office journeys to `src/test/journeys/catalogue/office.js`. Their setups use find by name, since
  the journeys don't use the camera:
  - `office-charge-guests` (action `chargeGuests`, refusals 'all')
  - `office-remove-guest-charge` (action `removeGuestCharge`, refusals 'all')
- [ ] **Step 2:** Add to the feature register in `src/test/features.js`: a "Guest check-in" feature in the Booking
  area, with its scenarios pointing at the tests above and a demo step.
- [ ] **Step 3:** Run `npm test`. Expected: all pass.
- [ ] **Step 4:** Do a phone-size check on the test database. Open Club office → Guests, find Live Tester, charge 1
  guest, check the points, then Remove it. Then open Guest points → Show my card.
- [ ] **Step 5:** Commit. Ask the user before `db:migrate:live` and push.
