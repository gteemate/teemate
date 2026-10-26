# Match days: guided setup, 3-balls, points, holes and visible colours — design

Agreed with the user 26 Oct 2026. Builds on `2026-10-26-ryder-season-design.md`. Applies to **four-ball team match
play, both seasons and one-off (1–3 day) events**. First use: Ballymena V Coleraine (event 2497 on live).

## What the user asked for

1. **Board:** choose the match day from a **drop-down of dates**, not one long list.
2. **Adding a match day is a guided flow:** confirm who's playing → pick the match types (four-balls, singles,
   3-balls, a mix) → confirm the **number of holes** (e.g. 12 on winter greens; handicaps scaled to it) → confirm the
   **points** (the event's settings, adjustable for that day, e.g. the end of the season worth more).
3. **3-ball (2 v 1):** a new match type. Points set at setup: the single gets more for a win than the pair does.
   Halved: each side gets half its own win points.
4. **Set when the event is made:** the points for each match type, and how matches are won, including **Stableford
   totalled across the holes** as well as hole by hole.
5. **Seasons and one-offs** both get all of this.
6. **Team colours:** only colours that show up clearly on the navy background.

## How matches are won (chosen once per event)

The event's format, as now plus one:

| Format | Four-ball | Singles | 3-ball |
|---|---|---|---|
| Better ball · off the low (`bbl`) | as now | handicap match play off the low (`kos`) | pair's better net v single's net, off the low |
| Better ball · Stableford (`bbstab`) | as now | Stableford match play off the low (`sm2`) | pair's better points v single's points, hole by hole |
| Better ball · scratch (`bbscr`) | as now | scratch match play (`sc2`) | pair's better gross v single's gross |
| **Stableford total (`stabtot`)** — new | pair's better-ball points over the day's holes v the other pair's | each player's points total | pair's better-ball points total v single's total |

- Hole-by-hole formats are match play over the day's holes (`matchProgress(winners, holes)`), so "3&2" etc. work
  for a 12-hole day too.
- Stableford total uses full playing handicaps (each player's own shots, not off the low), the event's Stableford
  allowance. It's decided when both sides have played all the day's holes; while playing it shows the running totals
  ("Blues 21 – 18 thru 9"); level at the end = halved.

## Points (set at setup, adjustable per match day)

- Event defaults, set when the event is made (the organiser can change them any time; a change only affects match days
  added after it):
  four-ball win **1**, singles win **1**, 3-ball **pair win 1**, 3-ball **single win 2**.
- Halved: each side gets **half its own win points** (four-ball/singles: ½ each; 3-ball default: pair ½, single 1).
- Each match day starts with the event's points and can be changed for that day (e.g. the last month worth 2 a
  four-ball). The day's points are kept with the day; changing the event's defaults later doesn't change days
  already set up.
- The season/event score adds the points. "To win" = half the total points available + a half-point, as now.

## Holes per match day

- Each match day has a number of holes, **default 18**, any of **6, 9, 12, 14 or 18**; played from hole 1.
- Handicaps for that day are scaled: playing handicap × holes ÷ 18, rounded (so 18 → 12 shots over 12 holes), then
  shots given by stroke index among the holes played (the lowest indexes on those holes first).
- Only the first N holes of each card count for the match; holes after that are ignored for the event.

## Adding a match day: the guided flow

From the board's **+ Add a match day** (organiser/admin), and the editor's Match days step, one screen at a time:

1. **Date** — today on, inside the season (one-off: one of its 1–3 days without matches yet).
2. **Who's playing** — both teams listed with ticks (everyone ticked to start); untick who's out.
3. **Matches** — buttons to add a **Four-ball** (2 v 2), **Singles** (1 v 1) or **3-ball** (2 v 1, either team's
   pair) from the players ticked, or **Draw** (fills four-balls, then a 3-ball from three left over across the teams,
   then a singles); swap/remove as the editor does now. Players not in a match are listed as sitting out.
4. **Holes** — 18 / 14 / 12 / 9 / 6.
5. **Points** — the event's points for each match type used that day, editable for this day; shows
   "N matches · M points available today".
6. **Confirm** — a summary of all the above, then **Add match day**.

Editing a day that hasn't started reopens the same steps with its values. Started/past days stay locked (as now).

## Board: match day drop-down

- Top: the event score card (as now, with points).
- Then a **drop-down of match days** ("Sat 24 Oct · 3 matches · 12 holes", with "(today)"/"(next)" marked), defaulting
  to today's match day, else the next one, else the latest played. Choosing a date shows that day's matches only
  (each card says Four-ball / Singles / 3-ball and its points). Switching days is a view-only redraw (no server).
- Seasons and one-offs both use it (it replaces the one-off's day tabs).

## Team colours you can see

- Team colours come from a fixed palette, all clearly visible on the navy background (contrast ≥ 3:1 against the
  app's navy): Red `#E5484D`, Orange `#F2994A`, Gold `#E8C547`, Green `#46C37B`, Teal `#2FC4C4`, Sky `#6CB6FF`,
  Pink `#F06FA8`, Lilac `#B79CFF`, Silver `#C9CED6`, White `#F4F4F2`.
- The editor offers these as swatches instead of the free colour picker (events and league teams). New events default
  to Sky v Red.
- Colours already saved that aren't in the palette (e.g. Ballymena's Blues `#19335a`) are shown as the nearest
  palette colour everywhere; saving the event stores the palette colour.

## Data

- `events.points jsonb` (event defaults: `{ "four": 1, "singles": 1, "threePair": 1, "threeSingle": 2 }`), and
  `events.day_rules jsonb` (`{ "<day>": { "holes": 12, "points": { … } } }`, a day with no entry = 18 holes and the
  event's points). Existing events: defaults (1 point, 18 holes), so results don't change.
- A 3-ball is a match with two players on one side and one on the other (`{ a: [x, y], b: [z] }` or the reverse).
- `fmt` allows `stabtot` for four-ball team match play.
- `save_season` (and the one-off save) accept the new shapes and check: a 3-ball is 2 v 1; holes in the list above;
  points are numbers from 0 to 10 in halves; started days' `day_rules` don't change (as their matches don't).
- `enter_event_round` unchanged (a player in any match that day can count their card).

## Testing

- Unit: 3-ball in each format (pair wins, single wins, halved → points), Stableford total (in progress, decided,
  level), a 12-hole day (scaled shots, only holes 1–12 count, "3&2" over 12 holes), points per day overriding the
  event's, the score's points total and "to win", the draw with 3-balls, the nearest palette colour.
- Database: `save_season` accepts a 3-ball / 12 holes / points and refuses 3 v 1, 11 holes, points of 15, changes to
  a started day's rules.
- Journeys: the add-a-match-day flow end to end (players → matches incl. a 3-ball → 12 holes → points 2 → confirm →
  the board's drop-down shows it), a one-off event with a 3-ball, the colour swatches (no free picker).
- End-to-end: existing journeys still pass; Ballymena's score unchanged.

## Not in this

- Foursomes / greensomes (alternate shot).
- Choosing which holes a short day uses (always from hole 1).
- Per-match (rather than per-match-type) points.
