# Journey tests: does a member ever get stuck, or is anything clunky?

Date: 11 Oct 2026. Status: design agreed in chat ("Yeah perfect").

## What and why

Several bugs were about **flow** rather than rules: back arrows that looped after booking, a tee sheet that didn't
filter, a screen you couldn't leave. These **journey tests** run the real app in a simulated phone browser
(happy-dom, under Vitest). A scripted member taps through whole tasks the way you would, with checks after every
tap. Agreed: run **simulated, on the Mac**, with no real database.

## How

- **A pretend TeeMate server** (`src/test/journeys/fake-api.js`) stands in for `src/api.js`. It's an in-memory
  club built from the sample data: members, course, tee sheet, bookings, requests, events (a league, a club
  competition open for entry today, a drawn Ryder-style cup), the hut menu and today's cards.
  - It acts like the server for what the screens need: booking takes the spaces, cancelling frees them, entries
    are recorded, orders appear on the staff list.
  - The server's rules are tested by the database tests, so they aren't repeated here.
  - Any app function the stand-in doesn't cover throws "not faked", so a gap fails loudly.
- **The clock** is fixed: Saturday 10 Oct 2026, 09:00. Timers are simulated, so the tests run in seconds.
- **The driver** (`src/test/journeys/driver.js`) loads `index.html` and the real `main.js`, then offers:
  - `tap('Booking')`: a visible button or link by its words. If it's missing, the test fails and lists what was
    on screen.
  - `back()`, `screen()` (the current title), and `type()` for inputs.
  - Counts of taps and screens visited.

## Checks on every journey

1. **Never stuck:** every screen has a back arrow or is Home, and `homeFromHere()` presses back until Home
   without repeating a screen (at most 10 presses).
2. **No errors:** no "Something went wrong", no unhandled errors, no "not faked" calls.
3. **Not clunky:** a tap budget per journey, and no screen visited twice unless the journey allows it.

## Journeys (taps budget)

1. Book a tee time with a friend (5).
2. Book with a guest from another club, using the filled-in guest form (7).
3. Delete a booking that has scores, with the warning and Delete booking and scores (4).
4. Request a tee time further ahead, then cancel it (7).
5. Book your match from the Christmas Cup board, then rearrange it (6, then 3).
6. Start a round from the tee time, count it for the Winter League with a marker, save holes 1–8, then order a
   bacon roll from the hut prompt (22).
7. Join today's club competition as you start (4).
8. Add a friend from a shared link (2).
9. Weather, then back Home (2).
10. Accept a match challenge from the alerts drop-down (1).
11. **Wander:** from Home, every tile and every button within two taps, each followed by `homeFromHere()`.

## Not included

Real-phone rendering, the real database (covered by the database tests), sign-in screens, and pixel-perfect
layout (covered by the preview checks).
