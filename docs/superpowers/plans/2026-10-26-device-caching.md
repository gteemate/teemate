# Faster screens: device caching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Screens on phones and the club office iPad draw at once from data kept on the device, refetch only the kinds whose server stamp moved, skip the server for view-only taps, and keep the app shell and pictures on the device.

**Architecture:** A `data_versions` table (one stamp per kind, moved by statement triggers) read by one RPC. A cache module (`src/api/cache.js`) wraps the slow-changing getters and the changes that touch them, by a rules table (`src/api/cache-rules.js`); `src/api.js` re-exports the wrapped functions over its `export *` (local exports shadow star exports), and the journey tests' pretend API is wrapped with the same rules. `main.js` scopes the cache to the signed-in user, checks stamps (first load, every 30 s, on coming back) and re-renders a screen whose kinds moved. A service worker keeps the shell and pictures.

**Tech Stack:** Vite + plain JS, vitest + happy-dom, Supabase Postgres, a classic service worker.

**Spec:** `docs/superpowers/specs/2026-10-26-device-caching-design.md`

## Global Constraints

- Kinds and their tables exactly as the spec's table: `members`, `course`, `pins`, `games`, `events`, `club`, `comps`, `requests`, `friends`.
- Never cached: rounds/scorecards, event and league entries, tee sheet, bookings, my tee times, notices, hut orders, balances, player events, session, `getMe`.
- Stamp check at most once every 30 seconds, plus on coming back to the front; cold start checks once before the first screen loads.
- Device storage key `tm-cache:<auth user id>`; a different user id, or sign-out, clears it. Every `localStorage` access in try/catch; the app works with none.
- Getters return a copy (`structuredClone`) of kept data, never the kept object.
- Service worker: page network-first; `assets/*` and pictures (`holes/`, `greens/`, icons, crest) cache-first; never `*.supabase.co`. Only registered in production builds.
- Database: `npm run db:migrate` → `npm run db:test` → `npm run db:migrate:live` → `npm run db:test:live`. The user approved building and pushing (26 Oct 2026).

## Review Focus

1. **Two people on one device** (demo logins, a shared iPad): the second sees none of the first's kept data (friends, office requests). → Task 2 test `a different user starts empty`, Task 3 journey.
2. **Your own change, then back to a list:** the change shows straight away, not after 30 s. → Task 3 journey `saving an event shows it at once`.
3. **No storage at all** (private browsing; `localStorage` throws): the app still loads and works, just without device keeping. → Task 2 test `works when storage throws`.
4. **A screen that changed data in place** (editors mutate what getters return): kept data stays as fetched. → Task 2 test `returns copies`.
5. **A new app version deployed:** the next open shows it (page network-first), and old cached files are cleared. → Task 6 test.

---

### Task 1: Stamps in the database

**Files:** Create `supabase/migrations/20261026150000_data_versions.sql`, `supabase/tests/data_versions.sql`. Modify `src/api/club.js` (add `getStamps`).

**Interfaces:** Produces `public.data_versions(kind text primary key, changed_at timestamptz not null default now())` with one row per kind; `public.data_versions() returns jsonb` (`{ kind: changed_at }`, granted to `authenticated` only); `getStamps(): Promise<{[kind]: string}>` in `src/api/club.js`.

- [ ] Step 1: SQL tests (harness as `supabase/tests/ryder_season.sql`): for each table in the spec's table, an insert/update/delete moves only its kind's stamp (compare before/after inside the test, using `clock_timestamp()`-based stamps so changes in one transaction differ); `data_versions()` returns all 9 kinds for a member; `anon` can't execute it.
- [ ] Step 2: `npm run db:test` — new file fails (function missing).
- [ ] Step 3: Migration: table, seed 9 rows, a trigger function `public.bump_version()` (`security definer`, `search_path ''`, kind from `TG_ARGV[0]`, sets `changed_at = clock_timestamp()`), `after insert or update or delete ... for each statement` triggers on every listed table, the RPC; `getStamps` calls `sb.rpc('data_versions')`.
- [ ] Step 4: `npm run db:migrate && npm run db:test` — all pass.
- [ ] Step 5: Commit "Data stamps: one per kind, moved by the database".

### Task 2: The cache module

**Files:** Create `src/api/cache.js`, `src/api/cache-rules.js`, `src/api/cache.test.js`.

