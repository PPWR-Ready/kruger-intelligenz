-- =====================================================================
-- Kruger Intelligenz – Datenbankschema für Supabase (Postgres)
-- Stand: 31.10.2026
--
-- Ausführen im Supabase SQL-Editor eines NEUEN Projekts (EU-Region)
-- oder als Migration über die Supabase CLI. Läuft in einer Transaktion.
--
-- Grundsätze
--   * Supabase ist die Quelle der Wahrheit, Qdrant nur ein Suchindex.
--   * Jede Tabelle hat Row Level Security. Ohne passende Regel: kein Zugriff.
--   * Trainer sehen Trainingsdaten eines Mitglieds nur mit dessen
--     Einwilligung „trainer_freigabe“. Chats sehen Trainer nie.
--   * Inhalte für die KI (Wissen, Übungen) wirken erst nach Freigabe
--     durch eine Person mit der Rolle „gruender“.
--   * Schreibzugriffe von Diensten (Edge Functions, n8n, Stripe) laufen
--     mit dem Service-Role-Schlüssel und umgehen RLS bewusst.
-- =====================================================================


create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Aufzählungstypen
-- ---------------------------------------------------------------------
create type rolle             as enum ('mitglied', 'trainer', 'gruender');
create type abo_stufe         as enum ('assistent', 'coach');
create type abo_status        as enum ('aktiv', 'gekuendigt', 'ueberfaellig', 'beendet');
create type einwilligung_art  as enum ('gesundheitsdaten', 'kamera', 'trainer_freigabe');
create type inhalt_status     as enum ('entwurf', 'eingereicht', 'freigegeben', 'abgelehnt', 'archiviert');
create type sichtbarkeit      as enum ('alle', 'premium', 'trainer');
create type eingabeweg        as enum ('text', 'diktat', 'upload', 'scan', 'interview', 'rueckfrage');
create type index_status      as enum ('ausstehend', 'indexiert', 'fehler', 'zu_entfernen', 'entfernt');
create type freigabe_typ      as enum ('wissen', 'uebung');
create type freigabe_status   as enum ('offen', 'freigegeben', 'abgelehnt');
create type rueckfrage_status as enum ('offen', 'beantwortet', 'verworfen');
create type chat_rolle        as enum ('mitglied', 'assistent', 'trainer');
create type chat_kontext      as enum ('chat', 'trainer_modus');
create type satz_qualitaet    as enum ('sauber', 'gut', 'anpassen');
create type vorschlag_status  as enum ('offen', 'uebernommen', 'verworfen');
create type bewertung_urteil  as enum ('passt', 'teilweise', 'falsch');

-- ---------------------------------------------------------------------
-- 2. Konten, Einwilligungen, Abos
-- ---------------------------------------------------------------------
create table studios (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  external_system text,                 -- z. B. 'centercom'
  external_id     text,
  created_at      timestamptz not null default now()
);

create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  studio_id           uuid not null references studios(id),
  rolle               rolle not null default 'mitglied',
  anzeigename         text not null check (length(trim(anzeigename)) between 1 and 80),
  freigeschaltet      boolean not null default false,
  freigeschaltet_von  uuid references profiles(id) on delete set null,
  external_member_id  text,             -- Mitgliedsnummer aus Centercom, später
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (studio_id, external_member_id)
);
create index on profiles (studio_id, rolle);

create table einladungscodes (
  code           text primary key check (code ~ '^[A-Z0-9-]{4,20}$'),
  studio_id      uuid not null references studios(id) on delete cascade,
  erstellt_von   uuid references profiles(id) on delete set null,
  gueltig_bis    timestamptz,
  max_nutzungen  int not null default 1 check (max_nutzungen > 0),
  genutzt        int not null default 0 check (genutzt >= 0),
  created_at     timestamptz not null default now()
);

