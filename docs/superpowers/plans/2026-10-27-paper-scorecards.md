# Paper scorecards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A group that played on paper photographs its cards after the round. The app crops off the names on the
phone, Claude reads the scores, the uploader checks every player, and a playing partner or the club office confirms
the uploader's own score.

**Architecture:**
- **Database:** new columns on `club_settings` and `rounds`, a few confirm functions, a daily read counter, and a
  private `scorecards` storage bucket.
- **Reader:** one Supabase Edge Function, `read-scorecard`, calls Claude with the cropped grid and returns the
  columns as JSON. Its request and reply logic lives in a plain JS `core.js`, so vitest can test it.
- **App:** new files under `src/paper/` (pure reading and cropping logic, plus the flow screens), small hooks into
  the Scores screen, alerts, Office → Today and Office → Club, and the pretend server for journeys.

**Tech Stack:**
- The app: Vite with plain JS, and vitest/happy-dom journeys on the pretend server.
- The database: Supabase migrations and SQL tests run by `scripts/db.mjs`.
- The reader: a Supabase Edge Function in Deno with `npm:@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-27-paper-scorecards-design.md` · **Demo:** `docs/paper-scorecards-mockup.html`

## Global Constraints

- **Copy:**
  - "Played on paper? Photograph your card instead"
  - "Scores entered as you play show on the live leaderboard"
  - "Are all the scores in the box?"
  - "🔒 Names stay on your phone. Only the scores inside the box are sent to be read."
  - "Yes, all the scores are in the box"
  - "Pat's scores are right"
  - "Who'll confirm your score?"
  - "The club office" / "Hand your card in at the office: they check it against the photo"
  - "Please confirm a score"
  - "Awaiting confirmation" / "Confirmed by Chris" / "Sent back"
  - "Scores to confirm"
