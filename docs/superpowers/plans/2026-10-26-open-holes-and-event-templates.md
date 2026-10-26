# Open holes and club event templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick the open holes with a tap for each hole on any event (one-day/multi-day events, season match days,
league weeks, knockout rounds), scored on those holes only; and let the club office save an event as a template, run it
on a day, or repeat it weekly.

**Architecture:** One helper, `src/open-holes.js`, turns any stored hole choice into the open holes of the course
(stroke indexes re-ranked, each hole knowing its course index). Scorers are handed that list instead of all 18, so
they need only three small changes: shots by `shotsOnHole(ph, h.si, h.of)`, handicaps scaled by `scaleHcp`, gross
taken from the card at `h.i`. A shared picker (`src/screens/hole-picker.js`) is dropped into each set-up screen.
Templates are a new `event_templates` table; weekly repeat inserts several events in one statement.

**Tech Stack:** Vite + plain JS, vitest/happy-dom journeys with the pretend server, Supabase migrations + SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-26-open-holes-and-event-templates-design.md`

## Global Constraints

- Hole choice stored as: null = all 18; a number n (old match days) = holes 1 to n; a list of hole numbers.
- Refusal text for a bad list (empty, outside 1–18, repeated): "Pick at least one hole, from 1 to 18."
- Handicap on k open holes: playing handicap × k ÷ 18, rounded (`Math.round`), after the allowance and off-the-low.
- Shots on the hardest of the open holes (re-ranked stroke index 1..k); plus handicaps give back from the easiest.
- Description line: "Holes 1–6, 10–12" (runs joined with an en dash; nothing shown for all 18). Picker count line:
  "9 holes open: 1–6, 10–12".
- Picker quick buttons: "All 18", "Front 9", "Back 9"; with none open the go-on button is disabled and reads
  "Open at least one hole".
- Templates and weekly repeat: club office only. A template keeps everything but the date and the players.
- Weekly repeat preview: "Makes 6 events: Sat 6 Dec … Sat 10 Jan". Not for leagues or seasons.
- Database changes go to the test database first, then live (`npm run db:push` / `:live`); new tables get a
  data_versions stamp and every new write function a rule in `src/api/cache-rules.js`.
- Ask nothing more of the user until the push; push at the end (approved: "Plan and push").

## Review Focus

1. An event saved before this change (no `holes`, `day_rules[d].holes` a number) — scores exactly as before.
   Test in Task 1: `holeList(12)` is 1..12, and Task 2: an old match day with `holes: 12` scores the same as now.
2. A card for an open-holes event where the group also saved a closed hole (played it anyway) — the closed hole
   never counts. Test in Task 2 (individual Stableford with a score on hole 8 when 1–6 are open).
3. A multi-day event whose Day 2 has its own holes — Day 1 and Day 2 each scored on their own holes. Test in Task 2.
4. Holes not in course order in the stored list (`[12, 1, 3]`) — sorted, duplicates refused by the database.
   Test in Task 1 and Task 3.
5. Running a template whose name a weekly repeat then copies — each made event is separate (deleting one leaves the
   others). Test in Task 7.

---

### Task 1: The open-holes helper and shots over fewer holes

**Files:**
- Create: `src/open-holes.js`, `src/open-holes.test.js`
- Modify: `src/scoring.js` (`shotsOnHole`, `gameState`, `matchProgress` callers)

**Interfaces:**
- Produces:
  - `holeList(spec: null|number|number[]) → number[]` (sorted, unique, 1–18; null → 1..18; n → 1..n)
  - `openCourse(courseHoles, spec) → hole[]`: each `{ ...h, i: courseIndex, si: rankAmongOpen, of: k }`
  - `scaleHcp(ph: number, k: number) → number`
  - `cardGross(card, k: lineupIndex, holes) → (number|null)[]` (from `card.done[h.i]`/`card.scores[h.i][k]`)
  - `holesText(spec) → string` ('' for all 18, else "Holes 1–6, 10–12")
  - `holesCount(spec) → string` ("9 holes open: 1–6, 10–12")
  - `holesFor(event, d) → spec` (`event.dayRules?.[d]?.holes ?? event.holes ?? null`)
  - `allOpen(spec) → boolean`
  - `shotsOnHole(ph, si, of = 18)` in scoring.js

- [ ] **Step 1: Write the failing tests** (`src/open-holes.test.js`)
  - `holeList(null)` → 1..18; `holeList(12)` → 1..12; `holeList([12, 1, 3, 3])` → `[1, 3, 12]`.
  - `openCourse(course, [1,2,3,4,5,6,10,11,12])`: length 9; `.i` = `[0..5, 9, 10, 11]`; `si` values are 1..9 ordered
    by the course SI of those holes; every `of` is 9.
  - `scaleHcp(18, 6)` → 6; `scaleHcp(13, 9)` → 7 (6.5 rounds up); `scaleHcp(-3, 6)` → -1; `scaleHcp(10, 18)` → 10.
  - `shotsOnHole(6, 1, 6)` → 1 and `shotsOnHole(7, 1, 6)` → 2; `shotsOnHole(-1, 6, 6)` → -1, `shotsOnHole(-1, 5, 6)` → 0;
    `shotsOnHole(20, 2)` still → 2 (18-hole default unchanged).
  - `holesText(null)` → ''; `holesText([1,2,3,4,5,6,10,11,12])` → 'Holes 1–6, 10–12'; `holesText([5])` → 'Hole 5';
    `holesCount([1,2,3,4,5,6,10,11,12])` → '9 holes open: 1–6, 10–12'.
  - `holesFor({ holes: [1,2], dayRules: { 2: { holes: [3] } } }, 2)` → `[3]`; for day 1 → `[1, 2]`.
- [ ] **Step 2: Run** `npx vitest run src/open-holes.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/open-holes.js` and `shotsOnHole(ph, si, of = HOLES_IN_ROUND)` (replace 18 with `of`).
- [ ] **Step 4: Run** the file, then `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** "Open holes: the helper (hole lists, re-ranked stroke index, scaled handicaps)".

