# Friend Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share your card as a link that opens an Add friend page. Friends are club members (bookable) or contact
cards from other clubs (booked as guests). Favourites are starred and come first.

**Architecture:** Pure helpers in `src/friend-link.js` (link, reading it, which button to show, picker groups),
tested with Vitest. A new table `friend_contacts` and a `favourite` flag on `buddies`. A new `friend` screen,
reachable before sign-in through a pending link kept on the phone.

**Tech Stack:** Vite + plain JS, Vitest, Supabase Postgres (migrations, SQL tests).

**Spec:** `docs/superpowers/specs/2026-10-10-friend-links-design.md`

## Global Constraints

- The link's details sit after `#` and never reach a server. Links over 600 characters are refused.
- Pending link key: `localStorage['teemate.pendingFriend']`, with every access in try/catch.
- `friend_contacts`: owner-only RLS. Grants to `authenticated` only.
- Existing `getBuddies()` keeps returning ids (no churn). The new `getFriends()` returns favourites and contacts.
- Build every task without stopping. Push only when the user says so.

## Review Focus

- **A link opened while signed out, then sign-in:** it lands back on the Add friend page once, not every time.
  Task 3 preview check, with the pending link cleared after the signed-in page is shown.
- **Odd characters in names and clubs** (O'Neill, Ciarán, "Smith & Sons GC"): they round-trip intact. Task 1 test.
- **Scanning your own card:** it says "This is your card", with no button. Task 1 test.
- **Two contacts with no GUI and the same name:** Update matches the first. Task 1 test.
- **Out of guest points:** other-club rows in the booking picker are greyed out. Task 5 test (pickerGroups marks them).

---

### Task 1: friend-link.js

**Files:** Create `src/friend-link.js` and `src/friend-link.test.js`. Modify `src/share-card.js` (the shared text),
`src/screens/account.js` (the QR encodes the link) and `src/share-card.test.js`.

**Interfaces (Produces):**
- `friendLink(me: {id,name,hcp,gui}, clubName, base: string, on = new Date()): string`, as
  `${base}#friend?n=…&c=…&h=…&g=…&m=…&d=YYYY-MM-DD`. `h` uses `fmtHcp`. `c` and `g` are left out when empty.
- `readFriendLink(hash: string): { name, club, hcp, gui, memberId, sharedOn } | null`.
- `addFriendAction(card, { me, members, buddies: number[], contacts }) → { kind: 'signin'|'self'|'add'|'already'|'save'|'update'|'same', memberId?, contact? }`.
  `me` null means signed out.
- `shareText(me, clubName, link)` returns `"<name> · <club> · Handicap index <hcp>\nAdd me as a friend on TeeMate: <link>"`.

- [ ] Tests:
  - Round trip with `Ciarán O'Neill`, `Smith & Sons GC` and `+2.1`.
  - Missing club and GUI.
  - `readFriendLink('#friend?n=A')` (no m) gives null, and so do m=`x`, a 601-character link, and `#other`.
  - Every row of the spec's table: signed out, self, member with matching name (case and spacing ignored) gives
    add or already, member id with a different name gives save, a contact with the same GUI gives update or same,
    no GUI with the same name gives update, and anything else gives save.
- [ ] RED, then implement, then GREEN. Update share-card tests to the new text. Account: the QR and Share use
  `friendLink(me, clubName, location.origin + import.meta.env.BASE_URL)`.
- [ ] Commit with "Friend links: your card as a link".

### Task 2: Database and API

**Files:** Create `supabase/migrations/20261010150000_friend_contacts.sql` and `supabase/tests/friend_contacts.sql`.
Modify `src/api/members.js`.

**Interfaces (Produces):**
- Table `friend_contacts(id bigserial, owner bigint references members on delete cascade, name text check 1–80, club text ≤80, hcp text ≤8, gui text ≤20, shared_on date, favourite bool default false, updated_at timestamptz default now())`.
- `buddies.favourite bool not null default false`, plus the policy `update own buddies` (member_id = current_member_id()).
- JS:
  - `getFriends(): { buddies: [{ id, favourite }], contacts: [{ id, name, club, hcp, gui, sharedOn, favourite, updatedAt }] }`
  - `saveContact(card, id?)` (insert, or update when id is given)
  - `removeContact(id)`
  - `setFavourite({ memberId } | { contactId }, on)`

- [ ] SQL test (the shape of course_location.sql):
  - Owner inserts, updates and deletes.
  - Another member sees 0 rows and can't update or delete (0 rows changed).
  - Anon can't select (error).
  - A 81-character name is refused.
  - Favourite on own buddy works. Another member's buddy row isn't changed.
- [ ] RED (the table doesn't exist), migrate, GREEN. Run `npm run db:test` with everything passing.
- [ ] Commit with "Friend contacts table and favourites".

### Task 3: Add friend page and the pending link

**Files:** Create `src/screens/friend.js` (aview `'friend'`). Modify `src/main.js`.

**Interfaces (Consumes):** Task 1 `readFriendLink` and `addFriendAction`; Task 2 API; `addBuddy`.

- [ ] `main.js` startup: if `location.hash` starts with `#friend?`, store it in `teemate.pendingFriend` and clear
  the hash with `history.replaceState`.
  - In `render()`, while a link is pending, signed in goes to `S.tab='home'; S.aview='friend'`. The friend screen
    clears the pending link after drawing.
  - Signed out draws the friend screen in signed-out mode (card plus **Sign in to save**, which shows the
    sign-in screen).
- [ ] Friend screen:
  - The card (initials, name, club, HI, GUI, "Shared 10 Oct 2026") and the button or message per action.
  - Add: `addBuddy` + toast "Added to your friends". Save or Update: `saveContact` + toast "Contact saved" or
    "Contact updated". Both then go to Friends.
  - A broken link shows "This link isn't complete. Ask them to share it again."
- [ ] Preview each state with stubbed data, then commit with "Add friend page (from a shared link)".

### Task 4: Friends screen

**Files:** Modify `src/screens/buddies.js`, `src/screens/account.js` and `src/screens/home.js` (counts).

- [ ] The Friends tab is labelled "Friends" (was "Playing partners").
  - Sections: Favourites, then Your club, then Other clubs. Each row has a ☆/★ button
    (`aria-pressed`, `setFavourite`).
  - Club rows keep their existing add/remove. Contact rows open a sheet showing the card, "updated <date>" and
    **Remove** (tap again to confirm).
- [ ] The Home and Account tiles say "N friends" (buddies + contacts).
- [ ] Preview, then commit with "Friends: favourites and friends from other clubs".

### Task 5: Pickers

**Files:** Modify `src/friend-link.js` (+ test), `src/screens/booking.js` and `src/screens/players.js`.

**Interfaces (Produces):**
`pickerGroups({ members, friends, taken: Set<number>, q, canGuest }) → [{ title, rows: [{ kind: 'member', m } | { kind: 'contact', c, disabled }] }]`.

- [ ] Tests:
  - With no search: Favourites (fav members + fav contacts), then "Your friends", then "Friends from other clubs".
    Empty groups are left out, and taken members are left out.
  - Contacts are `disabled` when `!canGuest`.
  - With a search: one group "Members" (as now, at most 30) plus matching contacts.
- [ ] Booking pick sheet: render `pickerGroups`. A contact row opens `guestForm` prefilled with name, club, GUI
  and handicap (pass a `prefill` argument).
- [ ] players.js: club friends with favourites first.
- [ ] Tests, build and preview, then commit with "Pickers: favourites first; book friends from other clubs as guests".
