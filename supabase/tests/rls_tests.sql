-- Funktionstests für Schema und Zugriffsregeln. Läuft gegen eine frische
-- Datenbank mit supabase_stubs.sql + schema.sql. Bricht beim ersten Fehler ab.
\set ON_ERROR_STOP on
\set QUIET on

-- Testpersonen
create or replace function als(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
end $$;
grant execute on function als(uuid) to authenticated;

create or replace function pruefe(bedingung boolean, name text) returns void language plpgsql as $$
begin
  if not coalesce(bedingung, false) then raise exception 'FEHLGESCHLAGEN: %', name; end if;
  raise notice 'ok  %', name;
end $$;
grant execute on function pruefe(boolean, text) to authenticated;

-- erwartet, dass eine Anweisung abgelehnt wird
create or replace function muss_scheitern(stmt text, name text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok  % (abgelehnt: %)', name, sqlerrm;
    return;
  end;
  raise exception 'FEHLGESCHLAGEN: % wurde nicht abgelehnt', name;
end $$;
grant execute on function muss_scheitern(text, text) to authenticated;

insert into studios (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Rückgrat Donaueschingen'),
  ('00000000-0000-0000-0000-0000000000b2', 'Anderes Studio');

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'), -- m1 Mitglied
  ('22222222-2222-2222-2222-222222222222'), -- m2 Mitglied
  ('33333333-3333-3333-3333-333333333333'), -- t1 Trainer
  ('44444444-4444-4444-4444-444444444444'), -- g1 Gründer
  ('55555555-5555-5555-5555-555555555555'), -- x  Trainer anderes Studio
  ('66666666-6666-6666-6666-666666666666'), -- n1 neu, löst Code ein
  ('77777777-7777-7777-7777-777777777777'); -- n2 neu, Code verbraucht

insert into profiles (id, studio_id, rolle, anzeigename, freigeschaltet) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'mitglied', 'Sabine M.', true),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000a1', 'mitglied', 'Thomas R.', true),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000a1', 'trainer',  'Daniel S.', true),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-0000000000a1', 'gruender', 'Lutz Kruger', true),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-0000000000b2', 'trainer',  'Fremd', true);

insert into einladungscodes (code, studio_id, max_nutzungen) values ('RG-TEST1', '00000000-0000-0000-0000-0000000000a1', 1);

insert into uebungen (id, studio_id, name, an_geraet, status, regeln) values
  ('99999999-0000-0000-0000-000000000001', null, 'Hüftbeuger', true, 'freigegeben',
   '{"winkel":[{"gelenk":"huefte","min":170,"max":185}]}');

set role authenticated;

-- 1. Registrierung per Einladungscode ------------------------------------
select als('66666666-6666-6666-6666-666666666666');
select pruefe((select studio_id from code_einloesen(' rg-test1 ', 'Neue Person')) = '00000000-0000-0000-0000-0000000000a1',
              'Code einlösen legt Profil im richtigen Studio an');
select pruefe((select not freigeschaltet from profiles where id = auth.uid()), 'neues Profil ist noch nicht freigeschaltet');
select als('77777777-7777-7777-7777-777777777777');
select muss_scheitern($$select code_einloesen('RG-TEST1', 'Zweite Person')$$, 'verbrauchter Code');

-- 2. Mitglied trainiert --------------------------------------------------
select als('11111111-1111-1111-1111-111111111111');
insert into einheiten (id, studio_id, mitglied_id, befinden, gestartet_am)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
          '11111111-1111-1111-1111-111111111111', 3, now() - interval '1 day');
insert into saetze (einheit_id, uebung_id, satz_nr, wiederholungen, qualitaet)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 1, 8, 'gut');
select pruefe((select count(*) from einheiten) = 1, 'Mitglied sieht eigene Einheit');
select pruefe((select count(*) from uebungen) = 1, 'Mitglied sieht freigegebene Übung');
select muss_scheitern($$insert into einheiten (studio_id, mitglied_id) values ('00000000-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222')$$,
                      'Einheit für fremdes Mitglied anlegen');
select muss_scheitern($$update profiles set rolle = 'gruender' where id = auth.uid()$$, 'eigene Rolle ändern');
select muss_scheitern($$update profiles set freigeschaltet = false where id = auth.uid()$$, 'eigene Freischaltung ändern');

select als('22222222-2222-2222-2222-222222222222');
select pruefe((select count(*) from einheiten) = 0, 'anderes Mitglied sieht fremde Einheit nicht');

