-- Client operations: appointments, documents, requests, messaging, notifications and settings.
-- This migration only adds objects and does not remove existing data.

alter table public.profiles add column if not exists email text;
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_email on auth.users;
create trigger sync_profile_email after update of email on auth.users
for each row execute function public.sync_profile_email();

create or replace function public.guard_profile_email()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and new.email is distinct from old.email then
    raise exception 'PROFILE_EMAIL_UPDATE_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_email on public.profiles;
create trigger profiles_guard_email before update on public.profiles
for each row execute function public.guard_profile_email();

create table if not exists public.services (
  code text primary key,
  title_ar text not null,
  title_en text not null,
  short_ar text not null default '',
  short_en text not null default '',
  details_ar text not null default '',
  details_en text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.services add column if not exists short_ar text not null default '';
alter table public.services add column if not exists short_en text not null default '';
alter table public.services add column if not exists details_ar text not null default '';
alter table public.services add column if not exists details_en text not null default '';

insert into public.services (code, title_ar, title_en, short_ar, short_en) values
  ('accounting', 'الخدمات المحاسبية', 'Accounting Services', 'مسك الدفاتر وإعداد القوائم المالية ومتابعة السجلات المحاسبية.', 'Bookkeeping, financial statements and accounting records follow-up.'),
  ('tax-returns', 'الإقرارات الضريبية', 'Tax Returns', 'إعداد وتقديم الإقرارات الضريبية ومتابعتها.', 'Preparing, filing and following up on tax returns.'),
  ('vat', 'ضريبة القيمة المضافة', 'Value Added Tax (VAT)', 'التسجيل والإقرارات الدورية والاستشارات المتعلقة بضريبة القيمة المضافة.', 'Registration, periodic returns and VAT advisory.'),
  ('company-formation', 'تأسيس الشركات', 'Company Formation', 'الإجراءات القانونية والمحاسبية لتأسيس الشركات.', 'Legal and accounting procedures for forming companies.'),
  ('contracts', 'صياغة العقود', 'Contract Drafting', 'صياغة ومراجعة العقود التجارية والقانونية.', 'Drafting and reviewing commercial and legal contracts.'),
  ('committees', 'متابعة اللجان الداخلية', 'Internal Committees Follow-up', 'متابعة الملفات أمام اللجان الداخلية.', 'Following up files before internal committees.'),
  ('tax-appeal', 'لجان الطعن الضريبي', 'Tax Appeal Committees', 'إعداد الطعون والمتابعة أمام لجان الطعن الضريبي.', 'Preparing appeals and following them before tax appeal committees.'),
  ('other', 'خدمات أخرى', 'Other Services', 'خدمات أخرى في مجال الأعمال المحاسبية والقانونية.', 'Other services in accounting and legal business.')
on conflict (code) do nothing;

create table if not exists public.office_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.office_settings (key, value) values
  ('timezone', '"UTC"'::jsonb),
  ('office_name', '"Y GROUP"'::jsonb),
  ('email', '""'::jsonb),
  ('phone', '""'::jsonb),
  ('address', '""'::jsonb),
  ('whatsapp', '""'::jsonb),
  ('facebook', '""'::jsonb),
  ('map_url', '""'::jsonb)
on conflict (key) do nothing;

create table if not exists public.office_availability (
  id bigint generated always as identity primary key,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  slot_minutes integer not null default 60 check (slot_minutes between 15 and 480),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((break_start is null and break_end is null) or
         (break_start is not null and break_end is not null and break_end > break_start))
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  service_code text not null references public.services (code),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'declined', 'cancelled', 'completed')),
  client_note text not null default '' check (length(client_note) <= 2000),
  internal_note text not null default '' check (length(internal_note) <= 5000),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists appointments_client_start_idx on public.appointments (client_id, starts_at desc);
