# Tee time release — design

Date: 2026-10-09

## Goal

Tee times open for booking at a set moment (e.g. 8pm, 8 days before), so a busy Saturday is a fair,
predictable rush rather than "whoever looked first, weeks ago". Booking stays safe when hundreds of
members try at once.

## Decisions (agreed in chat)

- Admins set the rule (not hard-coded): release time, days ahead, every day or weekends only.
- First come, first served for now. A ballot may come later and sits on top of this.
- The rule is enforced in the database, on the club's clock (UK time), not the phone's.
- Admins can still book ahead (competitions, society days). Members can't.

## Today (what exists)

- `book_tee_time()` locks the tee time row while it counts spaces: no double booking. Guest points
  are locked per member. `npm run db:race` proves both with 8 simultaneous members.
- No release rule: any future tee time can be booked.
- `get_tee_sheet(date)` creates a day's tee times on first view, up to 13 days ahead.
- Book tee times shows 7 days (today + 6).

## 1. The setting

Account → Club admin → **Booking rules** (new screen, admins only):

| Setting | Default | Range |
|---|---|---|
| Release time | 20:00 | any time, 5-minute steps |
| Days ahead | 8 | 1–13 |
| Applies to | Every day | Every day / Weekends only |

Stored on `club_settings`: `release_time time not null default '20:00'`, `release_days int not null
default 8 check (between 1 and 13)`, `release_weekends_only boolean not null default false`.
`admin_set_booking_rules(p_time time, p_days int, p_weekends_only boolean)`, admins only (same
pattern as `admin_set_club_name`, anon revoked). `get_booking_rules()` for signed-in members returns
`{ time, days, weekendsOnly, now }` (`now` = the database's clock, for the countdown).

## 2. The rule

`public.tee_time_opens_at(p_date date) returns timestamptz`:

- weekends-only and `p_date` is Mon–Fri → `null` (always open);
- otherwise `((p_date - release_days) + release_time) at time zone 'Europe/London'`.

`book_tee_time()` adds, after the "has passed" check and before anything else changes:
if the caller isn't an admin and `opens_at > now()` →
`'Tee times for <Sat 17 Oct> open at <8pm> on <Fri 9 Oct>.'` (errcode P0001).

`get_tee_sheet()` is unchanged except that it creates tee times up to `greatest(13, release_days)`
days ahead.

## 3. Book tee times (members)

- The day strip shows today up to `release_days` ahead (9 days with the default).
- `getTeeSheet` / a new `api.getBookingRules()` give the screen what it needs; the opening moment for a
  day is computed by one tested JS function `opensAt(dateIso, rules)` that mirrors the SQL (UK time).
  The database stays the authority: if they ever disagreed, the booking is refused with its message.
- A day not open yet: a banner "Opens Friday 9 October at 8pm" and, within 24 hours, a countdown
  ("Opens in 2h 14m", then "in 45s"), using the database's clock (phone clock offset measured once
  per visit from `rules.now`). Tee times are listed but can't be tapped to book.
- When the countdown reaches zero the screen redraws itself: the day is open.
- A booking refused because the spaces went: the message also names the next free time that day
  ("…Pick another time. 08:30 has 4 spaces.").

## 4. Safety under the rush

- **Suspected race (prove first):** the 2-hour rule between a member's own tee times reads their other
  bookings without a lock, so two people booking the same member onto two nearby tee times at the same
  moment could both succeed. Prove with a concurrency test in `scripts/db.mjs race` (temporary logins
  and tee times, removed afterwards, as now). If real: `book_tee_time` locks every booked member's
  row (`members … for update`, in id order to avoid deadlocks) before the 2-hour check.
- **Load:** a 1,000-member simultaneous test runs only against a separate Supabase test project
  (needs the user to create it). Not part of this change.

## 5. Testing

- DB (`supabase/tests/release.sql`, rolled back): before release refused with the message; exactly at
  release allowed; weekends-only weekday always open; admin books before release; `tee_time_opens_at`
  across the October clock change (BST → GMT) gives 20:00 UK both sides; settings: admins only, range
  checks, anon refused.
- JS (`src/release.test.js`): `opensAt` matches the SQL cases above; countdown wording.
- `db:race`: the two-tee-times case (fails before the fix if the race is real, passes after).
- Browser: Book tee times on an unopened day (banner, countdown, can't book) drawn with sample data.

## Not in this change

Ballot; the 1,000-member load test; reminders/notifications at release.
