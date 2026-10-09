# TeeMate

Golf club app: tee times and bookings, buddies, scorecards with games, leaderboards,
course guide with daily pins, guest points and team events.

Live: https://gteemate.github.io/teemate/

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scoring rules, card merging and the multi-phone card tests
```

Copy `.env.example` to `.env` and fill it in.

## How it's built

- **Vite + plain JavaScript.** `src/main.js` routes between screens; each screen is a file in `src/screens/`.
- **All data access goes through `src/api.js`** (Supabase today), one file per area in `src/api/`
  (`client.js` holds the connection). Screens only ever import `src/api.js`.
- **All scoring rules are in `src/scoring.js`**: shots, Stableford, match play, skins, net strokeplay, team event points.
- **Database** in `supabase/`: migrations (tables, Row Level Security, functions), generated seed, and tests.
  Tee times are booked only through `book_tee_time()`, which checks spaces and guest points in one
  transaction, so double bookings and negative points can't happen.
- **Sign-in** is email + password; no emails are sent. An admin approves an email (Admin → Members & access);
  that person creates their own password the first time. Any other email is refused by a Supabase
  before-user-created hook, and the person can leave their name as an access request for an admin
  to approve or decline. Forgotten password: the admin uses Reset login.

## Database commands

Need `SUPABASE_ACCESS_TOKEN` in `.env`.

```bash
npm run db:migrate   # apply new files in supabase/migrations
npm run db:seed      # WIPE and reload sample data (from src/sample-data.js; OWNER_EMAIL in .env gets committee)
npm run db:test      # RLS, booking, card and event tests (each file rolled back; a failing file doesn't stop the rest)
npm run db:race      # concurrent booking test against the live database
```

## Testing several players at once

`src/shared-card.test.js` runs several "phones" (separate copies of `api.js`, each signed in as a
different member) against an in-memory database (`src/test/fake-supabase.js`), so shared-scorecard
races (saving at the same moment, starting the same card) can be tested without real logins.
Database rules are tested by `npm run db:test`. Full multi-login tests are planned against a
separate Supabase test project, never the live club.

## Deploy

Every push to `main` runs the tests, builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