create index if not exists appointments_status_start_idx on public.appointments (status, starts_at);
create unique index if not exists appointments_active_slot_idx
  on public.appointments (starts_at)
  where status in ('pending', 'confirmed', 'reschedule_requested', 'rescheduled');
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments add constraint appointments_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
      where (status in ('pending', 'confirmed', 'reschedule_requested', 'rescheduled'));
  end if;
end;
$$;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  service_code text not null references public.services (code),
  business_activity text not null default '' check (length(business_activity) <= 250),
  description text not null check (length(description) between 1 and 5000),
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'need_information', 'completed', 'declined')),
  internal_note text not null default '' check (length(internal_note) <= 5000),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_client_created_idx on public.service_requests (client_id, created_at desc);
create index if not exists service_requests_status_created_idx on public.service_requests (status, created_at desc);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null default 'application/octet-stream' check (length(content_type) <= 255),
  file_size bigint not null check (file_size between 1 and 20971520),
  status text not null default 'received'
    check (status in ('received', 'under_review', 'need_information', 'completed')),
  staff_note text not null default '' check (length(staff_note) <= 5000),
  uploaded_by uuid not null references auth.users (id),
  handled_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_client_created_idx on public.documents (client_id, created_at desc);
create index if not exists documents_status_created_idx on public.documents (status, created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.profiles (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations add column if not exists assigned_to uuid references public.profiles (id) on delete set null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(btrim(body)) between 1 and 10000)
);

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null default 'application/octet-stream' check (length(content_type) <= 255),
  file_size bigint not null check (file_size between 1 and 20971520),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  title_ar text not null default '',
  body_ar text not null default '',
  title_en text not null default '',
  body_en text not null default '',
  kind text not null,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null default '' check (length(phone) <= 40),
  body text not null check (length(btrim(body)) between 1 and 5000),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'responded', 'closed')),
  staff_note text not null default '' check (length(staff_note) <= 5000),
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_status_created_idx on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_email_created_idx on public.contact_messages (lower(email), created_at desc);

create table if not exists public.contact_submission_limits (
  email_key text primary key,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count > 0)
);

create or replace function public.limit_contact_submissions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  recent_submissions integer;
begin
  new.id := gen_random_uuid();
  new.status := 'new';
  new.staff_note := '';
  new.handled_by := null;
  new.created_at := now();
  new.updated_at := new.created_at;

  insert into public.contact_submission_limits as limits (email_key, window_started_at, submission_count)
  values (md5(lower(btrim(new.email))), now(), 1)
  on conflict (email_key) do update
  set submission_count = case
        when limits.window_started_at <= now() - interval '1 hour' then 1
        else limits.submission_count + 1
      end,
      window_started_at = case
        when limits.window_started_at <= now() - interval '1 hour' then now()
        else limits.window_started_at
      end
  returning submission_count into recent_submissions;

  if recent_submissions > 5 then
    raise exception 'CONTACT_RATE_LIMITED';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_messages_rate_limit on public.contact_messages;
create trigger contact_messages_rate_limit before insert on public.contact_messages
for each row execute function public.limit_contact_submissions();

create or replace function public.guard_contact_message_updates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.name is distinct from old.name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at then
    raise exception 'CONTACT_MESSAGE_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_messages_guard_update on public.contact_messages;
create trigger contact_messages_guard_update before update on public.contact_messages
for each row execute function public.guard_contact_message_updates();

drop trigger if exists contact_messages_set_updated_at on public.contact_messages;
create trigger contact_messages_set_updated_at before update on public.contact_messages
for each row execute function public.set_updated_at();

alter table public.contact_messages enable row level security;
alter table public.contact_submission_limits enable row level security;

drop policy if exists contact_messages_public_insert on public.contact_messages;
create policy contact_messages_public_insert on public.contact_messages for insert
to anon, authenticated
with check (status = 'new' and staff_note = '' and handled_by is null);

drop policy if exists contact_messages_admin_read on public.contact_messages;
create policy contact_messages_admin_read on public.contact_messages for select
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));

drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_admin_update on public.contact_messages for update
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));

grant insert, select, update on public.contact_messages to anon, authenticated;

