# TeeMate

Golf club app: tee times and bookings, buddies, scorecards with games, leaderboards,
course guide with daily pins, guest points and team events.

Live: https://gteemate.github.io/teemate/

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scoring rules (src/scoring.test.js)
```

Copy `.env.example` to `.env` and fill it in.

## How it's built

- **Vite + plain JavaScript.** `src/main.js` routes between screens; each screen is a file in `src/screens/`.
- **All data access is in `src/api.js`** (Supabase today). Swap that one file to change backend.
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
npm run db:test      # RLS and booking tests (rolled back)
npm run db:race      # concurrent booking test against the live database
```

## Deploy

Every push to `main` runs the tests, builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
