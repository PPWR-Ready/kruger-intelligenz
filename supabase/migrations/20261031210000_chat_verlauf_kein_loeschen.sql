-- Mitglieder dürfen eigene Chat-Verläufe lesen und anlegen, aber nicht löschen oder
-- umhängen: Sonst ließe sich das Tageslimit des Assistenten durch Löschen umgehen.
-- (Das Löschen des ganzen Kontos läuft weiterhin über die Konto-Löschung.)
drop policy if exists verlauf_eigene on public.chat_verlaeufe;
create policy verlauf_eigene_lesen on public.chat_verlaeufe for select to authenticated
  using (mitglied_id = (select auth.uid()));
create policy verlauf_eigene_anlegen on public.chat_verlaeufe for insert to authenticated
  with check (mitglied_id = (select auth.uid()) and studio_id = (select public.mein_studio()));
