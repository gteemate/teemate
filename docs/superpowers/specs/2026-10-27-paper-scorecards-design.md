# Paper scorecards — design

**Date:** 27 Oct 2026 · **Status:** for review
**Demo:** `docs/paper-scorecards-mockup.html` (published at https://claude.ai/artifact/LcjU6n4pefMLSFLRcu59QS)

## Why

Some members, often older ones, like leaving their phone in the bag and playing on a paper card. This feature lets
them do that and still have the round count. After the round, one person photographs the group's paper cards. The
app reads the scores, the uploader checks every player, and a playing partner or the club office confirms the
uploader's own score.

Typing scores in as you play stays the main way. That's what feeds the live leaderboard, so the photo is a small
alternative and not the default.

## What stays the same

- Scoring, handicaps, open holes, competitions and the leaderboard are unchanged. A paper card ends up as an ordinary
  card with its scores entered, exactly as if it had been typed in.
- Nothing is saved until a person has checked every score.
- If reading fails, the member types the scores in by hand as now.
- Cards typed in on a phone get no confirmation step. Confirmation is only for paper cards.

## The flow (as in the demo)

1. **Office switch.** The office has a **Paper scorecards** On/Off setting on its Club page, and it's off to begin
   with. While it's off, nothing below appears anywhere.
2. **The way in.** On the Scores screen for today's card, when it has no scores entered yet:
   - **Enter scores hole by hole** stays the main gold button, with the line "Scores entered as you play show on the
     live leaderboard".
   - Underneath is a small link: "Played on paper? Photograph your card instead".
3. **Take the photo(s).**
   - The first time, an example card is shown. It's drawn like a real card: holes down the side, Par, SI, and Score
     columns A and B, with OUT, IN and TOTAL.
   - Tips: lay the card flat in good light; get all 18 holes and the totals in; a four-ball has two cards, so
     photograph each one.
   - The member takes a photo, or chooses one, for card 1, then card 2. "Only one card" covers a two-ball.
   - The photo is taken with the phone's camera through the normal web file picker (`<input type="file"
     accept="image/*" capture="environment">`).
4. **Names cut off on the phone.** After each photo, the screen "Are all the scores in the box?" shows the card with a
   box around the score grid. Everything outside the box (names, handicaps, signatures, the date) is greyed out.
   - The member drags a corner if the box is in the wrong place, then taps "Yes, all the scores are in the box".
   - Only the part inside the box is cropped (on the phone, with a canvas) and sent. A note says: "🔒 Names stay on
     your phone. Only the scores inside the box are sent to be read."
   - The box starts where it was last time on this phone, or else a sensible inset. Cards at one club are all the
     same layout, so after the first time it's usually right without moving.
5. **Reading.** A spinner, then: how many Score columns were found, that the par column matches this course, that
   each column has OUT, IN and TOTAL, and how many scores were hard to read.
   - If the photo can't be read (blurred, not a scorecard, the par column doesn't match), it says so and offers
     Retake or "Enter scores by hand".
6. **Which column is who.** Each Score column ("Card 1 · column A · Out 41 · In 44 = 85") gets a dropdown of the
   players on today's card, plus "Skip this column". It's guessed from the order of the players on the card. Two
   columns can't be set to the same player, and the uploader must be one of them.
7. **Check each player.** One player at a time, the uploader's own column last:
   - A hole-by-hole grid; tap a score to change it with a number pad.
   - Holes the reader wasn't sure of are amber.
   - The OUT and IN written on the card are compared with the holes ("In: the holes add up to 43, but the card says
     44").
   - Only the card's open holes are asked for (an open-holes event reads only those holes).
   - Each player's check ends with "Pat's scores are right".
8. **Who confirms your score.** The players on the card who use the app, plus **The club office** ("Hand your card in
   at the office: they check it against the photo"). Players who don't use the app are greyed out. Then Save.
9. **Saved.** The scores go onto today's card as entered by the uploader:
   - The other players show "✓ Confirmed by Alex".
   - The uploader shows "Waiting for Chris" (or "Waiting for the office").
10. **Confirming.**
    - **A player:** a "Please confirm a score" notice in the app's alerts drop-down shows the score, Out and In, a
      "See the holes and the photo" link, and **Not right** / **Confirm**.
    - **The office:** a "Scores to confirm" list on Office → Today shows the cropped photo, with that player's column
      highlighted, and **Not right** / **Confirm**.
    - **Not right** asks for a short note, such as "Hole 14 was a 6". The note goes back to the uploader's card, where
      they re-check their own scores and send it again to the same confirmer.
11. **Finished card.** Every score shows who confirmed it, with "Read from paper · See the photo of the card".

## How it's built

### The reader (new: the app's first server function)

- **A Supabase Edge Function, `read-scorecard`** (Deno, TypeScript, using the official `@anthropic-ai/sdk`).
  - The Anthropic key is a Supabase secret (`ANTHROPIC_API_KEY`) and is never sent to phones.
  - Only signed-in members can call it, and only while the club's setting is on.
- **Input:** one or two cropped JPEGs (scaled on the phone to at most 1568px on the long edge), today's par for each
  hole, the card's open holes, and how many players are on the card.
- **The call:**
  - Model `claude-opus-5-5`, with the image as a base64 `image` block, effort `low` (reading a grid isn't hard
    reasoning), and server-side refusal fallbacks (`fallbacks: "default"`).
  - It asks for a structured result (`output_config.format`, JSON schema), so the reply is always well-formed.
- **Output:**
  - Per card, the Score columns, each with 18 holes of `{ score: number|null, sure: boolean }` plus the written
    `out`, `in` and `total` (or null).
  - Whether the printed par column matched the par the app sent.
- **Cost:** about 1–2p per card at Claude Opus 5.5 prices ($4 / $20 per million tokens). One image is a little over
  a thousand tokens in, and a few hundred come out.
- **A daily limit:** each member gets at most 10 reads a day, so a mistake or misuse can't run up a bill. It's
  counted in a small table that the function writes.
- **Checks done in the app, not by the AI:** the totals comparison, the amber holes, and the matching. The reader
  only reports what it sees.

### Photos

- **Storage:** a new private Supabase Storage bucket, `scorecards` (the app's first file storage). It keeps the cropped
  grid only, never the full photo, at `<round id>/<card n>.jpg`.
- **Who can see them:** the players on that card and the club office (admins).
- **Removal:** photos are deleted when the round is deleted.

### Database (test first, then live)

- **`club_settings`:** a `paper_cards boolean not null default false`, set through `admin_set_paper_cards(p)`, the same
  way as the fee setting (admins only).
- **`rounds`:**
  - `paper boolean not null default false` (read from paper).
  - `photos int not null default 0` (how many card photos are stored).
  - `confirms jsonb`, keyed by player in the card's player order:
    `{ by: memberId | 'office', state: 'confirmed' | 'waiting' | 'sent_back', note?: text, at: timestamptz }`.
- **Functions:**
  - `save_paper_card(...)` saves the scores and `confirms` in one go.
  - `confirm_paper_score(round, player)` and `send_back_paper_score(round, player, note)` can be used only by the
    chosen confirmer, or by an admin when the office was picked.
  - `resend_paper_score(round)` can be used only by the uploader, after a send-back.
  - Each has an SQL test.
- **`read_counts`** (member, date, n) holds the daily limit. Only the function writes to it.
- **Device cache:** every new write function gets a rule in `src/api/cache-rules.js` (changes 'rounds'; the setting
  changes 'club').

### App code (new files kept small)

- **`src/paper/`:**
  - `crop.js`: the box, corner dragging and canvas crop. It's pure apart from the canvas.
  - `reading.js`: calls the function and turns its reply into columns, the amber holes and totals checks. This part is
    pure and unit-tested.
  - `paper-flow.js`: the screens from photo to saved.
- **Changes elsewhere:**
  - The Scores screen gets the small link.
  - `alerts.js` / `alert-bar.js` get the confirm notice.
  - Office → Today gets "Scores to confirm".
  - Office → Club gets the switch.
  - The finished card shows who confirmed each score.

### Testing

- **Unit tests:** reading the reply (columns, unsure holes, totals mismatches, open holes, a missing column), matching
  rules, and the crop maths.
- **Journeys on the pretend server:** the full flow with a canned reading, including the office switch off, two cards,
  a duplicate column, fixing an amber hole, a partner confirming, the office confirming, Not right and resend, and the
  daily limit being hit.
- **SQL tests:** only the chosen confirmer or the office can confirm; the uploader can't confirm themselves; the setting
  is admins only; the photo bucket is visible only to players on that card and admins.
- **One real reading** of the photo you sent (Angus Oliver, 22 April 2025), run against the test project before
  release. Expected: 6 6 4 5 4 3 8 6 4 = 46, then 6 5 5 3 6 5 3 6 4 = 43, total 89.

### Setting it up (needs you)

- An Anthropic API key, stored as a Supabase secret on test and live.
- Deploying the function with the Supabase CLI, which needs the access token in note.rtf. I'll ask before using it, as
  always.

## Decided

- **Who confirms the uploader's score:** a player on the card who uses the app, or the club office.
- **Names never leave the phone:** the cropped score grid is all that's sent or stored.
- **Photo entry is the smaller option:** typing scores as you play stays the main way.

## Left out (not in this version)

- Reading names, handicaps, the marker column or match-play points from the card.
- Finding the score grid automatically. The member confirms the box instead.
- Paper cards for a round that already has some scores typed in.
- Guests on a paper card. Their columns can be matched and checked like anyone else's, but they can't confirm
  anything.

## One question for review

**Does the uploader's score count before it's confirmed?** I've assumed yes: it shows on leaderboards straight away,
the same as a typed card, with a small "awaiting confirmation" mark. The alternative is to leave it off competition
results until it's confirmed. That's stricter, but it could leave a score missing if the confirmer never opens the
app.
