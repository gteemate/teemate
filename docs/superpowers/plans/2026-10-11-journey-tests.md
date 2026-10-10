# Journey Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Scripted members tap through whole tasks in the real app (simulated browser), failing on dead ends,
loops, errors or too many taps.

**Spec:** `docs/superpowers/specs/2026-10-11-journey-tests-design.md`

## Global Constraints

- Vitest with `// @vitest-environment happy-dom` per journey file. Fake `Date` and timers, with the clock at
  2026-10-10 09:00 local.
- `src/api.js` is mocked by `src/test/journeys/fake-api.js`, and every real export exists. Unknown behaviour
  throws `not faked: <name>`.
- Run all journeys with `npm test`, in under 30 s.

### Task 1: The pretend server and the driver
- [ ] `fake-api.js`: `makeWorld()` returns `{ api, db }` (in-memory club). `mockModule()` gives every api export,
  delegating to `globalThis.__world.api`.
- [ ] `driver.js`: `boot(world)` loads index.html and main.js, and returns `{ tap, back, type, screen, text,
  settle, taps, visited, homeFromHere, errors }`.
- [ ] A smoke journey: Home shows its four tiles, and Weather → back → Home. Run it: PASS. Commit.

### Task 2: The journeys
- [ ] Journeys 1–10 from the spec, each with its tap budget and checks. When one fails because of a real app
  problem, fix the app (each fix its own commit with the journey as its test). When the stand-in is wrong, fix
  the stand-in. Commit.

### Task 3: Wander
- [ ] From Home, every tile and every button within two taps (skipping destructive ones: Delete, Cancel, Remove,
  Sign out, Send, Confirm), each followed by `homeFromHere()`. Fix what it finds. Commit, then report.
