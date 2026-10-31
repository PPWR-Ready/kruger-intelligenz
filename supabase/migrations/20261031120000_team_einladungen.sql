-- Einladungscodes mit Rolle: Gründer können Trainer- und Gründer-Codes erstellen.
-- Wer einen Team-Code einlöst, ist sofort freigeschaltet. So kommt auch das
-- erste Gründerkonto ohne Handarbeit in der Datenbank zustande.

alter table public.einladungscodes
  add column rolle public.rolle not null default 'mitglied';

-- Nur Gründer dürfen Codes für Team-Rollen anlegen oder ändern
create function public.einladung_rolle_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- beim Einlösen wird nur „genutzt“ hochgezählt, das bleibt erlaubt
  if auth.uid() is not null and new.rolle <> 'mitglied'
     and (tg_op = 'INSERT' or new.rolle is distinct from old.rolle)
     and not ist_gruender() then
    raise exception 'Nur Gründer dürfen Einladungen für das Team erstellen';
  end if;
  return new;
end $$;
revoke execute on function public.einladung_rolle_schutz() from public, anon, authenticated;

create trigger einladung_rolle_schutz before insert or update on public.einladungscodes
  for each row execute function public.einladung_rolle_schutz();

create or replace function public.code_einloesen(p_code text, p_anzeigename text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_code einladungscodes;
  v_profil profiles;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Konto ist bereits einem Studio zugeordnet';
  end if;
  if coalesce(trim(p_anzeigename), '') = '' then
    raise exception 'Bitte gib deinen Namen an';
  end if;
  select * into v_code from einladungscodes where code = upper(trim(p_code)) for update;
  if not found
     or (v_code.gueltig_bis is not null and v_code.gueltig_bis < now())
     or v_code.genutzt >= v_code.max_nutzungen then
    raise exception 'Einladungscode ungültig oder abgelaufen';
  end if;
  update einladungscodes set genutzt = genutzt + 1 where code = v_code.code;
  insert into profiles (id, studio_id, anzeigename, rolle, freigeschaltet, freigeschaltet_von)
  values (auth.uid(), v_code.studio_id, left(trim(p_anzeigename), 60), v_code.rolle,
          v_code.rolle <> 'mitglied', case when v_code.rolle <> 'mitglied' then v_code.erstellt_von end)
  returning * into v_profil;
  return v_profil;
end $$;