-- aktueller Stand je Einwilligung; jede Änderung landet im Protokoll
create table einwilligungen (
  user_id          uuid not null references profiles(id) on delete cascade,
  art              einwilligung_art not null,
  erteilt          boolean not null,
  text_version     text not null,        -- welche Fassung des Einwilligungstexts
  aktualisiert_am  timestamptz not null default now(),
  primary key (user_id, art)
);

create table einwilligungen_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references profiles(id) on delete cascade,
  art           einwilligung_art not null,
  erteilt       boolean not null,
  text_version  text not null,
  zeitpunkt     timestamptz not null default now()
);
create index on einwilligungen_log (user_id, zeitpunkt desc);

create table gesundheitsprofil (
  user_id             uuid primary key references profiles(id) on delete cascade,
  ziele               text[] not null default '{}',
  beschwerden         text[] not null default '{}',
  trainings_pro_woche text check (trainings_pro_woche in ('1-2', '3-4', '5+')),
  aktualisiert_am     timestamptz not null default now()
);

create table abos (
  user_id                 uuid primary key references profiles(id) on delete cascade,
  stufe                   abo_stufe not null,
  status                  abo_status not null,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  laeuft_bis              timestamptz,
  aktualisiert_am         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Übungen und Pläne
-- ---------------------------------------------------------------------
create table uebungen (
  id                    uuid primary key default gen_random_uuid(),
  studio_id             uuid references studios(id) on delete cascade, -- null = Five-Übung für alle Studios
  name                  text not null,
  kategorie             text,
  an_geraet             boolean not null default false,
  beschreibung          text,
  regeln                jsonb not null default '{}'::jsonb,  -- Winkelregeln für den Trainer-Modus
  referenz_storage_pfad text,                                -- Referenzaufnahme (Skelettdaten)
  status                inhalt_status not null default 'entwurf',
  version               int not null default 1,
  erstellt_von          uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (jsonb_typeof(regeln) = 'object')
);
create index on uebungen (studio_id, status);

create table plaene (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id),
  mitglied_id   uuid not null references profiles(id) on delete cascade,
  name          text not null,
  aktiv         boolean not null default true,
  erstellt_von  uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index ein_aktiver_plan_je_mitglied on plaene (mitglied_id) where aktiv;

create table plan_uebungen (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references plaene(id) on delete cascade,
  uebung_id       uuid not null references uebungen(id),
  reihenfolge     int not null check (reihenfolge > 0),
  saetze          int not null default 2 check (saetze between 1 and 10),
  wiederholungen  int check (wiederholungen between 1 and 100),
  unique (plan_id, reihenfolge)
);

create table plan_vorschlaege (
  id              uuid primary key default gen_random_uuid(),
  mitglied_id     uuid not null references profiles(id) on delete cascade,
  plan_id         uuid references plaene(id) on delete cascade,
  vorschlag       jsonb not null,       -- Liste von Änderungen, von der KI erzeugt
  begruendung     text,
  status          vorschlag_status not null default 'offen',
  entschieden_von uuid references profiles(id) on delete set null,
  entschieden_am  timestamptz,
  created_at      timestamptz not null default now()
);
create index on plan_vorschlaege (mitglied_id, status);

-- ---------------------------------------------------------------------
-- 4. Training: Einheiten und Sätze
-- ---------------------------------------------------------------------
create table einheiten (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id),
  mitglied_id   uuid not null references profiles(id) on delete cascade,
  plan_id       uuid references plaene(id) on delete set null,
  gestartet_am  timestamptz not null default now(),
  beendet_am    timestamptz,
  befinden      smallint check (befinden between 0 and 10),  -- Rückenschmerz 0–10
  notiz         text,
  check (beendet_am is null or beendet_am >= gestartet_am)
);
create index on einheiten (mitglied_id, gestartet_am desc);

