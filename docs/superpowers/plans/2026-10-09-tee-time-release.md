# Tee Time Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tee times open for booking at an admin-set moment (default 8pm, 8 days before, UK time), enforced by the database, with a countdown on Book tee times; and booking stays safe under a rush.

**Architecture:** The rule lives in Postgres (`tee_time_opens_at()`, checked in `book_tee_time()`), settings on `club_settings`. The app mirrors the rule in one tested JS function only for display (banner, countdown); the database decides.

**Tech Stack:** Vite + plain JS, vitest, Supabase Postgres (migrations via `npm run db:migrate`, rolled-back tests via `npm run db:test`, live concurrency via `npm run db:race`).

**Spec:** `docs/superpowers/specs/2026-10-09-tee-time-release-design.md`

## Global Constraints

- Club clock: `Europe/London`. Never the phone's clock for deciding; phone only shows a countdown corrected by the DB's `now`.
- Defaults: release 20:00, 8 days ahead, every day. `release_days` 1–13. Release time in 5-minute steps.
- Admins can book before release; members can't.
- Refusal copy: `Tee times for <Sat 17 Oct> open at <8pm> on <Fri 9 Oct>.` (dates as `longDay`: `Sat 17 Oct`; time as `8pm` / `8.30pm`).
- DB access only in `src/api/*.js`, exported via `src/api.js`. New admin RPCs: revoke from `public, anon`, grant `authenticated`.
- Next free migration timestamps: `20261009130000`, `20261009140000`.
- After each task: show it and wait for the user's go-ahead (their standing rule). Push only when the user says.

## Review Focus

1. Clock change: Sat 31 Oct release is Fri 23 Oct 20:00 BST = 19:00 UTC; Sat 7 Nov release is Fri 30 Oct 20:00 GMT = 20:00 UTC. Both must read "8pm" in UK time.
2. Weekends-only: a weekday tee time is always open; a Sunday counts as weekend.
3. A member booking a buddy onto an unreleased day is refused even though the buddy isn't the caller.
4. Exactly at the release instant the booking succeeds (`opens_at > now()` refuses, `=` allows).
5. Days ahead set to 13 while tee times exist only 13 days out: the sheet still creates the last day.

---

### Task 1: Prove (or rule out) the two-tee-times race; fix if real

**Files:** Modify `scripts/db.mjs` (`race()`); if real: Create `supabase/migrations/20261009130000_book_locks_members.sql`.

**Interfaces:** Produces: `npm run db:race` case 3 "one member booked onto two close tee times at once" (✓ when at most one succeeds).

- [ ] **Step 1: Add race case 3** — two different users at the same moment book the same third member (Peter = `users[2].m`) onto two of the race's tee times (`slots[1]`, `slots[2]`: they're minutes apart, well inside 2 hours) with `book_tee_time(slot, '{<peter>}')`. Pass if Peter ends up on at most one of the two. Include in the overall pass/fail and clean-up (already covers those tee times).
- [ ] **Step 2: Run** `npm run db:race` — record whether case 3 fails (race real) or passes. Run it 3 times if it passes (timing-dependent).
- [ ] **Step 3 (only if it failed): migration** — `create or replace function public.book_tee_time` from the current definition in `20261008350000_bookings_and_cards.sql`, adding before `too_close(...)`: `perform 1 from public.members where id = any(v_ids || v_me) order by id for update;`.
- [ ] **Step 4: Run** `npm run db:migrate && npm run db:race` (3 times) — case 3 ✓ every time; `npm run db:test` all pass.
- [ ] **Step 5: Commit** `"Booking: two people can't put the same member on two close tee times at once"` (or, if not real, `"db:race: check a member can't be booked onto two close tee times at once"`).

### Task 2: The rule and the settings in the database

**Files:** Create `supabase/migrations/20261009140000_tee_time_release.sql`, `supabase/tests/release.sql`.

**Interfaces:** Produces: `club_settings.release_time time`, `.release_days int`, `.release_weekends_only boolean`; `tee_time_opens_at(p_date date) returns timestamptz` (null = always open); `get_booking_rules() returns jsonb {time:'20:00', days:8, weekendsOnly:false, now:<timestamptz>}`; `admin_set_booking_rules(p_time time, p_days int, p_weekends_only boolean)`.

