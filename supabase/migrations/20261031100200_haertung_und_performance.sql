-- =====================================================================
-- Härtung und Performance (nach Prüfung durch den Supabase-Advisor)
--   1. fester search_path für alle Funktionen
--   2. Trigger-Funktionen nicht per API aufrufbar; Hilfsfunktionen nur angemeldet
--   3. Indizes für alle Fremdschlüssel
--   4. Zugriffsregeln neu: auth.uid() und Hilfsfunktionen einmal je Abfrage
--      statt je Zeile auswerten ((select …)-Muster), Logik unverändert
-- =====================================================================

-- 1. search_path
alter function public.setze_updated_at() set search_path = public;

-- 2. Ausführungsrechte
revoke execute on function public.setze_updated_at()           from public, anon, authenticated;
revoke execute on function public.profiles_schutz()            from public, anon, authenticated;
revoke execute on function public.einwilligung_protokollieren() from public, anon, authenticated;
revoke execute on function public.nur_gruender_gibt_frei()     from public, anon, authenticated;
revoke execute on function public.wissen_index_markieren()     from public, anon, authenticated;
revoke execute on function public.freigabe_anwenden()          from public, anon, authenticated;

-- Hilfsfunktionen werden in den Zugriffsregeln gebraucht, also für angemeldete Nutzer
revoke execute on function public.mein_studio()             from public, anon;
revoke execute on function public.ist_team()                from public, anon;
revoke execute on function public.ist_gruender()            from public, anon;
revoke execute on function public.trainer_darf_sehen(uuid)  from public, anon;
revoke execute on function public.hat_coach_abo()           from public, anon;
grant  execute on function public.mein_studio()             to authenticated;
grant  execute on function public.ist_team()                to authenticated;
grant  execute on function public.ist_gruender()            to authenticated;
grant  execute on function public.trainer_darf_sehen(uuid)  to authenticated;
grant  execute on function public.hat_coach_abo()           to authenticated;

-- 3. Indizes für Fremdschlüssel
create index if not exists antwort_bewertungen_bewertet_von_idx on public.antwort_bewertungen (bewertet_von);
create index if not exists chat_verlaeufe_einheit_id_idx        on public.chat_verlaeufe (einheit_id);
create index if not exists chat_verlaeufe_studio_id_idx         on public.chat_verlaeufe (studio_id);
create index if not exists einheiten_plan_id_idx                on public.einheiten (plan_id);
create index if not exists einheiten_studio_id_idx              on public.einheiten (studio_id);
create index if not exists einladungscodes_erstellt_von_idx     on public.einladungscodes (erstellt_von);
create index if not exists einladungscodes_studio_id_idx        on public.einladungscodes (studio_id);
create index if not exists freigaben_eingereicht_von_idx        on public.freigaben (eingereicht_von);
create index if not exists freigaben_entschieden_von_idx        on public.freigaben (entschieden_von);
create index if not exists freigaben_uebung_id_idx              on public.freigaben (uebung_id);
create index if not exists freigaben_wissen_version_id_idx      on public.freigaben (wissen_version_id);
create index if not exists plaene_erstellt_von_idx              on public.plaene (erstellt_von);
create index if not exists plaene_studio_id_idx                 on public.plaene (studio_id);
create index if not exists plan_uebungen_uebung_id_idx          on public.plan_uebungen (uebung_id);
create index if not exists plan_vorschlaege_entschieden_von_idx on public.plan_vorschlaege (entschieden_von);
create index if not exists plan_vorschlaege_plan_id_idx         on public.plan_vorschlaege (plan_id);
create index if not exists profiles_freigeschaltet_von_idx      on public.profiles (freigeschaltet_von);
create index if not exists rueckfragen_beantwortet_von_idx      on public.rueckfragen (beantwortet_von);
create index if not exists rueckfragen_mitglied_id_idx          on public.rueckfragen (mitglied_id);
create index if not exists rueckfragen_nachricht_id_idx         on public.rueckfragen (nachricht_id);
create index if not exists uebungen_erstellt_von_idx            on public.uebungen (erstellt_von);
create index if not exists wissen_dateien_version_id_idx        on public.wissen_dateien (version_id);
create index if not exists wissen_eintraege_aktuelle_version_idx on public.wissen_eintraege (aktuelle_version_id);
create index if not exists wissen_eintraege_erstellt_von_idx    on public.wissen_eintraege (erstellt_von);
create index if not exists wissen_versionen_erstellt_von_idx    on public.wissen_versionen (erstellt_von);
create index if not exists wissen_versionen_rueckfrage_id_idx   on public.wissen_versionen (rueckfrage_id);