create table saetze (
  id                   uuid primary key default gen_random_uuid(),
  einheit_id           uuid not null references einheiten(id) on delete cascade,
  uebung_id            uuid not null references uebungen(id),
  satz_nr              int not null check (satz_nr > 0),
  wiederholungen       int not null default 0 check (wiederholungen >= 0),
  qualitaet            satz_qualitaet,
  wdh_bewertung        jsonb not null default '[]'::jsonb,  -- z. B. ["sauber","sauber","anpassen",…]
  korrekturen          jsonb not null default '[]'::jsonb,  -- erkannte Fehler mit Gelenk und Winkel
  bewegungsdaten_pfad  text,                                -- Skelettdaten im Storage, nie Video
  created_at           timestamptz not null default now(),
  unique (einheit_id, uebung_id, satz_nr)
);
create index on saetze (uebung_id);

-- ---------------------------------------------------------------------
-- 5. Chat und Rückfragen
-- ---------------------------------------------------------------------
create table chat_verlaeufe (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id),
  mitglied_id  uuid not null references profiles(id) on delete cascade,
  kontext      chat_kontext not null default 'chat',
  einheit_id   uuid references einheiten(id) on delete set null,  -- bei Fragen im Trainer-Modus
  created_at   timestamptz not null default now()
);
create index on chat_verlaeufe (mitglied_id, created_at desc);

create table chat_nachrichten (
  id          uuid primary key default gen_random_uuid(),
  verlauf_id  uuid not null references chat_verlaeufe(id) on delete cascade,
  rolle       chat_rolle not null,
  inhalt      text not null,
  quellen     jsonb not null default '[]'::jsonb,   -- verwendete Wissenseinträge
  unsicher    boolean not null default false,
  warnsignal  boolean not null default false,
  modell      text,                                  -- welches Sprachmodell geantwortet hat
  created_at  timestamptz not null default now()
);
create index on chat_nachrichten (verlauf_id, created_at);

create table rueckfragen (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id),
  mitglied_id     uuid not null references profiles(id) on delete cascade,
  nachricht_id    uuid references chat_nachrichten(id) on delete set null,
  frage           text not null,
  ki_entwurf      text,
  status          rueckfrage_status not null default 'offen',
  beantwortet_von uuid references profiles(id) on delete set null,
  antwort         text,
  beantwortet_am  timestamptz,
  created_at      timestamptz not null default now(),
  check (status <> 'beantwortet' or antwort is not null)
);
create index on rueckfragen (studio_id, status, created_at);

