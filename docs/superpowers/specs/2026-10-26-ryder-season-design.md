# Four-ball team match play over a season — design

Agreed with the user 26 Oct 2026. First use: **Ballymena V Coleraine** (event 2497 on live, set up by Live Tester).

## What it is

The existing four-ball team match play (style `ryder`: two teams, pairs play better-ball matches, 1 point each),
spread over a **season** instead of 1–3 days in a row. The season has a start date and an end date. On any day in
between, the organiser can put on a **match day** with **any number of matches** (1, 2, 3 …), each one either a
**four-ball** (a pair v a pair, better ball) or a **singles** (one v one). Every match is worth 1 point (½ each if
halved), as in a Ryder Cup. Points add up across
every match day into one season score. Example: all 12 play on day 1 and day 4 (3 matches each, so 6 points are
decided), day 9 has one four-ball for whichever four are free, and day 12 has two singles.

## Decisions (from the user)

- Same format as today's four-ball team match play, just over many days.
- A match day can have any number of matches, not always everyone.
- A match can be a four-ball or a **singles**; a match day can mix them.
- The organiser (an ordinary player, e.g. Live Tester) adds the match days.
- New players can be **added to a team part-way through** the season.
- **Nobody ever switches teams during a season.**

## Setting it up (Events → New, four-ball team match play)

A season is a general option, not something made just for Ballymena V Coleraine: **any player** can make one for
their own group from Events → New (as they can a one-off now), and **admins** can make one as a club event that
everyone sees. Who can see it follows the existing rules (players in it and its organiser; club events: everyone).

- A new choice under When: **One-off** (1–3 days in a row, exactly as now) or **Season** (start date and end date;
  the end date is after the start date and at most a year later).
- Players and teams are chosen as now: two named, coloured teams. Teams don't have to be the same size.
- The season's **format** is chosen once, as now, and sets how both kinds of match are played:

  | Season format | Four-ball | Singles |
  |---|---|---|
  | Better ball · off the low (`bbl`) | as now | Handicap match play, full difference off the low (`kos`) |
  | Better ball · Stableford (`bbstab`) | as now | Stableford match play, off the low (`sm2`) |
  | Better ball · scratch (`bbscr`) | as now | Scratch match play (`sc2`) |

  Each uses its own game's handicap allowance from the club's games, as the event board does now.
- A season has no "Day 1 / Day 2 / Day 3" draw. Its last step is **Match days**: a list, empty at first, with
  **+ Add a match day**. Adding one asks for a date (inside the season and not already used) and then the matches,
  each added with **+ Four-ball** (a pair from team A v a pair from team B) or **+ Singles** (one from each team).
  **Draw** fills four-balls from whoever's picked to play that day, and makes a singles from a player left over on
  each side; the organiser can then remove matches, change a match between four-ball and singles, or swap players,
  as the existing editor allows. A player can be in only one match per match day. Pairs can change from one match
  day to the next.
- Saving a season with no match days is allowed (they're added later).

## Changing it during the season

The organiser (the player who made it) and admins can, until the end date:

- **Add a match day** for today or a later date in the season.
- **Change or remove a match day that hasn't started**: a future date, or today before any card in it has a hole
  saved. Once a match day has started or passed, it's locked: its matches and results stand.
- **Add players** to either team. A new player can be put into match days that haven't started.
- **Not** move anyone to the other team, or remove a player who has played a match. (A player with no matches yet
  can still be taken out.)
- Change the end date to any date that isn't before the last match day or before today.

Admins can still change anything, as they can with any event now.

Because players today can only change their own event **before it starts** (the events update policy), the season
changes go through one new database function, `save_season`, which checks all of the rules above on the server, so
the app can't break them (e.g. an old screen open on another phone).

## Playing a match day

As today's four-ball team match play, on the match day only:

- Players with a match that day see it on Home (Today) and when they start a round ("Counts for"), tick it, and
  their card counts for their match. It's scored live from their cards, as now. The two players in a singles don't
  have to be on the same card (each one's own card counts), so a singles can be played inside a four-ball with
  friends.
- Players **without** a match that day aren't asked, and the event doesn't show as "on today" for them.
- "Book this match" and the other match helpers work per match day, as they do per day now.

## The board

- At the top: the **season score** (e.g. Blues 8½ – Reds 6½) and "N matches played · M to come", then "Season ends
  <date>". After the end date: "Final".
- Then **match days, newest first**: date, its matches and points (a live match shows its status). Coming match days
  are listed after, with their pairs.
- The organiser sees **+ Add a match day**, **Add a player** and **Change** (for days not started) on the board.

## How it's built (one line each)

- **Data:** keep the `events` row. A season is a ryder event whose `days` is the season length (start to end date,
  inclusive), with matches stored only on match days (`matches` keyed by day number = date − start + 1, as today).
  A singles is a match with one player a side: `{ a: [x], b: [y] }` (a four-ball stays `{ a: [x, y], b: [z, w] }`).
  The `days between 1 and 3` check is relaxed to allow up to 366 for ryder events. A new `season boolean` column
  marks it (a one-off is unchanged).
- **Scoring:** `scoreAdvanceEvent` scores each match on a day with `ryderMatches` (four-balls) or `singlesMatch`
  (singles, with the format from the table above); both give the same match result shape, so the season total
  (`teamEventScore`) adds them together.
- **Day numbers** already come from dates everywhere (`event_entries.day`, the board, the round's "Counts for"), so
  they keep working; places that loop over every day (`scoreAdvanceEvent`, the board's day tabs, `round.js`,
  `dayOf`) loop over **match days** (days with matches) instead for a season.
- **Entering a card** (`enter_event_round` / `enter_event_today`): for a season, the player must have a match on
  that day.
- **`save_season(p_event, p_end, p_team, p_matches)`**: organiser or admin, before the end date; rejects a team
  switch, a removed player who has played, or a change to a started or past match day.
- **Screens:** the event editor (One-off/Season, end date, Match days step), the event board (season header, match
  days list with four-balls and singles, organiser buttons), event cards on Events/Competitions/club office ("Season · ends 31 Mar"), and the
  match page heading ("Match 2 · 14 Nov").

## Testing

- Unit tests (vitest): season scoring over sparse match days (points add up; days without matches are ignored; a
  live match counts as in progress), singles alongside four-balls on one day (each format, players on different
  cards), the draw's leftover singles, the "has this match day started" rule, and the season helpers for the board.
- Database tests (supabase/tests): `save_season` allows adding a day / adding a player / a singles and refuses a match that isn't 2 v 2 or
  1 v 1, a player in two matches on a day, a team switch, a
  change to a started day, a removed player who has played, and a non-organiser; entering a card on a day where the
  player has no match is refused.
- Scenario data (supabase/scenarios.sql) gets a season with past, today's and future match days.
- End-to-end: the existing journeys keep passing; one journey adds a match day as the organiser.

## Then the demo data (live)

Ballymena V Coleraine becomes a season: start 10 weeks ago, end 31 Mar 2027, the same 12 players and teams
(Blues/Reds). **10 past match days with 1–3 matches each** (some with all 12 out, some with singles), each with believable cards and
the result worked out by the app; tomorrow's 3 matches (as set up now) stay as the next match day.

## Not in this

- Singles in a one-off (1–3 day) event: it stays four-balls only, as now.
- Moving a match day after it has started, or editing results by hand.
- A season for the other event styles (teams Stableford, individual).
