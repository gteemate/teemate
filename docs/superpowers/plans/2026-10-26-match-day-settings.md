# Match day settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four-ball team match play (seasons and one-offs) gets 3-balls, a Stableford-total format, points per match type with per-day overrides, a number of holes per day with scaled handicaps, a guided add-a-match-day flow, a date drop-down on the board, and team colours from a palette visible on navy.

**Architecture:** One new pure module `src/match-scoring.js` scores any match (four-ball, singles, 3-ball) over a day's holes in any format and gives its points; `scoreAdvanceEvent` uses it for every ryder match. Events gain `points` and `day_rules` columns; `save_season` validates the new shapes. A palette module maps any stored colour to a visible one at the API layer and gives the editor its swatches. The editor's Match days step becomes a guided flow; the board shows one day at a time from a drop-down.

**Tech Stack:** Vite + plain JS, vitest + happy-dom journeys, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-10-26-match-day-settings-design.md`

## Global Constraints

- Defaults: points `{ four: 1, singles: 1, threePair: 1, threeSingle: 2 }`; holes 18; allowed holes `[18, 14, 12, 9, 6]`, played from hole 1; points 0–10 in halves.
- Halved = each side gets half its own win points.
- Scaled handicap = `Math.round(ph * holes / 18)`; shots by stroke-index rank among the holes played.
- Hole-by-hole formats over N holes use `matchProgress(winners, N)`. `stabtot`: full playing handicaps (no off-the-low), the Stableford allowance (`L.lib.stab`), better-ball points per hole summed; decided when both sides are thru N.
- With 18 holes and default points, every existing four-ball and singles result must be identical to today's (`ryderMatches` / `singlesMatch`).
- Palette (exact): Red `#E5484D`, Orange `#F2994A`, Gold `#E8C547`, Green `#46C37B`, Teal `#2FC4C4`, Sky `#6CB6FF`, Pink `#F06FA8`, Lilac `#B79CFF`, Silver `#C9CED6`, White `#F4F4F2`. New events default Sky v Red.
- DB: `npm run db:migrate` → `db:test` → `db:migrate:live` → `db:test:live`. User approved build and push.

## Review Focus

1. **A short day where a player's card has holes beyond N saved** (they played 18 on a 12-hole day): only holes 1–N count; the match isn't left "live". → Task 1 test.
2. **3-ball with the single on team A** (either team can be the single): points go to the right team. → Task 1 test.
3. **Plus handicaps on a short day** (negative ph scaled): shots given back on the right holes, no crash. → Task 1 test.
4. **Existing events with no `points`/`day_rules`** (all live data): score exactly as before. → Task 2 equivalence test.
5. **A stored colour already in the palette, or not a hex string**: nearest colour is itself / a safe default. → Task 4 test.

---

### Task 1: Match scoring core

**Files:** Create `src/match-scoring.js`, `src/match-scoring.test.js`.

**Interfaces (produces):**
- `DEFAULT_POINTS`, `HOLE_CHOICES = [18, 14, 12, 9, 6]`.
- `matchType(m) → 'four' | 'singles' | 'three'` (by side sizes; 2v1 either way = 'three').
- `dayRules(e, d) → { holes, points }` (event `points` merged over defaults; `e.dayRules?.[d]` over that).
- `shotsOn(ph, rank, n = 18) → number` (same as `shotsOnHole(ph, si)` when n = 18 and rank = si; plus handicaps give back from the highest ranks).
- `holeRanks(holes, n) → number[]` (rank 1..n of each of the first n holes by stroke index).
- `scoreMatch({ holes, a, b, fmt, allow, holesPlayed, points }) → { res: { st, d, txt, thru }, match, win: { A, B }, ph: { [id]: n } }`, where `a`/`b` are `[{ id, courseHcp, gross }]`, `fmt` ∈ `bbl|bbstab|bbscr|stabtot` (singles map `bbl→kos`, `bbstab→sm2`, `bbscr→sc2` behaviour: off the low; sm2 compares points; sc2 scratch), `allow` = `{ four, singles, stab }` fractions, `points` = the day's points; `win` = the points each team gets if it wins.
- `matchPoints(r) → { pA, pB, cA, cB, avail }` for one scored match (projected/confirmed; halved = half own win).

- [ ] Step 1: Tests: four-ball and singles over 18 holes equal `ryderMatches`/`singlesMatch` on 6 varied cards (each format); 3-ball bbl pair wins / single wins / halved with points 1/2 → `{pA,pB}` correct for the single on team B and on team A; stabtot four-ball live (`txt` "21 – 18", st 'live') and decided; a 12-hole day: ph 18 → 12 shots, holes 13–18 ignored even if saved, "3&2" over 12; plus handicap −2 on 9 holes gives back on the 2 highest-ranked holes; `shotsOn` equals `shotsOnHole` for every ph −5..40 and si 1..18 at n = 18; `dayRules` merges.
- [ ] Step 2: `npx vitest run src/match-scoring.test.js` — FAIL (missing module).
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "Match scoring: 3-balls, Stableford total, points, holes per day".

### Task 2: Events scored with it

**Files:** Modify `src/event-scoring.js` (`scoreAdvanceEvent` ryder branch: every match via `scoreMatch` with `dayRules(event, d)`; result shape as now plus `type`, `win`, `holes`; `score` from `matchPoints` summed: `pA, pB, cA, cB, tot` = points available, `toWin = tot / 2 + 0.5`), `src/screens/event-board.js` (`boardResult` passes `allow = { four, singles, stab }`), `src/screens/match.js` (scorecard: show holes 1–N; 3-ball shows 3 players), `src/api/events.js` (`points`, `dayRules` ↔ `points`, `day_rules`), `src/event-scoring.test.js`.

