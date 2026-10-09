# Home as a Remote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home becomes a centred "remote": the disc in the middle of the screen with four notched tiles, weather in
the header, and nothing below. Things that need you drop down from the header as alerts with Accept/Decline/OK.

**Architecture:** Pure helpers (`weather.js`, `round-pill.js`, `alerts.js`) are tested with Vitest. The DOM pieces
(`screens/home.js`, new `alert-bar.js`) call them. One migration adds the course location to `club_settings`, sets
it through an admin-only function, and returns it from `get_theme`.

**Tech Stack:** Vite + plain JS, Vitest, Supabase Postgres (migrations via `npm run db:migrate`, SQL tests via
`npm run db:test`), Open-Meteo (forecast + geocoding, no key).

**Spec:** `docs/superpowers/specs/2026-10-10-home-remote-alerts-design.md`

## Global Constraints

- Only the course latitude and longitude (and the place search text an admin types) go to Open-Meteo. No member data.
- Weather cache: 30 minutes, in memory and in `localStorage` key `teemate.weather`, with every storage access in try/catch.
- Home does not scroll. The disc's centre is within 2px of the centre of the space below the header, upright and sideways.
- Copy is fixed by the spec: "Book a tee time", "Your competitions", "N playing partner(s)", "Round on the go",
  "Start a round", "Hole 4 · +1" (E when level), and the alert texts in Task 5.
- New SQL functions: `revoke ... from public, anon` and `grant ... to authenticated`, except `get_theme`, which stays readable before sign-in.
- Build every task in a row without stopping for approval (user, 10 Oct). Push only at the end, when the user says so.

## Review Focus

- **Landscape phones (e.g. 812×375):** the block sizes from the height, so the tiles and disc fit with no scroll.
  Task 4 preview check, at 375×812, 812×375 and 1024×768.
- **Weather API down or slow:** Home draws immediately without weather, and weather fills in when it arrives,
  never blocking `load()`. Test in Task 1: `getWeather` resolves `null` on a fetch rejection.
- **Accepting a challenge already called off:** the toast gives the reason and the alert goes. Task 6 manual check
  with a rejecting stub.
- **Several answered requests at once:** each gets its own alert, and requests are marked seen only after the last
  one is OK'd. Test in Task 5: `pickAlerts` gives one alert per request.
- **A round with holes saved out of order, or a finished round:** the pill uses the holes saved so far and shows no
  pill when the round is finished. Tests in Task 3.

---

### Task 1: Weather module

**Files:**
- Create: `src/weather.js`
- Test: `src/weather.test.js`

**Interfaces:**
- Produces:
  - `weatherUrl(lat: number, lon: number): string`
  - `readWeather(json): { windMph: number, rainMm: number } | null`
  - `getWeather({ lat, lon } | null, fetchFn = fetch, now = Date.now()): Promise<{ windMph, rainMm } | null>`

- [ ] **Step 1: Write failing tests** in `src/weather.test.js`:
  - `weatherUrl(55.2, -6.6)` starts with `https://api.open-meteo.com/v1/forecast?` and contains `latitude=55.2`,
    `longitude=-6.6`, `current=wind_speed_10m`, `daily=precipitation_sum`, `wind_speed_unit=mph`,
    `timezone=auto` and `forecast_days=1`.
  - `readWeather({ current: { wind_speed_10m: 13.6 }, daily: { precipitation_sum: [2.24] } })` equals
    `{ windMph: 14, rainMm: 2 }`, and rain 0.04 gives `rainMm: 0`.
  - `readWeather({})`, `readWeather(null)` and `readWeather({ current: { wind_speed_10m: 'x' }, daily: { precipitation_sum: [] } })`
    all give `null`.
  - `getWeather(null)` gives `null` without calling fetch.
  - `getWeather(loc, () => Promise.reject(new Error('down')))` gives `null`.
  - Two calls within 30 minutes with the same location call fetch once. A call 31 minutes later fetches again (pass `now`).
- [ ] **Step 2:** `npx vitest run src/weather.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/weather.js`. Build the URL with `URLSearchParams`. Cache key: lat/lon rounded to
  2 decimals. Keep the cache in a module variable, plus `localStorage['teemate.weather']` as
  `{ key, at, value }` with try/catch around it. Use `Number.isFinite` checks in `readWeather`.
