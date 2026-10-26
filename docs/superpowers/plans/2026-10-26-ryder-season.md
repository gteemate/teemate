# Four-ball team match play over a season — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any player (or an admin, as a club event) run four-ball team match play over a season: match days added by the organiser, each with any mix of four-balls and singles, points adding up to a season score; then fill Ballymena V Coleraine on live with 10 past match days.

**Architecture:** A season is an ordinary `events` row (style `ryder`) with a new `season` flag, `days` = season length, and `matches` stored only on match days (keyed by day number, as now). A singles is a match `{ a: [x], b: [y] }`. Pure helpers in a new `src/season.js`; scoring extends `scoreAdvanceEvent`; changes during the season go through one new DB function `save_season` that enforces the rules.

**Tech Stack:** Vite + plain JS, vitest (happy-dom), Supabase Postgres (migrations via `scripts/db.mjs`), SQL tests in `supabase/tests`.

**Spec:** `docs/superpowers/specs/2026-10-26-ryder-season-design.md`

## Global Constraints

- One-off four-ball team match play (1–3 days) behaves exactly as now: four-balls only, same editor, same board.
- Every match is 1 point; halved = ½ each (`teamEventScore`).
- Singles format follows the season format: `bbl → kos`, `bbstab → sm2`, `bbscr → sc2`; each uses its own game's allowance (`EVENT_ALLOWANCE_GAME`).
- Season end date: after the start date and at most a year later (`days` ≤ 366).
- Nobody switches teams during a season; a player who has played a match can't be removed; started/past match days are locked; a player is in at most one match per match day.
- Match days can be added for today or later, up to the end date. A match day has started when any card counting for it has a hole saved.
- Database changes: `npm run db:migrate` (test) → `npm run db:test` → `npm run db:migrate:live` → `npm run db:test:live`. The test database was paused on 26 Oct 2026: ask the user to restore it in the Supabase dashboard before Task 2.
- App copy is plain British English in the existing voice ("Match day", "Season · ends 31 Mar", "+ Add a match day", "+ Four-ball", "+ Singles").
- Never `git push` without the user's OK; they push at the end.

## Review Focus

1. **Uneven teams on a match day** (7 Blues out, 5 Reds): Draw makes four-balls, one singles from a leftover each side, and leaves the extra player out — it must not crash or pair two from one team. (Task 1 test `drawDay leaves the odd player out`.)
2. **A player added mid-season**: shows on their team, can be put into future match days, and past match days and the season score don't change. (Task 2 SQL test, Task 1 scoring test.)
3. **A singles where the two players are on different cards and only one has started**: shows "Not started"/live from the holes both have played, never a result from one card. (Task 1 test.)
4. **Shortening the end date before an existing future match day**: refused with a clear message. (Task 2 SQL test.)
5. **Ticking a card on a non-match day of a season**: the event isn't offered ("Counts for") and the DB refuses it. (Task 3 test, Task 2 SQL test.)

---

### Task 1: Season helpers and scoring

**Files:**
- Create: `src/season.js`, `src/season.test.js`
- Modify: `src/event-scoring.js:157-182` (`scoreAdvanceEvent`), `src/event-scoring.test.js`

