# TeeMate restyle — design

Date: 2026-10-09 · Mock-up: `mockups/restyle.html` (https://claude.ai/artifact/MvqmJX7tocAxjMuMhyNWAk, version 13)

## Goal

A calmer, club-badge look (navy, gold, a maroon-ringed cream disc, serif headings) and a simpler
layout: Home is the hub, Competitions gathers every competition in one place, and a round is just
the scorecard. **Every function TeeMate has today keeps a home.**

## Decisions (agreed in chat, all shown in the mock-up)

- Navy for everyone (no light mode). Club colours: main colour takes the navy's role, accent colour is
  the disc ring; gold is fixed and means "needs you".
- Type: Source Serif 4 (headings, numbers that matter), Source Sans 3 (everything else).
- **No section tab bar.** Home's four tiles and each screen's back arrow are the way around.
- **Home**: the date, the disc (name, club, handicap index, GUI; tap → Account), four tiles (Booking,
  Competition, Friends, Scoring; a tile glows gold when something needs you), a **Next up** card and
  any "Needs you" card. No second page, no Edit.
- **Account**: a shareable handicap card (QR of name, club, handicap index, GUI as text; **Share** opens
  the phone's share sheet with the text and the QR picture; **Copy details**), then bookings, guest
  points, my games, club admin, password, sign out.
- **Booking**: your bookings first (coming up, with who's playing; requests later), **+ Add a booking**
  → the tee sheet (release banner and countdown as now) → players & guests → booked. Each booking opens
  its details (add a player or guest, delete / withdraw).
- **Competitions**: tabs **Entered** (what you're in now: position, progress, a way to its board),
  **Open**, **Events** (invitations to answer, events set up by players, yours), **History** (finished,
  with your result); **+ Create your own event**. Boards: league, match, event.
- **Starting a round**: **New round** shows today's tee time → tap → **Scoring round?** ("You're currently
  entered in these competitions. Do you want to make this a scoring round?", tick or leave for general
  play) → **Start round**. No tab bar on these two pages.
- **In a round** the only bar is **Score · Leaderboard · Course**; **Leaderboard only when the round
  counts for a competition**. Score keeps today's scorecard: the 18-hole row with results under each hole,
  one small status line ("You & Reid 1 up thru 6 · game"), players and steppers, Save hole, then the
  **Game** drop-down (with pairs, players & shots) at the bottom. Course keeps today's guide: hole row with
  flag colours, tee yardages, Hole / Approach pages, today's pin.

## Where today's screens go

| Today | New home |
|---|---|
| Tab bar (Home · Scores · Leaderboard · Course) | Removed; Home tiles + back arrows |
| Home | Home (disc + tiles + Next up) |
| Account (old Admin) | Account, with the QR card first |
| Book tee times, booking, booked | Booking → + Add a booking |
| Bookings | Booking (first layer); also from Account |
| Buddies | Friends |
| Leaderboard: today's field | Competitions → Entered, a "Today at the club" card → today's field board |
| Leaderboard: events | Competitions → Entered / History → its board |
| Events (player-created), event editor | Competitions → Events; + Create your own event |
| Club events & leagues (admin) | Account → Club admin (unchanged screens, new look) |
| Player events (invite pop-up, counter-offer, live board) | Competitions → Events → invitation screen; Entered → match board |
| Scores: start card / pick players | Scoring → New round (tee time; "Pick players instead" kept) |
| League "Count today's round?" sheet + badges | Scoring round? page; badges stay on the card |
| Scores: scorecard, game menu, pairs, guest handicaps | Round → Score |
| Course tab | Round → Course; also Account → Course guide (outside a round) |
| Guest points, My games, Pins, Members & access, Booking rules, Club name & colours | Account (club admin where admin-only) |

## How it's built

- **Theme first**: new tokens in `styles.css` (night, navy, card, line, gold, maroon, cream, ink,
  muted), fonts, cards, buttons, segmented tabs, headers with a serif title and back arrow. Club colours
  (`theme.js`) map main → navy role, accent → ring. Every existing screen picks the look up from the
  tokens, so stage 1 restyles the whole app before any layout changes.
- **Routing**: no tab bar; one navigation stack (`S.view`, back = previous screen) replaces the
  tab/aview pair, introduced alongside the old one so screens move across one stage at a time.
- **Round bar**: shown only on the three round screens; Leaderboard appears when today's card counts for a
  league week or an event the player is in.
- **QR**: the `qrcode-generator` package (small, no dependencies) from npm; **Share** uses the Web Share
  API with the text and a PNG of the code, falling back to Copy where a phone can't share files.
- Logic stays where it is (`api/*`, `scoring.js`, `event-scoring.js`, `card-view.js`, `home-today.js`);
  screens are re-laid out, not re-written from scratch. All 148 tests keep passing; new pure functions
  (Home's Next up choice, whether a round has a leaderboard, the Competitions lists) get tests first.

## Stages (each goes live on its own; the app works between them)

1. Theme: tokens, fonts, components; every screen in the new colours.
2. Navigation: the stack, back arrows everywhere, tab bar removed; Home = disc + four tiles + Next up.
3. Account with the QR card and Share.
4. Booking: your bookings first, + Add a booking, booking details.
5. Competitions: Entered / Open / Events / History, boards, invitation screen, create.
6. Scoring: New round → Scoring round? → round with Score / Leaderboard / Course.
7. Friends, and a final pass over every admin screen.

## Testing

- `npm test` green at every stage, plus tests first for: Next up choice, round-has-leaderboard rule,
  Competitions lists (entered / open / events / history), share text.
- Each stage drawn in the preview with sample data at 375 and 320 px; the user checks it live on a phone
  before the next stage.

## Questions to settle before building (also asked in chat)

1. **Open tab**: today members can't enter club competitions themselves (admins add entrants). Show
   upcoming club competitions for information, or add self-entry (new)?
2. **Events on Scoring round?**: events count automatically today (no entry step); leagues need ticking.
   Show events as ticked and locked ("counts automatically"), or only list leagues?
3. **QR**: name, club, handicap index and GUI only (no email or phone)?

## Not in this change

Request a tee time (its plan is ready; built next, in this style); light mode; scanning a QR inside
TeeMate to add a playing partner.