- [ ] **Step 4:** `npx vitest run src/weather.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** with `git add src/weather.js src/weather.test.js && git commit -m "Weather: wind and rain for the course (Open-Meteo)"`.

### Task 2: Course location (database + Club admin)

**Files:**
- Create: `supabase/migrations/20261010120000_course_location.sql`
- Create: `supabase/tests/course_location.sql`
- Modify: `src/api/club.js` (add `setCourseLocation`, `searchPlaces`)
- Modify: `src/screens/colours.js` (Course location section)

**Interfaces:**
- Produces:
  - `get_theme()` JSON gains `courseLat`, `courseLon` and `coursePlace` (null when not set).
  - `admin_set_course_location(p_lat double precision, p_lon double precision, p_place text)`, with nulls clearing it.
  - JS `setCourseLocation(lat, lon, place)`.
  - JS `searchPlaces(q, fetchFn = fetch): Promise<[{ name, detail, lat, lon }]>`, where detail is
    "admin1, country" and the endpoint is `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=5&language=en&format=json`.

- [ ] **Step 1: Write the failing DB test** `supabase/tests/course_location.sql`, in the same shape as
  `card_delete.sql` (t schema, `t.ok`, `t.err`, `t.act_as`, rolled back). Members 990701 (admin) and 990702.
  Checks:
  - The admin sets (55.2, -6.65, 'Portrush, Northern Ireland') and `get_theme()->>'coursePlace'` matches.
  - A member gets an error containing `Only admins`.
  - A latitude of 91 gives an error containing `location`.
  - Anon can call `get_theme()` and sees `courseLat`.
- [ ] **Step 2:** `npm run db:test`. Expected: course_location.sql fails (function does not exist).
- [ ] **Step 3: Write the migration.**
  - `alter table club_settings add course_lat double precision, add course_lon double precision, add course_place text`.
  - The admin function is `security definer`, checks `is_admin()` (message `Only admins can set the course location.`),
    checks lat between -90 and 90 and lon between -180 and 180 (message `That location isn't valid.`), and trims
    place to 80 characters.
  - Replace `get_theme` from its live definition (fetch it with `pg_get_functiondef`) and add the three keys.
  - Grants as in Global Constraints.
- [ ] **Step 4:** `npm run db:migrate && npm run db:test`. Expected: "All database tests passed".
- [ ] **Step 5: Client.**
  - Add the API functions.
  - In `colours.js`, add a "Course location" card under the club name:
    - It shows the current place, or "Not set, so no weather on Home".
    - A search input with a **Find** button lists up to 5 results (name, detail). Tapping one saves it, with the
      toast "Course location saved". A **Clear** link appears when it's set.
  - Add a unit test in `src/weather.test.js` that `searchPlaces` maps a sample geocoding response
    (`results: [{ name, admin1, country, latitude, longitude }]`) and returns `[]` when there are no results.
- [ ] **Step 6:** Run `npx vitest run && npm run build`. Expected: all pass, and the build works.
- [ ] **Step 7: Commit** the migration, test, `club.js`, `colours.js` and `weather.test.js` with the message "Club admin: course location (for the weather on Home)".

### Task 3: Scoring pill helper

**Files:**
- Create: `src/round-pill.js`
- Test: `src/round-pill.test.js`

**Interfaces:**
- Produces: `roundPill({ done: boolean[], gross: (number|null)[], pars: number[], shots: number[], finished: boolean }): string | null`.
  `gross`, `pars` and `shots` are per hole for me (player 0). `shots[i]` is the strokes I get on hole i (all 0 for a gross game).

- [ ] **Step 1: Failing tests:**
  - No holes done gives `null`. `finished: true` gives `null`.
  - Holes 1–3 done with gross [5,4,4], pars [4,4,4], shots 0 give `'Hole 4 · +1'`.
  - The same with shots [1,0,0] gives `'Hole 4 · E'`. Net −2 shows as `-2`.
  - Done [true,false,true] gives the next hole as the first unsaved one (`Hole 2`), with the score from saved holes only.
  - All 18 done but not finished gives `'Hole 18 · …'`, so the next hole stays at 18.
