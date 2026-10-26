# Journey testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every customer journey, as the person who does it, is tested for success and for every way the server can say no: the message is seen, the screen isn't stuck, nothing is half-saved; the pretend server keeps the real database's rules; refusals are checked on top in a real browser at phone and iPad sizes; a coverage check keeps it complete.

**Architecture:** A journey catalogue (data) drives generated tests. A refusal index (generated from the migrations and `src/api/*.js`) says which database messages each app action can meet. Quick set: the pretend server refuses on demand with each real message (the app handles every refusal of an action through one code path), and the same-rules list runs on the pretend server. Full set: the same-rules list on the real test database, and journeys in Playwright with the action's server call answered with a refusal (route interception), checked by the browser's own hit-testing.

**Tech Stack:** vitest + happy-dom (journeys), Playwright (real browser), Supabase test database.

**Spec:** `docs/superpowers/specs/2026-10-26-journey-testing-design.md`

## Global Constraints

- People (`who`): `member`, `organiser`, `captain`, `office`, `hut`, `newjoiner`, `visitor`.
- A refusal is **seen** when its text is inside the open pop-up (`#modal` non-empty) or, with no pop-up, in `#toast`/`[role=alert]`; and in the real browser `document.elementFromPoint` at the message's centre is inside the message.
- **Not stuck**: after the refusal, the button that sent it is enabled again (or the screen offers a change) and Back works. **Nothing half-saved**: the pretend database equals its state before the attempt.
- Quick set `npm test` ≈ 1 minute; full set `npm run test:full` (quick + `test:e2e` + `test:screens` + `test:journeys:browser`) before every push.
- Database messages that can't be reached from the app (a guard for a button the person never sees, or input the screen already prevents) are listed in the catalogue's `unreachable` with a reason.
- Every fix to the app found by these tests gets its own failing test first.

## Review Focus

1. **A refusal while a pop-up is open** (the original bug): message inside the pop-up, not behind it. → Task 3 checker test with a hidden-toast fixture.
2. **A refusal on a screen with no pop-up, shown only as a notice that disappears**: still seen when it appears (we check at the moment it appears). → Task 3.
3. **A journey whose action calls two server functions** (e.g. saveMember → admin_save_member + something): both functions' messages are in its refusals. → Task 1 index test.
4. **The pretend server as a non-admin** sees only what the real database lets that person see (entries, events, requests). → Task 6 rules.
5. **A refusal that leaves partial state in the pretend server** (e.g. pushes then throws). → Task 3 "nothing half-saved" compares deep snapshots.

---

### Task 1: The refusal index

**Files:** Create `scripts/refusal-index.mjs`, `src/test/journeys/refusal-index.json` (generated), `src/test/journeys/refusal-index.test.js`; `package.json` script `journeys:index`.

**Interfaces (produces):** `refusal-index.json` = `{ db: { [fn]: string[] /* messages, '' unescaped, % kept */ }, api: { [apiFn]: { rpc: string[], tables: string[] } } }`. `messagePattern(msg) → RegExp` (in `src/test/journeys/patterns.js`: `%` → `.+`, regex-escaped otherwise).

