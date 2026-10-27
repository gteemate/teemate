# Testing protocol before a demo — design

Agreed with the user on 27 Oct 2026 ("Both, and fix gaps"; design approved: "go with that"). This builds on, and
finishes, `2026-10-26-journey-testing-design.md` (the journey catalogue, refusal checks, people). It adds a feature
register, ripple tests and a PDF.

## Why

Before a demo the user wants to know that every feature works in every situation, and to be able to show what
testing was done. Bugs found in use show what's missing:
- a pop-up hid a refusal;
- a deleted or abandoned scorecard still showed on the knockout;
- a list's layout squeezed names on a phone.

## What we're building

### 1. The journey catalogue, finished (from the 26 Oct design, Tasks 5–9)

- **Every action, done by the right person.** Every data action the app can send (62 still have no journey) gets a
  journey, done by the person who does it: member, organiser, captain, club office, hut staff, new joiner or visitor.
- **Every refusal checked.** For every way the server can refuse, the check confirms the refusal is seen, the screen
  isn't stuck, and nothing is half-saved.
- **The coverage check becomes a test.** It fails while any action, refusal or person has no journey.

**Same rules on both sides (ruling):** the rules run against the pretend server in the quick set, and against the
**test database as SQL** (each rule acted out as its person with `t.act_as`, as the existing database tests do). They
don't run through the app signed in. This needs no stored passwords, and it checks the same database rules.

### 2. The feature register (`src/test/features.js`)

Every feature the app has, grouped as the user knows them: Booking, Scoring and games, Competitions, Club life, Club
office, Paper scorecards, and so on. Each feature has:
- `name` and `what` (one or two sentences, in the user's words);
- `scenarios`: the edge cases specific to it, each `{ says: 'plain words', tests: ['file › test name', …] }`;
- `demo`: the steps to try it on a phone before a demo, as `{ who: 'demo login', steps: [...], see: 'what should happen' }`.

A test (`features.test.js`) checks that every scenario names at least one test, and that every named test exists in
the test files. So the register can't fall behind, or claim a test that isn't there.

### 3. Ripple tests (generic)

**When something is deleted, cancelled or changed, it goes or updates everywhere it shows, for everyone.** Each
"thing" below has a ripple test in the pretend server (`src/test/journeys/ripples.test.js`), plus SQL where the
database does the work (`supabase/tests/ripples.sql`).

| Thing | Ripples checked |
|---|---|
| An unfinished scorecard, deleted | It's gone from every player's Scores tab, today's leaderboard, events, leagues and knockout links, and its paper photos |
| A finished scorecard, deleted | As above, plus event and league results recalculate |
| An unfinished card from an earlier day | It isn't shown as anyone's current card or as a knockout match's card |
| A booking, cancelled or moved | Every player's bookings, the tee sheet, notices, and the card's tee time |
| A member, deleted | Bookings, cards, entries, teams, knockout entries, confirmations and friends |
| An event or competition, deleted | Every player's Competitions and leaderboards, templates and sign-ups |
| A paper card, confirmed or sent back | The card's marks, the leaderboard mark, the confirmer's alert and the office list |
| An office switch (paper scorecards, the halfway hut, the leaderboard of the day), turned off | Every place it shows is hidden |

Three general checks sit alongside:
- **Dates:** the same action yesterday, today and tomorrow.
- **Two phones:** two phones saving the same card.
- **The device cache:** a change made on one phone is seen on the next open of another.

### 4. The PDF (`npm run testing:pdf`)

The command runs every test and writes `docs/testing/TeeMate-testing.pdf`, with today's date and the results:
- **Part 1, by feature:** what it does, then each scenario with its tests, how many and whether they passed.
- **Part 2, the generic tests:** the ripple table with results, people and refusals (with counts), dates, two phones
  and the device cache.
- **Part 3, the pre-demo checklist:** the register's `demo` steps, grouped by demo login, for a tap-through of about
  20–30 minutes on a phone.

It's built as HTML (styled like the other docs/teemate-*.html files) and printed to PDF with Playwright's Chromium,
which the project already has.

### 5. Fixing what it finds

Each bug the new tests find is fixed test-first (the test failing first is the proof), and listed in the PDF's
"found and fixed" section.

## Not in this

- **Real-browser runs signed in to the test database.** Playwright's screen and journey checks need the user's test
  login. They're built and documented, and the PDF says when they were last run, but the user runs them
  (`npm run test:screens`).
- **Load or performance testing.**
