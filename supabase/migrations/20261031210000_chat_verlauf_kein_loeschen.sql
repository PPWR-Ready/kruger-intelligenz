-- Chat-Verläufe und -Nachrichten dürfen über die App nicht gelöscht werden: Sonst ließe
-- sich das Tageslimit des Assistenten durch Löschen umgehen. Konto-Löschung läuft über
-- den Server (Service-Rolle) und ist davon nicht betroffen.
create policy verlauf_kein_loeschen on public.chat_verlaeufe as restrictive for delete to authenticated using (false);
create policy nachricht_kein_loeschen on public.chat_nachrichten as restrictive for delete to authenticated using (false);