create table briefings (
  id            uuid primary key default gen_random_uuid(),
  mitglied_id   uuid not null references profiles(id) on delete cascade,
  inhalt        text not null,
  zeitraum_von  date not null,
  zeitraum_bis  date not null,
  created_at    timestamptz not null default now()
);
create index on briefings (mitglied_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Wissen und Freigaben
-- ---------------------------------------------------------------------
create table wissen_eintraege (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           uuid references studios(id) on delete cascade,  -- null = Five-Wissen für alle Studios
  titel               text not null,
  themen              text[] not null default '{}',
  sichtbarkeit        sichtbarkeit not null default 'alle',
  quelle              text,
  status              inhalt_status not null default 'entwurf',
  aktuelle_version_id uuid,           -- Fremdschlüssel weiter unten
  erstellt_von        uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on wissen_eintraege (studio_id, status);
create index on wissen_eintraege using gin (themen);

create table wissen_versionen (
  id             uuid primary key default gen_random_uuid(),
  eintrag_id     uuid not null references wissen_eintraege(id) on delete cascade,
  version        int not null check (version > 0),
  inhalt         text not null,
  eingabeweg     eingabeweg not null default 'text',
  rueckfrage_id  uuid references rueckfragen(id) on delete set null,
  erstellt_von   uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  index_status   index_status not null default 'ausstehend',
  indexiert_am   timestamptz,
  index_fehler   text,
  unique (eintrag_id, version)
);
create index on wissen_versionen (index_status);

alter table wissen_eintraege
  add constraint wissen_eintraege_aktuelle_version_fk
  foreign key (aktuelle_version_id) references wissen_versionen(id) on delete set null;

create table wissen_dateien (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references wissen_versionen(id) on delete cascade,
  storage_pfad text not null,
  mime_typ     text not null,
  transkript   text,                 -- Ergebnis von Texterkennung bzw. Transkription
  verarbeitet  boolean not null default false,
  created_at   timestamptz not null default now()
);

create table freigaben (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references studios(id),
  typ               freigabe_typ not null,
  wissen_version_id uuid references wissen_versionen(id) on delete cascade,
  uebung_id         uuid references uebungen(id) on delete cascade,
  eingereicht_von   uuid references profiles(id) on delete set null,
  status            freigabe_status not null default 'offen',
  ki_pruefung       jsonb not null default '{}'::jsonb,  -- ähnliche Einträge, medizinischer Bezug
  entschieden_von   uuid references profiles(id) on delete set null,
  entschieden_am    timestamptz,
  anmerkung         text,
  created_at        timestamptz not null default now(),
  check ((typ = 'wissen' and wissen_version_id is not null and uebung_id is null)
      or (typ = 'uebung' and uebung_id is not null and wissen_version_id is null))
);
create index on freigaben (studio_id, status, created_at);

create table antwort_bewertungen (
  id            uuid primary key default gen_random_uuid(),
  nachricht_id  uuid not null references chat_nachrichten(id) on delete cascade,
  bewertet_von  uuid not null references profiles(id) on delete cascade,
  urteil        bewertung_urteil not null,
  kommentar     text,
  created_at    timestamptz not null default now(),
  unique (nachricht_id, bewertet_von)
);

-- ---------------------------------------------------------------------
-- 7. Hilfsfunktionen für die Zugriffsregeln
--    security definer: lesen profiles/einwilligungen ohne RLS-Schleife
-- ---------------------------------------------------------------------
create function mein_studio() returns uuid
language sql stable security definer set search_path = public as $$
  select studio_id from profiles where id = auth.uid()
$$;

create function ist_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and rolle in ('trainer', 'gruender') and freigeschaltet
  )
$$;

create function ist_gruender() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and rolle = 'gruender' and freigeschaltet
  )
$$;

-- Darf die angemeldete Person (Team) die Trainingsdaten dieses Mitglieds sehen?
create function trainer_darf_sehen(mitglied uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select ist_team()
     and exists (
       select 1
       from profiles p
       join einwilligungen e on e.user_id = p.id
       where p.id = mitglied
         and p.studio_id = mein_studio()
         and e.art = 'trainer_freigabe'
         and e.erteilt
     )
$$;

-- Hat die angemeldete Person ein aktives Coach-Abo? (für Edge Functions und App)
create function hat_coach_abo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from abos
    where user_id = auth.uid() and stufe = 'coach' and status in ('aktiv', 'gekuendigt')
      and (laeuft_bis is null or laeuft_bis > now())
  )
$$;

-- ---------------------------------------------------------------------
-- 8. Trigger
-- ---------------------------------------------------------------------
create function setze_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at         before update on profiles         for each row execute function setze_updated_at();
create trigger uebungen_updated_at         before update on uebungen         for each row execute function setze_updated_at();
create trigger wissen_eintraege_updated_at before update on wissen_eintraege for each row execute function setze_updated_at();

-- Schutz sensibler Profilfelder vor Selbstbedienung
create function profiles_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then          -- Dienste mit Service-Role
    return new;
  end if;
  if new.id <> old.id or new.studio_id <> old.studio_id then
    raise exception 'Studio und Konto-ID können nicht geändert werden';
  end if;
  if new.rolle <> old.rolle and not ist_gruender() then
    raise exception 'Nur Gründer dürfen Rollen ändern';
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
create trigger profiles_schutz before update on profiles for each row execute function profiles_schutz();

-- Einwilligungen protokollieren
create function einwilligung_protokollieren() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.aktualisiert_am := now();
  insert into einwilligungen_log (user_id, art, erteilt, text_version)
  values (new.user_id, new.art, new.erteilt, new.text_version);
  return new;
end $$;
create trigger einwilligungen_log_trg before insert or update on einwilligungen
  for each row execute function einwilligung_protokollieren();

