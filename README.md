# Y GROUP

The website selected for production deployment is the React/Vite application in `client/`.
It connects directly to Supabase using a public Publishable key and database
Row Level Security; it does not require the Express server.

## Deploy the frontend

The Vercel project Root Directory is `client/`. Use the Vite preset,
`npm install`, `npm run build`, and `dist`. The project is configured for
Node.js 24 and includes an SPA route fallback.

Configure these Vercel Production and Preview variables:

- `VITE_SUPABASE_URL` — the production Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the project's public Publishable key.

The legacy `VITE_SUPABASE_ANON_KEY` is also supported by the frontend. Never
use a Supabase `service_role` or secret key in a `VITE_` variable.

## Database

Follow `client/SUPABASE_SETUP.md` and review the SQL migrations in
`client/supabase/migrations/` before applying them. Do not reset or recreate
the production database.

## Legacy server

`server/` and `client/supabase-supporting-migration.sql` belong to an older
Express-backed application. They are retained for reference but are not used
or deployed by the current Supabase-only client. Do not configure or deploy
that server for this release.
