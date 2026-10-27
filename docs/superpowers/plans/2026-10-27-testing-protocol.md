# Testing protocol before a demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every feature is tested for every scenario, with generic ripple tests, and one command produces a dated
PDF: by feature, with the bespoke testing and results, then the generic tests, then a pre-demo checklist.

**Architecture:** This finishes the journey catalogue (the 26 Oct plan, Tasks 5–9) on branch `journey-testing`. It
adds `src/test/features.js` (a register of scenarios mapped to test names, checked by a test), ripple tests (pretend
server and SQL), and `scripts/testing-pdf.mjs` (runs the tests with a JSON reporter, builds HTML, prints a PDF with
Playwright).

**Tech Stack:** vitest/happy-dom journeys on the pretend server; Supabase SQL tests via `scripts/db.mjs`; Playwright
Chromium for the PDF.

**Spec:** `docs/superpowers/specs/2026-10-27-testing-protocol-design.md` (and `2026-10-26-journey-testing-design.md`)

## Global Constraints

- **Journeys use the catalogue's shape** (`src/test/journeys/catalogue.js`). One file per person goes in
  `src/test/journeys/catalogue/`: `member.js` exists; add `organiser.js`, `captain.js`, `office.js`, `hut.js`,
  `newjoiner.js` and `visitor.js`.
- **Coverage must end at zero gaps:** 0 actions, 0 refusals and 0 people missing (`npm run journeys:coverage`). An
  action nobody can reach gets an `unreachable` reason.
- **"Same rules on both sides"** runs on the test database as SQL with `t.act_as`, never signed in with a password.
- **Bugs:** each one found is fixed test-first, and logged in the ledger as `FOUND+FIXED:`. The PDF lists them.
- **Database changes** go to test first (`npm run db:migrate`, `npm run db:test`), then live, with the user's
  go-ahead in chat. Push only with their go-ahead.
- **Plain words** throughout: the register, the PDF and the checklist are for the user, not a developer.

## Review Focus

1. A deleted card that belonged to a league or event round: the standings recalculate without it, for everyone.
2. A member deleted while they're the uploader, the confirmer, a knockout entrant or a league captain: nothing is left
   pointing at them, and nothing crashes.
3. A refusal shown while a sheet is open on an iPad-sized screen: it's on top and readable.
4. The PDF built when a test fails: it still builds, shows the failure in red at the top, and names the test.
5. A feature register scenario whose test was renamed: `features.test.js` fails and names the scenario.

---

### Task 1: The catalogue, person by person (old Task 5, continued)

**Files:** `src/test/journeys/catalogue/{organiser,captain,office,hut,newjoiner,visitor}.js` (new), `member.js` (add
member actions), `src/test/journeys/catalogue.js` (import them), the pretend server where a rule is missing.

**Produces:** journeys for all 62 uncovered actions, including:
- the new features: `setPaperCards`, `markPaperCard`, `confirmPaperScore`, `sendBackPaperScore`, `resendPaperScore`,
  `enterEvent`, `withdrawEvent`, `removeEventEntrant`, `saveEventTemplate`, `deleteEventTemplate`, `saveEvents`,
  `setKoRoundHoles` and `seenBookingNotice`;
- `refusals: 'all'` unless the refusal is unreachable (with the reason).

**Steps:**
- [ ] Per person: write the journeys, run `npx vitest run src/test/journeys/refusals.test.js`, and fix any app bug
  test-first. Commit per person.
- [ ] `npm run journeys:coverage` reports 0 / 0 / 0.

### Task 2: Same rules on both sides (old Task 6, re-ruled to SQL)

**Files:** `src/test/contract/rules.js` (each rule: person, setup, action, outcome), `src/test/contract/rules.test.js`
(against the pretend server), `scripts/contract-sql.mjs` (writes `supabase/tests/contract.sql` from the rules that
have an SQL form), `supabase/tests/contract.sql`.

**Steps:**
- [ ] Write the rules first; running them on the pretend server fails where its rules differ. Fix the pretend server.
- [ ] Generate the SQL, then run `npm run db:test`. Where the real database differs from the rule, the database is
  right: fix the rule and the pretend server, and ledger it.

### Task 3: The feature register

**Files:** `src/test/features.js`, `src/test/features.test.js`.

**Produces:** `FEATURES: [{ id, area, name, what, scenarios: [{ says, tests: ['path › name'] }], demo: [{ who, steps,
see }] }]`. It covers every feature in `docs/teemate-features.html`, the specs in `docs/superpowers/specs/` and the
app's screens.

**Steps:**
- [ ] Test first: every scenario has at least one test; every `path › name` exists (the file has an `it('name'` or a
  SQL `t.ok('name'`); every journey in the catalogue belongs to at least one feature.
- [ ] Write the register. Where a scenario has no test, write the test, fixing any bugs it finds.

### Task 4: Ripple tests

**Files:** `src/test/journeys/ripples.test.js`, `supabase/tests/ripples.sql`, plus app and SQL fixes.

**Produces:** one test per row of the spec's ripple table, and the three general checks (dates, two phones, device
cache).

**Steps:**
- [ ] Write each ripple test, watch it, and fix what fails, test-first. Ledger each `FOUND+FIXED:`.

### Task 5: Real-browser journeys (old Task 7)

**Files:** `src/test/screens/journeys.pw.js` (the catalogue's `browser` steps on the test database), and
`screens.pw.js` gains the event editor (match day steps), Office pages and paper scorecard screens.

**Steps:**
- [ ] Build it. Check it with `npx playwright test --list`, which needs no sign-in. Don't run it signed in: the user
  runs `npm run test:screens`. Record that in the ledger.

### Task 6: The PDF and the checklist

**Files:** `scripts/testing-pdf.mjs`, `docs/testing/report.css`, and `package.json` (script `testing:pdf`).

**Produces:**
- `npm run testing:pdf` runs `npx vitest run --reporter=json` and `npm run db:test` (captured), and reads
  `src/test/features.js`, the catalogue and the ledger's FOUND+FIXED lines.
- It writes `docs/testing/TeeMate-testing.html`, then `docs/testing/TeeMate-testing.pdf` (A4, page numbers, Parts
  1–3 as in the spec).
- If any test failed, a red box at the top lists each failed test.

**Steps:**
- [ ] Unit test the pure part first (`buildReport(results, features, catalogue) → html`): pass and fail counts per
  scenario, the red box on a failure, and a checklist grouped by login.
- [ ] Build it, run it, and send the PDF to the user.

### Task 7: Enforce, review, live

- [ ] Make the coverage test fail on any gap (old Task 9).
- [ ] Final review by a fresh reviewer on the most capable model. Fix Critical and Important findings test-first.
- [ ] Ask the user before live: migrations (if any), then merge and push. Confirm the live bundle.
