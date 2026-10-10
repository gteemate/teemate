# Sign-up competitions (step 1: the sign-up sheet)

Date: 11 Oct 2026. Status: design agreed in chat ("Perfect - build and push").

## What and why

The club's season competitions (Men's Match Play, Men's Fourball, Men's Foursome, Mixed Foursome, Mixed Fourball,
Ladies Singles, Ladies Fourball, Ladies Foursome) need a sign-up sheet. Members put their names down in advance,
alone or with a partner. Competitions → **Events** shows only the ones you can still enter. Once you're in, it's
under **Entered**. The draw, play-by dates and match scoring come later (step 2).

## Rules

- Each member says which section they play in, Men's or Ladies', on Account (`members.plays_in`). Admins can
  correct it in Members & access.
- A competition has a name, category (**men** / **ladies** / **mixed** / **open**), kind (**singles** /
  **pairs**), an **entries close** date, optional notes, and **open** (hidden until an admin opens it).
- Eligible:
  - Men's: plays_in = men. Ladies': plays_in = ladies.
  - Mixed: anyone with a section; a pair needs one of each.
  - Open: anyone.
  - A partner must also be eligible.
- One entry per member per competition, counting being someone's partner. Entering and withdrawing are allowed
  until the end of the closing date. Withdrawing a pair takes both out.
- The 8 competitions above are added **closed, with no closing date**, until an admin sets their dates and opens
  them.

## Screens

- **Competitions → Events:** open competitions not closed, that I'm eligible for and haven't entered. Each shows
  name, Singles/Pairs, "Entries close <date>", notes, and Enter.
  - Singles: confirm, then entered.
  - Pairs: pick a partner (favourites first, search, only eligible members not entered), then Enter as a pair.
  - If my section isn't set, a prompt to set it on Account.
- **Entered:** these entries ("with <partner>"), with Withdraw until entries close. Also match invitations to
  answer, and events I'm in or made (both moved here from Events).
- **Account:** "I play in: Men's / Ladies'".
- **Club admin → Sign-up competitions:**
  - The list (open or hidden, entries close, number entered).
  - Add or edit (name, category, kind, closes, notes, open).
  - Entries list with Share, and Delete.
- **Members & access:** the member sheet has a Men's / Ladies' choice.

## Testing

- `src/signups.test.js`: who sees what, and partner choices.
- `supabase/tests/signups.sql`: eligibility (men/ladies/mixed pair/open), no double entry (as partner too), closed
  or hidden refused, withdraw takes the pair out, members only change their own section, admins only for
  competitions, visitors refused.
- Journey: Events → enter Men's Fourball with a partner → it shows in Entered → withdraw.
- Preview, then push.
