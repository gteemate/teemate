# Friend links: share your card as a link, add friends from any club

Date: 10 Oct 2026. Status: design agreed in chat.

## What and why

Today the Account card's QR code and Share button send plain text (name, club, handicap index, GUI number).
Members want to send it as a **link**. Tapping the link opens TeeMate on an **Add friend** page with the sender's
details already filled in. If the sender is a member of the reader's club, they become a normal club friend
(bookable). If they're from another club, they're saved as a **contact card**. Each member's friends list is their
own and is not limited to their club.

Agreed in chat:
- A friend from another club is a **contact card** (name, club, handicap, GUI number). In a booking or on a
  scorecard they're added as a **guest**, with their details filled in and the usual guest points cost.
- **Favourites** are a starred few of your friends (from your club or other clubs). They come first in the pickers.
- Long member lists keep their Save/Next button in reach (section 6).
- Someone who opens the link but isn't signed in sees the card and a **Sign in to save** button, and the app
  returns to the page after sign-in.
- **Option 1:** the details travel in the link itself (after `#`, so they never reach a web server). There is no
  share code in the database and no open read access.

## 1. The link

`<site>/#friend?n=<name>&c=<club>&h=<handicap index>&g=<GUI>&m=<member id>&d=<yyyy-mm-dd shared>`

- Built with `URLSearchParams`, so any character is safe. `c`, `g` and `h` may be missing. `n` and `m` are always
  present (every sharer is a signed-in member).
- `h` is the text the app shows (`14.5`, `+2.1`, `54`).
- The QR code encodes the link. The shared and copied message is:
  `Gareth Cochrane · Royal Portrush GC · Handicap index 14.5` + newline + `Add me as a friend on TeeMate: <link>`
  It still makes sense to someone who never taps the link.
- Links over 600 characters are refused when read (a long name or club is the only way to get there).

New module `src/friend-link.js` (no DOM, no API):
- `friendLink(me, clubName, base, on)` returns the link.
- `readFriendLink(hash)` returns `{ name, club, hcp, gui, memberId, sharedOn }`, or `null` when `n` or `m` is
  missing, `m` isn't a whole number, or the link is too long.
- `addFriendAction(card, { me, members, buddies, contacts })` returns what the page offers (section 2).

`share-card.js` keeps the QR and share-sheet code. Only the text it shares changes.

## 2. The Add friend page

Opening a `#friend?...` link makes `main.js` keep the hash in `localStorage` (`teemate.pendingFriend`, with every
read and write in try/catch) and show the page. It is reachable before sign-in, like the sign-in screen.

The card shows initials, name, club, handicap index, GUI number and "Shared 10 Oct 2026". Under it, one of these
(`addFriendAction`):

| Situation | Shown |
|---|---|
| Not signed in | **Sign in to save** opens sign-in. After sign-in the app comes back here |
| The link is mine (`m` = my id) | "This is your card" |
| `m` is a member of my club and the name matches (case and spacing ignored) | **Add to friends** adds them to `buddies`. If they're already a friend: "Already in your friends" |
| Otherwise, I have no matching contact | **Save contact** |
| Otherwise, I have a contact with the same GUI number (or the same name, if either has no GUI) | **Update contact**, showing old → new handicap. Same details: "Already saved" |

- After saving: toast, then Friends opens. The pending link is cleared once the page has been shown signed in.
- If the link can't be read: "This link isn't complete. Ask them to share it again."

## 3. Friends and favourites

- The Friends screen's **Friends** tab lists **Favourites** (starred) first, then **Your club**, then
  **Other clubs**. Each row has a star to tap on or off.
- Contact cards show initials, name, club, handicap index and "updated 10 Oct". Tapping one opens it with
  **Remove** (tap again to confirm).
- The Account and Home tiles count all friends, for example "3 friends".

**In the pickers** (booking "Add to your group" and the scorecard's Choose players):
- With no search typed: **Favourites**, then **Your friends** (club), then **Friends from other clubs**, then the
  search box covers all members as now.
- Picking a club friend adds them as a member, as now.
- Picking an other-club friend opens the existing **Add a guest** form, filled in with their name, club, GUI and
  handicap. The form shows the guest points cost ("Uses 3 points · 30 → 27 left"), and you tap **Add guest** to
  confirm. If you don't have enough guest points left, these rows are greyed out with "not enough guest points",
  like the guest button.
- On a scorecard they're added through the existing guest route (`getGuests` / guest lineup entries).

## 4. Database

New table `public.friend_contacts`:
- Columns: `id`, `owner` (members, cascade on delete), `name` (required), `club`, `hcp` (text), `gui`,
  `shared_on` (date), `updated_at` (default now).
- RLS: owner only for select, insert, update and delete (`owner = current_member_id()`). Grants only to
  `authenticated`.
- Limits: name 1–80 characters, club up to 80, hcp up to 8, gui up to 20.
- `favourite boolean not null default false`.

`public.buddies` gains `favourite boolean not null default false`. Members can already change only their own rows,
which is checked in the test.


API (`src/api/members.js`): `getContacts()`, `saveContact(card, id?)`, `removeContact(id)`,
`setFavourite({ memberId | contactId }, on)`. `getBuddies()` returns `[{ id, favourite }]`, and the screens that
used plain ids are updated.

## 5. Testing

- `src/friend-link.test.js`: round trip with accents, apostrophes and `&`; missing club, GUI or handicap; `+2.1`;
  missing `n` or `m`; `m` not a number; too long; every row of the section 2 table.
- `supabase/tests/friend_contacts.sql`: owner adds, updates and removes; another member sees none and can't
  change them; visitors can't read them; field limits; favourites on contacts and buddies, own rows only.
- A pure `pickerGroups({ members, buddies, contacts, picked, q })` gives the picker's sections in order. It's
  tested for favourites first, no duplicates, already-picked people left out, and search still covering all
  members.
- Booking: picking an other-club friend fills in the guest form. The cost and points left are shown, and the
  row is greyed out when you're short of points.
- Preview at phone size with sample data: the Add friend page in each state, Friends with Other clubs, and the
  Account card's new message.
- Before pushing: curl the new table with the publishable key, expecting the permission error rather than a
  "table not found" error.

## 6. Save within reach on long lists

Screens with long member lists and a Save/Next button at the bottom: Choose players (`players.js`), event players,
league teams and captains (`event-editor.js`), and the booking picker sheet.
- The button moves into a bar fixed to the bottom of the screen (the scorecard's `.cta` style), always visible,
  with a count of who is picked ("6 picked").
- A search box is added at the top of any list over 15 names, where one isn't there already.
- The page's last row is never hidden behind the bar (bottom padding equal to the bar's height).

## Not included

Accounts at other clubs, live handicaps for other-club contacts, and a
way to switch off your link.
