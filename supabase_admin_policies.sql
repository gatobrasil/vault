-- ============================================================
-- VOZIA ADMIN — Políticas para painel admin no Supabase
-- Rode este arquivo no Supabase > SQL Editor.
--
-- IMPORTANTE:
-- Troque o e-mail abaixo se quiser outro administrador.
-- ============================================================

create or replace function public.is_vozia_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'thalesrenogrilo@gmail.com'
  );
$$;

-- PROFILES
drop policy if exists "admin_select_profiles" on public.profiles;
create policy "admin_select_profiles"
on public.profiles
for select
to authenticated
using (public.is_vozia_admin());

-- RECORDINGS
drop policy if exists "admin_select_recordings" on public.recordings;
create policy "admin_select_recordings"
on public.recordings
for select
to authenticated
using (public.is_vozia_admin());

-- LEGACY MESSAGES
drop policy if exists "admin_select_legacy_messages" on public.legacy_messages;
create policy "admin_select_legacy_messages"
on public.legacy_messages
for select
to authenticated
using (public.is_vozia_admin());

-- VOZIA CARE REQUESTS
drop policy if exists "admin_select_vozia_care_requests" on public.vozia_care_requests;
create policy "admin_select_vozia_care_requests"
on public.vozia_care_requests
for select
to authenticated
using (public.is_vozia_admin());

-- DELETION REQUESTS
drop policy if exists "admin_select_deletion_requests" on public.deletion_requests;
create policy "admin_select_deletion_requests"
on public.deletion_requests
for select
to authenticated
using (public.is_vozia_admin());

-- AUTHORIZED CONTACTS
drop policy if exists "admin_select_authorized_contacts" on public.authorized_contacts;
create policy "admin_select_authorized_contacts"
on public.authorized_contacts
for select
to authenticated
using (public.is_vozia_admin());

-- AUDIT LOGS
drop policy if exists "admin_select_audit_logs" on public.audit_logs;
create policy "admin_select_audit_logs"
on public.audit_logs
for select
to authenticated
using (public.is_vozia_admin());
