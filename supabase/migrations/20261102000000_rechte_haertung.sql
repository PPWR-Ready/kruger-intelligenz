-- Rechte-Härtung nach dem Code-Audit vom 01.11.2026.
-- 1. Trainer sehen und ändern nur Mitglieder-Einladungen (keine Team-/Admin-Codes mehr).
-- 2. Trainer ändern keine Team-Konten (z. B. Admin sperren) außer dem eigenen.
-- 3. Änderungen eines Trainers an einer freigegebenen Übung gehen immer erneut zur Freigabe.
-- 4. Freigaben nur für eigene Inhalte (bzw. globales Wissen); ältere Versionen werden nie wieder aktuell.
-- 5. Überholte Wissensversionen werden aus dem Index entfernt, auch wenn sie noch ausstehen.

-- 1. Einladungscodes: zusätzliche (einschränkende) Regel neben code_team
create policy code_nur_mitglieder_fuer_trainer on public.einladungscodes as restrictive for all to authenticated
  using (rolle = 'mitglied' or (select public.ist_gruender()))
  with check (rolle = 'mitglied' or (select public.ist_gruender()));

-- 2. Team-Konten sind vor Trainern geschützt
create or replace function public.profiles_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.id <> old.id or new.studio_id <> old.studio_id then
    raise exception 'Studio und Konto-ID können nicht geändert werden';
  end if;
  if new.rolle <> old.rolle and not ist_gruender() then
    raise exception 'Nur Admins dürfen Rollen ändern';
  end if;
  if old.id <> auth.uid() and old.rolle <> 'mitglied' and not ist_gruender() then
    raise exception 'Nur Admins dürfen Team-Konten ändern';
  end if;
  if (new.freigeschaltet <> old.freigeschaltet
      or new.freigeschaltet_von is distinct from old.freigeschaltet_von
      or new.external_member_id is distinct from old.external_member_id)
     and not ist_team() then
    raise exception 'Nur das Team darf Freischaltung und Mitgliedsnummer ändern';
  end if;
  if new.freigeschaltet and not old.freigeschaltet then
    new.freigeschaltet_von := auth.uid();
  end if;
  return new;
end $$;

-- 3. Freigegebene Übung von Nicht-Admin geändert: zurück zur Freigabe
create function public.uebung_aenderung_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.status = 'freigegeben' and new.status = 'freigegeben'
     and not ist_gruender()
     and (new.regeln is distinct from old.regeln or new.name is distinct from old.name
          or new.beschreibung is distinct from old.beschreibung or new.kategorie is distinct from old.kategorie
          or new.an_geraet is distinct from old.an_geraet) then
    new.status := 'eingereicht';
  end if;
  return new;
end $$;
revoke execute on function public.uebung_aenderung_pruefen() from public, anon, authenticated;
create trigger uebung_aenderung_pruefen before update on public.uebungen
  for each row execute function public.uebung_aenderung_pruefen();

-- 4a. Freigaben nur für Inhalte des eigenen Studios (globales Wissen bleibt für das Team einreichbar)
create policy freigabe_nur_eigene_inhalte on public.freigaben as restrictive for insert to authenticated
  with check (
    (typ = 'uebung' and exists (
      select 1 from public.uebungen u
       where u.id = uebung_id
         and (u.studio_id = (select public.mein_studio()) or (u.studio_id is null and (select public.ist_gruender())))))
    or (typ = 'wissen' and exists (
      select 1 from public.wissen_versionen v join public.wissen_eintraege w on w.id = v.eintrag_id
       where v.id = wissen_version_id
         and (w.studio_id is null or w.studio_id = (select public.mein_studio()))))
  );

-- 4b. Beim Freigeben wird nur eine neuere Version aktuell
create or replace function public.freigabe_anwenden() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_eintrag uuid;
  v_neu int;
begin
  if new.status = old.status then
    return new;
  end if;
  if auth.uid() is not null and not ist_gruender() then
    raise exception 'Nur Admins entscheiden über Freigaben';
  end if;
  new.entschieden_von := coalesce(auth.uid(), new.entschieden_von);
  new.entschieden_am  := now();

  if new.typ = 'wissen' then
    select eintrag_id, version into v_eintrag, v_neu from wissen_versionen where id = new.wissen_version_id;
    if new.status = 'freigegeben' then
      update wissen_eintraege w
         set status = 'freigegeben',
             aktuelle_version_id = case
               when w.aktuelle_version_id is null
                 or coalesce((select version from wissen_versionen where id = w.aktuelle_version_id), 0) <= v_neu
               then new.wissen_version_id else w.aktuelle_version_id end
       where w.id = v_eintrag;
    elsif new.status = 'abgelehnt' then
      update wissen_eintraege set status = 'abgelehnt'
       where id = v_eintrag and status = 'eingereicht';
    end if;
  else
    update uebungen
       set status = case when new.status = 'freigegeben' then 'freigegeben'::inhalt_status
                         else 'abgelehnt'::inhalt_status end
     where id = new.uebung_id;
  end if;
  return new;
end $$;

-- 5. Alte Versionen auch im Zustand „ausstehend“/„fehler“ zum Entfernen markieren
create or replace function public.wissen_index_markieren() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'freigegeben' then
    if old.aktuelle_version_id is distinct from new.aktuelle_version_id
       or old.status is distinct from 'freigegeben' then
      update wissen_versionen set index_status = 'zu_entfernen'
       where eintrag_id = new.id and id is distinct from new.aktuelle_version_id
         and index_status in ('indexiert', 'ausstehend', 'fehler');
      update wissen_versionen set index_status = 'ausstehend', index_fehler = null
       where id = new.aktuelle_version_id and index_status <> 'indexiert';
    end if;
  elsif old.status = 'freigegeben' then
    update wissen_versionen set index_status = 'zu_entfernen'
     where eintrag_id = new.id and index_status in ('indexiert', 'ausstehend', 'fehler');
  end if;
  return new;
end $$;

-- 6. Beispiel „Unterarmstütz“: Haltezeit läuft nur in der Stützposition (nicht im Stehen)
update public.uebungen
   set regeln = jsonb_set(regeln, '{pruefungen}',
         coalesce(regeln->'pruefungen', '[]'::jsonb)
         || '[{"id":"stuetz-lage","gelenk":"rumpfneigung","min":60,"max":null,"wann":"immer","meldung":"Geh in den Unterarmstütz – Körper waagerecht."}]'::jsonb)
 where regeln->>'modus' = 'halten'
   and name ilike '%unterarmstütz%'
   and not (regeln->'pruefungen' @> '[{"gelenk":"rumpfneigung"}]'::jsonb);