**Interfaces:**
- `createCache({ storage, getStamps, now = Date.now })` → `{ get(kind, key, fetch), drop(kinds), check(force = false) → Promise<string[]>, setUser(id), reads() → Set<kind>, resetReads(), wrap(api, rules) → object }`.
  - `get` returns a clone of kept data (memory, else storage for the current user) or fetches, keeps `{ stamp: known[kind] ?? null, data }`, records the kind in `reads()`.
  - `check` calls `getStamps` unless the last check was < 30 000 ms ago (`force` skips that), drops kinds whose kept stamp differs, returns them.
  - `setUser(id)`: different from the current → clear memory and the previous user's storage key.
  - `wrap(api, rules)`: for each rule `{ name: { kind } }` → `(...a) => get(kind, name + JSON.stringify(a), () => api[name](...a))`; `{ name: { changes: [kinds] } }` → calls through, then `drop(kinds)` (also on error).
- `cache-rules.js` exports `RULES`: getters `getMembers, getAccessList → members; getCourse → course; getPins → pins; getGameSettings → games; getEvents → events; getTheme, getBookingRules → club; getSignups, getSignupCounts, getSignupDeclines, getKnockout → comps; getAccessRequests, getTeeTimeRequests → requests; getBuddies, getFriends, getFavourites → friends`; and every exported change function in `src/api/*.js` with the kinds it writes (e.g. `saveEvent, saveSeason, deleteEvent, startLeagueKnockout, enterEventToday, enterLeague → events`; `saveMember, deleteMember, resetLogin, setOfficeLogin, adminSetPlaysIn, setMyPlaysIn, setHutStaff → members`; `declineRequest → requests, members`; `requestTeeTime, cancelTeeTimeRequest, decideTeeTimeRequest, markTeeTimeRequestsSeen, dismissTeeTimeRequest → requests`; signup/knockout changes → comps; `setBookingRules`, theme/club changes → club; `publishPins, setGreenWidth → pins, course`; `setMyGamePref` and game settings → games; buddy/contact/favourite changes → friends).
- The default instance and its functions are exported: `cache`, `wrapApi(api) = cache.wrap(api, RULES)`.

- [ ] Step 1: Tests in `src/api/cache.test.js` with a pretend storage (Map-backed) and pretend stamps: `returns kept data without fetching again`; `returns copies` (mutating a result doesn't change the next); `a moved stamp drops that kind only`; `checks at most every 30 s unless forced`; `a different user starts empty` (and their storage key is removed); `a change drops its kinds even when it fails`; `reloads from storage after a restart` (new instance, same storage, same user → no fetch); `works when storage throws` (getItem/setItem throw → still fetches and returns); every `RULES` change name exists as an export in `src/api/*.js` (read the files' text).
- [ ] Step 2: `npx vitest run src/api/cache.test.js` — FAIL (module missing).
- [ ] Step 3: Implement `cache.js` and `cache-rules.js`.
- [ ] Step 4: `npx vitest run` — all pass.
- [ ] Step 5: Commit "Cache module: kept data per user, stamps, rules".

### Task 3: Use it in the app

**Files:** Modify `src/api.js`, `src/main.js`, `src/test/journeys/fake-api.js`, `src/test/journeys/features.test.js` (or a new `src/test/journeys/caching.test.js`).

**Interfaces:**
- `src/api.js`: `import * as raw` of every api file's exports (as the current `export *` list), `const w = wrapApi(raw)`, then `export const <name> = w.<name>` for every `RULES` name (shadowing the star exports), and `export { cache } from './api/cache.js'`, `export { getStamps }`.
- `main.js` render: after `getSession`, `api.cache.setUser(session?.user.id ?? null)`; on the first signed-in render, `await api.cache.check(true)` before the screen loads; `api.cache.resetReads()` before `screen.load()`; after `screen.draw`, `api.cache.check().then(kinds => kinds.some(k => readsOfThisRender.has(k)) && mine === seq && keepScroll(render))`. On `visibilitychange` to visible: `api.cache.check(true)` then the same redraw rule. `signOut` (auth.js) also calls `cache.setUser(null)`.
- `fake-api.js`: `db.stamps = { members: '1', … }`; `getStamps` returns a copy; `mockModule()` returns `wrapApi(fakeApi)` functions plus `cache` and `getStamps`, so journeys run through the real cache.