-- Nur Gründer dürfen Inhalte auf „freigegeben“ setzen
create function nur_gruender_gibt_frei() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.status = 'freigegeben'
     and (tg_op = 'INSERT' or old.status is distinct from 'freigegeben')
     and not ist_gruender() then
    raise exception 'Nur Gründer dürfen Inhalte freigeben';
  end if;
  return new;
end $$;
create trigger uebungen_freigabe_schutz         before insert or update on uebungen         for each row execute function nur_gruender_gibt_frei();
create trigger wissen_eintraege_freigabe_schutz before insert or update on wissen_eintraege for each row execute function nur_gruender_gibt_frei();

-- Index-Status pflegen: n8n indexiert alles mit 'ausstehend' und entfernt 'zu_entfernen'
create function wissen_index_markieren() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- neue aktuelle Version eines freigegebenen Eintrags: alte raus, neue rein
  if new.status = 'freigegeben' then
    if old.aktuelle_version_id is distinct from new.aktuelle_version_id
       or old.status is distinct from 'freigegeben' then
      update wissen_versionen set index_status = 'zu_entfernen'
       where eintrag_id = new.id and id is distinct from new.aktuelle_version_id
         and index_status = 'indexiert';
      update wissen_versionen set index_status = 'ausstehend', index_fehler = null
       where id = new.aktuelle_version_id and index_status <> 'indexiert';
    end if;
  -- Eintrag zurückgezogen: alles aus dem Index entfernen
  elsif old.status = 'freigegeben' then
    update wissen_versionen set index_status = 'zu_entfernen'
     where eintrag_id = new.id and index_status in ('indexiert', 'ausstehend');
  end if;
  return new;
end $$;
create trigger wissen_index_trg after update on wissen_eintraege
  for each row execute function wissen_index_markieren();

-- Freigabe anwenden: Entscheidung der Gründer auf Eintrag bzw. Übung übertragen
create function freigabe_anwenden() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_eintrag uuid;
begin
  if new.status = old.status then
    return new;
  end if;
  if auth.uid() is not null and not ist_gruender() then
    raise exception 'Nur Gründer entscheiden über Freigaben';
  end if;
  new.entschieden_von := coalesce(auth.uid(), new.entschieden_von);
  new.entschieden_am  := now();

  if new.typ = 'wissen' then
    select eintrag_id into v_eintrag from wissen_versionen where id = new.wissen_version_id;
    if new.status = 'freigegeben' then
      update wissen_eintraege
         set status = 'freigegeben', aktuelle_version_id = new.wissen_version_id
       where id = v_eintrag;
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
create trigger freigabe_anwenden_trg before update on freigaben
  for each row execute function freigabe_anwenden();

-- ---------------------------------------------------------------------
-- 9. Funktionen für App und Cockpit
-- ---------------------------------------------------------------------

-- Registrierung: neu angemeldete Person löst einen Einladungscode ein
create function code_einloesen(p_code text, p_anzeigename text) returns profiles
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
  select * into v_code from einladungscodes where code = upper(trim(p_code)) for update;
  if not found
     or (v_code.gueltig_bis is not null and v_code.gueltig_bis < now())
     or v_code.genutzt >= v_code.max_nutzungen then
    raise exception 'Einladungscode ungültig oder abgelaufen';
  end if;
  update einladungscodes set genutzt = genutzt + 1 where code = v_code.code;
  insert into profiles (id, studio_id, anzeigename)
  values (auth.uid(), v_code.studio_id, trim(p_anzeigename))
  returning * into v_profil;
  return v_profil;
end $$;

