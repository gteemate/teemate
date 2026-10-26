# Leagues and club events open for sign-up, with places — design

Agreed with the user 26 Oct 2026, after the open-holes build.

**What the user asked:** when making an event, e.g. the Winter League, have the option to advertise it from a date, show
members a counter ("10 spaces remaining"), and once it's full stop anyone else being added.

## Answers
- For **leagues and club events** made by the club office.
- Entries close on a **closing date, or when full** (whichever comes first), and always before it starts.
- When full, members see **Full** and can't enter. If someone withdraws, a place opens again (no waiting list).
- The club office sees **who's entered and "X of Y places"**, and can remove someone.

## The club office sets it up
In the event editor, for a club event or league, a **Sign-up** card (instead of the plain "Members can enter themselves"
switch):
- **Members sign up themselves** (on/off).
- **Advertise from**: a date; members see it from then (blank: straight away).
- **Entries close**: a date, before the first day (blank: the day before it starts).
- **Places**: a number (blank: no limit). For a team league it starts at teams × players per team.
- A line under it: "Members see it from Sat 1 Nov · entries close Fri 28 Nov · 40 places".

## Members
- **Competitions → Events** lists it alongside the sign-up competitions, from the advertise date until entries close:
  name, what it is (e.g. "League · 10 weeks from Mon 1 Dec"), the entry fee if any, "entries close Fri 28 Nov", and
  **"10 spaces remaining"** (or "1 space remaining"). **Enter** and **No thanks**, as sign-up competitions have now.
- **Full**: the card shows a Full pill and "all 40 places taken", with no Enter button.
- After entering, it shows under **Entered** with **Withdraw** until entries close.
- If the last place is taken while they're looking, Enter is refused: "Sorry, it's full: someone took the last
  place." The list then shows Full.

## Club office
- The competition's detail shows **"32 of 40 places"**, the list of who has entered, and **Remove** (tap twice) by
  each name. The office can still add players in the editor beyond the limit (the limit stops members, not the office).
- The Competitions list line for it shows "Sign-up · 32 of 40" until it starts.

## Rules (the database checks them)
- `enter_event`: refused before the advertise date ("Entries open on …"), after the closing date or once it has
  started ("Entries have closed."), and when full ("Sorry, it's full: someone took the last place."). Entering twice
  does nothing. The row is locked while it checks, so two members can't take the last place together.
- `withdraw_event`: allowed until entries close.
- Members see a club event open for sign-up only from its advertise date (admins and entrants always).

## Storage
- `events.advertise_from date`, `events.entries_close date`, `events.max_entries int` (null = no limit),
  checked: max_entries ≥ 1, entries_close before start_date, advertise_from on or before entries_close.

## Testing
- Database: each refusal, the last place taken by one of two members, withdraw opening a place, visibility before
  the advertise date.
- Journeys: office sets up the Winter League with places 4 and dates; a member sees "4 spaces remaining", enters →
  "3 spaces remaining" for the next member; when full the next member sees Full; a withdraw opens a place; the office
  sees "3 of 4 places" and removes someone; the refusal when the last place goes while looking is shown in a notice
  the member can see.

## Not in this
- A waiting list.
- Members' own events.
