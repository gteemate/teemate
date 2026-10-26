# Leagues and club events open for sign-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The club office can advertise a league or club event from a date with a closing date and a number of places;
members see "N spaces remaining", enter or withdraw, and can't enter once it's full; the office sees and manages entries.

**Architecture:** Four new columns on `events` (`signup`, `advertise_from`, `entries_close`, `max_entries`). The
existing `enter_event`/`withdraw_event` functions gain the date and places rules (row locked), and a new
`remove_event_entrant` lets the office take someone off. The app lists open sign-ups beside sign-up competitions in
Competitions → Events, using one pure helper (`src/event-signups.js`) for "open now", "places left" and the line text.

**Tech Stack:** Vite + plain JS, vitest/happy-dom journeys on the pretend server, Supabase migrations + SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-27-event-signups-design.md`

## Global Constraints
- Copy: "10 spaces remaining" / "1 space remaining"; Full pill with "all 40 places taken"; office "32 of 40 places";
  refusals "Entries open on <date>.", "Entries have closed.", "Sorry, it's full: someone took the last place."
- Entries close on the closing date (inclusive) or the day before the first day, whichever is earlier.
- The limit stops members, not the office (the office can add players in the editor beyond it).
- `signup` is separate from `selfEntry` (on-the-day joining stays as it is).
- Database to the test database first, then live; new write functions get cache rules (change 'events').

## Review Focus
1. Two members taking the last place at once — only one gets it (row lock). SQL test in Task 1.
2. An event whose sign-up settings are cleared (signup off) — no longer listed, entries kept. Journey in Task 4.
3. Entries close date after the start date — refused by the database. SQL test in Task 1.
4. A member already entered who looks at a Full event — sees it under Entered with Withdraw, not "Full". Journey Task 4.
5. A team league's places default to teams × players per team. Journey in Task 3.

---

### Task 1: Database
**Files:** Create `supabase/migrations/20261027150000_event_signups.sql`, `supabase/tests/event_signups.sql`.
**Produces:** columns `signup boolean not null default false`, `advertise_from date`, `entries_close date`,
`max_entries int check (>= 1)`; a check that entries_close < start_date and advertise_from <= coalesce(entries_close,
start_date - 1); `enter_event(p_id)` allowed when `club and (self_entry or signup)`, refusing before advertise_from,
after `least(entries_close, start_date - 1)`, and when `cardinality(players) >= max_entries`; `withdraw_event` allowed
until entries close; `remove_event_entrant(p_event, p_member)` admin only; select policy also shows
`club and signup and coalesce(advertise_from, current_date) <= current_date and start_date > current_date`; select
grant for the new columns.
- [ ] SQL test first (each refusal; the last place: second enter refused; withdraw reopens; member can't see it before
  advertise_from, admin can; entries_close after start refused; remove_event_entrant refused for a member).
- [ ] `npm run db:test` FAIL → migration → `npm run db:migrate` → `npm run db:test` PASS → commit.

### Task 2: Data layer, helper and pretend server
**Files:** `src/api/events.js`, `src/api/cache-rules.js`, `src/api.js`, `src/event-signups.js` (+ test),
`src/test/journeys/fake-api.js`.
**Produces:** event fields `signup, advertiseFrom, entriesClose, maxEntries`; `enterEvent(id)`, `withdrawEvent(id)`,
`removeEventEntrant(eventId, memberId)`; helper `signupOpen(e, iso) → boolean`, `closesOn(e) → iso`,
`spacesLeft(e) → number|null`, `spacesText(n) → '10 spaces remaining'`. Pretend server enforces the same rules and
messages.
- [ ] Unit tests for the helper first; then implement; `npx vitest run` PASS; commit.

### Task 3: Club office — set it up and see entries
**Files:** `src/screens/event-editor.js` (Sign-up card for club events and leagues made by the office:
`#ev-signup` switch, `#ev-adv`, `#ev-close`, `#ev-max`, summary line; review row), `src/office/comps.js` (detail:
"X of Y places", entrant list with `data-o-rment` remove tapped twice; list line "Sign-up · X of Y").
- [ ] Journeys first: office makes "Winter League" with sign-up on, places 4, dates → saved fields; a team league's
  places start at teams × size; detail shows "1 of 4 places" and Remove takes the player off.
- [ ] Implement; all tests PASS; commit.

### Task 4: Members — spaces, enter, full, withdraw
**Files:** `src/screens/competitions.js` (Events tab rows for open sign-up events beside sign-up competitions:
`data-esign`, `data-enothanks`? — No thanks reuses nothing: rows show Enter only; Entered tab rows with
`data-ewd` Withdraw until entries close).
- [ ] Journeys first: member sees "4 spaces remaining" → Enter → listed under Entered, next member sees "3 spaces
  remaining"; full → Full pill, no Enter; last place taken while looking → notice "Sorry, it's full…" visible and the row
  shows Full after; withdraw reopens a place; not listed before the advertise date; signup off → not listed.
- [ ] Implement; all tests PASS; commit.

### Task 5: Finish
- [ ] Final review (fresh reviewer, most capable model); fix Critical/Important test-first.
- [ ] `npx vitest run`, `npm run build`, `npm run db:test`; `npm run db:migrate:live`, `npm run db:test:live`; merge,
  push, confirm the live bundle carries `entries_close`.
