# Find a time: arranging a knockout match

The design was approved from the clickable demo on 27 Oct 2026 (https://claude.ai/artifact/RLkcyRu8yHSd4BqDxatbCV).

## Why

Knockout matches have a play-by date, and the players arrange them among themselves by text and phone today. Find a
time puts that in the app, Doodle-style, and kept simple:
- someone suggests days with a part of day;
- everyone ticks what they can do;
- when everyone can, they book a tee time that day.

## Which matches

Knockout matches that are still to be played (open or disputed) and have both sides drawn. That covers club knockouts,
knockouts members set up themselves, and a league's knockout, in both singles (2 players) and pairs (4 players).
Team-event matches have their own fixed match days, so they aren't included.

## What players see

1. **Your next match** (on the knockout's page) gets **Find a time** beside Book this match.
2. **When suits you?**
   - Days from today up to the round's play-by date. If the round has no date, the next 21 days.
   - Each day has **Morning · Afternoon · Evening** to tick, up to 6 at a time.
   - **Send to …** names the other players.
   - The person suggesting counts as ✓ for each of their own suggestions.
3. **The other players are told** with the usual drop-down notice: "Peter suggests times for your Mixed fourball
   match", with **See the times**.
4. **Who can do which?**
   - A grid with each suggestion (day and part of day) down the side and each player across. You tap your own
     column: ✓ (can), then ✕ (can't), then blank.
   - Suggestions are listed by date, and a day that has passed drops off.
   - **Suggest other days** adds more to the same grid. A match has at most 12 suggestions on the go.
5. **Everyone can.** When all the players have ✓ on one suggestion:
   - the row turns green, with "Everyone can do Sat 31 Oct · morning";
   - everyone gets the notice "Everyone can do Sat 31 Oct · morning: book a tee time";
   - **Book a tee time** opens the tee sheet on that day with the other players ready to add, the same as Book this
     match. A club singles match holds the four-ball, as now. A day not open for booking yet becomes a tee time
     request, as now.
6. **A reminder.** With 7 days or fewer to the play-by date, no agreed suggestion and no booking, each player sees "Your
   Mixed fourball match isn't arranged yet: play by Sun 15 Nov", with Find a time. It shows once a day.
7. **On the match card**, once there are suggestions: "Find a time: 2 of 4 have answered", or "Everyone can do Sat 31
   Oct · morning".

## Rules (the database enforces them)

- Only players in the match can suggest or answer. The club office can see the grid but not answer.
- A suggestion's day must be from today up to the round's play-by date (or 21 days ahead if there isn't one). The part
  of day is morning, afternoon or evening.
- At most 12 suggestions per match. The same day and part of day can't be suggested twice.
- Suggestions and answers go when the match gets a result, or when its players change (a redraw). Answers are tied to
  the player.
- Members see the grid only for matches they're in.

## How it's built

**Database** (one migration):
- `match_times(id, ko_match_id, day, part, suggested_by, created_at, unique(ko_match_id, day, part))`
- `match_time_answers(time_id, member_id, can boolean, primary key(time_id, member_id))`
- `booking_notices` kinds gain `times` and `agreed`, carrying the match's competition name and the day and part.
- Functions:
  - `suggest_match_times(p_match, p_times jsonb)`: records the suggester's ✓ and tells the other players.
  - `answer_match_time(p_time, p_can boolean or null)`: when that makes a suggestion agreed, tells everyone.
  - `get_match_times(p_match)`: the players, the suggestions and the answers.
- The reminder is worked out in the app (from my open matches, their play-by dates, any agreement and any booking), so
  no scheduled job is needed.

**API and app:**
- `suggestMatchTimes`, `answerMatchTime` and `getMatchTimes`, all in the pretend server too.
- A new screen, `src/screens/find-time.js`, for the suggesting step and the grid.
- Find a time on the knockout match card, notices in `alerts.js`, and the reminder.

## Testing

**Database tests:**
- only players can suggest or answer;
- a day must be within the round;
- at most 12 suggestions, and no duplicates;
- the suggester counts as ✓;
- the others are told;
- the last ✓ makes it agreed, and everyone is told;
- a result clears the suggestions;
- members see only their own matches.

**App tests:**
- suggest 3 slots and send;
- answer as another player;
- all ✓ shows "Everyone can do" and Book a tee time, which opens the tee sheet on that day with the players added;
- Suggest other days;
- the notices;
- the reminder near the play-by date.

**Also:** journeys for every refusal, and feature register entries.

## Not included

- "Maybe" answers, chat, and syncing with calendars.
- Team-event and league-week matches.
- Picking exact tee times in the grid. The day and part of day is chosen first, and the time is booked from the tee
  sheet.