-- Mitglieder-Ampel für das Trainer-Cockpit (nur Mitglieder mit Freigabe)
-- Startregeln, mit den Gründern abzustimmen:
--   ansprechen: 14 Tage kein Training, Schmerz +2 gegenüber Vorzeitraum,
--               oder Warnsignal im Chat in den letzten 7 Tagen
--   beobachten: offene Rückfrage oder > 30 % Sätze „anpassen“ in 14 Tagen
--   laeuft:     sonst
create function mitglieder_ampel()
returns table (
  mitglied_id        uuid,
  anzeigename        text,
  status             text,
  letzte_einheit     timestamptz,
  schmerz_aktuell    numeric,
  schmerz_vorher     numeric,
  anteil_anpassen    numeric,
  offene_rueckfragen int,
  warnsignal_7_tage  boolean
)
language sql stable security definer set search_path = public as $$
  with m as (
    select p.id, p.anzeigename
    from profiles p
    join einwilligungen e on e.user_id = p.id and e.art = 'trainer_freigabe' and e.erteilt
    where ist_team() and p.studio_id = mein_studio() and p.rolle = 'mitglied'
  ),
  k as (
    select
      m.id, m.anzeigename,
      (select max(gestartet_am) from einheiten x where x.mitglied_id = m.id) as letzte,
      (select avg(befinden) from einheiten x where x.mitglied_id = m.id
         and x.gestartet_am >= now() - interval '14 days') as akt,
      (select avg(befinden) from einheiten x where x.mitglied_id = m.id
         and x.gestartet_am <  now() - interval '14 days'
         and x.gestartet_am >= now() - interval '42 days') as vor,
      (select avg(case when s.qualitaet = 'anpassen' then 1.0 else 0.0 end)
         from saetze s join einheiten x on x.id = s.einheit_id
        where x.mitglied_id = m.id and x.gestartet_am >= now() - interval '14 days') as anp,
      (select count(*)::int from rueckfragen r where r.mitglied_id = m.id and r.status = 'offen') as rf,
      exists (select 1 from chat_nachrichten n join chat_verlaeufe v on v.id = n.verlauf_id
               where v.mitglied_id = m.id and n.warnsignal
                 and n.created_at >= now() - interval '7 days') as warn
    from m
  )
  select
    id, anzeigename,
    case
      when letzte is null or letzte < now() - interval '14 days'
        or (akt is not null and vor is not null and akt - vor >= 2)
        or warn then 'ansprechen'
      when rf > 0 or coalesce(anp, 0) > 0.3 then 'beobachten'
      else 'laeuft'
    end,
    letzte, round(akt, 1), round(vor, 1), round(anp, 2), rf, warn
  from k
  order by case
    when letzte is null or letzte < now() - interval '14 days'
      or (akt is not null and vor is not null and akt - vor >= 2) or warn then 0
    when rf > 0 or coalesce(anp, 0) > 0.3 then 1
    else 2 end,
    anzeigename
$$;

-- ---------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------
alter table studios             enable row level security;
alter table profiles            enable row level security;
alter table einladungscodes     enable row level security;
alter table einwilligungen      enable row level security;
alter table einwilligungen_log  enable row level security;
alter table gesundheitsprofil   enable row level security;
alter table abos                enable row level security;
alter table uebungen            enable row level security;
alter table plaene              enable row level security;
alter table plan_uebungen       enable row level security;
alter table plan_vorschlaege    enable row level security;
alter table einheiten           enable row level security;
alter table saetze              enable row level security;
alter table chat_verlaeufe      enable row level security;
alter table chat_nachrichten    enable row level security;
alter table rueckfragen         enable row level security;
alter table briefings           enable row level security;
alter table wissen_eintraege    enable row level security;
alter table wissen_versionen    enable row level security;
alter table wissen_dateien      enable row level security;
alter table freigaben           enable row level security;
alter table antwort_bewertungen enable row level security;

-- Studios
create policy studio_lesen on studios for select to authenticated
  using (id = mein_studio());

-- Profile
create policy profil_eigenes_lesen on profiles for select to authenticated
  using (id = auth.uid());
create policy profil_team_lesen on profiles for select to authenticated
  using (ist_team() and studio_id = mein_studio());
create policy profil_eigenes_aendern on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profil_team_aendern on profiles for update to authenticated
  using (ist_team() and studio_id = mein_studio())
  with check (studio_id = mein_studio());

