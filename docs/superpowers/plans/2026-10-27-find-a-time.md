# Find a Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players in a knockout match suggest days (with Morning, Afternoon or Evening), tick which they can do, and
book a tee time once everyone can.

**Architecture:**
- Two tables (`match_times`, `match_time_answers`) with security-definer functions.
- Notices through `booking_notices`, with the new kinds `times` and `agreed`.
- A new screen, `find-time.js` (the suggest step, then the grid), opened from the knockout match card.
- The reminder is worked out in `alerts.js`.

**Tech Stack:** Vite + plain JS, Supabase Postgres, vitest journeys against the pretend server.

**Spec:** docs/superpowers/specs/2026-10-27-find-a-time-design.md

## Global Constraints

- **Parts of day:** `morning` | `afternoon` | `evening`, shown as Morning / Afternoon / Evening.
- **Which days:** from `club_today()` up to `round_deadlines[round]`, or `club_today() + 21` when the round has no date.
- **Limits:** up to 6 suggestions per send, and 12 per match.
- **Who:** only players in the match, and only while the match is open or disputed with both sides drawn.
- **Copy:**
  - Find a time
  - When suits you?
  - Send to …
  - Who can do which?
  - Suggest other days
  - Everyone can do {Day} · {part}
  - Book a tee time
  - {Name} suggests times for your {Comp} match
  - Your {Comp} match isn't arranged yet: play by {date}
- **Database changes:** to the test database first. Live only with the user's go-ahead, at push time.

## Review Focus

1. **A redraw changes the players:** an old grid must not show, and old answers mustn't count.
2. **A suggestion's day passes:** it drops off the grid, and no longer counts towards agreement.
3. **Pairs:** all 4 players must ✓. Ticks from 3 players never make it agreed.
4. **A double tap on Send:** suggestions are added once. Duplicates are refused by the unique rule.
5. **The reminder:** it doesn't show for a match that's agreed, booked, reported or finished.

---

### Task 1: Database

**Files:**
- `supabase/migrations/20261028220000_find_a_time.sql`
- `supabase/tests/find_a_time.sql`

**Refusals:**
- 'Only the players in this match can arrange it.'
- 'Pick days up to the play-by date.'
- 'A match can have at most 12 suggestions on the go.'
- 'That day is already suggested.'
- 'That match has been played.'

**Test names** (each starts "Find a time:"):
- only the players can suggest
- days within the round
- at most 12
- no duplicates
- the suggester counts as ✓
- the others are told
- the last ✓ makes it agreed and everyone is told
- 3 of 4 isn't agreed
- a result clears the suggestions
- members see only their own matches

`get_match_times(p_match)` returns `{ players: [{ id, name }], times: [{ id, day, part, by, answers: { [memberId]: true | false } }], agreed: timeId | null }`. It leaves out past days and any answers from people no longer in the match.

### Task 2: API and pretend server

**Files:** `src/api/signups.js`, `src/api.js` (no cache: live data), `fake-api.js`, the refusal index, and contract rules (`find-time-players-only`, `find-time-within-round`).

**Functions:**
- `suggestMatchTimes(matchId, [{ day, part }])`
- `answerMatchTime(timeId, can: true | false | null)`
- `getMatchTimes(matchId)`

### Task 3: Screen and match card

**Files:**
- `src/screens/find-time.js` (`S.aview = 'findtime'`, `S.ftMatch`)
- `main.js` (on demand)
- the match card in `src/screens/knockout.js`
- `styles.css`

**Behaviour:**
- **Find a time button:** beside Book this match.
- **Card line:** "Find a time: n of m have answered", or "Everyone can do …".
- **Book a tee time:** reuses Book this match's set-up, with `S.day` set to the agreed day (or request mode if that day isn't open yet).

**Tests:** `src/test/journeys/find-time.test.js`.

### Task 4: Notices and reminder

**File:** `src/alerts.js` (the kinds `times` and `agreed`, plus the reminder from my open knockout matches). The loader supplies its data.

**Tests:** `alerts.test.js` and the journeys.

### Task 5: Wiring and checks

- Journeys for `suggestMatchTimes` and `answerMatchTime`, including every refusal.
- Feature register entries.
- `npm test` and `npm run db:test`.
- A phone-size check on the test database.
- A fresh review, then fixes, then ask about live.