- [ ] Step 1: Journeys: `a screen opened twice fetches kept kinds once` (open Competitions → Events twice; `db.calls.filter(c => c === 'getEvents')` has length 1); `someone else's change shows after the check` (bump `db.stamps.events`, rename an event in `db.events`, advance 30 s and fire `visibilitychange` → the new name shows); `saving an event shows it at once` (make an event, the Events list shows it with no wait); `signing in as someone else starts empty` (two boots sharing `localStorage` with different session ids → second calls `getFriends` again).
- [ ] Step 2: `npx vitest run src/test/journeys` — the new journeys FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` and `npm run build` — PASS.
- [ ] Step 5: Commit "Screens draw from kept data and refetch only what changed".

### Task 4: View-only taps redraw without loading

**Files:** Modify `src/ui.js` (`setRedraw`, `redraw`), `src/main.js` (keeps the last screen and data; `redraw()` calls `screen.draw(lastData)` then the same bar/alerts steps as render), `src/screens/event-board.js` (`data-evday`, `data-lgview`, `data-lgweek`, `data-lgteam` toggles, `lg-all`), `src/office/*.js` filters/tabs that only change `S` and call `keepScroll(render)`; journeys.

**Interfaces:** `redraw(): void` exported from `ui.js`; handlers use `keepScroll(redraw)`.

- [ ] Step 1: Journey `a day tab on a one-off event board makes no request` (a 3-day Ryder event; tap Day 2; `db.calls` unchanged); `a league week switch makes no request`.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement; convert only handlers whose effect is purely `S` view state (leave any that change data).
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "View-only taps redraw without loading".

### Task 5: The club office iPad

**Files:** Modify `src/office/shell.js` (`summary`), office journeys.

**Interfaces:** `summary()` keeps its shape; its requests now go through the cached getters (`getAccessRequests`, `getTeeTimeRequests`, `getSignups`, `getKnockout`), so `forgetSummary()` per page costs no network unless `requests`/`comps` stamps moved.

- [ ] Step 1: Journey (office login, `db.asOffice`): `office pages don't refetch what's waiting` — Today → Members → Tee sheet: `getAccessRequests` called once; after a member asks to join (fake `requests` stamp bumped) and the 30 s check, Today shows the new request.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` — PASS.
- [ ] Step 5: Commit "Club office: what's waiting is kept and refetched only on change".

### Task 6: Service worker

**Files:** Create `public/sw.js`, `src/sw.test.js`. Modify `src/main.js` (register when `import.meta.env.PROD && 'serviceWorker' in navigator`: `navigator.serviceWorker.register('sw.js')`).

**Interfaces:** `public/sw.js` sets `self.swRoute(url, scopeUrl) → 'network-first' | 'cache-first' | 'skip'` and handles `install` (skipWaiting), `activate` (delete caches not named `CACHE = 'tm-v1'`, clients.claim), `fetch` (by route; GET only).

- [ ] Step 1: `src/sw.test.js` loads `public/sw.js` text into `new Function('self', 'caches', 'fetch', src)` with pretend `self`/`caches`: `swRoute` gives `network-first` for the page (`/teemate/`, `/teemate/index.html`), `cache-first` for `/teemate/assets/index-abc.js`, `/teemate/holes/1.jpg`, `/teemate/greens/1.png`, `/teemate/icon-192.png`, `skip` for `https://x.supabase.co/rest/v1/…`, POSTs and other origins; `activate` deletes a cache named `tm-v0` and keeps `tm-v1`.
- [ ] Step 2: Run — FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `npx vitest run` and `npm run build` (check `dist/sw.js` exists) — PASS.
- [ ] Step 5: Commit "Keep the app and its pictures on the device".

### Task 7: Measure, end-to-end, live

- [ ] Step 1: Before/after (in the ledger): from the journey call logs, requests to open Home, the Ballymena-style season board and office Today the first and second time; and `scratchpad/time-board.mjs`-style timing as Live Tester of a warm open (one stamps request) vs the cold numbers measured 26 Oct (622 ms total).
- [ ] Step 2: `npm run test:e2e` — PASS.
- [ ] Step 3: `npm run db:migrate:live && npm run db:test:live` — PASS.
- [ ] Step 4: Commit any measurement notes; then final review, merge to main, push (approved).
