-- ---------------------------------------------------------------------
-- 11. Storage (Dateien)
--   bewegungsdaten/<user_id>/<satz_id>.json.gz   Skelettdaten, nie Video
--   wissen/<studio_id>/<version_id>/<datei>       Uploads und Scans
--   uebungen/<studio_id>/<uebung_id>/referenz.json.gz
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('bewegungsdaten', 'bewegungsdaten', false),
  ('wissen',         'wissen',         false),
  ('uebungen',       'uebungen',       false)
on conflict (id) do nothing;

create policy bewegung_eigene on storage.objects for all to authenticated
  using (bucket_id = 'bewegungsdaten' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'bewegungsdaten' and (storage.foldername(name))[1] = auth.uid()::text);

create policy bewegung_team_lesen on storage.objects for select to authenticated
  using (bucket_id = 'bewegungsdaten'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.trainer_darf_sehen(((storage.foldername(name))[1])::uuid));

create policy wissen_dateien_team on storage.objects for all to authenticated
  using (bucket_id in ('wissen', 'uebungen') and public.ist_team()
         and (storage.foldername(name))[1] = public.mein_studio()::text)
  with check (bucket_id in ('wissen', 'uebungen') and public.ist_team()
              and (storage.foldername(name))[1] = public.mein_studio()::text);

-- Mitglieder brauchen Referenzaufnahmen freigegebener Übungen für den Trainer-Modus
create policy uebung_referenz_lesen on storage.objects for select to authenticated
  using (bucket_id = 'uebungen'
         and exists (select 1 from public.uebungen u
                     where u.referenz_storage_pfad = objects.name and u.status = 'freigegeben'
                       and (u.studio_id is null or u.studio_id = public.mein_studio())));

-- ---------------------------------------------------------------------
-- 12. Rechte für Funktionen
-- ---------------------------------------------------------------------
revoke execute on function public.code_einloesen(text, text) from public, anon;
revoke execute on function public.mitglieder_ampel()          from public, anon;
grant  execute on function public.code_einloesen(text, text) to authenticated;
grant  execute on function public.mitglieder_ampel()          to authenticated;

