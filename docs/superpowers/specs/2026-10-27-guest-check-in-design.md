# Guest check-in: the office scans a member's card and charges guest points

Approved in chat, 27 Oct 2026.

## Why

Guests booked in the app already use up the host's guest points when they are booked, and that doesn't change. Some
guests turn up without being booked in the app, and some clubs won't use TeeMate's booking straight away. For these
cases the club office needs to charge guests to a member's allowance at the counter.

## What members see

- **Their card.** Members use the QR code already on their Account card, the friend link. It carries their member
  number and name, so there's nothing new to learn. The member's **Guest points** page gets a **Show my card** button,
  which opens the same QR large enough to scan at the counter.
- **Their guest list.** A guest the office charged shows in the member's guest list like a booked guest, marked
  "Checked in at the club office". It counts against the same allowance.

## What the club office sees

The Club office gets a new section, **Guests**, in the side menu after Tee sheet.

1. **Scan a member's card.** This big button opens the camera inside the app, with a frame to aim at. It works on
   iPhone and Android. When the code reads, the camera stops and the member is shown.
2. **Find a member by name.** A search box under the scan button, for anyone without their phone.
3. **The member.** Shows their name, initials and **points left this year**.
4. **Add guests.** Add each guest with a name, which is required, and a club, which is optional. Each guest costs the
   course's guest points, as at booking (3 today). The button says what will happen, e.g. **"Charge 6 points · 2 guests"**.
   - The charge is refused if there aren't enough points left: "Not enough guest points: Pat has 3 left."
   - On success: "6 points charged to Pat Reid · 30 left". The section then goes back to the start, ready for the next
     member.
5. **Checked in today.** A list of today's office charges, each showing the member, guest and points, with **Remove**
   (Remove, then Sure?). Removing one gives the points back. After today they can't be removed here, the same as a
   booked guest.

## Rules (the database enforces them, not just the screen)

- Only admins (the office login is an admin) can charge or remove.
- A scanned code must be a TeeMate friend link whose member number **and** name match a member. Anything else is
  refused: "That isn't a TeeMate member card."
- The guest name is required, up to 100 characters. There can be 1 to 3 guests per charge.
- The existing cap holds: a member's points used in a year never go over the allowance.
- Only charges the office made can be removed here, and only on the day they were made.

## How it's built

- **Database** (one migration):
  - `guest_visits` gets `checked_in_by bigint references members` (null for a booked guest).
  - `office_charge_guests(p_member bigint, p_guests jsonb)` returns `{ charged, pointsLeft }`.
  - `office_remove_guest_charge(p_visit bigint)` returns `{ pointsBack }`.
  - `office_guest_charges_today()` returns the list for "Checked in today".
- **API** (`src/api/`): `chargeGuests`, `removeGuestCharge` and `getGuestChargesToday`, each with a cache rule, wired
  into the pretend server.
- **Reading the code**: the `jsqr` library reads frames from `getUserMedia`. The phone camera can't read a code inside
  a web page on iPhone without this. Reading reuses `readFriendLink` from `src/friend-link.js`.
- **Screens**: a new `src/office/guests.js` for the office section, a scanner component (`src/scan-qr.js`), and "Show
  my card" on `src/screens/points.js`. The member's guest list shows "Checked in at the club office" for office charges.

## Testing

- **Database tests** (`supabase/tests/guest_check_in.sql`):
  - admin only;
  - a charge is recorded with points, and points left is correct;
  - over the allowance is refused;
  - a blank name is refused;
  - more than 3 guests is refused;
  - remove gives the points back;
  - a booked guest can't be removed this way;
  - yesterday's charge can't be removed;
  - members see their own charges only.
- **App tests**: these use a fake camera that hands over a scanned link.
  - The office scans, adds 2 guests, and charges 6.
  - A bad code is refused.
  - Not enough points is refused and the message is shown.
  - Find by name works.
  - Remove works.
  - The member's Guest points page shows "Checked in at the club office" and Show my card.
- **Wiring**: journeys for the new actions and every refusal, and feature register entries.
- **Real phone**: a check against the test database at phone size. The camera itself can't be tested in the browser
  pane, so the real scan is for you to try on your phone after it goes live.

## Not included

- Charging for anything other than guests.
- Checking in guests who were booked in the app. They are already charged when booked.
- Changing how booking guests in the app works.
