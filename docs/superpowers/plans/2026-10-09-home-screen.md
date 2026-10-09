# Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Admin tab with a Home tab (membership card, Today list, Book button), move the old Admin tiles to an Account screen behind the card, add an admin-set club name, and open on Scores only mid-round.

**Architecture:** What goes on Today and which tab the app opens on are pure functions in `src/home-today.js` (vitest). `src/screens/home.js` loads data through `api.js` and draws those items. Club name is a column on `club_settings` returned by `get_theme()`.

**Tech Stack:** Vite + plain JS, vitest, Supabase (Postgres migrations + SQL tests via `npm run db:migrate` / `npm run db:test`).

**Spec:** `docs/superpowers/specs/2026-10-09-home-screen-design.md`

## Global Constraints

- Tabs in order: Home · Scores · Leaderboard · Course.
- Copy: "Member" / "Admin"; "Handicap index"; "GUI number"; "Not added"; "Bookings, buddies, events & account ›"; "Today"; "Nothing on today"; "Book a tee time"; "‹ Home"; "Account"; "Club name & colours"; pills "Answer", "On the go", "Finished", "Live".
- Club name max 60 characters, trimmed; empty = not shown.
- Always null-guard `me.gui` (many real members have none).
- All DB access stays in `src/api.js`. Match surrounding style: 2-space indent, no semicolons, short comments.
- Before pushing: curl any new RPC with the anon key to catch schema errors (see memory note). Don't push without the user's go-ahead.
- After each task: show it running in the browser preview and wait for the user's go-ahead before the next.

## Review Focus

1. Invitation where **my** group proposed (proposerSlot is my slot) → no "Answer" row; only invited groups answer.
2. Player event that was called off (`status: 'cancelled'`) or is on another day → no row.
3. Card exists *and* a tee time exists → only the card row (no duplicate tee-time row).
4. League running today that I'm not entered in (`players` doesn't include me) → no row; league whose last week ended yesterday → no row.
5. A card with scores but finished for its game (`submitted[game]`) → app opens on Home, card row pill "Finished".

---

### Task 1: Today items and opening tab (pure, tested)

**Files:**
- Create: `src/home-today.js`
- Test: `src/home-today.test.js`

**Interfaces:**
- Consumes: `eventLastDay(e)`, `hhmm(m)` from `src/dates.js`; `GAME_DEFS`, `eventFormatName(k)` from `src/games.js`. ("Entered" = `e.players.includes(me.id)`, so the spec's `leagueEntries` input isn't needed.)
- Produces:
  - `startTab(card) -> 'scores' | 'home'` — `'scores'` iff `card && card.done.some(Boolean) && !card.submitted?.[card.game]`.
  - `todayItems({ me, card, teeTimes, playerEvents, events, date }) -> Item[]` where `date` is an ISO string, `teeTimes` is `getMyTeeTimes` output (`[{ id, time, players: [{ memberId, name }] }]`), `playerEvents` is `getMyPlayerEvents` output, `events` is `getEvents` output.
  - `Item = { kind: 'invite'|'card'|'tee'|'match'|'event', title, pill: null | { text, gold?: true }, detail, go }` with `go` one of `{ tab: 'scores' }`, `{ tab: 'scores', sview: 'pevent', peId }`, `{ tab: 'lb', lbv: eventId }`.

Rows, in this order:
| kind | condition | title | pill | go |
|---|---|---|---|---|
| invite | `e.date === date && e.status === 'pending'`, my slot = `e.players.find(p => p.memberId === me.id).slot`, `mySlot !== e.proposerSlot`, my group's `answer == null` | `Invitation from ${e.proposedBy.name}` | `{ text: 'Answer', gold: true }` | `{ tab: 'scores' }` |
| card | `card` | game name from `GAME_DEFS` (fallback `'Scorecard'`) | `Finished` if submitted else `On the go` | `{ tab: 'scores' }` |
| tee | no `card`, first of `teeTimes` | `Tee time ${hhmm(t.time)}` | null | `{ tab: 'scores' }` |
| match | `e.date === date && e.status === 'accepted'` | `eventFormatName(e.format)` + ` match` | `{ text: 'Live' }` | `{ tab: 'scores', sview: 'pevent', peId: e.id }` |
| event | `(e.club \|\| e.style === 'league') && e.startDate <= date && eventLastDay(e) >= date && e.players.includes(me.id)` | `e.name` | null | `{ tab: 'lb', lbv: e.id }` |

Details: card → `not started` / `${n} holes played` (n = leading `done` true count); tee → other players' names joined with ", " (or `On your own`); invite/match → group times `hhmm` joined with " v "; event → `Your round today can count` for a league, else `Today`.

- [ ] **Step 1: Write failing tests** in `src/home-today.test.js`:
  - `startTab`: null → `'home'`; no holes done → `'home'`; one hole done → `'scores'`; done but `submitted: { stab: true }` with `game: 'stab'` → `'home'`.
  - `todayItems`: empty inputs → `[]`; pending invite to my group unanswered → one `invite` item, pill `{ text: 'Answer', gold: true }`; same with my group answered → no item; same where I'm in the proposer's slot → no item; cancelled event → no item; event dated tomorrow → no item; card + tee time → `card` only, tee time only → `tee` with title `'Tee time 08:10'` for `time: 490`; accepted match → `go` `{ tab: 'scores', sview: 'pevent', peId }`; league running today with me in `players` → `event` with `go.lbv`; league I'm not in → none; league ended yesterday → none; full set → kinds in order `['invite','card','match','event']`.
