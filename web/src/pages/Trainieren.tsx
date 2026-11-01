import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Uebung } from '../lib/db'
import { leseRegeln } from '../lib/pose/regeln'
import { Icon } from '../components/Icon'
import { UebungsBild } from '../components/UebungsBild'

export function Trainieren() {
  const [uebungen, setUebungen] = useState<Uebung[] | null>(null)

  useEffect(() => {
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status, regeln').eq('status', 'freigegeben').order('name')
      .then(({ data }) => setUebungen((data ?? []) as Uebung[]))
  }, [])

  return (
    <div className="seite">
      <h1 className="titel">Training</h1>

      <p className="leise" style={{ margin: '-8px 0 0', fontSize: 16 }}>
        Wähle eine Übung. Die App erkennt deine Haltung, zählt mit und sagt dir live, wenn du nachkorrigieren solltest – das Bild bleibt auf deinem Gerät.
      </p>

      <section className="stapel" style={{ gap: 14 }}>
        {uebungen === null ? null : uebungen.length === 0 ? (
          <div className="leer">Die Übungsbibliothek wird gerade vom Team aufgebaut.</div>
        ) : (
          uebungen.map((u) => {
            const regeln = leseRegeln(u.regeln).regeln
            const fakten = regeln ? [
              regeln.modus === 'halten' ? `${regeln.halten_sekunden} s halten` : `${regeln.ziel_wiederholungen ?? 10} ×`,
              ...(regeln.endhalten_sekunden ? [`je ${regeln.endhalten_sekunden} s halten`] : []),
              regeln.ansicht === 'seitlich' ? 'Handy seitlich' : 'Handy frontal',
            ] : []
            const inhalt = (
              <>
                <div className="uebung-bild-flaeche"><UebungsBild regeln={regeln} /></div>
                <div className="uebung-text">
                  <span className="uebung-kategorie">{u.kategorie ?? (u.studio_id ? 'Studio' : 'Five')}{u.an_geraet ? ' · am Gerät' : ''}</span>
                  <h3 className="uebung-name">{u.name}</h3>
                  {fakten.length > 0 && <div className="uebung-fakten">{fakten.map((f) => <span key={f}>{f}</span>)}</div>}
                  {regeln
                    ? <span className="uebung-start"><Icon name="kamera" groesse={16} />Mit Kamera starten</span>
                    : u.beschreibung && <p className="klein leise" style={{ margin: 0 }}>{u.beschreibung}</p>}
                </div>
              </>
            )
            return regeln ? (
              <Link key={u.id} to={`/trainieren/${u.id}`} className="uebung-karte" aria-label={`${u.name} mit Kamera trainieren`}>{inhalt}</Link>
            ) : (
              <article key={u.id} className="uebung-karte">{inhalt}</article>
            )
          })
        )}
      </section>

      <Link to="/fortschritt/neu" className="knopf voll"><Icon name="plus" groesse={22} staerke={2} />Einheit ohne Kamera eintragen</Link>
    </div>
  )
}
