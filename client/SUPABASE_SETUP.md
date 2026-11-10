# Y GROUP — Supabase Setup Guide

This guide connects the website to its database (Supabase).
Follow the steps **in order**. No programming knowledge is needed.
Ask your developer if anything is unclear — do not guess.

---

## What you need before starting

1. A computer with internet.
2. This project folder.
3. 10–15 minutes.

---

## Step 1 — Create a free Supabase account

1. Open https://supabase.com in your browser.
2. Click **Start your project** → **Sign up** (email + password).
3. Verify your email if asked.

## Step 2 — Create the project

1. Click **New project**.
2. **Name**: `y-group`
3. **Database Password**: create a strong password.
   ⚠️ SAVE THIS PASSWORD SOMEWHERE SAFE (e.g. a password manager).
   You will NOT need to type it into the website.
4. **Region**: choose the closest one to your office (e.g. `Frankfurt` or `London` for Egypt).
5. Click **Create new project** and wait ~2 minutes until it is ready.

## Step 3 — Run the database migrations (one time, in order)

1. In the left menu of Supabase, click the **SQL Editor** icon (it looks like `>_`).
2. Click **New query** (or `+`).
3. Open `supabase/migrations/0001_auth_roles.sql` from this project folder,
   select all its text and copy it.
4. Paste it into the SQL Editor and click **RUN**. Confirm that it succeeds.
5. Create a second query. Copy all text from
   `supabase/migrations/0002_client_operations.sql`, paste it and click **RUN**.
   This adds the client workspaces, database access policies, private file
   buckets, realtime message tables and public contact-message inbox. It does
   not delete existing tables.
6. If either query reports an error, stop and share the error text with your
   developer. Do not repeatedly run a partially completed SQL query.

The first migration creates accounts and roles; the second adds operational
features. Run them in order only after confirming the first one succeeded.

## Step 4 — Turn on email verification

1. In the left menu, click **Authentication** → **Sign In / Providers** (or **Providers**).
2. Make sure **Email** is enabled (green).
3. Go to **Authentication** → **Settings** (or **Emails**):
   - Make sure **"Confirm email"** is ON. Clients must verify their email before logging in.

## Step 5 — Get your public keys and connect the website

1. In the left menu, click **Project Settings** (gear icon) → **API Keys**.
2. Copy these values:
   - **Project URL** — starts with `https://`
   - **Publishable key**, or the legacy **anon public** key if your project does
     not show Publishable keys.
3. Open this project folder, find the file named `.env` and open it with Notepad.
4. Replace the placeholder text so it looks like this (example values):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
# Optional legacy fallback: VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

5. Save the file.

⚠️ SECURITY RULES:
- NEVER put the `service_role` (secret) key in this file or anywhere in the project.
  The website only needs the URL + a **Publishable** or legacy **anon public** key.
- Never share the `.env` file publicly or upload it to GitHub
  (the project is already configured to exclude it).

## Step 6 — Create YOUR first account (the owner)

1. Run the website (see README) and open it in your browser.
2. Click **إنشاء حساب / Create Account**.
3. Register with YOUR email, a strong password, your name and phone.
4. Verify your email through the message Supabase sends you.
5. Log in normally. At this point you are a normal **client** — that is expected.

## Step 7 — Promote yourself to Super Admin (one time only)

⚠️ Do this once, for the OWNER account only. This cannot be done from the website
on purpose — public registration must never create an admin.

1. Open your Supabase project in the browser.
2. Go to **SQL Editor** → **New query**.
3. Paste the following (replace `PUT_YOUR_EMAIL_HERE` with the email you registered with,
   keeping the quotes):

```sql
update public.profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'PUT_YOUR_EMAIL_HERE');
```

4. Click **RUN**. You should see "Success".
5. Go back to the website, **log out and log in again**.
6. You now see the administration panel at `/admin` (or via the **لوحة المكتب** button).

## Step 8 — Add office staff (later, when needed)

Never share your Super Admin account. Instead:

1. The staff member registers a normal account themselves (they become a "client").
2. You open **Admin → Staff & Permissions** (`/admin/staff`).
3. Find their name and change the role to **Staff** or **Office Admin**.
4. Every role change is recorded in the audit log.

Roles:
| Role | Meaning |
|---|---|
| client | Normal client account |
| staff | Office employee — limited access |
| office_admin | Office manager — clients, appointments, documents |
| super_admin | Owner — everything, including roles |

---

## How do I know it worked?

- Registering a new account creates a profile and asks for email verification.
- After verifying, you can log in and see the client dashboard (`/client`).
- `/admin/login` refuses client accounts.
- After Step 7, your account opens the admin panel.

## Common problems

| Problem | Fix |
|---|---|
| The website says "not connected to the database" | `.env` values are wrong/missing — redo Step 5, then restart `npm run dev` |
| "Email not confirmed" when logging in | Open the verification email (check Spam folder) |
| Cannot reach admin panel | You are not Super Admin — redo Step 7, then log out/in |
| Supabase keys changed | Update `.env` and restart the dev server |

## After setup — configure office information

1. Sign in as the Super Admin and open **Admin → Office Settings**.
2. Set the correct office timezone. It starts as `UTC`; appointment requests are
   checked against this timezone and the working hours you configure.
3. Enter only confirmed office phone numbers, email, address and social links.
4. Add each working-day time range and appointment duration. Appointments remain
   requests until an authorized office user confirms them.
5. Configure Supabase Auth email templates and SMTP before depending on
   verification or recovery emails for real clients.

## Where is the data stored?

All accounts, roles and audit logs live in your Supabase project
(tables include `profiles`, `activity_logs`, `appointments`, `documents`,
`service_requests`, `conversations`, `messages`, `message_attachments`,
`notifications`, `contact_messages`, `services`, `office_settings` and
`office_availability`).
Uploaded files are stored in private Supabase Storage buckets. Do not make
these buckets public.

Messages submitted through the public contact form appear in Admin →
Website Messages. This inbox does not send email notifications; configure an
email provider separately if automatic delivery is required.