- [ ] **Step 2: Run** `npx vitest run src/home-today.test.js` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `startTab` and `todayItems` in `src/home-today.js`.
- [ ] **Step 4: Run** `npm test` — expect all pass (95 existing + new).
- [ ] **Step 5: Commit** `git commit -m "Home: what goes on Today, and which tab the app opens on (tested)"`

### Task 2: Club name in the database and api.js

**Files:**
- Create: `supabase/migrations/20261009100000_club_name.sql`
- Modify: `supabase/tests/club_colours.sql` (add tests before the final results select)
- Modify: `src/api.js` (Club colours section, ~line 79-89)

**Interfaces:**
- Produces: `get_theme()` → `{ main, accent, name }`; `admin_set_club_name(p_name text) returns void`; `api.getTheme() -> { main, accent, name }` (unchanged call); `api.setClubName(name: string) -> Promise<void>`.

- [ ] **Step 1: Write failing DB tests** in `club_colours.sql`: anon `get_theme() ? 'name'` is true; member 1 calling `admin_set_club_name('X')` fails with `Only admins`; admin 0 sets `'  Royal Test GC  '` → `get_theme()->>'name' = 'Royal Test GC'`; 61 characters refused.
- [ ] **Step 2: Run** `npm run db:test` — expect the new club-name tests to FAIL (function missing).
- [ ] **Step 3: Write migration**: `alter table public.club_settings add column club_name text not null default '' check (char_length(club_name) <= 60)`; `create or replace function public.get_theme()` adding `'name', club_name`; `admin_set_club_name` security definer, `is_admin()` check with message `'Only admins can change the club name.'` (errcode 42501), trim, length > 60 → `'Club name must be 60 characters or fewer.'` (P0001); revoke from public, grant to authenticated. Then `npm run db:migrate`.
- [ ] **Step 4: Run** `npm run db:test` — expect all pass.
- [ ] **Step 5: Add** `setClubName` to `src/api.js` next to `setTheme`; curl `get_theme` with the anon key and confirm `name` is in the response.
- [ ] **Step 6: Commit** `git commit -m "Club name: stored with the club colours, admins set it"`

### Task 3: Home tab, Account screen, opening tab

**Files:**
- Create: `src/screens/home.js`
- Modify: `index.html` (tabs), `src/main.js` (ADMIN map, `screenFor`, `chooseStartTab`, tab click), `src/state.js` (`tab: 'home'`, aview comment), `src/screens/nav.js`, `src/screens/admin-home.js` (header + back link + tile label), `src/styles.css` (membership card, Today rows, book button — port from `mockups/home-screen.html` `.card-m`, `.today`, `.bookbtn`, `.pill.gold`, using existing theme variables)
- Grep and update every `S.tab = 'admin'` / `S.tab === 'admin'` / `data-tab="admin"` / `.tabs-demo` "Admin" to `home`.

**Interfaces:**
- Consumes: `startTab`, `todayItems` (Task 1); `api.getTheme()` with `name` (Task 2); `api.getMe`, `getCurrentRound`, `getMyTeeTimes(today())`, `getMyPlayerEvents`, `getEvents`.
- Produces: `S.tab === 'home'`; `S.aview` `'home'` = Home, `'account'` = old Admin screen; `toAdmin()` → `aview = 'account'`; `goAdmin(view)` → `S.tab = 'home'`.

- [ ] **Step 1: Routing** — `ADMIN = { home, account: adminHome, … }`; tab key `home`; Home button first in `index.html`; tapping Home tab sets `aview = 'home'`; `chooseStartTab` returns `startTab(await api.getCurrentRound())`.
- [ ] **Step 2: home.js** — `load()` fetches the five calls + theme in parallel and returns `{ me, clubName, items: todayItems(...) }`; `draw()` renders membership card (button → `aview = 'account'`), "Today" + items (each sets `S.tab`/`S.sview`/`S.peId`/`S.lbv` from `item.go`, then `render(); top0()`), "Nothing on today" when empty, and "Book a tee time" (→ `aview = 'tee'`). Header: `header('TeeMate', …)` matching other screens. Escape every name with `esc`.
- [ ] **Step 3: Account** — `admin-home.js` header `'Account'` with back to Home (header's third arg is the back handler, as in `colours.js`); Club colours tile title `Club name & colours`.
- [ ] **Step 4: Run** `npm test` and `npm run build` — expect pass and a clean build.
- [ ] **Step 5: Browser check** (preview, 375px, light + dark): opens on Home with no scores today; card → Account → ‹ Home; Book a tee time → Book tee times → back lands on Account; Today rows open the right place; save a hole on Scores, reload → opens on Scores; Home tab mid-round stays on Home. No console errors.
- [ ] **Step 6: Commit** `git commit -m "Home tab: membership card, Today and Book a tee time; Admin becomes Account"`

### Task 4: Club name field on Club name & colours

**Files:**
- Modify: `src/screens/colours.js`

**Interfaces:**
- Consumes: `api.getTheme()` → `name`, `api.setClubName(name)` (Task 2).

- [ ] **Step 1: Add** a "Club name" text input (maxlength 60) above the colours; header `Club name & colours`; "Save for everyone" calls `setClubName(name.trim())` and `setTheme(...)`; error text for over 60 in `#cerr`.
- [ ] **Step 2: Browser check** — set a name as an admin, save, go Home: the card's top line shows it; clear it: the line disappears. Non-admins never see the screen.
- [ ] **Step 3: Commit** `git commit -m "Club name & colours: admins set the club name shown on the membership card"`
