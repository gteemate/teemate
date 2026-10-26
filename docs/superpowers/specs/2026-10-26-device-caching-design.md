# Faster screens: keep data on the device, fetch only what changed — design

Agreed with the user 26 Oct 2026, for **phones and the club office iPad** (the same web app).

## The problem (measured 26 Oct 2026)

- Every screen loads all its data from the server from scratch, in 2–4 rounds of requests. The Ballymena V Coleraine
  board: 3 rounds, ~0.6 s on the Mac's wifi; estimated 1½–2½ s on a phone on mobile data.
- Data that hardly ever changes is fetched again on nearly every screen: the member list (~17 KB), the course, game
  settings, all events.
- Taps that only change what's shown (a day tab, a league week, a team opened) load everything again.
- Nothing stays on the device: reopening the app starts from nothing (the 170 KB app, 2.6 MB of hole pictures).
- The iPad club office reloads its "what's waiting" summary on every page: 3 requests plus one per published draw.

## What we're building

1. **Draw from the device first, then check for updates.** Slow-changing data is kept on the device. A screen draws
   straight away from it; a quick check then fetches anything newer and redraws only if something changed.
2. **One small "has anything changed?" request.** The database keeps a stamp per kind of data, moved on by the
   database itself whenever that data changes. One request returns all the stamps; the app refetches only the kinds
   whose stamp moved.
3. **Your own changes show at once.** When you change something (book, save an event, add a member), the app drops
   that kind from the device and fetches it fresh.
4. **Taps that only change the view don't go to the server.** Switching a tab or opening a section redraws from what
   the screen already loaded.
5. **Live things stay live.** Scorecards, a match in play, the tee sheet and bookings are always fetched fresh when a
   screen opens, as now.
6. **The app and its pictures stay on the device** (a small background helper, a service worker), so reopening is
   near-instant and works on a weak signal. A new version is picked up the next time the app opens.

## Which data is kept on the device

| Kind (stamp name) | Data | Tables that move its stamp |
|---|---|---|
| `members` | member list, access list (office) | members |
| `course` | course, tees, holes | courses, tees, holes |
| `pins` | today's pin sheet | pin_sheets |
| `games` | game settings and prefs | game_settings, game_prefs, member_game_prefs |
| `events` | events (incl. leagues and seasons) | events |
| `club` | club name, colours, booking rules, hut on/off | club_settings |
| `comps` | sign-up competitions, entries, draws | signup_comps, signup_entries, ko_matches |
| `requests` | access requests, tee time requests (office) | access_requests, tee_time_requests |
| `friends` | my buddies, friends, favourites | buddies, friend_contacts, member_favourites (one stamp for everyone: anyone's change makes each device refetch its own, which is small) |

Always fetched fresh (not kept): scorecards (`rounds`), event and league entries, the tee sheet, bookings, my tee
times, notices, hut orders, balances, player events (invitations), the signed-in session.

## How it works

- **Stamps:** a table `public.data_versions (kind text primary key, changed_at timestamptz)` and one statement-level
  trigger per table above that sets `changed_at = now()` for its kind. A function `data_versions()` returns
  `{ kind: changed_at }` to any signed-in user (no member data in it).
- **On the device:** a small module (`src/api/cache.js`) keeps, per kind, `{ stamp, data }` in memory and in
  `localStorage`, under the signed-in user's id. Signing out, or a different login on the same device (the demo
  logins, a shared iPad), clears it.
- **Reading:** the getters for the kinds above (`getMembers`, `getCourse`, `getEvents` …) return the kept data at
  once when there is some. Otherwise they fetch as now.
- **Checking:** the app asks for the stamps when a screen opens, at most once every 30 seconds, and whenever it comes
  back to the front (the phone unlocked, the app switched back to). Kinds whose stamp moved are fetched again. If
  the screen showing used any of them, it redraws (keeping its scroll position).
- **Own changes:** each change function (`saveEvent`, `saveSeason`, `saveMember`, `bookTeeTime` …) drops the kinds
  it touches, so the next read fetches fresh.
- **View-only redraws:** a `redraw()` next to `render()` draws the current screen again from the data it already has.
  The handlers that only change what's shown use it: event board day tabs, league week/view switches, team lists
  opened, office sections' filters.
- **Club office (iPad):** its "what's waiting" summary is kept like any other kind (`requests`, `comps`) and only
  refetched when those stamps move, not on every page.
- **Service worker** (`public/sw.js`, registered from `main.js`, scope `/teemate/`):
  - the page itself: network first, the kept copy when offline;
  - the app's files (`assets/*`, named by content): kept after the first load;
  - pictures (`holes/`, `greens/`, icons, crest): kept after the first load;
  - never the database (Supabase) requests.
  When a new version is deployed, the next open fetches the new page, which names the new files.

## What a person sees

- Opening a screen they've seen before: drawn at once, without the empty or loading state.
- If someone else changed something meanwhile: the screen updates itself a moment later, within 30 seconds or on
  coming back to the app.
- Their own change: shown straight away, as now.
- Reopening the app: the app shell and pictures appear at once, even on a weak signal.

## Testing

- Unit (vitest): the cache module, with a pretend storage and pretend stamps. It returns kept data at once; fetches
  only moved kinds; is cleared on sign-out or a different user; drops kinds on own changes; checks at most every 30 s.
- Journey tests (pretend server, with request counting): opening the same screen twice makes no second request for
  kept kinds; a stamp moved by "someone else" redraws the screen with the new data; a day tab on the event board
  makes no request.
- Database tests: each listed table moves its stamp on insert, update and delete; `data_versions()` is readable by
  members and not by visitors.
- End-to-end (test database): the existing journeys still pass.
- Before and after: the request count and time to open Home, the Ballymena board and the office Today page, written
  into the plan's ledger.

## Not in this

- Pushing changes to devices the moment they happen (Supabase realtime): more moving parts, and the free plan limits
  how many devices can be connected at once.
- Playing or saving a round offline.
- Changing what any screen shows.