### Task 2: Every scorer on the open holes

**Files:**
- Modify: `src/event-scoring.js`, `src/match-scoring.js`, `src/knockout.js`, `src/scoring.js` (`gameState`,
  `roundSummary` use `h.of`, `holes.length` for finished), `src/screens/event-board.js`, `src/screens/ko-card.js`,
  `src/screens/match-day-flow.js`/`event-editor.js` (callers of `dayRules().holes`)
- Test: `src/open-holes-scoring.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: scorers take an already-open `holes` list. `scoreMatch({ holes, a, b, fmt, allow, points })` (no
  `holesPlayed`; n = `holes.length`, rank = `h.si`). `dayRules(e, d)` returns `{ holes: spec, points }` with
  `holes` the raw spec (`holesFor`). `scoreAdvanceEvent` opens the holes per day, `scoreLeague`/`scorePairsLeague`
  per week (`holesFor(event, week)`), `koCardState(card, holes, …)` is given the round's open holes by its caller.
  `groupThru` runs to `gross.length`. In event-scoring every `playingHandicaps(...)` is followed by
  `.map(x => scaleHcp(x, holes.length))`; every `shotsOnHole(ph, h.si)` becomes `shotsOnHole(ph, h.si, h.of)`;
  gross arrays come from `cardGross`/`h.i`.

- [ ] **Step 1: Write the failing tests**, hand-worked on a course with holes 1–6 and 10–12 open (use the fake
  course from `src/sample-data.js`):
  - Individual Stableford, one player, index giving course handicap 18, all pars on the 9 open holes: playing
    handicap 9, one shot on each open hole → 27 points; a score on closed hole 8 doesn't change it; `thru` 9.
  - Net strokeplay, same player: net −9.
  - Team Stableford: two players each side, totals equal the sum of their individual points over the open holes.
  - Two-day individual event, Day 2 `dayRules: { 2: { holes: [1,2,3] } }`: Day 1 counted over 9 holes, Day 2 over 3.
  - Season match day with `holes: 12` (old form) gives the same result as before this change (copy an existing
    expected value from `src/match-scoring.test.js`).
  - Four-ball team match play (`bbl`) on 6 open holes: a 3-up lead after 4 holes reads "3&2".
  - League week 2 with `holes: [10, ..., 18]` for week 2 only: week 1 rounds counted over 18, week 2 over 9.
  - Knockout card on holes 1–9 (`koCardState` given `openCourse(holes, [1..9])`): finished after hole 9.
- [ ] **Step 2: Run** `npx vitest run src/open-holes-scoring.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces changes above. `matchProgress(winners, holes.length)` everywhere it's
  called with event holes.
- [ ] **Step 4: Run** the file, then `npx vitest run` — Expected: all pass (existing match-scoring tests updated only
  where they passed `holesPlayed`; switch those to `openCourse(holes, n)`).
- [ ] **Step 5: Commit** "Open holes: every scorer counts only the open holes".

### Task 3: Database — holes on events, days, weeks and knockout rounds; event templates

**Files:**
- Create: `supabase/migrations/20261027120000_open_holes_templates.sql`, `supabase/tests/open_holes_templates.sql`
- Modify: `src/api/events.js`, `src/api/signups.js`, `src/api/cache-rules.js`, `src/api.js` (exports),
  `src/test/journeys/fake-api.js`

