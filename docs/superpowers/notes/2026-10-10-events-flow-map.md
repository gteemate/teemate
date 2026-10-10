# Events: how they flow today, and what to tidy

10 Oct 2026. This is a map to think over before we design anything; nothing here is built yet.

## How it works today

| | Winter League | Club events and player events (Ryder Cup, team Stableford, individual) |
|---|---|---|
| **When you play** | Any day of each week, with anyone | Fixed dates (1–3 days) |
| **Pairings** | None. Each player's best scores count for their team | Ryder Cup: drawn matches (pairs v pairs) for each day. Others: no pairings |
| **How a round counts** | When a card starts: "You're entered in these competitions. Make this a scoring round?" Tick the league | The same question, offered whenever **anyone** on the card is in the event |
| **Booking** | You book a tee time as normal | You book as normal. Nothing links the match to the booking |
| **Seeing it** | Competitions → the event's board | Competitions → board: overall score, then each match's status only |

The "play any day" behaviour is built into the **League** type, so no other event can use it.

## What you asked for

### 1. "Play any day" as a setting on any event
- When starting an event, a setting covers **when rounds can be played**:
  - **On set days** (as now: 1–3 dates), or
  - **Any day**, either within a window (e.g. each week for 10 weeks, like the Winter League), or by a deadline (e.g. "play your match by 30 Nov", like a club knockout).
- The Winter League becomes "Teams · best scores · any day each week" rather than a type of its own. It works exactly as now.

### 2. Only ask "count this round?" when the right people are playing
The question appears only when the card has everyone the event needs:

| Event | Who has to be on the card |
|---|---|
| Ryder Cup match (pairs v pairs) | All four players in **your** match |
| Singles match (1 v 1) | Both players |
| Individual or team Stableford | Just you |
| Winter League | You (plus at least one other player to mark your card, if the league needs it) |

- When the right people **are** all there, I'd tick it automatically, with "Counts for Christmas Cup · Match 2" shown and an option to untick, rather than asking.
- When they aren't, nothing is offered for that event, so there are no half-counted matches.

### 3. Tap your match → book it, or start scoring
On the event's board, your own match gets a button, and TeeMate checks for a tee time that day with all of you on it:
- **No tee time yet:** the button says **Book this match**. It opens the tee sheet on the match day (or today, for an "any day" event) with all the match's players already added, so you just pick a time.
- **A tee time where only some of you are booked:** **Add the rest to your 08:10**, which adds the missing players to that booking, where there's space.
- **A tee time with everyone on it:** on the day, **Start scoring** opens the scorecard for that tee time, already counting for the match. Before the day, it shows "Booked: Sat 08:10".

### 4. A page for every match, even ones you're not in (like your picture)
Tap any match on the board to open its page:
- **Top:** Match 1, each pair's names and team colours, the status ("Not started · Tee 12:00", "2 up thru 7", "Won 3&2"), and initials instead of photos.
- **Match summary:** holes 1–18 with the match state after each (AS, 1 up, 2 dn), and the current hole highlighted.
- **Scorecard:** Out and In, with Par, SI, each player with their handicap, the dots for shots received, and their scores.
- It's **read-only** unless you're in the match. If you are, there's an **Enter scores** button that takes you to your scorecard.
- It updates as the players save holes.

## Other things that don't flow well (for you to think about)

1. **The draw isn't announced.** Players aren't told who they're drawn with. *Idea:* an alert drops down, "You're in Match 2 with Peter Reid v Cochrane/Trimble, Sat", with Book this match.
2. **Matches split across tee times.** If the four players of a match end up in different four-balls, nobody's card has all of them, so the match can't be scored. *Idea:* when booking a match, keep all its players together. Warn if someone in a match is booked elsewhere that day.
3. **Handicaps move during an event.** Matches use each player's current handicap, so a handicap change midway through a multi-day or any-day event changes the shots. *Idea:* lock handicaps when the event starts. Admins can update them if needed.
4. **Unplayed matches.** There's no way to concede, halve or rearrange a match that didn't happen. *Idea:* the organiser can set the result ("Conceded", "Halved: not played") or move the match to another day.
5. **Who confirms a result.** Today the board is "live" from the cards and never marked final. *Idea:* when the last hole is saved, both sides see "Match over: confirm the result" (one tap). Admins can correct it.
6. **Entering versus counting.** You can enter a competition (Competitions → Open), then also have to tick each round. With item 2's auto-tick, entering would be the only step for paired events.
7. **Where events live.** Player events sit in Account → Events and club events in Club admin, but both appear in Competitions. *Idea:* one **+ New event** in Competitions, with "Club event" as an admin-only option.
8. **Singles (1 v 1) matches** aren't a type yet. Ryder Cup is always pairs. *Idea:* an "Individual matches" type, drawn or chosen, which also suits club knockouts.

## Questions before a design
1. **Any-day events:** should "any day" allow a deadline-style event (play your match by a date) as well as weekly rounds?
2. **Winter League marker:** must a league score be played with at least one other member?
3. **Tee time missing:** for a match with no tee time, should **Book this match** book for all four players at once (one of you books everyone, as with booking a friend), or send the others an invitation?
4. **Which "other things" (1–8) matter most,** and which should wait?
