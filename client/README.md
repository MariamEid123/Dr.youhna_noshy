# Y GROUP — Client & Office Management Platform

Premium bilingual (Arabic/English) platform for Dr. Yohana Nosshy Attia —
Y GROUP for Accounting, Auditing and Legal Business.

## Run it on your computer

1. Install Node.js (LTS) from https://nodejs.org
2. Open a terminal inside this folder.
3. Run `npm install` (once, and after pulling new dependencies).
4. Run `npm run dev` and open the address it prints (usually http://localhost:5173).
5. Production build: `npm run build` (output in `dist/`).

## Database & accounts (required for login and workspaces)

Connect Supabase by following **SUPABASE_SETUP.md**. For a new, empty project,
apply `supabase/migrations/0001_auth_roles.sql` followed by
`supabase/migrations/0002_client_operations.sql`. Do not re-run those migrations
on a populated production database without reviewing their effects. The
additive `0003_private_storage.sql` provisions only missing private buckets and
missing storage policies.

For Vercel, use the repository's `client/` directory as the Root Directory,
Vite as the Framework Preset, `npm install` as the Install Command,
`npm run build` as the Build Command, and `dist` as the Output Directory.
The deployment uses Node.js 24 and the SPA rewrite in `vercel.json`.

## Project status

- Public bilingual website, legal pages, Supabase authentication, profiles, roles,
  client and admin workspaces.
- Client document exchange with private storage and signed downloads.
- Appointment requests, administrator review, availability configuration,
  database-side time validation and overlap protection.
- Service requests, assigned staff, private conversations, file attachments,
  realtime messages, in-app notifications and office contact settings.
- Public contact-form messages are stored for office-admin review, with a
  database-enforced per-email submission limit. No automatic email is sent.
- Database RLS limits client records to their owner; staff access is limited to
  assigned records; office admins and Super Admins can manage office records.

The production frontend is available at
[https://dr-youhna-noshy.vercel.app](https://dr-youhna-noshy.vercel.app).
The live Supabase project has the required tables, but its private storage
buckets are currently missing; document uploads and message attachments remain
unavailable until the owner applies `0003_private_storage.sql` in the matching
Supabase project's SQL Editor. Authentication flows, email delivery, final
legal text and office-specific contact/availability details still require
owner setup or authorized test accounts.

## Security notes

- Only the Supabase URL and public **Publishable** (or legacy **anon**) key are
  used in the frontend (`.env`). Neither key is a service-role secret.
- The service/secret key is never used in this project — keep it in Supabase only.
- Public registration always creates a **client**; roles can only be changed by
  the Super Admin (enforced by database triggers, not just the UI).
- Role changes are recorded in `activity_logs`.
- Appointment/document/service-request status and assignment changes are
  recorded in `activity_logs`.
- Public contact submissions are limited to five per email per hour. This does
  not replace a CAPTCHA or edge-level abuse protection for a public deployment.
- `.env` is git-ignored; `.env.example` contains placeholders only.

## Important setup after migrations

1. In Admin → Office Settings, enter the office's actual timezone, contact
   information and weekly working hours. No phone, address or hours are assumed.
2. In Admin → Users & Permissions, promote the owner's verified account to
   Super Admin only after following the secure bootstrap step in
   `SUPABASE_SETUP.md`.
3. Configure Supabase Auth email templates/SMTP before relying on verification
   and password-recovery emails outside development.
4. Review the legal pages with the office's legal adviser before publishing.

## Editing content

- Office contact details, service descriptions and working hours: Admin → Office Settings.
- Website UI text (AR/EN): `src/i18n/translations.js`
- Service icon metadata and local fallbacks: `src/config/site.js`
- Database setup SQL: `supabase/migrations/`