- [ ] **Step 1: Write failing tests** in `release.sql` (own test members/tee times, rolled back, admin = a member the test makes admin): defaults read back; `tee_time_opens_at('2026-10-31')` = `'2026-10-23 19:00+00'` and `('2026-11-07')` = `'2026-10-30 20:00+00'`; weekends-only → Wed null, Sun not null; member booking a slot dated `current_date + 9` (default rule) refused with `like 'Tee times for % open at 8pm on %'`; same slot after `admin_set_booking_rules('20:00', 13, false)` books; member booking a buddy onto `current_date + 9` refused; admin books `current_date + 9` under default rule; non-admin / anon can't set rules; `p_days` 0 and 14 refused; `get_tee_sheet(current_date + 13)` returns tee times.
- [ ] **Step 2: Run** `npm run db:test` — release.sql fails (functions missing).
- [ ] **Step 3: Migration** — columns with defaults/checks; the three functions (`opens_at` stable, `set search_path = ''`; message built with `to_char` → `Dy FMDD Mon` and `FMHH12am` lower-cased without `:00`, e.g. `8pm`, `8.30pm`); `book_tee_time` replaced from the Task 1 version (or `20261008350000` if Task 1 changed nothing) with the check right after the "has passed" check: `if not public.is_admin() and public.tee_time_opens_at(v_slot.date) > now() then raise …`; `get_tee_sheet` horizon `current_date + greatest(13, release_days)`. Grants per Global Constraints. `npm run db:migrate`.
- [ ] **Step 4:** `db:race` books as members on tee times 12 days out, which the default rule now refuses: at the start of `race()` save `release_days` and set it to 13; restore it in `finally`. **Run** `npm run db:test` (all pass) and `npm run db:race` (all ✓).
- [ ] **Step 5:** curl `get_booking_rules` with the anon key → `permission denied` (members only); commit `"Tee time release: admin-set rule enforced by the database"`.

### Task 3: The rule in JS, and the api

**Files:** Create `src/release.js`, `src/release.test.js`; Modify `src/api/tee-times.js`.

**Interfaces:** Produces: `opensAt(dateIso: string, rules) -> Date | null` (UK time, mirrors SQL); `openLabel(dateIso, rules) -> string` ("Opens Friday 9 October at 8pm"); `countdown(ms: number) -> string` ("Opens in 2h 14m", "Opens in 3m 05s", "Opens in 45s"); `api.getBookingRules() -> { time, days, weekendsOnly, now: Date }`; `api.setBookingRules({ time, days, weekendsOnly })`.

- [ ] **Step 1: Failing tests:** `opensAt('2026-10-31', defaults)` → `2026-10-23T19:00:00Z`; `('2026-11-07')` → `2026-10-30T20:00:00Z`; weekends-only Wednesday → null; `time: '20:30'` → `8.30pm` in `openLabel`; `countdown` cases above and 0 → `'Opening…'`.
- [ ] **Step 2: Run** `npx vitest run src/release.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement** with `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', … })` to find the UK offset for that date (no new dependency).
- [ ] **Step 4: Run** `npm test` — all pass. Add the two api functions (`rpc('get_booking_rules')` mapping `now` to a `Date`; `rpc('admin_set_booking_rules', …)`).
- [ ] **Step 5: Commit** `"Tee time release: the opening moment in JS for the countdown (tested)"`.

### Task 4: Booking rules screen (admins)

**Files:** Create `src/screens/booking-rules.js`; Modify `src/main.js` (ADMIN map `rules`), `src/screens/admin-home.js` (Club admin tile "Booking rules", sub-line e.g. "8pm, 8 days before · every day").

- [ ] **Step 1:** Screen: time input (`step=300`), days stepper 1–13, Every day / Weekends only segment, a live sentence "Saturday 17 October opens Friday 9 October at 8pm" for the next Saturday, Save → `api.setBookingRules`, toast "Booking rules saved"; back → Account (`toAdmin`).
- [ ] **Step 2: Run** `npm test && npm run build`; draw the screen with sample data in the preview (light + dark, 320px).
- [ ] **Step 3: Commit** `"Club admin → Booking rules"`.

### Task 5: Book tee times — days not open yet

**Files:** Modify `src/screens/tee-times.js`, `src/screens/booking.js` (refusal message), `src/styles.css`.

- [ ] **Step 1:** Day strip shows `rules.days + 1` days. For a day with `opensAt > now` (now = phone time + offset from `rules.now`): banner with `openLabel`, and within 24h `countdown` refreshed every second; tee times shown but tapping one toasts the opening label instead of booking. One timer per visit, cleared on redraw; at zero → `render()`.
- [ ] **Step 2:** "spaces have just been taken" refusal: after it, reload that day's sheet and append `"<hh:mm> has <n> space(s)."` for the next free tee time after the one tried (or "No times left that day.").
- [ ] **Step 3: Run** `npm test && npm run build`; draw an unopened day in the preview (banner, countdown ticking, tap refused) and an open day (unchanged).
- [ ] **Step 4: Commit** `"Book tee times: days not open yet show when they open, with a countdown"`.