-- Einladungscodes: nur das Team; Einlösen läuft über code_einloesen()
create policy code_team on einladungscodes for all to authenticated
  using (ist_team() and studio_id = mein_studio())
  with check (ist_team() and studio_id = mein_studio());

-- Einwilligungen: nur die Person selbst
create policy einwilligung_eigene on einwilligungen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy einwilligung_log_eigenes on einwilligungen_log for select to authenticated
  using (user_id = auth.uid());

-- Gesundheitsprofil
create policy gesundheit_eigenes on gesundheitsprofil for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy gesundheit_team_lesen on gesundheitsprofil for select to authenticated
  using (trainer_darf_sehen(user_id));

-- Abos: lesen ja, schreiben nur Stripe-Workflow (Service-Role)
create policy abo_eigenes_lesen on abos for select to authenticated
  using (user_id = auth.uid());

-- Übungen
create policy uebung_freigegeben_lesen on uebungen for select to authenticated
  using (status = 'freigegeben' and (studio_id is null or studio_id = mein_studio()));
create policy uebung_team_lesen on uebungen for select to authenticated
  using (ist_team() and (studio_id is null or studio_id = mein_studio()));
create policy uebung_team_anlegen on uebungen for insert to authenticated
  with check (ist_team() and studio_id = mein_studio() and erstellt_von = auth.uid());
create policy uebung_team_aendern on uebungen for update to authenticated
  using (ist_team() and studio_id = mein_studio()
         and (erstellt_von = auth.uid() or ist_gruender()))
  with check (studio_id = mein_studio());
create policy uebung_gruender_global on uebungen for update to authenticated
  using (ist_gruender() and studio_id is null)
  with check (studio_id is null or studio_id = mein_studio());

-- Pläne
create policy plan_eigener_lesen on plaene for select to authenticated
  using (mitglied_id = auth.uid());
create policy plan_team on plaene for all to authenticated
  using (trainer_darf_sehen(mitglied_id))
  with check (trainer_darf_sehen(mitglied_id) and studio_id = mein_studio());

create policy plan_uebung_lesen on plan_uebungen for select to authenticated
  using (exists (select 1 from plaene p where p.id = plan_id
                 and (p.mitglied_id = auth.uid() or trainer_darf_sehen(p.mitglied_id))));
create policy plan_uebung_team on plan_uebungen for all to authenticated
  using (exists (select 1 from plaene p where p.id = plan_id and trainer_darf_sehen(p.mitglied_id)))
  with check (exists (select 1 from plaene p where p.id = plan_id and trainer_darf_sehen(p.mitglied_id)));

create policy vorschlag_team on plan_vorschlaege for all to authenticated
  using (trainer_darf_sehen(mitglied_id)) with check (trainer_darf_sehen(mitglied_id));

-- Einheiten und Sätze
create policy einheit_eigene on einheiten for all to authenticated
  using (mitglied_id = auth.uid())
  with check (mitglied_id = auth.uid() and studio_id = mein_studio());
create policy einheit_team_lesen on einheiten for select to authenticated
  using (trainer_darf_sehen(mitglied_id));

create policy satz_eigene on saetze for all to authenticated
  using (exists (select 1 from einheiten e where e.id = einheit_id and e.mitglied_id = auth.uid()))
  with check (exists (select 1 from einheiten e where e.id = einheit_id and e.mitglied_id = auth.uid()));
create policy satz_team_lesen on saetze for select to authenticated
  using (exists (select 1 from einheiten e where e.id = einheit_id and trainer_darf_sehen(e.mitglied_id)));

-- Chat: nur das Mitglied selbst. Antworten der KI schreibt die Edge Function.
create policy verlauf_eigene on chat_verlaeufe for all to authenticated
  using (mitglied_id = auth.uid())
  with check (mitglied_id = auth.uid() and studio_id = mein_studio());
