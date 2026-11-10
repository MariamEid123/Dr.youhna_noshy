-- Add only the missing private buckets and their access policies.
-- Existing buckets and policies are never replaced or made more permissive.

do $$
begin
  if exists (
    select 1 from storage.buckets
    where id in ('client-documents', 'message-attachments') and public
  ) then
    raise exception 'A Y GROUP storage bucket is public; review it before continuing';
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('client-documents', 'client-documents', false, 20971520),
  ('message-attachments', 'message-attachments', false, 20971520)
on conflict (id) do nothing;

do $storage_policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'client_documents_read'
  ) then
    execute $policy$
      create policy client_documents_read on storage.objects for select
      using (
        bucket_id = 'client-documents'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.can_access_document_path(name)
          or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'client_documents_insert'
  ) then
    execute $policy$
      create policy client_documents_insert on storage.objects for insert
      with check (
        bucket_id = 'client-documents'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])
          or public.can_access_client_path((storage.foldername(name))[1])
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'client_documents_delete'
  ) then
    execute $policy$
      create policy client_documents_delete on storage.objects for delete
      using (
        bucket_id = 'client-documents'
        and public.document_path_is_unregistered(name)
        and (
          public.has_any_role(array['office_admin'::public.user_role, 'super_admin'::public.user_role])
          or (storage.foldername(name))[1] = auth.uid()::text
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'message_files_read'
  ) then
    execute $policy$
      create policy message_files_read on storage.objects for select
      using (
        bucket_id = 'message-attachments'
        and public.can_access_conversation_path((storage.foldername(name))[1])
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'message_files_insert'
  ) then
    execute $policy$
      create policy message_files_insert on storage.objects for insert
      with check (
        bucket_id = 'message-attachments'
        and public.can_access_conversation_path((storage.foldername(name))[1])
        and (storage.foldername(name))[2] = auth.uid()::text
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'message_files_delete'
  ) then
    execute $policy$
      create policy message_files_delete on storage.objects for delete
      using (
        bucket_id = 'message-attachments'
        and public.can_access_conversation_path((storage.foldername(name))[1])
        and (storage.foldername(name))[2] = auth.uid()::text
        and not exists (
          select 1 from public.message_attachments a
          where a.storage_path = name
        )
      )
    $policy$;
  end if;
end
$storage_policies$;