-- 3. Trainer-Freigabe ----------------------------------------------------
select als('33333333-3333-3333-3333-333333333333');
select pruefe((select count(*) from einheiten) = 0, 'Trainer sieht ohne Einwilligung nichts');
select pruefe((select count(*) from mitglieder_ampel()) = 0, 'Ampel ohne Einwilligung leer');

select als('11111111-1111-1111-1111-111111111111');
insert into einwilligungen (user_id, art, erteilt, text_version)
  values ('11111111-1111-1111-1111-111111111111', 'trainer_freigabe', true, 'v1');
select pruefe((select count(*) from einwilligungen_log) = 1, 'Einwilligung wird protokolliert');

select als('33333333-3333-3333-3333-333333333333');
select pruefe((select count(*) from einheiten) = 1, 'Trainer sieht Einheit nach Einwilligung');
select pruefe((select count(*) from saetze) = 1, 'Trainer sieht Sätze nach Einwilligung');
select pruefe((select status from mitglieder_ampel() where mitglied_id = '11111111-1111-1111-1111-111111111111') = 'laeuft',
              'Ampel zeigt Mitglied mit Status');

select als('55555555-5555-5555-5555-555555555555');
select pruefe((select count(*) from einheiten) = 0, 'Trainer eines anderen Studios sieht nichts');

select als('11111111-1111-1111-1111-111111111111');
select pruefe((select count(*) from mitglieder_ampel()) = 0, 'Mitglied bekommt keine Ampel');
update einwilligungen set erteilt = false where user_id = auth.uid() and art = 'trainer_freigabe';
select als('33333333-3333-3333-3333-333333333333');
select pruefe((select count(*) from einheiten) = 0, 'Widerruf wirkt sofort');
select als('11111111-1111-1111-1111-111111111111');
update einwilligungen set erteilt = true where user_id = auth.uid() and art = 'trainer_freigabe';

-- 4. Chat ---------------------------------------------------------------
insert into chat_verlaeufe (id, studio_id, mitglied_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111');
insert into chat_nachrichten (verlauf_id, rolle, inhalt)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'mitglied', 'Mein Rücken zieht.');
select muss_scheitern($$insert into chat_nachrichten (verlauf_id, rolle, inhalt) values ('bbbbbbbb-0000-0000-0000-000000000001', 'assistent', 'gefälscht')$$,
                      'Mitglied schreibt KI-Antwort selbst');
select als('33333333-3333-3333-3333-333333333333');
select pruefe((select count(*) from chat_nachrichten) = 0, 'Trainer liest keine Chats');

-- 5. Wissen und Freigabe -------------------------------------------------
insert into wissen_eintraege (id, studio_id, titel, status, erstellt_von)
  values ('cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
          'Hüftbeuger nach Bandscheibenvorfall', 'eingereicht', '33333333-3333-3333-3333-333333333333');
insert into wissen_versionen (id, eintrag_id, version, inhalt, eingabeweg, erstellt_von)
  values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1,
          'Antwort des Trainers', 'rueckfrage', '33333333-3333-3333-3333-333333333333');
insert into freigaben (id, studio_id, typ, wissen_version_id, eingereicht_von)
  values ('eeeeeeee-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'wissen',
          'dddddddd-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');
select muss_scheitern($$update wissen_eintraege set status = 'freigegeben' where id = 'cccccccc-0000-0000-0000-000000000001'$$,
                      'Trainer gibt eigenen Eintrag frei');
update freigaben set status = 'freigegeben' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pruefe((select status from freigaben where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'offen',
              'Trainer kann Freigabe nicht entscheiden');

select als('11111111-1111-1111-1111-111111111111');
select pruefe((select count(*) from wissen_eintraege) = 0, 'Mitglied sieht Wissensbasis nicht direkt');

select als('44444444-4444-4444-4444-444444444444');
update freigaben set status = 'freigegeben', anmerkung = 'passt' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pruefe((select status = 'freigegeben' and aktuelle_version_id = 'dddddddd-0000-0000-0000-000000000001'
               from wissen_eintraege where id = 'cccccccc-0000-0000-0000-000000000001'),
              'Gründer-Freigabe setzt Eintrag und aktuelle Version');
select pruefe((select index_status from wissen_versionen where id = 'dddddddd-0000-0000-0000-000000000001') = 'ausstehend',
              'freigegebene Version wartet auf Indexierung');
select pruefe((select entschieden_von from freigaben where id = 'eeeeeeee-0000-0000-0000-000000000001') = auth.uid(),
              'Entscheidung wird der Gründerin zugeordnet');

reset role;
select als(null);
update wissen_versionen set index_status = 'indexiert', indexiert_am = now()
 where id = 'dddddddd-0000-0000-0000-000000000001';   -- simuliert n8n nach der Indexierung
set role authenticated;

select als('44444444-4444-4444-4444-444444444444');
insert into wissen_versionen (id, eintrag_id, version, inhalt, erstellt_von)
  values ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 2,
          'Überarbeitete Antwort', '44444444-4444-4444-4444-444444444444');
