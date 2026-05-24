-- ============================================================
-- VOZIA V8.12 — Correção iPhone + Buckets em português
-- Rode no Supabase SQL Editor.
--
-- O código agora tenta buckets em inglês e português.
-- Este SQL garante que os buckets principais em inglês existam também.
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('voice-recordings', 'voice-recordings', false),
  ('legacy-audios', 'legacy-audios', false),
  ('patient-photos', 'patient-photos', false),
  ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

-- Policies para bucket voice-recordings
drop policy if exists "storage_voice_select_own" on storage.objects;
create policy "storage_voice_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('voice-recordings', 'gravações de voz', 'gravacoes de voz', 'gravações-de-voz', 'gravacoes-de-voz')
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_voice_insert_own" on storage.objects;
create policy "storage_voice_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('voice-recordings', 'gravações de voz', 'gravacoes de voz', 'gravações-de-voz', 'gravacoes-de-voz')
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_voice_update_own" on storage.objects;
create policy "storage_voice_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('voice-recordings', 'gravações de voz', 'gravacoes de voz', 'gravações-de-voz', 'gravacoes-de-voz')
  and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
  bucket_id in ('voice-recordings', 'gravações de voz', 'gravacoes de voz', 'gravações-de-voz', 'gravacoes-de-voz')
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

-- Policies para legacy
drop policy if exists "storage_legacy_select_own" on storage.objects;
create policy "storage_legacy_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('legacy-audios', 'áudios legados', 'audios legados', 'áudios-legados', 'audios-legados')
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_legacy_insert_own" on storage.objects;
create policy "storage_legacy_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('legacy-audios', 'áudios legados', 'audios legados', 'áudios-legados', 'audios-legados')
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

-- Confirme se existe tabela recordings
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phrase_index int not null,
  phrase_category text,
  phrase_text text not null,
  audio_path text not null,
  duration_ms int,
  quality_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, phrase_index)
);

alter table public.recordings enable row level security;

drop policy if exists "recordings_select_own" on public.recordings;
create policy "recordings_select_own"
on public.recordings
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "recordings_insert_own" on public.recordings;
create policy "recordings_insert_own"
on public.recordings
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "recordings_update_own" on public.recordings;
create policy "recordings_update_own"
on public.recordings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

select id, name, public
from storage.buckets
where id in ('voice-recordings', 'legacy-audios', 'gravações de voz', 'áudios legados');
