# Knockout draw (sign-up competitions, step 2)

Date: 11 Oct 2026. Status: design agreed in chat. Members see nothing until an admin publishes a draw (a trial
first).

## Rules

- **Draw:** after entries close, an admin makes it. The server places entries at random in a bracket of the next
  power of two. Byes are spread so no match has two, and a bye goes straight through to round 2.
  - Before publishing, admins can swap any two entries and set a **play-by date** for each round.
  - Publishing shows it to everyone in the competition.
- **Results:** a player in a match (or their partner) reports the winner and how ("3&2", "at the 19th",
  "conceded"). The other side **confirms**, and the winner moves into the next round, or **disputes** it, which
  flags it for the admin.
  - Admins can set or correct any result (correction only while the next match hasn't been played) and give a
    walkover.
- **Who sees it:** everyone in the competition and admins, once published. Admins always see it.

## Screens

- **The competition page** opens from Entered, and from Club admin for admins.
  - Your next match is at the top: opponent, play-by date, Book this match (the tee sheet with them added), and
    Enter result, Confirm or Dispute as needed.
  - Round pills, then that round's matches (both sides, the result or "to play by"). The winner is gold and your
    path is highlighted.
  - On a wide screen, all rounds side by side as a bracket, with the champion at the top.
- **Admin, before publishing:** Make the draw, tap two entries to swap them, set the play-by dates, then Publish.
  After that: Set result or Walkover on any match.
- **Alerts:** "Confirm your result" when the other side has reported.

## Data

- `signup_comps.draw_published`, `signup_comps.round_deadlines` (date[]).
- `ko_matches(comp_id, round, slot, a_entry, b_entry, winner_entry, result, status, reported_entry, updated_at)`,
  where status is open / reported / confirmed / disputed / bye.
- Functions:
  - `admin_make_draw`, `admin_swap_draw`, `admin_set_round_deadlines` and `admin_publish_draw`.
  - `report_ko_result`, `confirm_ko_result`, `dispute_ko_result` and `admin_set_ko_result`.
  - Each advances the winner where it should, and all are security definer.

## Tests

- `src/knockout.test.js`: the bracket size, round names, byes spread, my next match, where a winner goes.
- `supabase/tests/knockout.sql`: draw sizes (5, 6, 8 entries), byes advance, swaps, members can't make draws,
  report/confirm/dispute, only players in the match, admin result and correction, not visible before publishing.
- A journey: report a result, the opponent confirms, the next round fills in.