- **Model:** `claude-opus-5-5`, effort `low`, structured output (`output_config.format` json_schema), server-side
  refusal fallbacks (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`).
- **Images:** only the cropped score grid leaves the phone, as a JPEG with its long edge at most 1568px. The full photo
  is never uploaded or stored.
- **Daily limit:** at most 10 reads a day per member. Refusal text: "You've read 10 cards today. Enter the scores by
  hand, or try again tomorrow."
- **The setting:** `club_settings.paper_cards`, off by default. While it's off, no paper UI shows, and the function
  refuses with "Paper scorecards are switched off at this club."
- **Counting:** an unconfirmed (or sent-back) score counts at once on leaderboards and in competitions, with a mark.
- **Delivery:** database changes go to test first (`npm run db:migrate`, `npm run db:test`), then live. Every new write
  function gets a cache rule (`changes('rounds')` or `changes('club')`).
- **Secrets:** the key is a Supabase secret, `ANTHROPIC_API_KEY`. Deploying uses the Supabase access token in
  note.rtf; ask the user before using it, and never commit it.

## Rulings on the spec (simpler, same behaviour)

- **Saving:** in place of a single `save_paper_card`, the app saves the scores with the existing `saveRound`, which
  already handles a new card, joining the group's card and merging, then calls `mark_paper_card`.
  - Why: it reuses the safe save path rather than duplicating it.
  - Cost if wrong: a crash between the two calls leaves typed-looking scores with no confirmation. It's visible and
    can be fixed by redoing the paper step.
- **Confirmation state:** in place of a per-player `confirms` jsonb, `rounds` gets four plain columns: `paper_by`
  (the uploader), `paper_confirmer` (a member id; null means the office), `paper_state` and `paper_note`.
  - Why: everyone except the uploader is confirmed by the uploader when the card is saved, so only one confirmation
    is ever outstanding.
  - Cost if wrong: if two uploaders per card were ever needed, the state would have to move to jsonb.

## Review Focus

1. **The office switches the setting off between the photo and Save.** The reading still saves, but the reader
   refuses new reads. Journey in Task 5.
2. **A sent-back score is fixed and resent,** then the confirmer confirms. The note is cleared and the mark goes. SQL
   in Task 1, journey in Task 6.
3. **The uploader picks someone, then that player is taken off the booking or card.** The office can still confirm
   any paper score. SQL in Task 1.
4. **The reply has a column with nulls (a blank B column) or a missing total.** The column is offered as "Skip", and
   no totals check is shown. Unit test in Task 4.
5. **An open-holes event.** Only the open holes are checked and saved; scores read for closed holes are ignored. Unit
   test in Task 4, journey in Task 5.

---

### Task 1: Database
**Files:**
- Create `supabase/migrations/20261028100000_paper_scorecards.sql`.
- Create `supabase/tests/paper_scorecards.sql`.
- Update `supabase/tests/data_versions.sql` if the stamp kinds change (they shouldn't).

**Produces:**
- **`club_settings.paper_cards`:** `boolean not null default false`. `get_theme()` adds `'paperCards'`.
  `admin_set_paper_cards(p boolean)` is admins only ("Only the club office can change this.").
- **`rounds`:**
  - `paper_by bigint references members`
  - `paper_confirmer bigint references members` (null = the office)
  - `paper_state text check (paper_state in ('waiting','confirmed','sent_back'))`
  - `paper_note text`
  - `paper_photos smallint not null default 0`
  - The select grant covers the new columns.
- **`mark_paper_card(p_round bigint, p_photos int, p_confirmer bigint)`:**
  - The caller must be on the round's lineup.
  - `p_confirmer` is null or another member on the lineup who isn't the caller.
  - Sets `paper_by` to the caller and `paper_state` to 'waiting'.
- **`confirm_paper_score(p_round)` / `send_back_paper_score(p_round, p_note text)`:**
  - Allowed for the chosen confirmer, or for `is_admin()` (always, whoever was picked).
  - The note is required, 1–200 characters.
  - Confirm sets 'confirmed' and clears the note.
- **`resend_paper_score(p_round)`:** `paper_by` only, and only when the state is 'sent_back'. Sets 'waiting'.
- **`my_paper_confirms()`:** returns the rounds waiting for me, plus, for admins, the rounds waiting for the office,
  as `{ id, date, paper_by, paper_photos, scores, lineup, game }`.
- **`paper_reads (member_id, day date, n int, primary key (member_id, day))`:** no grants.
  `take_paper_read() returns void` (security definer):
  - Refuses when `paper_cards` is off, with the copy above.
  - Refuses when n ≥ 10.
  - Otherwise increments the count for `club_today()`.
- **Storage:**
  - `insert into storage.buckets (id, name, public) values ('scorecards','scorecards',false)`.
  - Policies on `storage.objects` for bucket `scorecards`: select and insert when the first path segment is a round id
    whose lineup contains `current_member_id()`, or when `is_admin()`.
  - A trigger on `rounds` deletes that round's objects when the round is deleted.

**Steps:**
- [ ] Write the SQL test first. It must cover:
  - The setting is admins only.
  - `take_paper_read` refuses while the setting is off, then allows 10 reads and refuses the 11th.
  - `mark_paper_card` refuses a confirmer who isn't on the card, and refuses the caller themselves.
  - Confirm is refused for a third player, allowed for the chosen confirmer, and allowed for an admin when the office
    was picked.
  - Send back needs a note, and resend is allowed only for the uploader.
  - An admin can confirm even when a member was picked (Review Focus 3).
  - `my_paper_confirms` lists rounds for the confirmer and the office.
  - A member not on the card can't read the round's storage objects.
- [ ] `npm run db:test` FAIL → write the migration → `npm run db:migrate` → `npm run db:test` PASS → commit.

### Task 2: Data layer and pretend server
**Files:**
- `src/api/paper.js` (new), `src/api.js` (re-export), `src/api/cards.js` (`ROUND_COLS`/`toCard` carry the paper
  fields), `src/api/club.js` (`setPaperCards`), `src/api/cache-rules.js`.
- `src/test/journeys/fake-api.js`.

**Produces:**
- **`setPaperCards(on: boolean)`:** changes 'club'.
- **`readScorecard({ images: Blob[], pars: number[18], open: number[], players: number })`:** returns the reader's reply
  (Task 3's shape). It calls `sb.functions.invoke('read-scorecard', …)` with the images as base64.
- **`markPaperCard(roundId, photos, confirmerId|null)`, `confirmPaperScore(id)`, `sendBackPaperScore(id, note)`,
  `resendPaperScore(id)`:** each changes 'rounds'.
- **`uploadCardPhoto(roundId, n, blob)`:** stored at path `${roundId}/${n}.jpg`.
- **`cardPhotoUrl(roundId, n)`:** a signed URL that lasts 10 minutes.
- **`getPaperConfirms()`:** wraps `my_paper_confirms`.
- **The card object** gains `paper: { by, confirmer, state, note, photos } | null`.
- **The pretend server** has the same functions and rules and messages.
  - `fake.paperReading` is a settable canned reply.
  - It defaults to the demo's four columns, with holes 8 and 18 unsure on Pat's column and In written as 44 against 43.

**Steps:**
- [ ] Add a unit test of the cache rules for each new write.
- [ ] Implement.
- [ ] `npx vitest run` PASS → commit.

### Task 3: The reader function
**Files:**
- `supabase/functions/read-scorecard/core.js` (plain JS, no Deno APIs) and `core.test.js`.
- `supabase/functions/read-scorecard/index.ts`.
- `vitest.config` so the test runs if `supabase/` isn't already included.

**Produces (`core.js`):**
- **`buildRequest({ images, pars, open, players })`:** returns the Messages request body:
  - `model: 'claude-opus-5-5'`, `max_tokens: 4000`.
  - `output_config: { effort: 'low', format: { type: 'json_schema', schema: READING_SCHEMA } }`.
  - `fallbacks: 'default'`.
  - One user message: the image blocks (base64 `image/jpeg`), then a text block. The text gives the printed pars to
    check, says the cards have Score columns A and B with holes 1–18 down the side, says to read only the Score
    columns, and says to report blank cells as null and illegible ones with `sure: false`.
- **`READING_SCHEMA`:** `{ parMatches: boolean, cards: [{ columns: [{ label: 'A'|'B', holes: [{ score: int|null, sure:
  boolean }] ×18, out: int|null, in: int|null, total: int|null }] }] }`, with `additionalProperties: false`.
- **`checkReply(json)`:** returns the reading, or throws "The card couldn't be read. Retake the photo or enter the
  scores by hand." when the shape is wrong.

**`index.ts`:**
- `Deno.serve`, with CORS for the app's origin.
- Makes a supabase-js client with the caller's `Authorization` header and calls `rpc('take_paper_read')`. Its error
  text is passed straight back as `{ error }` with status 400.
- Calls `new Anthropic().beta.messages.create({ ...buildRequest(body), betas: ['server-side-fallback-2026-07-01'] })`.
  - Checks `stop_reason` (`refusal` → the could-not-read message).
  - Parses the text block's JSON and returns `checkReply(...)`.

**Steps:**
- [ ] Write the tests first:
  - `buildRequest` has the model, effort and schema, one image block per image, and the pars in the text.
  - `checkReply` accepts the canned demo reply and rejects a reply with 17 holes, or with a string score.
- [ ] Implement → PASS → commit.
- [ ] **Stop and ask the user** for the Anthropic key and permission to use the Supabase token. Then set the test
  project's secret and deploy:
  `supabase secrets set ANTHROPIC_API_KEY=… --project-ref <test>` and
  `supabase functions deploy read-scorecard --project-ref <test>`.
- [ ] Check it with one real reading of the crop of `/Users/gcochrane86/.claude/uploads/a3b42e2f-b3fd-457e-a460-386b0758060b/1c75e3d2-image.webp`.
  - Expected: column A is 6 6 4 5 4 3 8 6 4 / 46 and 6 5 5 3 6 5 3 6 4 / 43, total 89.
  - Its printed pars differ from our course, so expect `parMatches: false`. That's fine for this check.
  - Record the result in the ledger.

### Task 4: Reading and cropping logic (pure)
**Files:** `src/paper/reading.js` with `reading.test.js`; `src/paper/crop.js` with `crop.test.js`.

**Produces (`reading.js`):**
- **`toColumns(reading)`:** returns `[{ card: 1|2, label: 'A'|'B', holes: [{ score, sure }], out, in, total, blank:
  boolean }]`. `blank` is true when every score is null.
- **`colChecks(col, open: number[])`:** returns `{ out: { holes, written, ok } | null, in: …, unsure: number[] }`.
  - Only the open holes count.
  - A half with no open holes, or no written total, is null.
- **`guessPlayers(columns, lineup)`:** gives the lineup keys in card order, and `null` for blank columns.
- **`matchProblem(who, meKey)`:** returns `null`, or "Two columns are set to Pat Reid. Each player can only have one
  column.", or "Pick your own column."
- **`toScores(col, open)`:** returns the 18 scores to save, null on closed holes.

**Produces (`crop.js`):**
- **`defaultBox()`:** `{ x: 0.04, y: 0.2, w: 0.92, h: 0.68 }`, as fractions of the image.
- **`savedBox()` / `saveBox(box)`:** stored in localStorage under `teemate.cropBox`, wrapped in try/catch.
- **`moveCorner(box, corner, dx, dy)`:** clamped inside 0–1, with a minimum size of 0.2.
- **`cropRect(box, w, h, maxEdge = 1568)`:** returns `{ sx, sy, sw, sh, dw, dh }`.
- **`cropToBlob(img, box)`:** draws on a canvas and returns a JPEG (quality 0.85). It isn't unit-tested.

**Steps:**
- [ ] Write the tests first:
  - The demo reply gives 4 columns.
  - The pretend reply's Pat column has `unsure` `[7, 17]` and In `{ holes: 43, written: 44, ok: false }`.
  - A blank B column has `blank: true` and a null guess (Review Focus 4).
  - With open holes `[0..5, 9..11]`, the Out check covers holes 1–6 only, and `toScores` nulls the closed holes
    (Review Focus 5).
  - `matchProblem` catches a duplicate and a missing "me".
  - `cropRect` scales a 4000×3000 image down to a long edge of 1568.
  - `moveCorner` clamps.
- [ ] Implement → PASS → commit.

### Task 5: Office switch and the member's flow
**Files:**
- `src/office/club.js`: a "Paper scorecards" row with an Off/On segment, using `data-o-paper` and `setPaperCards`.
- `src/screens/scores.js`: when `theme.paperCards` is on and the current card has no scores, show the small link
  `#paper-go` under the existing entry button, plus the leaderboard line.
- `src/paper/paper-flow.js` (new): `S.pview` steps `photo` → `crop` → `reading` → `match` → `check` → `who`. It's drawn
  like the demo:
  - The example card appears only on the first `photo` step.
  - The file input is `accept="image/*" capture="environment"`.
  - The crop box can be dragged with pointer events.
  - "Only one card" is offered after card 1.
  - The check grid's number pad is the existing score pad if there is one, else a 1–12 sheet.
  - Save does `saveRound`, then `uploadCardPhoto` ×n, then `markPaperCard`. The toast is "Card saved. Chris will
    confirm your score." or "Card saved. Hand it in at the office."
- `src/test/journeys/features.test.js`.

**Steps:**
- [ ] Write the journeys first:
  - The office turns it on, and the member sees the link; off, the member doesn't.
  - Two cards → crop confirm ×2 → reading → match → fix hole 18 to 10, so the In check turns to "ok" → confirm all 4
    → pick Chris → saved. The card scores match the reading and `paper.state` is 'waiting'.
  - A duplicate column disables Next.
  - The daily limit message shows as a notice and offers "Enter scores by hand".
  - A reading with `parMatches: false` says "This doesn't look like a card for this course." and offers Retake or
    "Enter scores by hand".
  - The setting is turned off mid-flow; Save still works (Review Focus 1).
  - An open-holes event saves only its open holes (Review Focus 5).
- [ ] Implement → `npx vitest run` PASS → commit.

### Task 6: Confirming, marks and the office list
**Files:**
- `src/alerts.js` and `alerts.test.js`: new kind `paperconfirm` from `getPaperConfirms()` (members only, not the
  office login). Title "Please confirm a score"; detail "Alex Hart · 85 (Out 41 · In 44)"; actions Confirm (primary),
  Not right, See the holes, Later.
- `src/alert-bar.js`: handle those actions.
  - **Not right** opens a small sheet for the note, using the existing sheet pattern.
  - **See the holes** opens the card read-only, with its photo.
- `src/office/today.js`: a "Scores to confirm (N)" card listing the office's waiting rounds. Each has the photo with
  the player's column highlighted (column = the player's place in the card order), plus Confirm and Not right.