- [ ] Step 1: Tests: the index matches a fresh run of the script (so it's never stale); `api.enterSignup.rpc` is `['enter_signup']`; `db.enter_signup` includes `"% is already entered in %. Pick another partner."`; `messagePattern('% is already entered in %.')` matches "Jacqueline Cochrane is already entered in Mixed Fourball."; every `rpc` named in `api` exists in `db` or is listed as message-free.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement (latest definition of each function across migrations, as the scratch `refusals.mjs` did; api: `sb.rpc('x')` and `sb.from('t').insert|update|delete|upsert` per exported function).
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "Refusal index: what each app action can be refused with".

### Task 2: People in the pretend server

**Files:** Modify `src/test/journeys/fake-api.js`, `src/test/journeys/driver.js`; test `src/test/journeys/people.test.js`.

**Interfaces:** `boot(setup, { as })` with `as` ∈ people: `member` (Declan, id 1), `organiser` (Peter Walsh, 7, owns an event), `captain` (Orla Ryan, 12, a league captain), `office` (the office login), `hut` (Tom Byrne, 10, hut staff), `newjoiner` (approved email, signed in but no member yet → the not-member screen / create account flow), `visitor` (signed out). Default stays Gary (admin). Visibility follows the person: competition entries (own only unless admin), events (club/everyone, mine, ones I'm in), tee time requests (own unless admin), access requests (admin only).

- [ ] Step 1: Tests: as `member`, Competitions shows no other member's entry and no Club office; as `office`, the office opens; as `hut`, the hut orders page is reachable; as `visitor`, the sign-in screen; as `newjoiner`, the create-account screen.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit "People in the pretend server".

### Task 3: Journeys, refusal injection and the checks

**Files:** Create `src/test/journeys/catalogue.js`, `src/test/journeys/steps.js`, `src/test/journeys/seen.js`, `src/test/journeys/refusals.test.js`, `src/test/journeys/seen.test.js`. Modify `fake-api.js` (`db.refuse = { [apiFn]: message }` → that call throws `Error(message)` once, before any change).

**Interfaces:**
- Journey: `{ id, who, title, setup?(db), steps: Step[], action: apiFn, expect(db, app), refusals: 'all' | string[] | { none: reason }, unreachable?: { [message]: reason }, browser?: Step[] /* portable steps for the real browser */ }`. `Step` = `{ tap: textOrSelector } | { type: [selector, value] } | { pick: [selector, value] } | { back: true }`; the last step sends the action. `refusals: 'all'` = every message of the action's db functions (from the index) minus `unreachable`.
- `runSteps(app, steps)` (steps.js) — drives the happy-dom driver.
- `whereSeen(message) → 'modal' | 'notice' | 'hidden' | null` (seen.js): `'hidden'` when the text is only in `#toast` while `#modal` is non-empty and the toast's stylesheet z-index isn't above `.overlay`'s (read from `src/styles.css`).
- refusals.test.js: for each journey (happy path) — run as its person, assert `expect`; for each refusal message — fresh boot, `db.refuse[action] = sample(message)` (`%` filled with "Jacqueline Cochrane" / "Mixed Fourball" / "3"), run steps, assert `whereSeen` is `'modal'` or `'notice'`, not stuck, pretend db deep-equal to before.

- [ ] Step 1: `seen.test.js`: a DOM with an open `#modal` and the message only in `#toast` and the old CSS (no z-index) → `'hidden'`; message inside `#modal` → `'modal'`; no modal, message in `#toast` → `'notice'`. One catalogue journey: `enter-pairs` (member, Men's Fourball with Declan… as Ciarán) with refusals `'all'`.
- [ ] Step 2: Run — FAIL. Step 3: implement. Step 4: PASS (the pairs journey passes with today's fix; temporarily reverting the sheet's error line makes it fail — check once, don't commit the revert).
- [ ] Step 5: Commit "Journey catalogue, refusal injection and the seen / not stuck / nothing half-saved checks".

### Task 4: Coverage report

**Files:** Create `src/test/journeys/coverage.js` (`gaps() → { actions: apiFn[], messages: { [dbFn]: string[] }, people: who[] }`), `scripts/journeys-coverage.mjs` (`npm run journeys:coverage` prints gaps), `src/test/journeys/coverage.test.js` (enforced in Task 9).

- [ ] Steps: test `gaps()` on a tiny fake catalogue/index (an action with no journey; a message with no refusal or unreachable; a person with none) → reported. Implement. Commit "Journey coverage report".

### Task 5: The catalogue, person by person

**Files:** `src/test/journeys/catalogue.js` (split into `catalogue/<who>.js` files re-exported by `catalogue.js`).

Write journeys until `npm run journeys:coverage` reports no actions and no messages for the person; any app bug the refusal checks find gets a failing test and a fix (ledgered). Order and commits:
- [ ] 5a member: booking (book, guests, cancel, request a tee time, cancel a request), competitions (enter singles/pairs, withdraw, no thanks/undo), events (counts for, join today), scoring (start/save/delete a card, singles/challenges: propose/answer/cancel/counter), friends (buddies, contacts, favourites), hut (order, cancel), account (password, plays in, game prefs). Commit "Journeys: members".
- [ ] 5b organiser: events (one-off, season, match day flow, delete), leagues (member's league), knockouts (create member knockout, draw, swap, deadlines, publish, report/confirm/dispute results, link card). Commit "Journeys: organisers".
- [ ] 5c captain: league teams/captains as used from the board (enter league, leave league, start knockout). Commit "Journeys: captains".
- [ ] 5d office: members & access (save, decline, reset login, office login, delete, plays in), tee sheet (cancel, move), requests (decide, dismiss, seen), competitions (run sign-up, save, delete, set result), club (name, colours, fee payment, location, booking rules, hut on/off, hut menu, hut staff), pins (publish, green width). Commit "Journeys: club office".
- [ ] 5e hut, newjoiner, visitor: hut orders (status), create account, request access, sign in (wrong password). Commit "Journeys: hut, new joiners, visitors".

### Task 6: Same rules on both sides

**Files:** Create `src/test/contract/rules.js`, `src/test/contract/rules.test.js` (pretend server), `src/test/contract/rules.e2e.js` (real test database through the real `src/api.js`, via the e2e config). Modify `fake-api.js` to enforce each rule.

**Interfaces:** Rule: `{ id, as: who, setup: { fake(db), sql: string }, call: [apiFn, ...args], expect: 'ok' | RegExp /* refusal */ | { sees: fn(result) } }`.

- [ ] Step 1: Rules (at least): already entered (me / partner), entries closed, competition full, wrong category partner, mixed pair, plays-in unset; tee time full; booking before release; guest points short; one card per tee time; a member sees only their own entries / requests; events visible to a member (club/everyone, mine, in it); counts-for refused on a non-match day; season team switch refused.
- [ ] Step 2: `rules.test.js` — FAIL where the pretend server is more permissive.
- [ ] Step 3: Make the pretend server enforce them.
- [ ] Step 4: `npx vitest run` and `npm run test:e2e` (with `rules.e2e.js` included) — PASS on both.
- [ ] Step 5: Commit "Same rules on the pretend server and the real database".

### Task 7: Real browser journeys

**Files:** Create `src/test/screens/journeys.pw.js`; modify `scripts/db.mjs` (`e2eSetup` also makes test logins for member, organiser, captain, office, hut — `e2e-<who>@teemate.test`), `src/test/screens/setup.js` (env for them), `playwright.config.js` (`testMatch` both files), `package.json` (`test:journeys:browser`).

- [ ] Step 1: For each journey with `browser` steps: sign in as its person, run the steps; intercept the action's first server call (`page.route('**/rest/v1/rpc/<fn>'` or the table's REST path) and answer `400 {"message": <sample refusal>}`; assert `elementFromPoint` at the message's centre is within it and it's inside the viewport; screenshot into `test-results/journeys/`, index page. At least one browser journey per person who signs in, and every journey that ends in a pop-up.
- [ ] Step 2: Run `npm run test:journeys:browser` — the enter-pairs journey passes; temporarily removing the toast z-index fix fails a notice-based journey (check once).
- [ ] Step 3: Commit "Real-browser journeys: refusals seen on top at phone and iPad sizes".

### Task 8: Documents and commands

**Files:** `scripts/journeys-doc.mjs` (`npm run journeys:doc` → `docs/journeys.md`: by person, each journey's title, steps in words, refusals, unreachable with reasons); `package.json` `test:full`; memory note (full set before every push).

- [ ] Steps: test the doc generator on a two-journey catalogue (headings per person, refusal lines). Implement. Generate `docs/journeys.md`. Commit "Journey document and the full test command".

### Task 9: Enforce coverage, run everything

- [ ] Step 1: `coverage.test.js` asserts `gaps()` is empty — PASS.
- [ ] Step 2: `npm run test:full` — PASS (record times in the ledger: quick ≈ 1 min, full ≤ 10 min).
- [ ] Step 3: Final review, fixes, merge, push (approved).
