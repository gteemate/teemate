# Home as a remote: centred tiles, weather, alerts drop-down

Date: 10 Oct 2026. Status: design agreed in chat. This is design 1 of 2. The Halfway hut (design 2) builds on the
alerts drop-down described here.

## What and why

Home should be as simple as a TV remote: the membership disc in the exact centre of the screen with four tiles
around it, and nothing else. The list at the bottom ("Next up / Today") goes. Whatever needed you there now
**drops down from the header** as an alert you can answer on the spot. The header gains the course weather.
Reference: the user's mock-up (four rounded tiles notched around a cream disc, date top left, wind and rain top
right, "Hole 4 · +1" on Scoring).

## 1. Home layout

- **One centred block.** The disc and four tiles form a square, centred horizontally and vertically in the space
  below the header. The square is sized from the screen's shorter side (`min(width, height − header) − gutters`,
  capped for large screens), so it is the same remote upright, sideways, on a tablet and on a computer. Home
  doesn't scroll.
- **Tiles:** Booking (top left), Competition (top right), Friends (bottom left), Scoring (bottom right). The inner
  corner of each tile is cut out in a curve around the disc, with a small gap. The icon and title sit on the tile's
  outer side, as in the mock-up. The gold glow when something needs you stays.
- **Subtitles:** Booking: "Book a tee time" (or "08:10 today"). Competition: "Your competitions" (or
  "1 invitation"). Friends: "2 playing partners". Scoring: "Round on the go" with a pill **Hole 4 · +1**
  (next hole to play, then the score against par so far: net for a handicap game, gross otherwise, "E" when level),
  or "08:10 today", or "Start a round".
- **Disc:** name, club, handicap index, GUI number. Tap it to open Account, as now.
- The "Next up / Today" list and its code path (`nextUp`, Home's rows) are removed from Home. `todayItems` stays
  where other screens use it, and is otherwise removed.

## 2. Header

- Home's header: the date on the left (as now) and the weather on the right: wind icon + "14 mph", rain icon +
  "2 mm" (rain expected for the rest of today).
- A small gold dot on the date when an alert is waiting but hidden ("Later"). Tapping the date or the dot shows it
  again.

## 3. Weather

- Source: Open-Meteo forecast API (free, no key, sends nothing but the course's latitude and longitude):
  `current=wind_speed_10m`, `daily=precipitation_sum`, `wind_speed_unit=mph`, `timezone=auto`.
- Kept in memory and in `localStorage` (with every read and write in try/catch) for 30 minutes. If the request fails
  or no location is set, nothing shows.
- **Course location:** Club admin → Club name & colours gains "Course location". Type a town or postcode, pick
  from Open-Meteo's place search results, then save. The latitude, longitude and place name are stored in
  `club_settings` (`course_lat`, `course_lon`, `course_place`) and set through an admin-only function. They are
  readable before sign-in, like the club colours.
- New module `src/weather.js`: `weatherUrl(lat, lon)` and `readWeather(json)` return `{ windMph, rainMm }`
  (rounded, or `null` if the shape is wrong), plus a cached `getWeather()`.

## 3b. Weather screen (tap the weather)

Added by the user after the design was agreed: tapping the weather in the header opens a **Weather** screen
(back arrow returns Home).
- **Now:** wind speed, gusts and direction ("14 mph from the SW, gusts 22"), and rain today.
- **Wind on the course:** a map of the area around the course location (OpenStreetMap tiles, credited
  "© OpenStreetMap contributors"), with a large arrow over it showing which way the wind is blowing.
- **Hour by hour, for the rest of today:** time, wind (an arrow + mph), gusts, rain (mm) and chance of rain (%), so
  you can judge whether to stop after 9 holes. Rows with rain are tinted.
- The data comes from one Open-Meteo request (current + hourly), kept for 30 minutes like the header.
- The map tiles come from tile.openstreetmap.org (only the course area is requested). If they don't load, the arrow
  shows on a plain background.
- **Course location:** the search also accepts a pasted `lat, lon` (for example from a map app), so an admin can
  put the point on the course itself rather than the town.

## 4. Alerts drop-down

**What drops down** (most urgent first):
1. **Match challenge** for my group, not yet answered: "Peter Reid's four-ball (07:50) has challenged your group",
   with the format on a second line. Buttons: **Accept**, **Decline**, and **See details**, which opens it on the
   Scores tab where the existing Suggest-changes option lives. Accept and Decline use the existing
   `answerPlayerEvent`, so they answer for the group exactly as the Scores tab does.
2. **Tee time request answered** (approved or declined, not seen, within 7 days): "Request approved: Sat 14 Nov
   08:10 · Booked. It's in your bookings." or "Request declined: … " with the admin's note. **OK** marks it seen.
3. **Halfway hut order ready**: added by design 2.

**How it behaves**
- A card slides down under the header, over the screen, on every screen except sign-in. One alert at a time. When
  it's answered, the next one slides in.
- **Later** hides that alert until the app is next opened. The dot on the date (on Home), or a small bell-dot in
  other screens' headers, brings it back.
- Alerts are checked when the app opens, on every screen change, and when the app comes back to the foreground.
  There are no live pushes and no lock-screen notifications (out of scope).
- If Accept or Decline fails (for example, the other group called it off), a toast gives the reason and the alert goes.

**Code**
- `src/alerts.js` (pure): `pickAlerts({ me, playerEvents, requests, date, later })` returns an ordered list of
  `{ key, kind, title, detail, actions }`. It reuses `needsMyAnswer` from `home-today.js`.
- `src/alert-bar.js` (DOM): draws the drop-down into a new `#alerts` element in `index.html`, wires the buttons,
  and keeps the "Later" keys in memory for the session.
- `main.js` calls the alert check after each render, debounced. The data comes from `getMyPlayerEvents` and
  `getMyTeeTimeRequests` (existing).

## 5. Testing

- `src/alerts.test.js`: no alerts; a challenge for my group; my group already answered; my own group proposed it;
  called off; tomorrow's; a request approved, declined, seen, or older than 7 days; ordering; Later hides only that key.
- `src/weather.test.js`: the URL; reading a good response; a missing or odd response gives `null`; rounding.
- Scoring pill: a pure helper `roundPill(card, course, me)` gives "Hole 4 · +1", "Hole 1 · E", or `null` when no
  holes are saved or the round is finished. Tested for net and gross.
- `supabase/tests/course_location.sql`: an admin sets it; a member can't; visitors can read it.
- Preview at phone size, upright and sideways, plus tablet: the disc's centre within 2px of the space's centre;
  alerts in each state; weather shown and hidden. Compare with the mock-up.
- Before pushing: curl the new function with the publishable key and expect a permission error, not "not found".

## Not included

Push notifications on a locked phone, live alerts while the app sits on one screen, a "booked you in" alert, and
weather on other screens.