- The card and leaderboard rows (`src/screens/scores.js`, `src/screens/leaderboard.js`) show the uploader's mark:
  "Awaiting confirmation", "Sent back" or "Confirmed by Chris". The other players show "Confirmed by Alex". The card
  shows "Read from paper · See the photo of the card".
- **Sent back:** the uploader's card shows the note and a "Check my scores" button. That reopens the check step for
  their own column, using the saved scores and the photo, then calls `resendPaperScore`.

**Steps:**
- [ ] Write the tests first:
  - An alerts unit test for the new kind.
  - Journeys:
    - Chris confirms from the drop-down and the mark becomes "Confirmed by Chris".
    - The office confirms from Today.
    - Not right with a note → Alex sees the note → fixes → resends → Chris confirms (Review Focus 2).
    - The leaderboard shows Alex's score with "Awaiting confirmation" before any confirm.
- [ ] Implement → PASS → commit.

### Task 7: Finish
- [ ] Final review: a fresh reviewer on the most capable model. Fix Critical and Important findings test-first.
- [ ] Run `npx vitest run`, `npm run build` and `npm run db:test`.
- [ ] Re-run the real reading on test through the app flow, in the browser pane with a demo login.
- [ ] Go live, asking the user first:
  - `npm run db:migrate:live`, then `npm run db:test:live`.
  - Set the live secret and deploy the function live.
  - Merge and push.
  - Confirm the live bundle contains `read-scorecard`.
