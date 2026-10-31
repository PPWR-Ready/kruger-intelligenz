-- Trainer-Modus mit Kamera
--  * Haltedauer für Halteübungen (z. B. Unterarmstütz), statt die Sekunden
--    als „Wiederholungen“ zu speichern
--  * drei Beispielübungen mit Kamera-Regeln zum Testen. Das sind allgemeine
--    Testregeln, NICHT das Five-Konzept; sie sind entsprechend benannt und
--    können im Team-Bereich angepasst, archiviert oder ersetzt werden.

alter table public.saetze
  add column if not exists dauer_sekunden int check (dauer_sekunden is null or dauer_sekunden >= 0);

comment on column public.saetze.dauer_sekunden is 'Sauber gehaltene Sekunden bei Halteübungen (Trainer-Modus)';

insert into public.uebungen (studio_id, name, kategorie, an_geraet, beschreibung, regeln, status)
select s.id, v.name, v.kategorie, false, v.beschreibung, v.regeln::jsonb, 'freigegeben'
from public.studios s
cross join (values
  (
    'Beispiel: Kniebeuge',
    'Beine',
    'Testregel zum Ausprobieren der Kamera, nicht aus dem Five-Konzept. Handy seitlich in Hüfthöhe, ganzer Körper im Bild.',
    '{"version":1,"ansicht":"seitlich","modus":"wiederholungen",
      "zaehlen":{"gelenk":"knie","start":165,"umkehr":100},
      "ziel_wiederholungen":10,"halten_sekunden":null,
      "pruefungen":[
        {"id":"rumpf","gelenk":"rumpfneigung","min":null,"max":50,"wann":"immer","meldung":"Oberkörper aufrichten."},
        {"id":"tiefe","gelenk":"knie","min":70,"max":null,"wann":"umkehr","meldung":"Nicht so tief."}
      ]}'
  ),
  (
    'Beispiel: Unterarmstütz',
    'Rumpf',
    'Testregel zum Ausprobieren der Kamera, nicht aus dem Five-Konzept. Handy seitlich auf Bodenhöhe, ganzer Körper im Bild.',
    '{"version":1,"ansicht":"seitlich","modus":"halten",
      "zaehlen":null,"ziel_wiederholungen":null,"halten_sekunden":30,
      "pruefungen":[
        {"id":"durchhaengen","gelenk":"koerperlinie","min":160,"max":null,"wann":"immer","meldung":"Becken anheben, Körper gerade."},
        {"id":"kopf","gelenk":"kopfhaltung","min":null,"max":35,"wann":"immer","meldung":"Kopf in Verlängerung der Wirbelsäule."}
      ]}'
  ),
  (
    'Beispiel: Schulterdrücken stehend',
    'Schulter',
    'Testregel zum Ausprobieren der Kamera, nicht aus dem Five-Konzept. Handy seitlich in Brusthöhe, Oberkörper und Arme im Bild.',
    '{"version":1,"ansicht":"seitlich","modus":"wiederholungen",
      "zaehlen":{"gelenk":"ellbogen","start":80,"umkehr":165},
      "ziel_wiederholungen":10,"halten_sekunden":null,
      "pruefungen":[
        {"id":"hohlkreuz","gelenk":"rumpfneigung","min":null,"max":15,"wann":"immer","meldung":"Kein Hohlkreuz, Bauch anspannen."}
      ]}'
  )
) as v(name, kategorie, beschreibung, regeln)
where s.name = 'Rückgrat Donaueschingen'
  and not exists (select 1 from public.uebungen u where u.name = v.name and u.studio_id = s.id);