**Interfaces:**
- Produces (SQL):
  - `public.holes_problem(p jsonb) returns text` — null when p is null, a number in (18, 14, 12, 9, 6), or a non-empty
    array of distinct integers 1–18; else 'Pick at least one hole, from 1 to 18.'
  - `events.holes jsonb` with check `holes_problem(holes) is null`; `match_rules_problem` uses `holes_problem` for each
    day's `holes` and allows day keys up to `greatest(days, weeks)` for every style.
  - `signup_comps.round_holes jsonb` (`{ "<round>": [holes] }`, each checked by `holes_problem`).
  - `set_ko_round_holes(p_comp bigint, p_round int, p_holes jsonb)` — admin or the comp's creator; null clears.
  - `event_templates (id bigserial, name text 1–60, setup jsonb not null, created_at)`; RLS: admins only, all actions.
  - data_versions stamp triggers for `event_templates` (as other tables).
- Produces (api): `toEvent` adds `holes`; `saveEvent` writes `holes` and `day_rules` for every style;
  `saveEvents(list) → ids` (one insert); `setKoRoundHoles(compId, round, holes)`; comps read `roundHoles`;
  `getEventTemplates() → [{ id, name, setup }]`, `saveEventTemplate({ id?, name, setup }) → id`,
  `deleteEventTemplate(id)`. Cache rules: template writes change 'event_templates'; `saveEvents` changes 'events';
  `setKoRoundHoles` changes 'signups'.
- Pretend server: same functions; refuses a bad hole list with the same message; templates only for admins.

- [ ] **Step 1: Write the failing SQL test** (`supabase/tests/open_holes_templates.sql`): `holes_problem` on
  `null`, `12`, `[1,2]`, `[]`, `[0]`, `[19]`, `[1,1]`; inserting an event with `holes '[]'` fails with the message;
  a day rule with `holes [1,2,3]` saves; a member can't read or write `event_templates`, an admin can;
  `set_ko_round_holes` refused for a member who isn't the creator.
- [ ] **Step 2: Run** `npm run db:test` (test database) — Expected: FAIL (function missing).
- [ ] **Step 3: Write the migration**; push to the test database (`npm run db:push`).
- [ ] **Step 4: Run** `npm run db:test` — Expected: PASS. Write the api functions, cache rules and pretend-server
  versions; add a quick test in `src/api/cache-rules.test.js` style if the file checks every write has a rule.
- [ ] **Step 5: Run** `npx vitest run` — Expected: all pass. **Commit** "Open holes and event templates: database and data layer".

### Task 4: The hole picker, in event set-up, match days and league weeks

**Files:**
- Create: `src/screens/hole-picker.js`
- Modify: `src/screens/event-editor.js` (details step + review line), `src/screens/match-day-flow.js` (Holes step),
  `src/styles.css`, `src/match-scoring.js` (drop `HOLE_CHOICES`), event descriptions in `src/office/comps.js`,
  `src/screens/events.js`, `src/screens/event-board.js`
- Test: `src/test/journeys/features.test.js` (new describe "open holes")

**Interfaces:**
- Consumes: Task 1 (`holeList`, `holesCount`, `holesText`, `allOpen`), Task 3 (`holes`, `dayRules` saved).
- Produces: `holePickerHtml(spec, key: string) → string` (buttons `data-hp="<key>:<n>"`, quick buttons
  `data-hpq="<key>:all|front|back"`, count line `.hpcount`) and `bindHolePicker(key, get: () => spec,
  set: spec => void)`; `set` receives `null` when all 18 are open and `[]` when none.
- Editor: details step has a "Holes" card (all styles; for a season the card is not shown — days set holes in the
  flow). Multi-day events and leagues list "Day 2"/"Week 3" rows below with "Same holes" or the day's own line and a
  "Change" button that opens the picker for that day (stored as `dayRules[d].holes`; "Same as the event" clears it).
  The step's next button is disabled with "Open at least one hole" while any picker is empty.

- [ ] **Step 1: Write the failing journeys:**
  - New club event (office): tap holes 7, 8, 9 and 13–18 off → the count reads "9 holes open: 1–6, 10–12"; Save →
    the saved event's `holes` is `[1,2,3,4,5,6,10,11,12]` and the office detail shows "Holes 1–6, 10–12".
  - "Back 9" then "All 18" → `holes` null on save.
  - All holes off → the next button is disabled and reads "Open at least one hole".
  - A 2-day event, Day 2 "Change" → holes 1–3 → `dayRules[2].holes` is `[1,2,3]`.
  - Season match-day flow, Holes step: tap Front 9 → the confirm step shows "Holes 1–9".
