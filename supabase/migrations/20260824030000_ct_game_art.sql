-- Optional tile art per fast-select game.
alter table ct_games add column if not exists image_url text;

-- Public storage bucket for game tile art. Objects live under <auth_uid>/<key>.jpg so a
-- user can only write within their own folder; reads are public (public bucket) since the
-- tile <img> loads the URL directly.
insert into storage.buckets (id, name, public) values ('ct-game-art', 'ct-game-art', true)
  on conflict (id) do nothing;

drop policy if exists "ct_art_insert_own" on storage.objects;
create policy "ct_art_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ct-game-art' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ct_art_update_own" on storage.objects;
create policy "ct_art_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'ct-game-art' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ct_art_delete_own" on storage.objects;
create policy "ct_art_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'ct-game-art' and (storage.foldername(name))[1] = auth.uid()::text);
