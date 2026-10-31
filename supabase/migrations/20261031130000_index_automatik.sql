-- Automatisches Einlesen des Wissens: pg_cron prüft jede Minute, ob es etwas
-- zu tun gibt, und ruft nur dann die Edge Function wissen-indexieren auf.
-- Kein n8n und kein von Hand gesetztes Geheimnis nötig.
--
-- Voraussetzung (einmalig, projektabhängig – nicht Teil der Migration):
--   select vault.create_secret('https://<projekt-ref>.supabase.co', 'projekt_url');
-- Das Geheimnis 'index_geheimnis' legt diese Migration selbst an.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Zufälliges Geheimnis, nur in Vault gespeichert
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'index_geheimnis',
                           'Aufruf von wissen-indexieren durch pg_cron')
 where not exists (select 1 from vault.secrets where name = 'index_geheimnis');

-- Prüfung für die Edge Function (nur mit Service-Role aufrufbar)
create function public.index_geheimnis_pruefen(p_geheimnis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'index_geheimnis' and decrypted_secret = p_geheimnis
  )
$$;
revoke execute on function public.index_geheimnis_pruefen(text) from public, anon, authenticated;
grant execute on function public.index_geheimnis_pruefen(text) to service_role;

-- Ruft die Edge Function nur auf, wenn Versionen ein- oder auszulesen sind
create function public.index_anstossen() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_geheimnis text;
begin
  if not exists (
    select 1 from public.wissen_versionen v
    where v.index_status = 'zu_entfernen'
       or (v.index_status = 'ausstehend'
           and exists (select 1 from public.wissen_eintraege e
                       where e.aktuelle_version_id = v.id and e.status = 'freigegeben'))
  ) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'projekt_url';
  select decrypted_secret into v_geheimnis from vault.decrypted_secrets where name = 'index_geheimnis';
  if v_url is null or v_geheimnis is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/wissen-indexieren',
    headers := jsonb_build_object('content-type', 'application/json', 'x-index-secret', v_geheimnis),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.index_anstossen() from public, anon, authenticated;

select cron.schedule('wissen-indexieren', '* * * * *', 'select public.index_anstossen()');