- [ ] **Step 2: Run** `npx vitest run src/test/journeys/features.test.js -t "open holes"` — Expected: FAIL.
- [ ] **Step 3: Implement** the picker and wire it in.
- [ ] **Step 4: Run** all tests — Expected: pass. **Commit** "Open holes: tap each hole on any event, a day or a week".

### Task 5: Knockout rounds' holes

**Files:**
- Modify: `src/screens/knockout.js` (admin draw: per round "Holes" line + Change), `src/screens/ko-new.js` if it
  sets rounds, `src/screens/ko-card.js` (pass `openCourse(course.holes, comp.roundHoles?.[round])`), office detail in
  `src/office/comps.js` (round line shows "Holes 1–9")
- Test: `src/test/journeys/features.test.js`

**Interfaces:**
- Consumes: Task 3 `setKoRoundHoles`, `roundHoles`; Task 4 picker.

- [ ] **Step 1: Failing journey:** office opens a knockout's draw, Round 1 "Change holes" → Front 9 → saved
  `roundHoles[1]` is `[1..9]`; a Round 1 match card with 9 holes saved reads finished.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all — pass. **Step 5: Commit**
  "Open holes: knockout rounds".

### Task 6: The scorecard shows only the open holes

**Files:**
- Modify: `src/screens/scores.js` (hole navigation, grid, `played`, game state on open holes), `src/round.js`
  (`roundBoard` also returns `holes` spec for the event/day or league week)
- Test: `src/test/journeys/features.test.js`

**Interfaces:**
- Consumes: Task 1 (`openCourse`, `holesText`), Task 3 (event `holes`, `dayRules`).
- Produces: `roundBoard(...)` → `{ view, id, holes }`. scores.js: when `S.roundBoard?.holes` isn't all open, the hole
  grid shows only open holes, Next from hole 6 goes to 10, the card opens at the first open hole without a score, the
  game's state is worked out on `openCourse` with scores taken at `h.i`, and a line "Holes 1–6, 10–12 today" shows
  above the grid. General rounds are unchanged.

- [ ] **Step 1: Failing journey:** Gary's card ticked for a club event with holes 1–6, 10–12: the grid has 9
  holes; saving hole 6 moves to hole 10; the line reads "Holes 1–6, 10–12 today"; a general round still has 18.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all — pass. **Step 5: Commit**
  "Open holes: the scorecard plays only the open holes".

### Task 7: Templates, run on a day, repeat weekly (club office)

**Files:**
- Modify: `src/screens/event-editor.js` (review step: "Save as a template", "Repeat weekly until"; template mode
  without a date), `src/office/comps.js` (event templates under Ready to run: Run on a day, Change, Delete), `src/state.js`
  if it lists state keys
- Test: `src/test/journeys/features.test.js` (describe "event templates")

**Interfaces:**
- Consumes: Task 3 template api and `saveEvents`.
- Produces: `templateOf(ev) → setup` (the event minus `id, startDate, players, team, matches, captainPool,
  leaguePairs`), `fromTemplate(setup, date) → ev` (empty players/team/matches). `S.evTemplate` = id when editing a
  template; `S.evRepeatUntil` = iso date or null. `weeklyDates(startIso, untilIso) → iso[]` in `src/dates.js`.

- [ ] **Step 1: Failing journeys:**
  - Office: New competition → A club event, name "Turkey Trot", Individual Stableford, holes 1–9 → review → "Save as a
    template" → Competitions shows "Turkey Trot" with "Ready to run"; no event was made.
  - Pick it → "Run on a day" → date 20 Dec → editor at players step with the name, scoring and holes kept → save → an
    event on 20 Dec; the template is still listed.
  - "Delete" (tap twice) removes the template only.
  - New club event on Sat 6 Dec, "Repeat weekly until" 10 Jan → preview "Makes 6 events: Sat 6 Dec … Sat 10 Jan" →
    save → 6 events with those dates; deleting one leaves 5.
  - A league's review step has no "Repeat weekly until"; a member's own event has neither option.
  - `weeklyDates('2026-12-06', '2027-01-10')` → 6 dates (unit test in `src/dates.test.js`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all — pass. **Step 5: Commit**
  "Club office: event templates (run on a day) and weekly repeats".

### Task 8: Finish — review, live database, push

- [ ] Final whole-branch review (fresh reviewer, most capable model) against the spec and Review Focus; fix
  Critical/Important test-first.
- [ ] `npx vitest run`, `npm run build`, `npm run db:test`; push the migration to live (`npm run db:push:live`).
- [ ] Merge into main, push, wait for the live bundle to carry `event_templates`.
