# Testing every customer journey, including every way the server says no — design

Agreed with the user 26 Oct 2026, after a pairs entry looked frozen: the server refused (the partner had already
entered) but the message was hidden behind the pop-up.

## Why the tests missed it

1. **The pretend server never said no.** It accepted a partner who had already entered, so no journey ever met a
   refusal.
2. **Nothing checked a refusal can be seen.** The message existed but sat behind the pop-up; the quick tests
   (happy-dom) can't tell what's on top.
3. **Journeys ran as an admin**, who sees everyone's entries. An ordinary member can't, which is where it went wrong.

## What we're building

### 1. The journey list (`src/test/journeys/catalogue.js`)

Every customer journey, by **who does it**: member, organiser (of an event or season), league captain, club office /
admin, halfway hut staff, new joiner, visitor (not yet a member). Each entry:

```js
{ id: 'enter-pairs', who: 'member', title: 'Enter a pairs competition with a partner',
  start: 'Competitions → Events', steps: [/* taps, as driver calls */], expect: /* what's true after */,
  action: 'enterSignup',                       // the data function it ends in
  refusals: [{ rule: 'partner-already-entered', message: /is already entered/, setup: db => { … } }, … ] }
```

- `refusals` lists every way the server can say no to that action (from the database functions' `raise exception`
  lines), each with the setup that causes it. An action that can't be refused says so: `refusals: 'none: …why…'`.
- `npm run journeys:doc` writes `docs/journeys.md` from the list (by person: each journey, its steps, its refusals),
  so the user can read what's covered.

### 2. Refusal checks — quick set (pretend server)

For every refusal in the list (generated tests, `src/test/journeys/refusals.test.js`):
- run the journey as its person, with the setup that causes the refusal;
- the pretend server refuses **by the same rule** (see 3), with its message;
- check: the message is **where the person is looking** — inside the open pop-up (`#modal`) if one is open, else in
  a notice (`#toast`/an alert) — and the notice is not under an overlay (its z-index is above `.overlay`'s);
- check: **not stuck** — the action's button is usable again or the person can change their choice, and Back works;
- check: **nothing half-saved** — the pretend database is as it was before the attempt.

### 3. Same rules on both sides (`src/test/contract/*`)

A list of rules (`src/test/contract/rules.js`): each is a setup, an action with inputs, and the outcome (allowed, or
refused with a message pattern; and for visibility rules, what a given person can see). Run:
- against the **pretend server** in the quick set (`rules.test.js`);
- against the **real test database** in the full set (`rules.e2e.js`, through the real `src/api.js` signed in as the
  rule's person, using the e2e test logins).

The pretend server enforces each rule in the list (as `enterSignup` now does for "already entered"). A rule that the
real database enforces and the pretend server doesn't fails the quick set. Visibility rules include "a member sees only
their own competition entries; an admin sees all".

### 4. Real browser — full set (Playwright)

`src/test/screens/journeys.pw.js` runs the catalogue's journeys in Chrome at the four screen sizes already used
(small Android, iPhone SE, iPhone Pro Max, iPad), against the test database's scenarios, signed in as each journey's
person. For every refusal that can be set up on the test database: the message must be **visible and on top**
(`document.elementFromPoint` at the message's centre is the message or inside it), readable (inside the viewport),
and the screen not stuck. Screenshots go into `test-results/journeys/` with an index page.

### 5. The right person

Test logins for each role on the test database (made fresh each run, as the e2e ones are): member, organiser,
captain, office, hut staff, new joiner (approved, no login yet), visitor. Journeys and refusals run as their person;
the pretend server's `getMe`/visibility follow the person (admin or not, office, hut staff).

### 6. Coverage check

`src/test/journeys/coverage.test.js` fails when:
- a data function that changes something (every non-get export in `src/api/*.js`) has no catalogue journey ending in
  it, or its journey has neither refusals nor a `none: …` note;
- a refusal message in the database functions (`raise exception` in the latest migration defining each function)
  has no catalogue refusal matching it (by message pattern), unless listed as unreachable from the app with a reason;
- a person in the list has no journeys.

### 7. When it runs

- **Quick set** (`npm test`, about a minute, on every change): unit tests, journeys, refusal checks, same-rules
  against the pretend server, coverage check.
- **Full set** (`npm run test:full`, about 5–10 minutes): the quick set, the end-to-end journeys and same-rules
  against the real test database, and the real-browser journeys at phone and iPad sizes. Run before every push (a
  memory note records this).

## Building it up

The list starts with the journeys and refusals the app has today, written from the screens and the database
functions; the coverage check then shows what's left, and the plan works through it person by person (member first,
then organiser, office, captain, hut, new joiner, visitor).

## Not in this

- Load testing.
- Testing on a real phone; the real browser is Chrome (iPhone Safari can be added later as another Playwright
  project).
- Changing app behaviour, except fixing what the new tests find (each fix with its own failing test).