-- 4. Zugriffsregeln neu anlegen
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Studios
create policy studio_lesen on public.studios for select to authenticated
  using (id = (select public.mein_studio()));

-- Profile
create policy profil_eigenes_lesen on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profil_team_lesen on public.profiles for select to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio()));
create policy profil_eigenes_aendern on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profil_team_aendern on public.profiles for update to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio()))
  with check (studio_id = (select public.mein_studio()));

-- Einladungscodes
create policy code_team on public.einladungscodes for all to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio()))
  with check ((select public.ist_team()) and studio_id = (select public.mein_studio()));

-- Einwilligungen
create policy einwilligung_eigene on public.einwilligungen for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy einwilligung_log_eigenes on public.einwilligungen_log for select to authenticated
  using (user_id = (select auth.uid()));

-- Gesundheitsprofil
create policy gesundheit_eigenes on public.gesundheitsprofil for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy gesundheit_team_lesen on public.gesundheitsprofil for select to authenticated
  using (public.trainer_darf_sehen(user_id));

-- Abos
create policy abo_eigenes_lesen on public.abos for select to authenticated
  using (user_id = (select auth.uid()));

-- Übungen
create policy uebung_freigegeben_lesen on public.uebungen for select to authenticated
  using (status = 'freigegeben' and (studio_id is null or studio_id = (select public.mein_studio())));
create policy uebung_team_lesen on public.uebungen for select to authenticated
  using ((select public.ist_team()) and (studio_id is null or studio_id = (select public.mein_studio())));
create policy uebung_team_anlegen on public.uebungen for insert to authenticated
  with check ((select public.ist_team()) and studio_id = (select public.mein_studio())
              and erstellt_von = (select auth.uid()));
create policy uebung_team_aendern on public.uebungen for update to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio())
         and (erstellt_von = (select auth.uid()) or (select public.ist_gruender())))
  with check (studio_id = (select public.mein_studio()));
create policy uebung_gruender_global on public.uebungen for update to authenticated
  using ((select public.ist_gruender()) and studio_id is null)
  with check (studio_id is null or studio_id = (select public.mein_studio()));

-- Pläne
create policy plan_eigener_lesen on public.plaene for select to authenticated
  using (mitglied_id = (select auth.uid()));
create policy plan_team on public.plaene for all to authenticated
  using (public.trainer_darf_sehen(mitglied_id))
  with check (public.trainer_darf_sehen(mitglied_id) and studio_id = (select public.mein_studio()));

create policy plan_uebung_lesen on public.plan_uebungen for select to authenticated
  using (exists (select 1 from public.plaene p where p.id = plan_id
                 and (p.mitglied_id = (select auth.uid()) or public.trainer_darf_sehen(p.mitglied_id))));
create policy plan_uebung_team on public.plan_uebungen for all to authenticated
  using (exists (select 1 from public.plaene p where p.id = plan_id and public.trainer_darf_sehen(p.mitglied_id)))
  with check (exists (select 1 from public.plaene p where p.id = plan_id and public.trainer_darf_sehen(p.mitglied_id)));

create policy vorschlag_team on public.plan_vorschlaege for all to authenticated
  using (public.trainer_darf_sehen(mitglied_id)) with check (public.trainer_darf_sehen(mitglied_id));

-- Einheiten und Sätze
create policy einheit_eigene on public.einheiten for all to authenticated
  using (mitglied_id = (select auth.uid()))
  with check (mitglied_id = (select auth.uid()) and studio_id = (select public.mein_studio()));
create policy einheit_team_lesen on public.einheiten for select to authenticated
  using (public.trainer_darf_sehen(mitglied_id));

create policy satz_eigene on public.saetze for all to authenticated
  using (exists (select 1 from public.einheiten e where e.id = einheit_id and e.mitglied_id = (select auth.uid())))
  with check (exists (select 1 from public.einheiten e where e.id = einheit_id and e.mitglied_id = (select auth.uid())));
create policy satz_team_lesen on public.saetze for select to authenticated
  using (exists (select 1 from public.einheiten e where e.id = einheit_id and public.trainer_darf_sehen(e.mitglied_id)));

