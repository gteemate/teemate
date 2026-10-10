# Event matches: a page for every match, book or score your own, count only when your match is together

Date: 10 Oct 2026. This is part 1 of 3 of the events tidy-up (see `docs/superpowers/notes/2026-10-10-events-flow-map.md`).
Part 2 adds the set-up options (when played, 1 or 3 matches per four-ball, hide the draw, lock handicaps). Part 3
adds results (concede, rearrange, confirm).

Applies to events set up in advance that have **drawn matches** (Ryder Cup style today: pairs v pairs, by day).
The quick on-the-day player events and team/individual Stableford events are unchanged, except for item 3.

## 1. A page for every match

Tapping a match on the event board opens **Match N** (aview `match`; it uses `S.evId`, `S.evDay` and `S.matchNo`).
Back returns to the board.

- **Header card:**
  - "Match 2" with each pair: initials in team-coloured rings and surnames (A on the left, B on the right).
  - Between them, the status: "Not started" plus "Tee 12:00" when booked; "2 up · thru 7" with ● live; "Halved"
    or "Cochrane & Trimble won 3&2".
- **Match summary:** holes 1–9 and 10–18 as numbered circles, with the match state after each hole underneath
  (AS, "2 ▲" in the colour of the side that's up, or – when not played). The hole being played is highlighted.
- **Scorecard:** Out (1–9) and In (10–18) tables with rows for Par, SI and then each player (surname, playing
  handicap). A cell shows the gross score, with dots for the shots that player gets on the hole, and holes the
  player won are tinted. Totals are at the end.
- **Your match:** shows the action from section 2. **Another match:** read-only, with no buttons.
- It updates when you open it or come back to it, as the board does.

## 2. Your match: Book it, add the rest, or start scoring

On the board, **your** match is marked "Your match" and shows one action. The same action appears on its page. It
comes from the match day's tee sheet (who is booked where):

| What the tee sheet shows that day | Action |
|---|---|
| None of the four booked | **Book this match**: the tee sheet for that day with the other three added to your booking, ready to pick a time |
| You're booked; some of the others aren't booked anywhere; your tee time has room | **Add the rest to your 08:10**: your tee time's booking screen, with the missing players added |
| All four in one tee time, on the day | **Start scoring**: the scorecard for that tee time, counting for this match (section 3) |
| All four in one tee time, before the day | "Booked: Sat 08:10" (no button) |
| Split across tee times, or no room | A warning: "Your match needs all four in one tee time. Peter Reid is booked at 09:10." No button |

- Booking for all four at once uses the existing booking flow (you book your friends in). Release rules apply as
  usual: before tee times open for that day, the tee sheet says when they open.
- Guests aren't part of drawn matches.

## 3. Count a round only when your whole match is on the card

- For an event with drawn matches on a given day, **Scoring round?** offers it only when **all four players of
  your match** are on the card. When they are, it's **ticked already**, shown as "Christmas Cup · Match 2", and
  you can untick it.
- Ticking enters the match's players on that card (the existing `enter_event_round`). Nobody else on the card is
  entered.
- Events without drawn matches (team or individual Stableford, and leagues) work as now.

## 3b. Needs a marker (Winter League and standard competitions)

Agreed 10 Oct: a round counts for a **Winter League** or a **standard competition** (individual or team
Stableford) only when there is **at least one other player on the card** to mark it. That player can be anyone on
the card, member or guest.

- On "What does this round count for?", these competitions are offered only when someone else is on the card. On
  your own, they're not offered.
- With exactly one other player, they're your marker automatically ("Marker: Peter Reid").
- With two or more, a **Who's marking your card?** choice appears under the ticked competition (one per
  competition is overkill, so one marker covers all the competitions ticked on this card). It's required before
  **Start round**.
- The marker is stored with the entry: `league_entries.marker` and `event_entries.marker`, as `{m: memberId}` or
  `{g: guestId}`, set through the existing entry functions with a new optional parameter. It must be someone on the
  card other than me. Part 3 uses it to confirm the score.
- Matches (section 3) need no marker: the other side marks you.

## 4. Code

- `src/match.js` (pure, tested):
  - `myMatch(event, day, meId) → { no, a: ids, b: ids } | null`
  - `matchBooking(ids, sheet, meId) → { kind: 'none' | 'partial' | 'together' | 'split', slot?, missing?: ids, clash?: { id, time } }`
  - `holeStates(winners) → [{ hole, d }]` (the running state)
  - `cardRows(...)` for the scorecard table
- `event-scoring.js`: `ryderMatches` also returns each match's per-hole `winners` and players (id, name, team,
  gross, playing handicap). It's additive, so the board doesn't change.
- `round.js`: `countsForOptions` gains `meId`. For events with matches it returns the option only when my match is
  complete on the card, with `match` and `auto: true`. `screens/scoring-round.js` pre-ticks `auto` options.
- Screens:
  - `screens/match.js`: the new page.
  - `screens/event-board.js`: match cards open the page, and your match carries its action.
  - `screens/booking.js`: accepts players to add (`S.picked`) from the match action, as it already does for the
    booking page.

## 5. Testing

- `src/match.test.js`:
  - `myMatch`: in a match, not in any, and a different day.
  - `matchBooking`: all five rows of section 2, including a tee time with no room.
  - `holeStates`: AS, up, down, and a match won early.
- `src/round.test.js`: a match option only appears when all four are on the card (not for 3 of 4), and is
  pre-ticked; league and Stableford options need another player on the card; `markerChoices` (the others on the
  card) and the automatic marker when there's one.
- `supabase/tests/`: the marker is stored, and refused if it isn't on the card or is me.
- `src/event-scoring.test.js`: the new `winners` and player details per match.
- Preview with sample data: the board with "Your match" and its action in each state; a match page live, finished,
  and not started; read-only for another match.

## Not included (parts 2 and 3)

Any-day and deadline events, singles and 3-match four-balls, hiding the draw, locked handicaps, conceding,
rearranging, and confirming results.
