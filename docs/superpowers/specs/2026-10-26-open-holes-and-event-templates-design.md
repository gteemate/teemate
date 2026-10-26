# Open holes for any event, and club event templates — design

Agreed with the user 26 Oct 2026.

## Part 1: Pick the holes that are open, with a tap for each hole

**What the user asked:** when setting up an event, tap each hole that's open, because the course might be playing, say,
holes 1–6 and 10–12. Every kind of event gets this.

### Where the picker appears
- **One-day and multi-day club events** (Individual, Team Stableford, one-off four-ball team match play), made in
  the club office or by members, in the event's details step. On a 2- or 3-day event the holes are picked once; each
  day can be changed on its own ("Day 2: change holes").
- **Each season match day** (Ballymena-style): the match-day flow's Holes step becomes the picker. It replaces the
  18/14/12/9/6 "from hole 1" chips. Days saved before this change keep meaning holes 1 to n.
- **League weeks**: the league has its holes, and each week can be changed on its own.
- **Knockout rounds**: for sign-up knockouts the club office sets the holes per round of the draw. A member-made
  knockout gets the same picker per round.

### The picker
- 18 hole buttons in a grid (1–9 on top, 10–18 below): tap to open or close a hole. Open holes are filled in, closed
  holes are dimmed.
- Quick buttons: **All 18**, **Front 9**, **Back 9**.
- A count under the grid, e.g. "9 holes open: 1–6, 10–12".
- At least one hole has to be open; the button to go on is disabled with "Open at least one hole" until one is.
- Anywhere the event is described (review step, cards in lists, leaderboards, office detail), a short line reads
  "Holes 1–6, 10–12" (nothing for all 18).

### Scoring on the open holes
- Only the open holes count. Holes that are closed are left out of every total: Stableford, net, match play,
  better ball, team totals, league rounds and knockouts.
- **Handicaps are scaled to the holes played**, as match days do now: the playing handicap × open holes ÷ 18,
  rounded. 18 shots become 6 over 6 holes.
- **Shots go on the hardest of the open holes:** the open holes are ranked by stroke index (1 = hardest of them), and
  shots are given by that rank. Plus handicaps give shots back from the easiest of them.
- Match play: "won when the lead is more than the holes left" counts open holes left.
- A round is finished when every open hole has a score.

### The scorecard
- When a card counts for an event (the round's Leaderboard tab already knows which), the card shows only the open
  holes, in course order, and goes from the last open hole of one run to the first of the next (6 → 10).
- A line on the card says "Holes 1–6, 10–12 today" so the group knows.
- A general round (no event) is unchanged: all 18.

### Storage
- `events.holes` (new, int[] or null = all 18): the event's open holes.
- `events.day_rules[d].holes`: a day's own holes. This accepts a list of hole numbers (new) or a number (old: holes
  1 to n). Day rules are allowed for every event type, not only team match play. For a league, `d` is the week.
- `signup_comps.round_holes` (new, jsonb `{ "<round>": [holes] }`) for sign-up knockouts. Member knockouts get
  the same on their own table.
- The database refuses a hole list that is empty, has a hole outside 1–18, or repeats a hole, with
  "Pick at least one hole, from 1 to 18."
- One helper (`src/open-holes.js`) turns any of these into the open holes. Every scorer is given the open holes, with
  stroke indexes re-ranked and handicaps scaled, so the scoring code itself stays as it is.

## Part 2: Club event templates, and repeating weekly

**What the user asked:** when the club office sets up a new event, give the option to make it recurring or save it
as a template, e.g. a turkey competition run on random days over Christmas.

### Save as a template
- The club office's event editor (club events and leagues made from the office) gets **Save as a template** on its
  review step, beside the usual save.
- A template keeps everything **except the date and the players**: name, type, scoring, open holes, points, who can
  see it, open to all or picked players, team names and colours.
- Templates are listed in Competitions under **Ready to run**, as sign-up competition templates already are.

### Run a template on a day
- Pick a template, then **Run on a day**: pick the date. The editor opens with the template's settings and that date,
  at the players step (or straight to review for an open-to-all event, where members enter themselves).
- Saving makes an ordinary event for that day. The template stays, ready for next time.
- A template can be changed (opens the editor without a date) or deleted.

### Repeat weekly
- On the review step of a new club event (or one run from a template), **Repeat weekly until** a date: one event
  is made for each week on the same day of the week, up to and including that date. Each is an ordinary event that
  can be changed or deleted on its own.
- Shown before saving: "Makes 6 events: Sat 6 Dec … Sat 10 Jan".
- Not for leagues (a league already runs over weeks) or seasons.

### Who
- Templates and weekly repeats are for the club office only. Members' own events are unchanged.

### Storage
- `event_templates` (new): id, name, setup (jsonb: the event's settings without date and players), created_at.
  The club office reads and writes them; members can't see them.
- Weekly repeat: made in the app as several events in one call (`api.saveEvents`), all or none.

## Testing
- Unit tests for `open-holes.js`: hole lists from each storage form, re-ranked stroke indexes, scaled handicaps,
  shots on a 6-hole and a 9-hole round, a plus handicap.
- Each scorer, on holes 1–6 and 10–12, against hand-worked totals: individual Stableford and net, team Stableford,
  four-ball team match play (match play and Stableford total), a season match day, a league round, a knockout match.
- Journey tests: the picker (tap, All 18, Front 9, Back 9, none open), the scorecard showing only open holes,
  saving and running a template, weekly repeat making the right dates.
- Database tests for the hole-list check and the template table's access.
- The pretend server follows the same rules.

## Not in this
- Templates for members' own events.
- Repeats other than weekly (fortnightly, monthly).
- Changing a general round's scorecard.
