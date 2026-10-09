# Request a Tee Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can request a tee time on a day not yet released, with a reason; admins approve (booked as the member) or decline with a note; members see the outcome.

**Architecture:** One internal booking function `book_as()` that both `book_tee_time()` and approvals call, so every booking runs the same checks. Requests are a table written only through functions. The app reuses the existing tee sheet and players/guests screens in a "request" mode.

**Tech Stack:** Vite + plain JS, vitest, Supabase Postgres (`db:migrate`, rolled-back `db:test`, live `db:race`).

**Spec:** `docs/superpowers/specs/2026-10-09-tee-time-requests-design.md`

## Global Constraints

- Approve books as the requester (they play; their guest points), never as the admin.
- Reason required, 1–500 chars after trimming. At most 3 pending requests per member.
- Requests only for tee times not yet open (`tee_time_opens_at(date) > now()`); open days → "This day is open — book it instead."
- Decline needs a note. Approve failure (full, 2-hour rule, points) → the booking's own message back to the admin; request stays pending.
- Tee times creatable up to 12 months ahead (`current_date + 366`).
- All DB access in `src/api/*.js` via `src/api.js`. New RPCs: revoke `public, anon`, grant `authenticated`; `book_as` granted to nobody.
- Migrations: `20261009150000_book_as.sql`, `20261009160000_tee_time_requests.sql`.
- Stop after each task for the user's go-ahead; push only when asked.

## Review Focus