- [ ] **Step 2:** `npx vitest run src/round-pill.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `toPar` from `scoring.js` for the number. The next hole is the first index where
  `!done[i]`, plus 1, capped at 18.
- [ ] **Step 4:** Expected: PASS.
- [ ] **Step 5: Commit** with "Scoring tile: Hole 4 · +1 pill".

### Task 4: Home redesign (centred remote)

**Files:**
- Modify: `src/screens/home.js`, `src/styles.css` (Home block, lines ~496–525)
- Modify: `src/home-today.js` and `src/home-today.test.js` (remove `todayItems` and `nextUp` and their tests; keep `startTab` and `needsMyAnswer`)

**Interfaces:**
- Consumes: `getWeather` (Task 1), `getTheme().courseLat/courseLon` (Task 2), `roundPill` (Task 3).
- Produces: the Home header markup has `<div class="homedate">` on the left and `<div class="hwx" id="hwx">` on
  the right. Task 6 adds the alert dot inside `.homedate`.

- [ ] **Step 1: Load.**
  - `load()` fetches me, theme, the current card, today's tee times, player events, buddies and tee time requests.
    For the pill it also fetches course, members and game settings.
  - Compute `shots` for player 0 the same way `scores.js:110` does: `playingHandicaps` over `courseHandicap(p.hcp ?? 0, teeRating(course))`
    with the game's `G.allow` and `G.offLow`, then `shotsOnHole(ph[0], hole.si)` per hole. Use 0s when `G.allow` is 0.
  - `finished = !!card.submitted?.[card.game]`.
- [ ] **Step 2: Draw.**
  - Same four tiles, disc and click targets as now. The tile subtitles are as in the spec, with invitations still
    glowing Competition and answered requests glowing Booking.
  - The Scoring tile shows the pill as `<span class="hpill">Hole 4 <i>· +1</i></span>` next to its icon.
  - Remove the `hnext` list and the "Nothing on today" message.
  - The header shows the date on the left and `#hwx` on the right. After the draw, `getWeather(...)` fills `#hwx`
    with wind and rain icons, "14 mph" and "2 mm". If it gives `null` or the node is gone, nothing happens.
- [ ] **Step 3: CSS.**
  - Home's `.screen` becomes a flex container taking the remaining viewport height (`100dvh` minus the header),
    centring the `.hquad`, with no scroll.
  - `.hquad` is a square of `--q: min(calc(100vw - 32px), calc(100dvh - var(--hdrH) - 32px), 520px)`. Tiles are
    `calc((var(--q) - 10px)/2)` square.
  - Notch: each tile gets a `mask` of a radial-gradient circle at its inner corner, with radius = disc radius + 8px.
  - The disc is `calc(var(--q) * 0.42)` with font sizes in `em` from it, and stays absolutely centred.
  - Remove the `.hnext` rules.
- [ ] **Step 4: Tests.**
  - Remove the `todayItems` and `nextUp` tests and the functions. Check that `grep -rn "todayItems\|nextUp" src`
    finds nothing.
  - Run `npx vitest run && npm run build`. Expected: all pass.
- [ ] **Step 5: Preview check** (dev server "teemates", drawing with sample data as in earlier tasks).
  - At 375×812, 812×375 and 1024×768, use `javascript_tool` to compare the disc's `getBoundingClientRect()`
    centre with the centre of the space below the header (within 2px), and check `scrollHeight <= clientHeight`.
  - Weather shown with a stubbed value, and hidden with `null`.
  - Take a phone-size screenshot for the user and compare it with the mock-up.
- [ ] **Step 6: Commit** with "Home: a centred remote, with weather and the round pill; Today list removed".

### Task 5: Alerts (what drops down)

**Files:**
- Create: `src/alerts.js`
- Test: `src/alerts.test.js`

**Interfaces:**
- Consumes: `needsMyAnswer(e, me)` from `home-today.js`.
- Produces: `pickAlerts({ me, playerEvents, requests, date, hidden: Set<string> }): Alert[]`, where
  `Alert = { key: string, kind: 'challenge'|'request', title, detail, actions: [{ id: 'accept'|'decline'|'details'|'ok'|'later', label, primary? }], ref: { peId? , reqId? } }`.