create policy nachricht_eigene_lesen on chat_nachrichten for select to authenticated
  using (exists (select 1 from chat_verlaeufe v where v.id = verlauf_id and v.mitglied_id = auth.uid()));
create policy nachricht_eigene_schreiben on chat_nachrichten for insert to authenticated
  with check (rolle = 'mitglied'
              and exists (select 1 from chat_verlaeufe v where v.id = verlauf_id and v.mitglied_id = auth.uid()));
-- Team liest einzelne Antworten nur zur Stichprobenbewertung (ohne Verlauf)
create policy nachricht_gruender_bewerten on chat_nachrichten for select to authenticated
  using (ist_gruender() and rolle = 'assistent'
         and exists (select 1 from chat_verlaeufe v where v.id = verlauf_id and v.studio_id = mein_studio()));

-- Rückfragen: Mitglied sieht eigene, Team bearbeitet die des Studios
create policy rueckfrage_eigene_lesen on rueckfragen for select to authenticated
  using (mitglied_id = auth.uid());
create policy rueckfrage_team_lesen on rueckfragen for select to authenticated
  using (ist_team() and studio_id = mein_studio());
create policy rueckfrage_team_beantworten on rueckfragen for update to authenticated
  using (ist_team() and studio_id = mein_studio())
  with check (studio_id = mein_studio() and beantwortet_von = auth.uid());

-- Briefings
create policy briefing_team_lesen on briefings for select to authenticated
  using (trainer_darf_sehen(mitglied_id));

-- Wissen: nur das Team; Mitglieder erreichen Wissen ausschließlich über die KI
create policy wissen_team_lesen on wissen_eintraege for select to authenticated
  using (ist_team() and (studio_id is null or studio_id = mein_studio()));
create policy wissen_team_anlegen on wissen_eintraege for insert to authenticated
  with check (ist_team() and erstellt_von = auth.uid()
              and (studio_id = mein_studio() or (studio_id is null and ist_gruender())));
create policy wissen_team_aendern on wissen_eintraege for update to authenticated
  using (ist_team() and (studio_id is null or studio_id = mein_studio())
         and (ist_gruender() or (erstellt_von = auth.uid() and status in ('entwurf', 'eingereicht'))))
  with check (studio_id is null or studio_id = mein_studio());

create policy version_team_lesen on wissen_versionen for select to authenticated
  using (exists (select 1 from wissen_eintraege w where w.id = eintrag_id
                 and ist_team() and (w.studio_id is null or w.studio_id = mein_studio())));
create policy version_team_anlegen on wissen_versionen for insert to authenticated
  with check (erstellt_von = auth.uid()
              and exists (select 1 from wissen_eintraege w where w.id = eintrag_id
                          and ist_team() and (w.studio_id is null or w.studio_id = mein_studio())
                          and (ist_gruender() or w.erstellt_von = auth.uid())));

create policy datei_team on wissen_dateien for all to authenticated
  using (exists (select 1 from wissen_versionen v join wissen_eintraege w on w.id = v.eintrag_id
                 where v.id = version_id and ist_team()
                   and (w.studio_id is null or w.studio_id = mein_studio())))
  with check (exists (select 1 from wissen_versionen v join wissen_eintraege w on w.id = v.eintrag_id
                      where v.id = version_id and ist_team()
                        and (w.studio_id is null or w.studio_id = mein_studio())));

-- Freigaben
create policy freigabe_team_lesen on freigaben for select to authenticated
  using (ist_team() and studio_id = mein_studio());
create policy freigabe_team_einreichen on freigaben for insert to authenticated
  with check (ist_team() and studio_id = mein_studio()
              and eingereicht_von = auth.uid() and status = 'offen');
create policy freigabe_gruender_entscheiden on freigaben for update to authenticated
  using (ist_gruender() and studio_id = mein_studio())
  with check (studio_id = mein_studio());

-- Antwort-Bewertungen
create policy bewertung_gruender on antwort_bewertungen for all to authenticated
  using (ist_gruender()) with check (ist_gruender() and bewertet_von = auth.uid());