1. Approve when the requester has run out of guest points since asking → refused with the points message, still pending.
2. Approve when one of the requested buddies has since booked within 2 hours → refused, still pending.
3. A request for a date 11 months ahead: the tee sheet for that date exists and lists times.
4. The member cancels while an admin is approving at the same moment → exactly one wins (row lock on the request).
5. The day releases while a request is pending → it can still be approved (admins aren't bound by release).

---

### Task 1: Split the booking function (no change in behaviour)

**Files:** Create `supabase/migrations/20261009150000_book_as.sql`.

**Interfaces:** Produces `public.book_as(p_booker bigint, p_slot_id bigint, p_member_ids bigint[], p_guests jsonb, p_check_release boolean) returns jsonb` (security definer; execute revoked from everyone); `book_tee_time(p_slot_id, p_member_ids, p_guests)` = `book_as(current_member_id(), …, not is_admin())`, signature and grants unchanged.

- [ ] **Step 1:** Run `npm run db:test` and `npm run db:race` and save the outputs to the plan workspace (baseline).
- [ ] **Step 2: Migration** — `book_as` body = current `book_tee_time` body (from `20261009140000_tee_time_release.sql`) with `v_me := p_booker` (null → 'Only members can book tee times.'), release check only `if p_check_release and …`. `book_tee_time` becomes the one-line wrapper. `npm run db:migrate`.
- [ ] **Step 3: Run** both again — identical ✓ lines to the baseline; anon calling `book_as` via REST → permission denied.
- [ ] **Step 4: Commit** `"Booking: one internal book_as() behind book_tee_time (no change)"`.

### Task 2: Requests in the database

**Files:** Create `supabase/migrations/20261009160000_tee_time_requests.sql`, `supabase/tests/requests.sql`.

**Interfaces:** Produces table `tee_time_requests` (spec §1, plus `seen boolean not null default false`); `request_tee_time(p_slot_id bigint, p_member_ids bigint[], p_guests jsonb, p_reason text) returns bigint`; `cancel_tee_time_request(p_id bigint)`; `admin_decide_tee_time_request(p_id bigint, p_approve boolean, p_note text) returns jsonb` (approve → booking json); `mark_tee_time_requests_seen()`; `get_tee_sheet` horizon 366 days.

- [ ] **Step 1: Failing tests** (own members/tee times, rolled back): every case in spec §4 DB list, plus Review Focus 1, 2, 5; `seen` false after a decision, true after `mark_tee_time_requests_seen()`.
- [ ] **Step 2: Run** `npm run db:test` — requests.sql fails (missing).
- [ ] **Step 3: Migration** — table + RLS (select own or admin; no direct writes); functions lock the request row `for update` before changing it (Review Focus 4); `admin_decide` approve calls `book_as(r.member_id, r.slot_id, r.member_ids, r.guests, false)` inside a sub-block so a refusal re-raises its message and leaves the row untouched; `get_tee_sheet` replaced with horizon `current_date + 366`. `npm run db:migrate`.
- [ ] **Step 4: Run** `npm run db:test` (all), `npm run db:race` (all ✓); curl a new RPC as anon → permission denied.
- [ ] **Step 5: Commit** `"Tee time requests: request, cancel, approve (books as the member), decline"`.

### Task 3: Requests in JS (wording, Home row) and the api

**Files:** Create `src/requests.js`, `src/requests.test.js`; Modify `src/api/tee-times.js`, `src/home-today.js` (+ test).

**Interfaces:** Produces `requestStatus(r) -> { text, tone: 'wait'|'ok'|'no'|'off' }` ("Waiting for an admin" / "Approved — booked" / "Declined: <note>" / "Cancelled"); api: `requestTeeTime({ slotId, memberIds, guests, reason })`, `cancelTeeTimeRequest(id)`, `getMyTeeTimeRequests() -> [{ id, date, time, memberIds, guests, reason, status, note, decidedAt, seen }]`, `getTeeTimeRequests()` (admin: + `member: { id, name }`, `free`), `decideTeeTimeRequest(id, approve, note)`, `markTeeTimeRequestsSeen()`; `todayItems` takes `requests` and adds kind `'request'` rows for decided, unseen, decided within 7 days (title "Request approved: Sat 14 Nov 08:10" / "Request declined: Sat 14 Nov 08:10", go `{ tab: 'home', aview: 'mine' }`), after the invite row.

- [ ] **Step 1: Failing tests** for `requestStatus` (4 statuses) and the new `todayItems` rows (approved unseen ✓, seen ✗, pending ✗, decided 8 days ago ✗, order after invite).
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement. **Step 4:** `npm test` all pass; build.
- [ ] **Step 5: Commit** `"Tee time requests: status wording and the Home row (tested)"`.

### Task 4: Member: make a request

**Files:** Modify `src/screens/tee-times.js`, `src/screens/booking.js`, `src/state.js` (`reqDate`, `reqReason`), `src/styles.css`.

- [ ] **Step 1:** Book tee times: "Request a tee time" button below the strip → date input (min = first unopened day, max = +366) → that date's sheet in request mode (`S.reqDate`); an unopened day's banner gets "Request a time on this day" (sets `S.reqDate` to it). In request mode, times aren't faded and tapping one opens booking.js.
- [ ] **Step 2:** booking.js in request mode: header "Request <time>", the usual players/guests, a required textarea "Why do you need this time?" (500 max, counter), button "Send request" → `api.requestTeeTime` → toast "Request sent. You'll see the answer in Bookings." → Bookings.
- [ ] **Step 3: Run** `npm test && npm run build`; preview with sample data (light/dark, 320px): button, date pick, request screen, empty reason blocked.
- [ ] **Step 4: Commit** `"Book tee times: request a tee time on a day not open yet"`.

### Task 5: Member: see requests (Bookings, Home)

**Files:** Modify `src/screens/bookings.js`, `src/screens/home.js`.

- [ ] **Step 1:** Bookings: "Requests" section first (newest first; date, time, players, `requestStatus`), Cancel on waiting ones (tap → confirm, as delete does); opening Bookings calls `markTeeTimeRequestsSeen()`.
- [ ] **Step 2:** Home: load `getMyTeeTimeRequests()` and pass to `todayItems`; request rows use icon 📨.
- [ ] **Step 3: Run** tests/build; preview with sample data.
- [ ] **Step 4: Commit** `"Bookings and Home: see your tee time requests"`.

### Task 6: Admin: Tee time requests

**Files:** Create `src/screens/tee-requests.js`; Modify `src/main.js` (`treq`), `src/screens/admin-home.js` (tile + waiting count).

- [ ] **Step 1:** List waiting first then recent decisions; each: member, date/time, players & guests, reason, "4 spaces free" / "Now full"; Approve → `decideTeeTimeRequest(id, true)` (error → toast, stays); Decline → note sheet (required) → `decideTeeTimeRequest(id, false, note)`.
- [ ] **Step 2: Run** tests/build; preview with sample data; tile shows "<n> waiting" like access requests.
- [ ] **Step 3: Commit** `"Club admin → Tee time requests: approve or decline"`.
