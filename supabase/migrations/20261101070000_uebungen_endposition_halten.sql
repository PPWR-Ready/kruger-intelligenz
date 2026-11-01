-- Five-Prinzip: Bewegung so weit wie möglich ausführen und die Endposition 10 Sekunden halten.
-- Weniger Wiederholungen, weil jede jetzt mit Halten deutlich länger dauert.
update uebungen
   set regeln = regeln || jsonb_build_object('endhalten_sekunden', 10, 'ziel_wiederholungen', 5)
 where regeln->>'modus' = 'wiederholungen' and name in ('Kniebeuge', 'Schulterdrücken stehend');