create or replace function public.can_access_client_records(client_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() in ('office_admin'::public.user_role, 'super_admin'::public.user_role) then true
    when public.current_role() = 'staff'::public.user_role then
      exists (select 1 from public.appointments a where a.client_id = client_user_id and a.assigned_to = auth.uid())
      or exists (select 1 from public.service_requests r where r.client_id = client_user_id and r.assigned_to = auth.uid())
      or exists (select 1 from public.documents d where d.client_id = client_user_id and d.handled_by = auth.uid())
      or exists (select 1 from public.conversations c where c.client_id = client_user_id and c.assigned_to = auth.uid())
    else false
  end
$$;

create or replace function public.can_access_client_path(client_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if client_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_access_client_records(client_user_id::uuid);
end;
$$;

create or replace function public.can_access_conversation(conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (
        c.client_id = auth.uid()
        or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])
        or (public.current_role() = 'staff'::public.user_role and c.assigned_to = auth.uid())
      )
  )
$$;

create or replace function public.can_access_document_path(document_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = document_path
      and (
        d.client_id = auth.uid()
        or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])
        or (public.current_role() = 'staff'::public.user_role and d.handled_by = auth.uid())
      )
  )
$$;

create or replace function public.document_path_is_unregistered(document_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.documents d where d.storage_path = document_path)
$$;

create or replace function public.validate_document_storage_path()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if split_part(new.storage_path, '/', 1) <> new.client_id::text then
    raise exception 'DOCUMENT_STORAGE_PATH_CLIENT_MISMATCH';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'client-documents' and o.name = new.storage_path
  ) then
    raise exception 'DOCUMENT_STORAGE_OBJECT_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_validate_storage_path on public.documents;
create trigger documents_validate_storage_path before insert on public.documents
for each row execute function public.validate_document_storage_path();

create or replace function public.validate_message_attachment_storage_path()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  message_conversation uuid;
  message_sender uuid;
begin
  select m.conversation_id, m.sender_id
  into message_conversation, message_sender
  from public.messages m where m.id = new.message_id;

  if message_conversation is null
    or split_part(new.storage_path, '/', 1) <> message_conversation::text
    or split_part(new.storage_path, '/', 2) <> message_sender::text then
    raise exception 'MESSAGE_ATTACHMENT_PATH_MISMATCH';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'message-attachments' and o.name = new.storage_path
  ) then
    raise exception 'MESSAGE_ATTACHMENT_STORAGE_OBJECT_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists message_attachments_validate_storage_path on public.message_attachments;
create trigger message_attachments_validate_storage_path before insert on public.message_attachments
for each row execute function public.validate_message_attachment_storage_path();