**Interfaces:**
- Produces (in `src/season.js`):
  - `SINGLES_FMT = { bbl: 'kos', bbstab: 'sm2', bbscr: 'sc2' }`
  - `isSingles(m) → boolean` (`m.a.length === 1`)
  - `matchDays(e) → number[]` — for a season, sorted day numbers that have ≥1 match; for a one-off, `1..e.days`.
  - `dayDate(e, d) → 'YYYY-MM-DD'` (start + d − 1); `dayOfDate(e, iso) → number` (0 if before start).
  - `seasonEnd(e) → iso` (= `eventLastDay(e)`).
  - `dayStarted(e, d, dayCards, entries) → boolean` — any card entered for day `d` (or, if `!e.entryRequired`, any card on that date with a player from that day's matches) has a `done` hole.
  - `playedIds(e, dayCards, entries, todayIso) → Set<id>` — players in matches on started or past match days.
  - `drawDay(aIds, bIds, rand = Math.random) → [{ a, b }]` — shuffles each side, pairs four-balls while both sides have 2+, then one singles if both have 1 left; extras sit out.
- Changes: `scoreAdvanceEvent(event, holes, dayCards, player, allow, entries = [], allowSingles = allow)` — for `event.season` it loops `matchDays(event)`; each match is scored with `ryderMatches` (four-ball) or `singlesMatch(holes, [ga, gb], SINGLES_FMT[event.fmt], allowSingles)` (singles), and singles results are shaped like a ryder match: `{ key, name, a: [name], b: [name], res: { st, d, txt, thru }, match, players, singles: true }`. `byDay` holds only match days. One-off events are unchanged.

- [ ] **Step 1: Write the failing tests** in `src/season.test.js` and `src/event-scoring.test.js`:
  - `matchDays` returns `[1, 4, 9]` for a season with matches on days 1, 4, 9 (and `[]` keys with empty arrays ignored); `[1, 2]` for a one-off with `days: 2`.
  - `drawDay([1,2,3,4,5],[6,7,8,9,10])` → two four-balls and one singles, every id once; `drawDay leaves the odd player out`: `drawDay([1,2,3,4,5,6,7],[8,9,10,11,12])` → 2 four-balls + 1 singles, one A player unused, no match with two players from one side.
  - `dayStarted` false with no saved holes, true once one entered card has `done[0] = true`.
  - Season scoring: day 1 three four-balls all finished, day 4 one singles finished A 2&1 → `score.tot === 4`, `byDay` keys `['1','4']`, the singles has `singles: true`.
  - Singles on different cards, A thru 5 and B not started → `res.st === 'ns'`; both thru 5 → `res.st === 'live'`, `thru === 5`.
  - Singles format: with `fmt: 'bbscr'` a 54-handicapper gets no shots (scratch `sc2`).
  - Mid-season player: adding id 99 to `team` and to a match on day 9 (not played) leaves `score.cA/cB` unchanged.
- [ ] **Step 2: Run** `npx vitest run src/season.test.js src/event-scoring.test.js` — expect FAIL (module/functions missing).
- [ ] **Step 3: Implement** `src/season.js` and the `scoreAdvanceEvent` changes.
- [ ] **Step 4: Run** `npx vitest run` — expect all PASS (existing event-scoring tests unchanged).
- [ ] **Step 5: Commit** `git add src/season.js src/season.test.js src/event-scoring.js src/event-scoring.test.js && git commit -m "Season helpers and scoring: match days, singles, draw"`

### Task 2: Database — season flag, entry rule, `save_season`

**Files:**
- Create: `supabase/migrations/20261026120000_ryder_season.sql`, `supabase/tests/ryder_season.sql`

**Interfaces:**
- Produces:
  - `events.season boolean not null default false`; check replaced: `days between 1 and 3 or (season and style = 'ryder' and days between 1 and 366)`; check `not season or style = 'ryder'`.
  - `enter_event_round` (latest body from `20261010220000_entry_markers.sql`, recreated): for a season, each `p_members` id must be in a match on `v_day` (`'% has no match on this day.'`).
  - `public.save_season(p_event bigint, p_end date, p_team jsonb, p_matches jsonb) returns void`, security definer, granted to `authenticated`. `p_team` = full `{ id: 'A'|'B' }`; `p_matches` = full `{ day: [{a,b}] }`. Sets `days = p_end − start_date + 1`, `players` = keys of `p_team`, `team`, `matches`. Refuses (errcode `P0001` unless noted):
    - not the creator or an admin (`42501`), not a season, today after the old end date;
    - `p_end` before today, before the start, more than 365 days after the start, or before the last match day in `p_matches`;
    - any existing player's team changed (`'Players can''t change teams during a season.'`);
    - a player removed who is in a match on a started or past day;
    - a started or past day's matches different from what's stored (`'That match day has started; its matches can''t change.'`) — "started" = date < today, or date = today and an `event_entries` card for that day has a saved hole;
    - a match that isn't 2 v 2 or 1 v 1, a player in two matches on a day, a player not in `p_team`, or both sides not from opposite teams.

- [ ] **Step 1: Write the failing SQL tests** in `supabase/tests/ryder_season.sql` (same harness as `supabase/tests/advance_events.sql`: `t.ok`, `t.err`, `t.act_as`): as member 1 create a season (insert with `season = true, days = 120`) and call `save_season` to: add a match day with a four-ball and a singles (ok); add a new player to team A (ok); switch an existing player's team (error text); change a day whose date is yesterday (error); remove a player who played yesterday (error); put one player in two matches on a day (error); set end date before a future match day (error); call as member 2 (not creator, not admin → `42501`); `enter_event_round` on a season day where the member has no match (error) and on their match day (ok). Plus: inserting `season = true` with style `teams` fails the check; a one-off with `days = 4` still fails.
- [ ] **Step 2: Run** `npm run db:test` — expect the new file's tests to FAIL (column/function missing).
- [ ] **Step 3: Write the migration**; apply with `npm run db:migrate`.
- [ ] **Step 4: Run** `npm run db:test` — expect all PASS.
- [ ] **Step 5: Commit** `git add supabase/migrations/20261026120000_ryder_season.sql supabase/tests/ryder_season.sql && git commit -m "Seasons in the database: season flag, match-day entry rule, save_season"`

### Task 3: API and "Counts for" on a match day

**Files:**
- Modify: `src/api/events.js` (EVENT_COLS, `toEvent`, `saveEvent`; add `saveSeason`), `src/api.js` (re-export), `src/round.js:17-45`, `src/round.test.js`, `src/test/journeys/fake-api.js` (season support for `saveSeason`)

**Interfaces:**
- Consumes: `matchDays`, `dayOfDate`, `isSingles` (Task 1); `save_season` (Task 2).
- Produces: event objects carry `season: boolean`; `saveEvent` writes `season`; `saveSeason(e) → void` calls `save_season` with `p_end = eventLastDay(e)`, `p_team = e.team`, `p_matches = e.matches`.
- `countsForOptions` for a season: only on a match day where I have a match. Four-ball: as now (all four on the card → `auto`). Singles: if my opponent is on the card → `{ kind: 'event', players: [me, opp], match, auto: true }`; else if `marked` → `{ kind: 'event', players: [me], day, match, needsMarker: true }`.

- [ ] **Step 1: Failing tests** in `src/round.test.js`: season with my four-ball on day 4 → offered on day 4's date, not on day 3's; season singles, opponent not on my card, a friend on it → offered with `players: [me]`, `needsMarker: true`; opponent on my card → `auto: true`, both players.
- [ ] **Step 2: Run** `npx vitest run src/round.test.js` — FAIL.
- [ ] **Step 3: Implement** the API fields/`saveSeason` and the `countsForOptions` branch (use `dayOfDate(e, date)` for the day).
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `git commit -am "Seasons in the API; Counts for offers a season only on my match day, singles too"`

### Task 4: Event editor — One-off / Season and Match days

**Files:**
- Modify: `src/screens/event-editor.js` (step 1 When, `problem`, `stepsFor`, step 3 for seasons, review step, `draw1`), `src/test/journeys/features.test.js`

**Interfaces:**
- Consumes: `drawDay`, `matchDays`, `dayDate`, `isSingles` (Task 1); `saveEvent`, `saveSeason` (Task 3).
- Produces: `S.ev.season`, `S.ev.endDate` (editor-only; saved as `days`). For ryder: When shows **One-off** / **Season**; Season shows Start and **End** date inputs instead of the day chips (end defaults to start + 6 months). Step 3 for a season is **Match days**: one card per match day (date, matches with "v", "Singles" tag), **+ Add a match day** (date input limited to today…end, not a used date) and, per day not started, **+ Four-ball**, **+ Singles**, **Draw** (players picked for the day, then `drawDay`), remove match, and the existing swap. Days started/past show read-only. Saving a new season uses `saveEvent` (no match days needed); editing an existing season uses `saveSeason`. On the players/teams step of an existing season, existing players' team buttons are disabled ("Can't change team in a season") and only players with no played matches can be removed; new players can be added to either team.

- [ ] **Step 1: Failing journey tests** in `src/test/journeys/features.test.js` (journey driver style already used there): create a Season as an ordinary member with an end date and no match days → saved with `season: true`; open it, **+ Add a match day**, **+ Four-ball** and **+ Singles**, save → `saveSeason` called with both matches on that day; on a season with a past match day, that day has no edit buttons and existing players' team buttons are disabled.
- [ ] **Step 2: Run** `npx vitest run src/test/journeys` — FAIL.
- [ ] **Step 3: Implement** the editor changes.
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `git commit -am "Event editor: season with end date, match days with four-balls and singles"`

### Task 5: The board, match page and event cards

**Files:**
- Modify: `src/screens/event-board.js` (`loadBoard`, `dayOf`, `boardResult`, `boardHtml` ryder branch), `src/screens/match.js:76`, `src/screens/scoring-round.js:62`, `src/screens/events.js:45`, `src/screens/competitions.js:38`, `src/office/comps.js:47,118`, `src/test/journeys/features.test.js`

**Interfaces:**
- Consumes: Task 1 helpers; `allowSingles` from `L.lib[SINGLES_FMT[e.fmt]]`.
- Produces: for a season, `loadBoard` fetches cards only on match-day dates; `dayOf` returns today's match day or the latest past one (else the first). Board: season score (existing tug + "N matches played · M to come · Season ends 31 Mar", "Final" after the end), then match days newest first (date heading, matches; singles show one name a side), then coming match days with pairs. Organiser/admin sees **+ Add a match day**, **Add a player**, **Change** (opens the editor at Match days / Players). Headings: "Match 2 · 14 Nov" (season) instead of "day N"; event cards: "Season · ends 31 Mar".

- [ ] **Step 1: Failing journey tests**: board for a season with match days 1 and 4 shows "Season ends", both days newest first and the right total; a singles card shows one name each side; an ordinary player who isn't the organiser sees no **+ Add a match day**.
- [ ] **Step 2: Run** `npx vitest run src/test/journeys` — FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build` — PASS / builds.
- [ ] **Step 5: Commit** `git commit -am "Season board: score, match days, singles, organiser buttons; season dates on cards"`

### Task 6: Scenarios, end-to-end, live database

**Files:**
- Modify: `supabase/scenarios.sql`, `src/test/e2e/journeys.e2e.js`

- [ ] **Step 1:** Add a scenario season to `supabase/scenarios.sql`: Gary (0) organises "Pals Ryder Season" (start −30 days, end +60), match days at −28 (3 four-balls, cards finished), −14 (1 four-ball + 1 singles, finished), today (Gary's four-ball, not started), +7 (2 singles). Run `npm run db:scenarios` and check the board in the preview (draw with sample data per the project's preview trick).
- [ ] **Step 2:** Add an e2e journey: Gary opens the season, **+ Add a match day** (+10 days), **+ Singles**, saves; the board lists it. Run `npm run test:e2e` — PASS.
- [ ] **Step 3:** `npm run db:migrate:live` then `npm run db:test:live` — PASS.
- [ ] **Step 4: Commit** `git commit -am "Season scenario and end-to-end journey"`; ask the user to push (the site deploys from main).

### Task 7: Ballymena V Coleraine demo season (live, after the push is deployed)

**Files:**
- Create: `scripts/demo-season.mjs` (one-off; run with `--live`)

- [ ] **Step 1:** Write the script: event 2497 → `season = true`, start = today − 70 days, end 2027-03-31, same players/teams (Blues/Reds), keep tomorrow's 3 matches as that day. Add 10 past match days (spread over the 10 weeks, Sat/Sun), 1–3 matches each, at least two days with all 12 out, at least three singles in total; for each match day, cards (four-ball: one card of four; singles: the two on one card, or each on a card with a friend not in the event) with realistic gross (par + shots ± as in `scripts/make-seed.mjs` fieldScores, Stableford 28–38), `done` all true, and `event_entries` rows for every match player (entry_required stays true). Refuse to run if the event already has match days in the past.
- [ ] **Step 2:** Run `node scripts/demo-season.mjs --live`; then score it with `scoreAdvanceEvent` (as the board does) and print the season score and each day — check every past match is `done` and the total equals the number of past matches.
- [ ] **Step 3:** Sign in as live@test.com through the API and check the event and its entries are visible; the user checks the board on their phone.
- [ ] **Step 4: Commit** `git add scripts/demo-season.mjs && git commit -m "Demo: Ballymena V Coleraine as a season with 10 past match days"`