-- Chat
create policy verlauf_eigene on public.chat_verlaeufe for all to authenticated
  using (mitglied_id = (select auth.uid()))
  with check (mitglied_id = (select auth.uid()) and studio_id = (select public.mein_studio()));
create policy nachricht_eigene_lesen on public.chat_nachrichten for select to authenticated
  using (exists (select 1 from public.chat_verlaeufe v where v.id = verlauf_id and v.mitglied_id = (select auth.uid())));
create policy nachricht_eigene_schreiben on public.chat_nachrichten for insert to authenticated
  with check (rolle = 'mitglied'
              and exists (select 1 from public.chat_verlaeufe v where v.id = verlauf_id and v.mitglied_id = (select auth.uid())));
create policy nachricht_gruender_bewerten on public.chat_nachrichten for select to authenticated
  using ((select public.ist_gruender()) and rolle = 'assistent'
         and exists (select 1 from public.chat_verlaeufe v where v.id = verlauf_id and v.studio_id = (select public.mein_studio())));

-- Rückfragen
create policy rueckfrage_eigene_lesen on public.rueckfragen for select to authenticated
  using (mitglied_id = (select auth.uid()));
create policy rueckfrage_team_lesen on public.rueckfragen for select to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio()));
create policy rueckfrage_team_beantworten on public.rueckfragen for update to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio()))
  with check (studio_id = (select public.mein_studio()) and beantwortet_von = (select auth.uid()));

-- Briefings
create policy briefing_team_lesen on public.briefings for select to authenticated
  using (public.trainer_darf_sehen(mitglied_id));

-- Wissen
create policy wissen_team_lesen on public.wissen_eintraege for select to authenticated
  using ((select public.ist_team()) and (studio_id is null or studio_id = (select public.mein_studio())));
create policy wissen_team_anlegen on public.wissen_eintraege for insert to authenticated
  with check ((select public.ist_team()) and erstellt_von = (select auth.uid())
              and (studio_id = (select public.mein_studio()) or (studio_id is null and (select public.ist_gruender()))));
create policy wissen_team_aendern on public.wissen_eintraege for update to authenticated
  using ((select public.ist_team()) and (studio_id is null or studio_id = (select public.mein_studio()))
         and ((select public.ist_gruender())
              or (erstellt_von = (select auth.uid()) and status in ('entwurf', 'eingereicht'))))
  with check (studio_id is null or studio_id = (select public.mein_studio()));

create policy version_team_lesen on public.wissen_versionen for select to authenticated
  using ((select public.ist_team())
         and exists (select 1 from public.wissen_eintraege w where w.id = eintrag_id
                     and (w.studio_id is null or w.studio_id = (select public.mein_studio()))));
create policy version_team_anlegen on public.wissen_versionen for insert to authenticated
  with check (erstellt_von = (select auth.uid()) and (select public.ist_team())
              and exists (select 1 from public.wissen_eintraege w where w.id = eintrag_id
                          and (w.studio_id is null or w.studio_id = (select public.mein_studio()))
                          and ((select public.ist_gruender()) or w.erstellt_von = (select auth.uid()))));

create policy datei_team on public.wissen_dateien for all to authenticated
  using ((select public.ist_team())
         and exists (select 1 from public.wissen_versionen v join public.wissen_eintraege w on w.id = v.eintrag_id
                     where v.id = version_id
                       and (w.studio_id is null or w.studio_id = (select public.mein_studio()))))
  with check ((select public.ist_team())
              and exists (select 1 from public.wissen_versionen v join public.wissen_eintraege w on w.id = v.eintrag_id
                          where v.id = version_id
                            and (w.studio_id is null or w.studio_id = (select public.mein_studio()))));

-- Freigaben
create policy freigabe_team_lesen on public.freigaben for select to authenticated
  using ((select public.ist_team()) and studio_id = (select public.mein_studio()));
create policy freigabe_team_einreichen on public.freigaben for insert to authenticated
  with check ((select public.ist_team()) and studio_id = (select public.mein_studio())
              and eingereicht_von = (select auth.uid()) and status = 'offen');
create policy freigabe_gruender_entscheiden on public.freigaben for update to authenticated
  using ((select public.ist_gruender()) and studio_id = (select public.mein_studio()))
  with check (studio_id = (select public.mein_studio()));

-- Antwort-Bewertungen
create policy bewertung_gruender on public.antwort_bewertungen for all to authenticated
  using ((select public.ist_gruender()))
  with check ((select public.ist_gruender()) and bewertet_von = (select auth.uid()));
