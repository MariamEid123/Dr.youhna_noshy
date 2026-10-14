# Y GROUP Accounting Portal

Arabic RTL client portal and office dashboard built with React, Vite, Supabase Auth, PostgreSQL, and private Supabase Storage.

## Supabase setup

1. In Supabase Dashboard → SQL Editor, review and run `supabase-supporting-migration.sql` once. It adds the service catalog, required-document tracking, request notes/progress, document-to-request links, and protected database functions; it also seeds services and links existing client profiles to client records where the email match is unique. It does not recreate, alter, or delete existing application tables, change their RLS policies, or make the Storage bucket public. It does revoke direct `INSERT`/`UPDATE`/`DELETE` privileges from `anon` and `authenticated` on selected existing tables; the app performs those writes through the validated functions in this migration. Review those privilege changes before running it.
2. In Authentication → URL Configuration, set the local Site URL to `http://localhost:5173` and allow `http://localhost:5173/reset` as a redirect URL. Add the production website and reset URL before deployment.
3. Configure the Supabase Auth email provider and confirmation email template. Public registration always creates a client profile; the browser never chooses a role.
4. Copy `client/.env.example` to `client/.env.local` and enter the project URL and publishable key from Supabase Project Settings → API. Only the public/publishable key belongs in the frontend.
5. To bootstrap the first office administrator, register the administrator account through the website and confirm its email. Then, in the SQL Editor, promote that account using its exact email:

   ```sql
   update public.profiles
   set role = 'super_admin'
   where email = 'admin@example.com';

   delete from public.clients
   where user_id = (
     select id from public.profiles
     where email = 'admin@example.com' and role = 'super_admin'
   );
   ```

   Run this only for the intended administrator account. Do not expose or place a service-role key in the browser.
6. In `server`, copy `.env.example` to `.env` and configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CLIENT_URL`. The service-role key is used only on the server for staff provisioning and secure document finalization; never prefix it with `VITE_` or expose it to the browser.

## Local development

Requirements: Node.js 20.19+ (or 22.12+).

1. In one terminal, start the restricted staff-provisioning API:

   ```powershell
   Set-Location ..\server
   npm ci
   npm run dev
   ```

2. In a second terminal, start the website:

   ```powershell
   Set-Location ..\client
   npm ci
   npm run dev
   ```

3. Open <http://localhost:5173>.

For production, route the website's `/api/*` requests to the Express server; the Vite proxy above applies only during local development. Keep the server's service-role key in its server-side environment only.

## Data and authorization

- Supabase Auth is the only login/session system. Roles are read from `public.profiles`; registration does not accept a role.
- Client data access is scoped through the existing RLS policies and `clients.user_id`. Private documents use the existing `client-documents` bucket and the path `{client_id}/{random-id}-{file-name}`.
- The browser creates short-lived signed download links only after the RLS-protected document metadata query succeeds.
- The Express server verifies the caller's Supabase access token and profile using a server-only key. It provisions accountant/receptionist Auth users and verifies uploaded files before inserting document metadata or linking required documents.
- Document uploads use the existing private `client-documents` bucket. The browser uploads to the client-specific path, then the server verifies the authenticated user's role, client/request ownership, file contents, and size before accepting the document. The bucket stays private; downloads use signed URLs after the RLS-protected metadata query.
- Request stages and notes are stored in the added `request_notes` table. Service IDs are stored in the existing `requests.category` text field; request titles retain the service name. Request codes are stable short prefixes of the UUID.
- Appointments keep the service name in the existing `appointments.title` field. Database functions authorize booking, cancellation, rescheduling, and completion and serialize slot checks.
- Existing MongoDB records and `private_uploads` files are not copied by this code migration. Back them up and migrate them separately before deleting any MongoDB database or uploaded files.
- The SQL migration has not been applied to a Supabase project as part of this code change. Live Auth, RLS, Storage, and role-specific behavior still need verification after applying the reviewed SQL and configuring the local environment.

## Build

```powershell
Set-Location .
npm run build
```
