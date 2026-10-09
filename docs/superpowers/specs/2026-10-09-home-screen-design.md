# Home screen — design

Date: 2026-10-09 · Based on the "Simpler" version of `mockups/home-screen.html`.

## Goal

Members open TeeMate and see, in one place, what is live for them today, with one tap to each
thing and one big button to book. The Admin tab, which today is a grid of tiles, becomes a
**Home** tab; the tiles move behind the membership card.

## Decisions (agreed in chat)

- Build the **Simpler** mock-up, not the Half-ring.
- Tabs: **Home · Scores · Leaderboard · Course** (Home first, replacing Admin).
- Club name: admins set it; stored in the database.
- Opening screen: **Scores** if I'm on today's card, at least one hole has a score saved, and the
  round isn't finished; otherwise **Home**.

## Opening screen

Chosen once each time the app loads (as now; afterwards tabs stay where the member puts them):

- `card = api.getCurrentRound()`
- Scores when `card && card.done.some(Boolean) && !card.submitted[card.game]`
- Home otherwise (no card, a card with nothing saved, a booking only, or a finished round).

"Finished" = the member tapped **Finish round** (`submitted[game]` is true for the card's game).

## Home (`src/screens/home.js`)

Top to bottom:

1. **Membership card** in the club colours (main colour background).
   Top line: club name (left, omitted if not set) and "Member" or "Admin" (right).
   Then the member's name, and two facts: Handicap index (one decimal) and GUI number
   ("Not added" when `gui` is null).
   Bottom line: "Bookings, buddies, events & account ›". Tapping anywhere on it opens **Account**.
2. **Today** heading and list. Each row: icon, title (with optional pill), one-line detail, and a
   short action word on the right. Only rows that apply, in this order:
   | Row | When | Pill | Tap opens |
   |---|---|---|---|
   | Invitation from {proposer} | a pending player event today where my group hasn't answered | Answer (gold) | Scores (its pop-up asks) |
   | {game name} card | today's card exists | On the go / Finished | Scores |
   | Tee time {hh:mm} | I have a tee time today and no card yet | — | Scores |
   | {event} match | a player event today with status accepted | Live | its live board (Scores → pevent) |
   | {league or club event} | a league/club event running today that I'm entered in | — | Leaderboard |
   Nothing applies → one muted line: "Nothing on today".
3. **Book a tee time** — full-width primary button → Book tee times.

## Account (`src/screens/admin-home.js`, renamed in the UI)

Today's Admin screen, unchanged except:

- Header "Account" with a "‹ Home" back link.
- Club colours tile reads **Club name & colours**.
- Screens that go back with `toAdmin()` return here (so `toAdmin` sets `aview = 'account'`).

## Routing

- `index.html`: tab button `data-tab="home"` labelled Home, moved first.
- `S.tab = 'home'` replaces `'admin'`; `S.aview` gains `'account'`; `aview: 'home'` is the new Home
  screen. `goAdmin(view)` sets `S.tab = 'home'`. Tapping the Home tab sets `aview = 'home'`.
- `chooseStartTab()` implements the rule above.

## Club name

- Migration: `club_settings.club_name text not null default ''` (max 60 chars).
- `get_theme()` also returns `name`. New `admin_set_club_name(p_name text)`, admins only, trims,
  rejects over 60 characters.
- `api.getTheme()` returns `{ main, accent, name }`; new `api.setClubName(name)`.
- Club colours screen gets a "Club name" text field above the colours; saved by the same
  "Save for everyone" button.

## What goes in Today — a tested function

`src/home-today.js` exports `todayItems({ me, card, teeTimes, playerEvents, events, leagueEntries, date })`
returning `[{ kind, title, pill, detail, go }]`. No DOM, no API calls. `home.js` loads the data
and draws whatever it returns.

## Testing

- `src/home-today.test.js` (vitest, written first): each row's condition, ordering, empty list,
  a finished card, a tee time with and without a card, and an invitation my group already answered
  (no row).
- Start-tab rule as a small exported function `startTab(card)` with tests.
- `supabase/tests/club_colours.sql`: non-admin can't set the club name; admin can; too long is refused;
  `get_theme()` returns it signed out.
- Browser preview at phone width, light and dark: Home with and without things on today, the card
  opening Account, back to Home, and opening on Scores after saving a hole.

## Not in this change

Half-ring hero, live push updates, any other change to the Account tiles.