- [ ] **Step 1: Failing tests** (reuse the `pe()` fixture style from `home-today.test.js`):
  - Nothing gives `[]`.
  - Today's pending challenge for my group gives one alert:
    - key `pe:5`, kind `challenge`, title `Peter Reid's four-ball (07:50) has challenged your group`.
    - detail = the event format name.
    - actions accept/decline/details/later, in that order, with Accept primary.
  - These give no alert: my group answered, my group proposed, called off, tomorrow's.
  - An approved, unseen request decided less than 7 days ago gives:
    - key `rq:3`, title `Request approved: Sat 14 Nov 08:10`, detail `Booked. It’s in your bookings.`
    - actions ok/later.
  - A declined one has the detail = the admin note (or `No reason given`).
  - These give no request alert: seen, pending, decided 8 days ago.
  - Order: challenges first, then requests by `decidedAt`, oldest first.
  - `hidden` containing `pe:5` drops just that one.
  - Two answered requests give two alerts.
- [ ] **Step 2:** `npx vitest run src/alerts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** The request title date uses the same format as the existing request rows
  (`requestStatus`/`longDay` in `requests.js` and `dates.js`). Reuse that, don't copy it.
- [ ] **Step 4:** Expected: PASS.
- [ ] **Step 5: Commit** with "Alerts: which things drop down from the header".

### Task 6: Alert drop-down (DOM) and the dot

**Files:**
- Create: `src/alert-bar.js`
- Modify: `index.html` (add `<div id="alerts" aria-live="polite"></div>` after `#hdr`), `src/main.js`
  (after each draw and on `visibilitychange` to visible, call `checkAlerts()`; sign-in screens excluded),
  `src/styles.css`

**Interfaces:**
- Consumes: `pickAlerts` (Task 5), `api.getMyPlayerEvents`, `api.getMyTeeTimeRequests`, `api.answerPlayerEvent(id, accept)`,
  `api.markTeeTimeRequestsSeen()`.
- Produces: `checkAlerts(): Promise<void>` (debounced 300ms; ignores overlapping calls) and `showHidden(): void`.

- [ ] **Step 1: Implement.**
  - `checkAlerts` loads the two lists, runs `pickAlerts` with the module's `hidden` set and `answered` set
    (keys done this session), and draws the first alert as a card that slides down under the header (CSS
    transform transition): title, detail, and buttons.
  - **Accept/Decline:** call `answerPlayerEvent`. On success, toast "Accepted" or "Declined" and re-render. On
    error, toast `err.message` and drop the alert.
  - **See details:** sets `S.tab='scores'; S.sview='pevent'; S.peId`, then renders.
  - **OK:** adds the key to `answered`. When no request alerts are left, call `markTeeTimeRequestsSeen()`.
  - **Later:** adds the key to `hidden`.
  - When `hidden` has alerts still current, show a small gold dot button (`#alertdot`, aria-label "Show alerts"):
    inside `.homedate` on Home, or at the right of `#hdr` on other screens. It calls `showHidden()`, which clears
    `hidden` and redraws.
- [ ] **Step 2: Preview check** with stubbed api functions (override them on the imported module in the page):
  - A challenge alert shows; Accept calls the stub with `(5, true)`; a rejecting stub shows the toast and removes the alert.
  - Later shows the dot, and tapping the dot brings the alert back.
  - A request alert shows and OK marks it seen.
  - Upright and sideways: the alert doesn't move the disc (it overlays).
  - Take a screenshot for the user.
- [ ] **Step 3:** Run `npx vitest run && npm run build && npm run db:test`. Expected: all pass.
- [ ] **Step 4: Before pushing**, curl `rpc/admin_set_course_location` with the publishable key. Expected: 42501
  (permission denied), not PGRST202. Curl `rpc/get_theme`. Expected: 200 with `courseLat`.
- [ ] **Step 5: Commit** with "Alerts drop down from the header: Accept/Decline challenges, answered requests". Then
  report to the user and ask to push.
