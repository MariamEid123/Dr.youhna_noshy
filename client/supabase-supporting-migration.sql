-- Additive support for existing Y GROUP application features.
-- This migration creates new objects only; it does not alter or drop the
-- existing application tables, policies, profile trigger, or Storage bucket.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.required_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  title text not null,
  fulfilled boolean not null default false,
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  note text,
  stage integer check (stage between 0 and 3),
  created_at timestamptz not null default now(),
  constraint request_notes_content_required check (note is not null or stage is not null)
);

create table if not exists public.document_requests (
  document_id uuid not null references public.documents(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (document_id, request_id)
);

create index if not exists idx_required_documents_client_id
  on public.required_documents(client_id);
create index if not exists idx_required_documents_request_id
  on public.required_documents(request_id);
create index if not exists idx_request_notes_request_id_created_at
  on public.request_notes(request_id, created_at);
create index if not exists idx_document_requests_request_id
  on public.document_requests(request_id);

alter table public.services enable row level security;
alter table public.required_documents enable row level security;
alter table public.request_notes enable row level security;
alter table public.document_requests enable row level security;

grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.required_documents to authenticated;
grant select, insert on public.request_notes to authenticated;
grant select on public.document_requests to authenticated;

-- Keep existing table definitions and RLS policies intact while restricting
-- sensitive writes to the validated SECURITY DEFINER functions below.
revoke update on public.profiles from anon, authenticated;
revoke insert, update on public.requests from anon, authenticated;
revoke insert, update, delete on public.documents from anon, authenticated;
revoke insert, update on public.appointments from anon, authenticated;
revoke insert, update, delete on public.conversations from anon, authenticated;
revoke insert, update, delete on public.conversation_participants from anon, authenticated;
revoke insert on public.messages from anon, authenticated;
revoke insert, update on public.invoices from anon, authenticated;

drop policy if exists "Anyone can view active services" on public.services;
create policy "Anyone can view active services"
  on public.services for select
  using (active = true);

drop policy if exists "Staff can manage services" on public.services;
create policy "Staff can manage services"
  on public.services for all to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists "Clients and staff can read required documents" on public.required_documents;
create policy "Clients and staff can read required documents"
  on public.required_documents for select to authenticated
  using (
    private.is_staff()
    or client_id = private.get_my_client_id()
  );

drop policy if exists "Staff can manage required documents" on public.required_documents;
create policy "Staff can manage required documents"
  on public.required_documents for all to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists "Clients and staff can read request notes" on public.request_notes;
create policy "Clients and staff can read request notes"
  on public.request_notes for select to authenticated
  using (
    private.is_staff()
    or exists (
      select 1
      from public.requests r
      where r.id = request_id
        and r.client_id = private.get_my_client_id()
    )
  );

drop policy if exists "Staff can create request notes" on public.request_notes;
create policy "Staff can create request notes"
  on public.request_notes for insert to authenticated
  with check (
    private.is_staff()
    and user_id = auth.uid()
  );

drop policy if exists "Clients and staff can read document request links" on public.document_requests;
create policy "Clients and staff can read document request links"
  on public.document_requests for select to authenticated
  using (
    private.is_staff()
    or client_id = private.get_my_client_id()
  );

insert into public.services (name, description)
values
  ('الخدمات المحاسبية', 'إعداد وتنظيم الحسابات والتقارير الدورية.'),
  ('الخدمات الضريبية', 'إعداد الإقرارات ومتابعة الالتزامات الضريبية.'),
  ('القوائم المالية', 'إعداد قوائم مالية واضحة لدعم قراراتك.'),
  ('مسك الدفاتر', 'تسجيل منظم لحركة النشاط ومراجعته باستمرار.'),
  ('خدمات الرواتب', 'إدارة الرواتب والالتزامات المرتبطة بها.'),
  ('تأسيس الشركات', 'المساعدة في إجراءات تأسيس الشركات وتسجيلها.'),
  ('الاستشارات المالية', 'تحليل مالي يساعدك على التخطيط بثقة.'),
  ('الاستشارات الضريبية', 'إجابات عملية عن المسائل والقرارات الضريبية.')
on conflict (name) do nothing;

with unique_client_emails as (
  select lower(p.email) as email, (array_agg(p.id))[1] as user_id
  from public.profiles p
  where p.role = 'client' and p.email is not null
  group by lower(p.email)
  having count(*) = 1
)
update public.clients c
set user_id = u.user_id,
    updated_at = now()
from unique_client_emails u
where c.user_id is null
  and lower(c.email) = u.email
  and not exists (
    select 1 from public.clients linked
    where linked.user_id = u.user_id
  );

insert into public.clients (user_id, full_name, email, phone)
select p.id, coalesce(p.full_name, ''), p.email, p.phone
from public.profiles p
where p.role = 'client'
on conflict (user_id) do nothing;

create or replace function public.ensure_my_client_record()
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_company_name text;
  v_client public.clients;
begin
  select p.* into v_profile
  from public.profiles p
  where p.id = auth.uid();
  if not found or v_profile.role <> 'client' then
    raise exception 'Only clients can provision a client record';
  end if;

  select u.raw_user_meta_data ->> 'company_name'
  into v_company_name
  from auth.users u
  where u.id = auth.uid();

  insert into public.clients (user_id, full_name, email, phone, company_name)
  values (
    auth.uid(),
    coalesce(v_profile.full_name, ''),
    v_profile.email,
    v_profile.phone,
    v_company_name
  )
  on conflict (user_id) do update
    set full_name = coalesce(nullif(clients.full_name, ''), excluded.full_name),
        email = coalesce(clients.email, excluded.email),
        phone = coalesce(clients.phone, excluded.phone),
        company_name = coalesce(clients.company_name, excluded.company_name),
        updated_at = now()
  returning * into v_client;
  return v_client;
end;
$$;

revoke all on function public.ensure_my_client_record() from public;
grant execute on function public.ensure_my_client_record() to authenticated;

create or replace function public.create_client_request(
  p_title text,
  p_description text,
  p_service_id uuid
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_request public.requests;
begin
  if private.get_my_role() <> 'client' then
    raise exception 'Only clients can create service requests';
  end if;
  if p_title is null or length(btrim(p_title)) < 2 or length(p_title) > 160
    or p_description is null or length(btrim(p_description)) < 5
    or length(p_description) > 5000
    or not exists (select 1 from public.services s where s.id = p_service_id and s.active) then
    raise exception 'Request data is invalid';
  end if;

  select c.id into v_client_id
  from public.clients c
  where c.user_id = auth.uid();
  if v_client_id is null then
    raise exception 'Client profile not found';
  end if;

  insert into public.requests (client_id, title, description, category, status, priority)
  values (v_client_id, btrim(p_title), btrim(p_description), p_service_id::text, 'pending', 'normal')
  returning * into v_request;

  insert into public.notifications (user_id, title, message, type)
  select p.id, 'طلب خدمة جديد', v_request.title, 'request'
  from public.profiles p
  where p.role in ('super_admin', 'accountant', 'receptionist');

  return v_request;
end;
$$;

revoke all on function public.create_client_request(text, text, uuid) from public;
grant execute on function public.create_client_request(text, text, uuid) to authenticated;

create or replace function public.manage_staff_request(
  p_request_id uuid,
  p_status text default null,
  p_stage integer default null,
  p_note text default null
)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_previous_status text;
begin
  if coalesce(private.get_my_role(), '') not in ('super_admin', 'accountant') then
    raise exception 'Not authorized';
  end if;
  if p_status is null and p_stage is null and nullif(btrim(p_note), '') is null then
    raise exception 'No request changes supplied';
  end if;
  if p_status is not null and p_status not in (
    'pending', 'in_progress', 'waiting_for_client', 'completed', 'cancelled'
  ) then
    raise exception 'Request status is invalid';
  end if;
  if p_stage is not null and p_stage not between 0 and 3 then
    raise exception 'Request stage is invalid';
  end if;
  if p_note is not null and (length(btrim(p_note)) < 1 or length(p_note) > 2000) then
    raise exception 'Request note is invalid';
  end if;

  if p_status is not null then
    select r.status into v_previous_status
    from public.requests r
    where r.id = p_request_id;
    update public.requests
    set status = p_status,
        completed_at = case when p_status = 'completed' then now() else null end,
        updated_at = now()
    where id = p_request_id
    returning * into v_request;
  else
    select r.* into v_request
    from public.requests r
    where r.id = p_request_id;
  end if;
  if not found then
    raise exception 'Request not found';
  end if;

  if p_status is not null and v_previous_status is distinct from v_request.status then
    insert into public.notifications (user_id, title, message, type)
    select c.user_id, 'تحديث حالة الطلب', v_request.title, 'request'
    from public.clients c
    where c.id = v_request.client_id and c.user_id is not null;
  end if;

  if p_stage is not null or nullif(btrim(p_note), '') is not null then
    insert into public.request_notes (request_id, user_id, note, stage)
    values (p_request_id, auth.uid(), nullif(btrim(p_note), ''), p_stage);
  end if;
  return v_request;
end;
$$;

revoke all on function public.manage_staff_request(uuid, text, integer, text) from public;
grant execute on function public.manage_staff_request(uuid, text, integer, text) to authenticated;

create or replace function public.update_my_client_profile(
  p_full_name text,
  p_phone text,
  p_company_name text,
  p_address text
)
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
begin
  if coalesce(private.get_my_role(), '') <> 'client' then
    raise exception 'Not authorized';
  end if;

  update public.profiles
  set full_name = nullif(btrim(p_full_name), ''),
      phone = nullif(btrim(p_phone), ''),
      updated_at = now()
  where id = auth.uid()
    and role = 'client';

  update public.clients
  set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
      phone = nullif(btrim(p_phone), ''),
      company_name = nullif(btrim(p_company_name), ''),
      address = nullif(btrim(p_address), ''),
      updated_at = now()
  where user_id = auth.uid()
  returning * into v_client;

  if not found then
    raise exception 'Client profile not found';
  end if;
  return v_client;
end;
$$;

revoke all on function public.update_my_client_profile(text, text, text, text) from public;
grant execute on function public.update_my_client_profile(text, text, text, text) to authenticated;

create or replace function public.create_staff_invoice(
  p_client_id uuid,
  p_description text,
  p_amount numeric,
  p_due_date date
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_client_user_id uuid;
begin
  if coalesce(private.get_my_role(), '') not in ('super_admin', 'accountant') then
    raise exception 'Not authorized';
  end if;
  if p_description is null or length(btrim(p_description)) < 1
    or length(p_description) > 160
    or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99
    or p_due_date is null then
    raise exception 'Invoice data is invalid';
  end if;

  select c.user_id into v_client_user_id
  from public.clients c where c.id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;

  insert into public.invoices (
    client_id, invoice_number, description, subtotal, tax, total,
    status, due_date, issued_at
  )
  values (
    p_client_id,
    'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    btrim(p_description),
    p_amount,
    0,
    p_amount,
    'issued',
    p_due_date,
    now()
  )
  returning * into v_invoice;

  if v_client_user_id is not null then
    insert into public.notifications (user_id, title, message, type)
    values (v_client_user_id, 'فاتورة جديدة', v_invoice.invoice_number, 'invoice');
  end if;
  return v_invoice;
end;
$$;

revoke all on function public.create_staff_invoice(uuid, text, numeric, date) from public;
grant execute on function public.create_staff_invoice(uuid, text, numeric, date) to authenticated;

create or replace function public.mark_staff_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  if coalesce(private.get_my_role(), '') not in ('super_admin', 'accountant') then
    raise exception 'Not authorized';
  end if;
  update public.invoices
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;
  if not found then
    raise exception 'Invoice not found';
  end if;
  return v_invoice;
end;
$$;

revoke all on function public.mark_staff_invoice_paid(uuid) from public;
grant execute on function public.mark_staff_invoice_paid(uuid) to authenticated;

create or replace function public.ensure_client_conversation(p_client_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_client_id uuid;
  v_conversation_id uuid;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null then
    raise exception 'Authenticated profile not found';
  end if;

  if v_role = 'client' then
    select c.id into v_client_id
    from public.clients c
    where c.user_id = auth.uid();
  elsif v_role in ('super_admin', 'accountant', 'receptionist') then
    v_client_id := p_client_id;
  else
    raise exception 'Not authorized';
  end if;

  if v_client_id is null or not exists (
    select 1 from public.clients c where c.id = v_client_id
  ) then
    raise exception 'Client not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_client_id::text, 0));
  select c.id into v_conversation_id
  from public.conversations c
  where c.client_id = v_client_id
  order by c.created_at
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (client_id, subject)
    values (v_client_id, 'التواصل مع المكتب')
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conversation_id, c.user_id
  from public.clients c
  where c.id = v_client_id and c.user_id is not null
  on conflict (conversation_id, user_id) do nothing;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conversation_id, p.id
  from public.profiles p
  where p.role in ('super_admin', 'accountant', 'receptionist')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke all on function public.ensure_client_conversation(uuid) from public;
grant execute on function public.ensure_client_conversation(uuid) to authenticated;

create or replace function public.create_conversation_message(
  p_conversation_id uuid,
  p_message text
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages;
begin
  if p_message is null or length(btrim(p_message)) < 1 or length(p_message) > 3000
    or not exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = p_conversation_id
        and cp.user_id = auth.uid()
    ) then
    raise exception 'Message data is invalid or access is denied';
  end if;

  insert into public.messages (conversation_id, sender_id, message)
  values (p_conversation_id, auth.uid(), btrim(p_message))
  returning * into v_message;

  insert into public.notifications (user_id, title, message, type)
  select cp.user_id, 'رسالة جديدة', left(v_message.message, 180), 'message'
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id
    and cp.user_id <> auth.uid();

  return v_message;
end;
$$;

revoke all on function public.create_conversation_message(uuid, text) from public;
grant execute on function public.create_conversation_message(uuid, text) to authenticated;

create or replace function public.book_client_appointment(
  p_client_id uuid,
  p_title text,
  p_description text,
  p_appointment_date date,
  p_start_time time
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_client_id uuid;
  v_appointment public.appointments;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role = 'client' then
    select c.id into v_client_id
    from public.clients c where c.user_id = auth.uid();
  elsif v_role in ('super_admin', 'accountant', 'receptionist') then
    v_client_id := p_client_id;
  else
    raise exception 'Not authorized';
  end if;

  if v_client_id is null or not exists (
    select 1 from public.clients c where c.id = v_client_id
  ) then
    raise exception 'Client not found';
  end if;
  if p_title is null or length(btrim(p_title)) < 2
    or p_appointment_date is null
    or p_start_time is null
    or (p_appointment_date + p_start_time) at time zone 'Africa/Cairo' <= now()
    or extract(hour from p_start_time) < 9
    or extract(hour from p_start_time) > 15
    or extract(minute from p_start_time) <> 0 then
    raise exception 'Appointment time is not available';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_appointment_date::text || ' ' || p_start_time::text, 1
  ));
  if exists (
    select 1 from public.appointments a
    where a.appointment_date = p_appointment_date
      and a.start_time = p_start_time
      and a.status in ('scheduled', 'confirmed')
  ) then
    raise exception 'Appointment slot is already booked';
  end if;

  insert into public.appointments (
    client_id, title, description, appointment_date, start_time,
    status, staff_id
  )
  values (
    v_client_id, btrim(p_title), p_description, p_appointment_date,
    p_start_time, 'scheduled',
    case when v_role = 'client' then null else auth.uid() end
  )
  returning * into v_appointment;

  if v_role = 'client' then
    insert into public.notifications (user_id, title, message, type)
    select p.id, 'موعد جديد', v_appointment.title, 'appointment'
    from public.profiles p
    where p.role in ('super_admin', 'accountant', 'receptionist');
  else
    insert into public.notifications (user_id, title, message, type)
    select c.user_id, 'تم حجز موعد لك من المكتب', v_appointment.title, 'appointment'
    from public.clients c
    where c.id = v_client_id and c.user_id is not null;
  end if;

  return v_appointment;
end;
$$;

revoke all on function public.book_client_appointment(uuid, text, text, date, time) from public;
grant execute on function public.book_client_appointment(uuid, text, text, date, time) to authenticated;

create or replace function public.manage_client_appointment(
  p_appointment_id uuid,
  p_action text,
  p_appointment_date date default null,
  p_start_time time default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_appointment public.appointments;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is null then
    raise exception 'Authenticated profile not found';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.id = p_appointment_id
    and (
      private.is_staff()
      or a.client_id = private.get_my_client_id()
    )
  for update;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if p_action = 'cancel' then
    if v_role = 'client'
      and ((v_appointment.appointment_date + v_appointment.start_time) at time zone 'Africa/Cairo') - now() < interval '24 hours' then
      raise exception 'Cancellation must be made 24 hours in advance';
    end if;
    update public.appointments set status = 'cancelled', updated_at = now()
    where id = p_appointment_id returning * into v_appointment;
  elsif p_action = 'complete' and v_role in ('super_admin', 'accountant', 'receptionist') then
    update public.appointments set status = 'completed', updated_at = now()
    where id = p_appointment_id returning * into v_appointment;
  elsif p_action = 'reschedule' then
    if v_role = 'client'
      and ((v_appointment.appointment_date + v_appointment.start_time) at time zone 'Africa/Cairo') - now() < interval '24 hours' then
      raise exception 'Rescheduling must be made 24 hours in advance';
    end if;
    if p_appointment_date is null
      or p_start_time is null
      or (p_appointment_date + p_start_time) at time zone 'Africa/Cairo' <= now()
      or extract(hour from p_start_time) < 9
      or extract(hour from p_start_time) > 15
      or extract(minute from p_start_time) <> 0 then
      raise exception 'Appointment time is not available';
    end if;

    if v_role = 'client' then
      insert into public.notifications (user_id, title, message, type)
      select p.id, 'تحديث الموعد', v_appointment.title, 'appointment'
      from public.profiles p
      where p.role in ('super_admin', 'accountant', 'receptionist');
    else
      insert into public.notifications (user_id, title, message, type)
      select c.user_id, 'تحديث الموعد', v_appointment.title, 'appointment'
      from public.clients c
      where c.id = v_appointment.client_id and c.user_id is not null;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      p_appointment_date::text || ' ' || p_start_time::text, 1
    ));
    if exists (
      select 1 from public.appointments a
      where a.id <> p_appointment_id
        and a.appointment_date = p_appointment_date
        and a.start_time = p_start_time
        and a.status in ('scheduled', 'confirmed')
    ) then
      raise exception 'Appointment slot is already booked';
    end if;

    update public.appointments
    set appointment_date = p_appointment_date,
        start_time = p_start_time,
        updated_at = now()
    where id = p_appointment_id returning * into v_appointment;
  else
    raise exception 'Not authorized';
  end if;

  return v_appointment;
end;
$$;

revoke all on function public.manage_client_appointment(uuid, text, date, time) from public;
grant execute on function public.manage_client_appointment(uuid, text, date, time) to authenticated;

create or replace function public.get_booked_appointment_slots()
returns table (appointment_date date, start_time time)
language sql
security definer
stable
set search_path = ''
as $$
  select a.appointment_date, a.start_time
  from public.appointments a
  where a.status in ('scheduled', 'confirmed')
    and (
      a.appointment_date + a.start_time
    ) at time zone 'Africa/Cairo' >= now();
$$;

revoke all on function public.get_booked_appointment_slots() from public;
grant execute on function public.get_booked_appointment_slots() to authenticated;