- [ ] Step 1: Tests: an event with no points/day_rules scores exactly as before (existing ryder tests unchanged, plus a season with singles); a day with `points.four = 2` doubles that day's four-ball; a 3-ball day adds 2 to the single's team when they win; `tot`/`toWin` from points.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "Events scored per match type, points and holes".

### Task 3: Database

**Files:** Create `supabase/migrations/20261026170000_match_day_settings.sql`, `supabase/tests/match_day_settings.sql`.

**Interfaces:** `events.points jsonb`, `events.day_rules jsonb` (both nullable; null = defaults), `event_fmt` allows `stabtot` for ryder; `save_season(p_event, p_end, p_team, p_matches, p_day_rules jsonb default null)`: accepts 2v1 matches; checks `holes` ∈ (18,14,12,9,6), each points value 0–10 in halves; a started day's `day_rules` entry can't change; stores `day_rules`. `saveSeason(e)` passes `e.dayRules`; `saveEvent` writes `points`, `day_rules`.

- [ ] Step 1: SQL tests: a 3-ball (2v1 and 1v2) saves; 3v1 refused; holes 11 refused; points 15 or 0.3 refused; a past day's rules can't change; a stabtot event inserts.
- [ ] Step 2: `npm run db:test` — FAIL.
- [ ] Step 3: Migration (replace `save_season` with the new signature; drop the old one).
- [ ] Step 4: `npm run db:migrate && npm run db:test` — PASS.
- [ ] Step 5: Commit "Match day settings in the database".

### Task 4: Visible team colours

**Files:** Create `src/palette.js`, `src/palette.test.js`. Modify `src/api/events.js` (`toEvent` maps `A.col`, `B.col` and each league team's `col` through `visible()`), `src/screens/event-editor.js` (swatch buttons `data-col="A|B|<league idx>:<hex>"` instead of `<input type="color">`; new events Sky v Red; `TEAM_COLOURS` = the palette), journeys.

**Interfaces:** `PALETTE: [{ name, hex }]` (the 10, in order), `visible(col) → hex` (itself if in the palette, else nearest by RGB distance; non-hex → Sky).

- [ ] Step 1: Tests: `visible('#19335a')` is a palette colour and not Red/Orange (nearest blue-ish: Sky or Teal); palette colours map to themselves; `visible(null)` → Sky; every palette colour has contrast ≥ 3 against `#0f1c2e` and `#19335a`; journey: the editor's Teams step shows swatches and no `input[type=color]`, tapping Gold saves `#E8C547`.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "Team colours from a palette you can see on navy".

### Task 5: Event settings and the guided add-a-match-day flow

**Files:** Modify `src/screens/event-editor.js` (step 1: `stabtot` option "Stableford total"; a Points card with steppers for four-ball, singles, 3-ball pair, 3-ball single, in halves; step 4 for seasons and one-offs: match day cards with **Set up**/**Change** (not started) opening the flow; the flow in `S.mdFlow = { d, step, playing:Set, matches, holes, points }` with steps Date (seasons only) → Players → Matches (+ Four-ball, + Singles, + 3-ball, Draw, remove, swap) → Holes → Points → Confirm "Add match day"/"Save match day"), `src/season.js` (`drawDay(aIds, bIds)` also makes a 3-ball from three left over: 2 from one team and 1 from the other, before a singles), `src/screens/event-board.js` (board **+ Add a match day** opens the flow), journeys, `src/season.test.js`.

- [ ] Step 1: Tests: `drawDay` makes four-balls while both teams have 2+, then a 3-ball if one team has 2+ and the other 1+, then a singles if both have 1+: `drawDay([1,2,3,4,5],[6,7,8])` → one four-ball and one 3-ball (A pair v B single), one A player sits out; `drawDay([1,2,3],[4,5,6])` → one four-ball and one singles. Journey: organiser adds a day through the flow (untick one player, + 3-ball, 12 holes, four-ball points 2, Confirm) → saved matches, `dayRules[d] = { holes: 12, points: { …, four: 2 } }`; the event's step 1 points save; a one-off's day 1 set up through the same flow.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "Guided match day setup: players, matches incl. 3-balls, holes, points".

### Task 6: Board date drop-down

**Files:** Modify `src/screens/event-board.js` (ryder boards, seasons and one-offs: score card, then `<select id="ev-mday">` of match days labelled "Sat 24 Oct · 3 matches · 12 holes" + "(today)"/"(next)", default today's → next → latest; change = `S.evDay` + `keepScroll(redraw)`; that day's match cards with type and points "Four-ball · 1 pt", "3-ball · 1 / 2 pts"; the one-off day tabs removed), `src/test/journeys/*`.

- [ ] Step 1: Journeys: the season board shows a drop-down defaulting to the latest played day (no day today/next) and lists only that day's matches; choosing another date shows its matches and makes no request; a 3-ball card shows its points.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement (the drop-down change also recomputes `data.mine/action` only for the season's `myNextDay`, as now — the drop-down is a view switch).
- [ ] Step 4: `npx vitest run` and `npm run build` — PASS.
- [ ] Step 5: Commit "Board: choose the match day from a drop-down".

### Task 7: Scenarios, e2e, live

- [ ] Step 1: Scenario season gets a 12-hole day with a 3-ball and 2-point four-balls; `npm run db:scenarios`; score it with the scratchpad scorer.
- [ ] Step 2: `npm run test:e2e` — PASS.
- [ ] Step 3: `npm run db:migrate:live && npm run db:test:live`; score Ballymena V Coleraine before and after the deploy code — identical (Reds 13½ – Blues 8½).
- [ ] Step 4: Final review, fixes, merge, push (approved).
