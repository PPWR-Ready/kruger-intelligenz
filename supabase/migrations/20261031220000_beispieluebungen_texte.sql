-- Beispielübungen für Mitglieder verständlich benennen und beschreiben (ohne „Testregel“).
-- Es sind allgemeine Übungen, keine Five-Übungen – das sagt der Text ehrlich, ohne abzuschrecken.
update uebungen set name = 'Kniebeuge',
  beschreibung = 'Handy seitlich in Hüfthöhe aufstellen, ganzer Körper im Bild. Die App zählt mit und sagt dir, wenn du nachkorrigieren solltest.'
where name = 'Beispiel: Kniebeuge';
update uebungen set name = 'Unterarmstütz',
  beschreibung = 'Handy seitlich auf Bodenhöhe, ganzer Körper im Bild. Die App misst die Zeit und achtet darauf, dass dein Körper eine gerade Linie bildet.'
where name = 'Beispiel: Unterarmstütz';
update uebungen set name = 'Schulterdrücken stehend',
  beschreibung = 'Handy seitlich in Brusthöhe, Oberkörper und Arme im Bild. Die App zählt mit und achtet auf einen aufrechten Rumpf.'
where name = 'Beispiel: Schulterdrücken stehend';