create or replace function public.can_access_conversation_path(conversation_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if conversation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_access_conversation(conversation_id::uuid);
end;
$$;

create or replace function public.guard_private_record_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'messages' then
    if new.id is distinct from old.id
      or new.conversation_id is distinct from old.conversation_id
      or new.sender_id is distinct from old.sender_id
      or new.body is distinct from old.body
      or new.created_at is distinct from old.created_at
      or old.sender_id = auth.uid() then
      raise exception 'MESSAGE_UPDATE_FORBIDDEN';
    end if;
  elsif tg_table_name = 'notifications' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.title_ar is distinct from old.title_ar
      or new.body_ar is distinct from old.body_ar
      or new.title_en is distinct from old.title_en
      or new.body_en is distinct from old.body_en
      or new.kind is distinct from old.kind
      or new.related_id is distinct from old.related_id
      or new.created_at is distinct from old.created_at then
      raise exception 'NOTIFICATION_UPDATE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_record_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'appointments' then
    if new.id is distinct from old.id or new.client_id is distinct from old.client_id
      or new.service_code is distinct from old.service_code or new.created_at is distinct from old.created_at then
      raise exception 'APPOINTMENT_IDENTITY_IMMUTABLE';
    end if;
  elsif tg_table_name = 'service_requests' then
    if new.id is distinct from old.id or new.client_id is distinct from old.client_id
      or new.service_code is distinct from old.service_code or new.business_activity is distinct from old.business_activity
      or new.description is distinct from old.description or new.created_at is distinct from old.created_at then
      raise exception 'SERVICE_REQUEST_IDENTITY_IMMUTABLE';
    end if;
  elsif tg_table_name = 'documents' then
    if new.id is distinct from old.id or new.client_id is distinct from old.client_id
      or new.title is distinct from old.title or new.file_name is distinct from old.file_name
      or new.storage_path is distinct from old.storage_path or new.content_type is distinct from old.content_type
      or new.file_size is distinct from old.file_size or new.uploaded_by is distinct from old.uploaded_by
      or new.created_at is distinct from old.created_at then
      raise exception 'DOCUMENT_IDENTITY_IMMUTABLE';
    end if;
  elsif tg_table_name = 'conversations' then
    if new.id is distinct from old.id or new.client_id is distinct from old.client_id
      or new.created_at is distinct from old.created_at then
      raise exception 'CONVERSATION_IDENTITY_IMMUTABLE';
    end if;
  elsif tg_table_name = 'services' then
    if new.code is distinct from old.code or new.created_at is distinct from old.created_at then
      raise exception 'SERVICE_IDENTITY_IMMUTABLE';
    end if;
  elsif tg_table_name = 'office_settings' and new.key is distinct from old.key then
    raise exception 'OFFICE_SETTING_KEY_IMMUTABLE';
  elsif tg_table_name = 'office_availability' then
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'AVAILABILITY_IDENTITY_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_guard_identity on public.appointments;
create trigger appointments_guard_identity before update on public.appointments
for each row execute function public.guard_record_identity();
drop trigger if exists service_requests_guard_identity on public.service_requests;
create trigger service_requests_guard_identity before update on public.service_requests
for each row execute function public.guard_record_identity();
drop trigger if exists documents_guard_identity on public.documents;
create trigger documents_guard_identity before update on public.documents
for each row execute function public.guard_record_identity();
drop trigger if exists conversations_guard_identity on public.conversations;
create trigger conversations_guard_identity before update on public.conversations
for each row execute function public.guard_record_identity();
drop trigger if exists services_guard_identity on public.services;
create trigger services_guard_identity before update on public.services
for each row execute function public.guard_record_identity();
drop trigger if exists office_settings_guard_identity on public.office_settings;
create trigger office_settings_guard_identity before update on public.office_settings
for each row execute function public.guard_record_identity();
drop trigger if exists availability_guard_identity on public.office_availability;
create trigger availability_guard_identity before update on public.office_availability
for each row execute function public.guard_record_identity();

create or replace function public.validate_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  office_timezone text;
  local_start timestamp;
  local_end timestamp;
  slot_minutes integer;
begin
  if tg_op = 'UPDATE' then
    if auth.uid() is not null and not public.has_any_role(array['staff'::public.user_role, 'office_admin'::public.user_role, 'super_admin'::public.user_role]) then
      if new.client_id is distinct from old.client_id
        or new.service_code is distinct from old.service_code
        or new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at
        or new.internal_note is distinct from old.internal_note
        or new.assigned_to is distinct from old.assigned_to
        or new.created_at is distinct from old.created_at
        or new.status not in ('reschedule_requested', 'cancelled')
        or old.status not in ('pending', 'confirmed', 'reschedule_requested', 'rescheduled')
        or old.client_id <> auth.uid() then
        raise exception 'APPOINTMENT_UPDATE_FORBIDDEN';
      end if;
      return new;
    end if;
    if new.starts_at is not distinct from old.starts_at
      and new.ends_at is not distinct from old.ends_at then
      return new;
    end if;
    if new.status in ('declined', 'cancelled', 'completed') then
      return new;
    end if;
  elsif new.client_id <> auth.uid() or new.status <> 'pending'
    or new.assigned_to is not null or new.internal_note <> '' then
    raise exception 'APPOINTMENT_REQUEST_FORBIDDEN';
  end if;

  if new.starts_at <= now() then
    raise exception 'APPOINTMENT_MUST_BE_FUTURE';
  end if;

  select coalesce((value #>> '{}'), 'UTC')
  into office_timezone
  from public.office_settings where key = 'timezone';
  office_timezone := coalesce(office_timezone, 'UTC');
  local_start := new.starts_at at time zone office_timezone;
  local_end := new.ends_at at time zone office_timezone;
  if local_end::date <> local_start::date then
    raise exception 'APPOINTMENT_SLOT_UNAVAILABLE';
  end if;

  select a.slot_minutes into slot_minutes
  from public.office_availability a
  where a.is_active
    and a.weekday = extract(dow from local_start)::smallint
    and local_start::time >= a.start_time
    and local_end::time <= a.end_time
    and (a.break_start is null or local_end::time <= a.break_start or local_start::time >= a.break_end)
    and new.ends_at - new.starts_at = make_interval(mins => a.slot_minutes)
    and mod(extract(epoch from (local_start::time - a.start_time))::integer, a.slot_minutes * 60) = 0
  limit 1;
  if slot_minutes is null then
    raise exception 'APPOINTMENT_SLOT_UNAVAILABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_validate on public.appointments;
create trigger appointments_validate before insert or update on public.appointments
for each row execute function public.validate_appointment();

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update before update on public.messages
for each row execute function public.guard_private_record_updates();

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update before update on public.notifications
for each row execute function public.guard_private_record_updates();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at before update on public.service_requests
for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists office_settings_set_updated_at on public.office_settings;
create trigger office_settings_set_updated_at before update on public.office_settings
for each row execute function public.set_updated_at();

create or replace function public.audit_client_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_client uuid;
  record_status text;
  record_assignee uuid;
begin
  if tg_table_name = 'appointments' then
    record_client := new.client_id;
    record_status := new.status;
    record_assignee := new.assigned_to;
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
      and new.starts_at is not distinct from old.starts_at
      and new.assigned_to is not distinct from old.assigned_to then
      return new;
    end if;
  elsif tg_table_name = 'service_requests' then
    record_client := new.client_id;
    record_status := new.status;
    record_assignee := new.assigned_to;
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
      and new.assigned_to is not distinct from old.assigned_to then
      return new;
    end if;
  elsif tg_table_name = 'documents' then
    record_client := new.client_id;
    record_status := new.status;
    record_assignee := new.handled_by;
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
      and new.handled_by is not distinct from old.handled_by then
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.activity_logs (actor_id, action, target_user_id, details)
  values (
    auth.uid(),
    tg_table_name || '_' || lower(tg_op),
    record_client,
    jsonb_build_object('record_id', new.id, 'status', record_status, 'assigned_to', record_assignee)
  );
  return new;
end;
$$;

drop trigger if exists appointments_audit on public.appointments;
create trigger appointments_audit after insert or update on public.appointments
for each row execute function public.audit_client_operation();
drop trigger if exists service_requests_audit on public.service_requests;
create trigger service_requests_audit after insert or update on public.service_requests
for each row execute function public.audit_client_operation();
drop trigger if exists documents_audit on public.documents;
create trigger documents_audit after insert or update on public.documents
for each row execute function public.audit_client_operation();

create or replace function public.audit_office_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_key text;
begin
  if tg_table_name = 'office_settings' then
    record_key := new.key;
  elsif tg_table_name = 'services' then
    record_key := new.code;
  else
    record_key := new.id::text;
  end if;
  insert into public.activity_logs (actor_id, action, details)
  values (auth.uid(), tg_table_name || '_' || lower(tg_op), jsonb_build_object('key', record_key));
  return new;
end;
$$;

drop trigger if exists office_settings_audit on public.office_settings;
create trigger office_settings_audit after insert or update on public.office_settings
for each row execute function public.audit_office_settings_change();
drop trigger if exists services_audit on public.services;
create trigger services_audit after update on public.services
for each row execute function public.audit_office_settings_change();
drop trigger if exists availability_audit on public.office_availability;
create trigger availability_audit after insert or update on public.office_availability
for each row execute function public.audit_office_settings_change();

create or replace function public.notify_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_user record;
  notification_title text;
  notification_body text;
  notification_title_ar text;
  notification_body_ar text;
  notification_title_en text;
  notification_body_en text;
  notification_kind text;
  target_client uuid;
begin
  if tg_table_name = 'appointments' then
    target_client := new.client_id;
    notification_kind := 'appointment';
    notification_title := 'Appointment update';
    notification_title_ar := 'تحديث الموعد';
    notification_title_en := 'Appointment update';
    notification_body_en := 'Your appointment status is now: ' || replace(new.status, '_', ' ');
    notification_body_ar := 'حالة موعدك الآن: ' || case new.status
      when 'pending' then 'قيد الانتظار' when 'confirmed' then 'مؤكد'
      when 'reschedule_requested' then 'طلب تغيير الموعد' when 'rescheduled' then 'أعيدت جدولته'
      when 'declined' then 'مرفوض' when 'cancelled' then 'ملغي' when 'completed' then 'مكتمل'
      else new.status end;
    if tg_op = 'INSERT' then
      for staff_user in select id from public.profiles where is_active and (role in ('office_admin', 'super_admin') or id = new.assigned_to) loop
        insert into public.notifications (user_id, title, body, title_ar, body_ar, title_en, body_en, kind, related_id)
        values (staff_user.id, 'New appointment request', 'A client requested an appointment.', 'طلب موعد جديد', 'أرسل أحد العملاء طلبًا لحجز موعد.', 'New appointment request', 'A client requested an appointment.', 'appointment', new.id);
      end loop;
      return new;
    elsif new.status is not distinct from old.status and new.starts_at is not distinct from old.starts_at then
      return new;
    end if;
  elsif tg_table_name = 'service_requests' then
    target_client := new.client_id;
    notification_kind := 'service_request';
    notification_title := 'Service request update';
    notification_title_ar := 'تحديث طلب الخدمة';
    notification_title_en := 'Service request update';
    notification_body_en := 'Your service request status is now: ' || replace(new.status, '_', ' ');
    notification_body_ar := 'حالة طلب الخدمة الآن: ' || case new.status
      when 'pending' then 'قيد الانتظار' when 'in_review' then 'قيد المراجعة'
      when 'need_information' then 'مطلوب معلومات إضافية' when 'completed' then 'مكتمل'
      when 'declined' then 'مرفوض' else new.status end;
    if tg_op = 'INSERT' then
      for staff_user in select id from public.profiles where is_active and (role in ('office_admin', 'super_admin') or id = new.assigned_to) loop
        insert into public.notifications (user_id, title, body, title_ar, body_ar, title_en, body_en, kind, related_id)
        values (staff_user.id, 'New service request', 'A client submitted a service request.', 'طلب خدمة جديد', 'أرسل أحد العملاء طلب خدمة جديدًا.', 'New service request', 'A client submitted a service request.', 'service_request', new.id);
      end loop;
      return new;
    elsif new.status is not distinct from old.status then
      return new;
    end if;
  elsif tg_table_name = 'documents' then
    target_client := new.client_id;
    notification_kind := 'document';
    notification_title := 'Document update';
    notification_title_ar := 'تحديث المستند';
    notification_title_en := 'Document update';
    notification_body_ar := 'تمت إضافة مستند أو تحديثه في حسابك.';
    notification_body_en := 'A document was added or updated in your account.';
    if tg_op = 'INSERT' and new.uploaded_by = new.client_id then
      for staff_user in select id from public.profiles where is_active and (role in ('office_admin', 'super_admin') or id = new.handled_by) loop
        insert into public.notifications (user_id, title, body, title_ar, body_ar, title_en, body_en, kind, related_id)
        values (staff_user.id, 'New client document', 'A client uploaded a document.', 'مستند جديد من عميل', 'رفع أحد العملاء مستندًا جديدًا.', 'New client document', 'A client uploaded a document.', 'document', new.id);
      end loop;
      return new;
    elsif tg_op = 'UPDATE' and new.status is not distinct from old.status then
      return new;
    end if;
  else
    return new;
  end if;
  insert into public.notifications (user_id, title, body, title_ar, body_ar, title_en, body_en, kind, related_id)
  values (target_client, notification_title, notification_body, notification_title_ar, notification_body_ar, notification_title_en, notification_body_en, notification_kind, new.id);
  return new;
end;
$$;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_client uuid;
  recipient record;
begin
  select client_id into conversation_client
  from public.conversations where id = new.conversation_id;

  if new.sender_id = conversation_client then
    for recipient in
      select id from public.profiles
      where is_active and (
        role in ('office_admin', 'super_admin')
        or id = (select assigned_to from public.conversations where id = new.conversation_id)
      )
    loop
      insert into public.notifications (user_id, title, body, title_ar, body_ar, title_en, body_en, kind, related_id)
      values (recipient.id, 'New client message', 'A client sent a new message.', 'رسالة جديدة من عميل', 'أرسل أحد العملاء رسالة جديدة.', 'New client message', 'A client sent a new message.', 'message', new.conversation_id);
    end loop;
  else
    insert into public.notifications (user_id, title, body, title_ar, body_ar, title_en, body_en, kind, related_id)
    values (conversation_client, 'New office message', 'The office sent you a new message.', 'رسالة جديدة من المكتب', 'أرسل المكتب رسالة جديدة.', 'New office message', 'The office sent you a new message.', 'message', new.conversation_id);
  end if;
  return new;
end;
$$;

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
for each row execute function public.touch_conversation();

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
for each row execute function public.notify_new_message();

drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify after insert or update on public.appointments
for each row execute function public.notify_record_change();

drop trigger if exists service_requests_notify on public.service_requests;
create trigger service_requests_notify after insert or update on public.service_requests
for each row execute function public.notify_record_change();

drop trigger if exists documents_notify on public.documents;
create trigger documents_notify after insert or update on public.documents
for each row execute function public.notify_record_change();

alter table public.services enable row level security;
alter table public.office_settings enable row level security;
alter table public.office_availability enable row level security;
alter table public.appointments enable row level security;
alter table public.service_requests enable row level security;
alter table public.documents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services for select using (is_active or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));
drop policy if exists services_admin_manage on public.services;
create policy services_admin_manage on public.services for all using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])
  or (public.current_role() = 'staff'::public.user_role and public.can_access_client_records(id))
);

