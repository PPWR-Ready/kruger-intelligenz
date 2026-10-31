-- Die Rolle „gruender“ heißt in der App jetzt „Admin“. Intern bleibt der Wert
-- 'gruender' (Zugriffsregeln, Funktionen und Daten hängen daran); angepasst
-- werden nur die Fehlermeldungen, die in der App sichtbar werden können.
-- Die Funktionen werden unverändert neu angelegt, nur der Meldungstext ändert sich.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%Nur Gründer%'
  loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'Nur Gründer dürfen', 'Nur Admins dürfen');
    def := replace(def, 'Nur Gründer entscheiden', 'Nur Admins entscheiden');
    execute def;
  end loop;
end $$;
