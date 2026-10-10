# Event Matches (part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page for every drawn match. Your match books itself or starts scoring. A round counts for a match only
with all four on the card. League and standard competition rounds need a marker on the card.

**Architecture:** Pure helpers (`src/match.js`, plus `round.js` changes), tested with Vitest. A migration adds
`marker` to the entry tables and a marker parameter to the two entry functions. Two screens are touched
(event board, scoring round) and one is new (match page).

**Spec:** `docs/superpowers/specs/2026-10-10-event-matches-design.md`

## Global Constraints

- Matches = events whose `matches[day]` has entries `{ a: [ids], b: [ids] }` (Ryder Cup style).
- The marker is anyone on the card except the player: `{m}` or `{g}` (a lineup entry).
- Build everything without stopping. Push only on the user's OK.

## Review Focus

- **Three of four on the card:** no option to count. Test (round.test).
- **Only me on the card, in a league:** no option. Test.
- **The marker is a guest:** saved as `{g}`. SQL test.
- **Match day beyond the booking window:** Book this match opens Request a tee time for that date with the players
  added. Preview check.
- **Another match's page:** no action buttons. Preview check.

---

### Task 1: match.js and the per-hole match details
**Files:** Create `src/match.js` and `src/match.test.js`. Modify `src/event-scoring.js` (`ryderMatches` adds
`winners` and `players: [{ id, name, team, gross, ph }]`) and `src/event-scoring.test.js`.

**Produces:**
- `myMatch(event, day, meId) → { no, a, b } | null`, where `no` is 1-based.
- `matchBooking(ids, sheet, meId) → { kind: 'none' | 'partial' | 'together' | 'split', slot?, missing?, clash? }`.
  `sheet` is `[{ id, time, capacity, players: [{ memberId }] }]`.
  - none: none of the ids are booked.
  - together: all are in one slot (`slot`).
  - partial: my slot has room for the ids not booked anywhere (`slot`, `missing`).
  - split: anything else (`clash`: the first id booked in a slot other than mine, with that slot's time).
- `holeStates(winners) → [d after hole 1, …]`, the running difference (A positive).

- [ ] Tests for each case listed. RED, then implement, then GREEN, then commit.

### Task 2: Counting rules and the marker (app side)
**Files:** `src/round.js`, `src/round.test.js`, `src/screens/scoring-round.js`, `src/api/events.js`.

**Produces:**
- `countsForOptions({ lineup, events, leagueEntries, date, meId })`:
  - Match events give `{ kind: 'event', e, players: the four, day, match: no, auto: true }`, only if all four
    are on the card (and only my match).
  - League and other events need `lineup.length >= 2`, with `needsMarker: true`.
- `markerChoices(lineup, meId)` returns the lineup entries other than me.
- `enterLeague(roundId, eventId, ids, marker)` and `enterEventRound(roundId, eventId, ids, marker)` (marker
  optional).
- [ ] Tests. RED, then implement, then GREEN.
- [ ] UI:
  - `auto` options start ticked.
  - When any ticked option needs a marker and there are 2 or more choices, show a "Who's marking your card?"
    chip group, required before Start round. With one choice, show "Marker: name".
  - The marker for each entered player is the chosen one, or me when that player is the marker.
- [ ] Commit.

### Task 3: Marker in the database
**Files:** `supabase/migrations/20261010220000_entry_markers.sql`, `supabase/tests/entry_markers.sql`.

- [ ] Test:
  - A league entry with a member marker is stored.
  - A guest marker is stored.
  - A marker not on the card is refused.
  - The marker can't be the player themself.
  - No marker is still allowed (the old app).
- [ ] Migration:
  - Add `marker jsonb` to both tables.
  - Drop and recreate `enter_league` and `enter_event_round` with `p_marker jsonb default null`. Validate that the
    marker is on the card and isn't the member. When the marker is the member, store `{m: current member}`.
  - Grants as before.
- [ ] RED, then migrate, then GREEN, with all DB tests passing. Commit.

### Task 4: The match page, your match's action, and booking with players added
**Files:** Create `src/screens/match.js` (aview `match`). Modify `src/screens/event-board.js` (cards open the page;
your match shows its action; it loads the match day's tee sheet), `src/screens/tee-times.js` (slot tap keeps
`S.matchPick` players), `src/main.js` and `src/styles.css`.

- [ ] Match page as in spec section 1. Action as in section 2:
  - Book this match: sets `S.tab='home'`, `S.aview='tee'`, `S.day` to the match day (or Request mode with
    `S.reqDate` when beyond the window), and `S.matchPick` to the other three.
  - Add the rest: `S.slotId`, `S.picked = missing`, `S.aview='book'`.
  - Start scoring: start the card from that tee time (`lineupFromTeeTime` + `newRound` + `saveRound`), then
    `S.sview='counts'`.
- [ ] Preview each action state and the page, live and read-only. Commit, then the final review.