drop policy if exists office_settings_public_read on public.office_settings;
create policy office_settings_public_read on public.office_settings for select
using (key in ('timezone', 'office_name', 'email', 'phone', 'address', 'whatsapp', 'facebook', 'map_url'));
drop policy if exists office_settings_admin_manage on public.office_settings;
create policy office_settings_admin_manage on public.office_settings for all
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));

drop policy if exists availability_public_read on public.office_availability;
create policy availability_public_read on public.office_availability for select using (is_active or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));
drop policy if exists availability_admin_manage on public.office_availability;
create policy availability_admin_manage on public.office_availability for all
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]));

drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select
using (client_id = auth.uid() or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role));
drop policy if exists appointments_client_insert on public.appointments;
create policy appointments_client_insert on public.appointments for insert
with check (client_id = auth.uid() and status = 'pending' and assigned_to is null and internal_note = '');
drop policy if exists appointments_client_update on public.appointments;
create policy appointments_client_update on public.appointments for update
using (client_id = auth.uid() or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role))
with check (client_id = auth.uid() or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role));

drop policy if exists service_requests_read on public.service_requests;
create policy service_requests_read on public.service_requests for select
using (client_id = auth.uid() or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role));
drop policy if exists service_requests_client_insert on public.service_requests;
create policy service_requests_client_insert on public.service_requests for insert
with check (client_id = auth.uid() and status = 'pending' and assigned_to is null and internal_note = '');
drop policy if exists service_requests_staff_update on public.service_requests;
create policy service_requests_staff_update on public.service_requests for update
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role));

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select
using (client_id = auth.uid() or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (handled_by = auth.uid() and public.current_role() = 'staff'::public.user_role));
drop policy if exists documents_client_insert on public.documents;
create policy documents_client_insert on public.documents for insert
with check (client_id = auth.uid() and uploaded_by = auth.uid() and status = 'received' and handled_by is null and staff_note = '');
drop policy if exists documents_staff_insert on public.documents;
create policy documents_staff_insert on public.documents for insert
with check ((public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (public.current_role() = 'staff'::public.user_role and public.can_access_client_records(client_id))) and uploaded_by = auth.uid() and handled_by = auth.uid());
drop policy if exists documents_staff_manage on public.documents;
create policy documents_staff_manage on public.documents for update
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (handled_by = auth.uid() and public.current_role() = 'staff'::public.user_role))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (handled_by = auth.uid() and public.current_role() = 'staff'::public.user_role));

drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select using (public.can_access_conversation(id));
drop policy if exists conversations_client_insert on public.conversations;
create policy conversations_client_insert on public.conversations for insert with check (client_id = auth.uid() and assigned_to is null);
drop policy if exists conversations_staff_update on public.conversations;
create policy conversations_staff_update on public.conversations for update
using (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role))
with check (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (assigned_to = auth.uid() and public.current_role() = 'staff'::public.user_role));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select using (public.can_access_conversation(conversation_id));
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert
with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id));
drop policy if exists messages_mark_read on public.messages;
create policy messages_mark_read on public.messages for update
using (public.can_access_conversation(conversation_id) and sender_id <> auth.uid())
with check (public.can_access_conversation(conversation_id) and sender_id <> auth.uid());

drop policy if exists message_attachments_read on public.message_attachments;
create policy message_attachments_read on public.message_attachments for select
using (exists (select 1 from public.messages m where m.id = message_id and public.can_access_conversation(m.conversation_id)));
drop policy if exists message_attachments_insert on public.message_attachments;
create policy message_attachments_insert on public.message_attachments for insert
with check (exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid()
  and public.can_access_conversation(m.conversation_id)
  and storage_path like m.conversation_id::text || '/' || auth.uid()::text || '/%'));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('client-documents', 'client-documents', false, 20971520),
       ('message-attachments', 'message-attachments', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists client_documents_read on storage.objects;
create policy client_documents_read on storage.objects for select
using (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.can_access_document_path(name) or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])));
drop policy if exists client_documents_insert on storage.objects;
create policy client_documents_insert on storage.objects for insert
with check (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or public.can_access_client_path((storage.foldername(name))[1])));
drop policy if exists client_documents_delete on storage.objects;
create policy client_documents_delete on storage.objects for delete
using (bucket_id = 'client-documents' and public.document_path_is_unregistered(name)
  and (public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role]) or (storage.foldername(name))[1] = auth.uid()::text));

drop policy if exists message_files_read on storage.objects;
create policy message_files_read on storage.objects for select
using (bucket_id = 'message-attachments' and public.can_access_conversation_path((storage.foldername(name))[1]));
drop policy if exists message_files_insert on storage.objects;
create policy message_files_insert on storage.objects for insert
with check (bucket_id = 'message-attachments' and public.can_access_conversation_path((storage.foldername(name))[1]) and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists message_files_delete on storage.objects;
create policy message_files_delete on storage.objects for delete
using (bucket_id = 'message-attachments' and public.can_access_conversation_path((storage.foldername(name))[1]) and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (select 1 from public.message_attachments a where a.storage_path = name));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_attachments') then
      alter publication supabase_realtime add table public.message_attachments;
    end if;
  end if;
end;
$$;