update wissen_eintraege set aktuelle_version_id = 'dddddddd-0000-0000-0000-000000000002'
 where id = 'cccccccc-0000-0000-0000-000000000001';
select pruefe((select index_status from wissen_versionen where id = 'dddddddd-0000-0000-0000-000000000001') = 'zu_entfernen',
              'alte Version wird aus dem Index entfernt');
select pruefe((select index_status from wissen_versionen where id = 'dddddddd-0000-0000-0000-000000000002') = 'ausstehend',
              'neue Version wird indexiert');
update wissen_eintraege set status = 'archiviert' where id = 'cccccccc-0000-0000-0000-000000000001';
select pruefe((select count(*) from wissen_versionen where eintrag_id = 'cccccccc-0000-0000-0000-000000000001'
               and index_status = 'zu_entfernen') = 2, 'archivierter Eintrag verschwindet komplett aus dem Index');

-- 6. Rückfrage ----------------------------------------------------------
reset role;
select als(null);
insert into rueckfragen (id, studio_id, mitglied_id, frage)
  values ('ffffffff-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
          '11111111-1111-1111-1111-111111111111', 'Wie oft pro Woche?');   -- legt die Edge Function an
set role authenticated;
select als('33333333-3333-3333-3333-333333333333');
update rueckfragen set status = 'beantwortet', antwort = 'Drei Mal pro Woche ist ein guter Start.',
       beantwortet_von = auth.uid(), beantwortet_am = now()
 where id = 'ffffffff-0000-0000-0000-000000000001';
select als('11111111-1111-1111-1111-111111111111');
select pruefe((select antwort is not null from rueckfragen where id = 'ffffffff-0000-0000-0000-000000000001'),
              'Mitglied sieht Antwort des Trainers');
select als('55555555-5555-5555-5555-555555555555');
select pruefe((select count(*) from rueckfragen) = 0, 'fremdes Studio sieht keine Rückfragen');

-- 7. Storage -------------------------------------------------------------
select als('11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name) values ('bewegungsdaten', '11111111-1111-1111-1111-111111111111/satz1.json.gz');
select muss_scheitern($$insert into storage.objects (bucket_id, name) values ('bewegungsdaten', '22222222-2222-2222-2222-222222222222/x.json.gz')$$,
                      'Datei in fremden Ordner schreiben');
select als('33333333-3333-3333-3333-333333333333');
select pruefe((select count(*) from storage.objects where bucket_id = 'bewegungsdaten') = 1,
              'Trainer liest Bewegungsdaten nach Einwilligung');
select als('22222222-2222-2222-2222-222222222222');
select pruefe((select count(*) from storage.objects where bucket_id = 'bewegungsdaten') = 0,
              'anderes Mitglied liest keine fremden Bewegungsdaten');

reset role;
update uebungen set referenz_storage_pfad = 'global/hueftbeuger/referenz.json.gz'
 where id = '99999999-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id, name) values
  ('uebungen', 'global/hueftbeuger/referenz.json.gz'),
  ('uebungen', 'global/geheim/entwurf.json.gz');
set role authenticated;
select als('11111111-1111-1111-1111-111111111111');
select pruefe((select count(*) from storage.objects where bucket_id = 'uebungen') = 1,
              'Mitglied liest nur Referenz freigegebener Übungen');

-- 8. Abo ----------------------------------------------------------------
reset role;
insert into abos (user_id, stufe, status, laeuft_bis)
  values ('11111111-1111-1111-1111-111111111111', 'coach', 'aktiv', now() + interval '20 days');
set role authenticated;
select als('11111111-1111-1111-1111-111111111111');
select pruefe(hat_coach_abo(), 'Coach-Abo wird erkannt');
update abos set laeuft_bis = now() + interval '10 years' where user_id = auth.uid();
select pruefe((select laeuft_bis < now() + interval '30 days' from abos where user_id = auth.uid()),
              'Abo-Laufzeit unverändert');

\echo 'ALLE TESTS BESTANDEN'
