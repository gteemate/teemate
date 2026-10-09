# Request a tee time — design

Date: 2026-10-09

## Goal

A member who needs a tee time before it's released (visitors flying in from America, a society
day) can ask for one, give a reason, and get an answer from an admin. Approved means booked: the
time is theirs before the day opens to everyone.

## Decisions (agreed in chat)

- Any future date, past what's open now. The member sees just that day's times, not the whole diary.
- Any member can request; the reason is required. Admins approve or decline.
- No hold while a request waits: the time stays bookable by others until approved.
- Approve books it straight away, as the member who asked (their guest points), ahead of release.
- Decline sends a short note back.

## What exists that this builds on

- Release rule (`tee_time_opens_at`, `book_tee_time` refuses members before release; admins exempt).
- `book_tee_time()` books as the caller: the caller plays, guest points are charged to the caller,
  2-hour rule, spaces, member locks.
- `get_tee_sheet(date)` creates a day's tee times on first view, but only up to 13 days ahead.
- Access requests: a count on the admin tile, a list to act on.

## 1. Data

`tee_time_requests`:
`id, member_id (who asked, plays), slot_id, member_ids bigint[] (others playing), guests jsonb
(as book_tee_time), reason text (1–500 chars), status ('pending'|'approved'|'declined'|'cancelled'),
admin_note text, decided_by, decided_at, booking_id, created_at`.

RLS: members see their own; admins see all. All writes through functions.

## 2. Functions

- **Split the booking function, same checks for both paths.** `book_tee_time()` becomes a thin
  wrapper over an internal `public.book_as(p_booker, p_slot, p_members, p_guests, p_check_release)`
  (not callable by members). `book_tee_time` = `book_as(current_member_id(), …, not is_admin())`.
  Existing db tests and `db:race` must pass unchanged — that proves the split changed nothing.
- `request_tee_time(p_slot, p_members, p_guests, p_reason)`: only for a tee time that hasn't opened
  yet (if it has: "This day is open — book it instead."); checks the slot exists and is in the future,
  members exist, guests have names, reason not blank; at most 3 pending requests per member.
  Doesn't touch spaces or points.
- `cancel_tee_time_request(p_id)`: the member, while pending.
- `admin_decide_tee_time_request(p_id, p_approve, p_note)`: admins only, pending only.
  Approve → `book_as(request.member_id, …, false)`; any refusal from it (full, 2-hour rule, guest
  points) is passed back to the admin and the request stays pending. Decline → note required.
- `get_tee_sheet`: creates tee times up to 12 months ahead (was 13 days), so far dates can be requested.

## 3. Screens

- **Book tee times:** a "Request a tee time" button under the day strip → pick a date (date input,
  from the first day not yet open, up to 12 months) → that day's times → tap one → the usual players
  & guests screen, plus a required "Why do you need this time?" box → "Send request".
  An unopened day's banner (within the strip) also gets "Request a time on this day".
- **Bookings:** a "Requests" section at the top: date, time, players, and status
  (Waiting for an admin / Approved — booked / Declined: <note> / Cancelled); swipe or tap to cancel
  while waiting.
- **Home → Today:** a request decided in the last 7 days shows once as a row ("Request approved:
  Sat 14 Nov 08:10" / "Request declined") until tapped (opens Bookings).
- **Club admin → Tee time requests** (tile with a count of waiting ones): each shows who, when,
  players & guests, reason, and whether the time still has room; Approve / Decline (note).

## 4. Testing

- DB (`supabase/tests/requests.sql`, rolled back): request before release ✓; request an open day
  refused; blank reason refused; 4th pending refused; member sees only their own; approve books as
  the member (their guest points, they're on the tee time, admin isn't); approve when full → error,
  still pending; decline needs a note; cancel by owner only, pending only; members can't approve;
  anon can't do anything. All existing tests + `db:race` pass unchanged after the split.
- JS: status wording and the Home row condition as pure functions with tests.
- Browser: the request flow, Bookings section and admin list drawn with sample data.

## Not in this change

Holding a time while pending; emails/push notifications; recurring requests (e.g. every Saturday).
