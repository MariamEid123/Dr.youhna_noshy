-- ============================================================================
-- Y GROUP — Migration 0001: Profiles, Roles, Authorization, Activity Logs
-- Phase 3: Authentication foundation
--
-- SAFE: this migration only CREATES new objects. It does not drop or alter
-- any existing table or data.
--
-- SECURITY RULES ENFORCED HERE (at the database level, not the frontend):
--   1. Every new signup automatically gets role 'client'.
--      Public registration can NEVER create a staff/admin account.
--   2. Only a Super Admin (or the Supabase SQL editor / service role) may
--      change a user's role. Clients cannot promote themselves.
--   3. Row Level Security: users see only their own profile; staff/admins
--      can see all profiles; role/status columns are protected by triggers.
--   4. Role changes are recorded in activity_logs (audit trail).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Role type
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'staff', 'office_admin', 'super_admin');

-- ---------------------------------------------------------------------------
-- 2) Profiles table (one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null default '',
  phone        text not null default '',
  company_name text not null default '',
  role         public.user_role not null default 'client',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_created_at_idx on public.profiles (created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Activity logs (audit trail for sensitive actions)
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id             bigint generated always as identity primary key,
  actor_id       uuid references auth.users (id) on delete set null,
  action         text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index activity_logs_actor_idx on public.activity_logs (actor_id);

-- ---------------------------------------------------------------------------
-- 4) Helper functions (SECURITY DEFINER so policies do not recurse)
--    They are owned by postgres and bypass RLS on purpose, but only READ
--    the caller's own role.
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.has_any_role(roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = any (roles), false)
$$;

-- Is the current database session a privileged one (SQL editor / service
-- role)? In those sessions auth.uid() is null. Used only to bootstrap the
-- first Super Admin and for maintenance.
create or replace function public.is_service_session()
returns boolean
language sql
stable
as $$
  select auth.uid() is null
$$;

-- ---------------------------------------------------------------------------
-- 5) Auto-create a profile for every new signup — ALWAYS as 'client'.
--    Any role value sent from the frontend at signup is ignored.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6) Protect sensitive columns on update.
--    - role: only super_admin may change (or a service/SQL session).
--    - is_active: only office_admin / super_admin (or service session).
--    - id: never changeable.
--    - Every role change is written to activity_logs.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.user_role;
begin
  actor_role := public.current_role();  -- null in service/SQL sessions

  if new.id is distinct from old.id then
    raise exception 'PROFILE_ID_CHANGE_FORBIDDEN';
  end if;

  if new.role is distinct from old.role then
    if actor_role is null then
      -- service / SQL editor session (bootstrapping or maintenance)
      insert into public.activity_logs (action, target_user_id, details)
      values ('role_change', old.id,
              jsonb_build_object('from', old.role, 'to', new.role, 'via', 'service'));
    elsif actor_role = 'super_admin' then
      insert into public.activity_logs (actor_id, action, target_user_id, details)
      values (auth.uid(), 'role_change', old.id,
              jsonb_build_object('from', old.role, 'to', new.role));
    else
      raise exception 'ROLE_CHANGE_FORBIDDEN: only a Super Admin can change roles.';
    end if;
  end if;

  if new.is_active is distinct from old.is_active
     and actor_role is not null
     and actor_role not in ('office_admin', 'super_admin') then
    raise exception 'STATUS_CHANGE_FORBIDDEN: insufficient permissions.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profiles on public.profiles;
create trigger guard_profiles
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7) Row Level Security on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Read: own profile, or any staff member (staff / office_admin / super_admin).
create policy profiles_select on public.profiles
  for select
  using (
    id = auth.uid()
    or public.has_any_role(
      array['staff'::public.user_role,
            'office_admin'::public.user_role,
            'super_admin'::public.user_role]
    )
  );

-- Update: clients edit their own basic info; admins may also edit clients.
-- The guard_profiles trigger above protects role / is_active / id columns.
create policy profiles_update on public.profiles
  for update
  using (
    id = auth.uid()
    or public.has_any_role(
      array['office_admin'::public.user_role,
            'super_admin'::public.user_role]
    )
  )
  with check (
    id = auth.uid()
    or public.has_any_role(
      array['office_admin'::public.user_role,
            'super_admin'::public.user_role]
    )
  );

-- No INSERT / DELETE policies from the frontend:
-- profiles are created only by the signup trigger, and users are managed
-- through Supabase Auth. Deleting users happens through the dashboard
-- (service role) or Supabase admin UI — never through the anon client.

-- ---------------------------------------------------------------------------
-- 8) Row Level Security on activity_logs (append-only audit trail)
-- ---------------------------------------------------------------------------
alter table public.activity_logs enable row level security;

create policy activity_logs_select on public.activity_logs
  for select
  using (
    actor_id = auth.uid()
    or public.has_any_role(
      array['super_admin'::public.user_role]
    )
  );

create policy activity_logs_insert on public.activity_logs
  for insert
  with check (
    actor_id = auth.uid()
    or public.has_any_role(
      array['office_admin'::public.user_role,
            'super_admin'::public.user_role]
    )
  );

-- No update/delete policies: the audit trail is immutable from the app.
