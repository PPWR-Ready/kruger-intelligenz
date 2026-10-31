import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Uebung } from '../lib/db'
import { Icon } from '../components/Icon'

export function Trainieren() {
  const [uebungen, setUebungen] = useState<Uebung[] | null>(null)

  useEffect(() => {
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status').eq('status', 'freigegeben').order('name')
      .then(({ data }) => setUebungen((data ?? []) as Uebung[]))
  }, [])

  return (
    <div className="seite">
      <h1 className="titel">Trainieren</h1>

      <section className="karte akzent">
        <p className="eyebrow">Bald verfügbar</p>
        <h2 className="display display-l" style={{ fontSize: 32 }}>Kamera-Coaching</h2>
        <p style={{ margin: 0, fontSize: 15 }}>
          Die App erkennt deine Haltung, zeigt dir Winkel und Korrekturen live und spricht mit dir. Das Bild bleibt dabei auf deinem Gerät. Die ersten Übungen kommen mit dem nächsten Update.
        </p>
      </section>

      <Link to="/fortschritt/neu" className="knopf primaer voll"><Icon name="plus" groesse={22} staerke={2} />Einheit ohne Kamera eintragen</Link>

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Übungen</h2>
        {uebungen === null ? null : uebungen.length === 0 ? (
          <div className="leer">Die Übungsbibliothek wird gerade vom Team aufgebaut.</div>
        ) : (
          uebungen.map((u) => (
            <article key={u.id} className="karte" style={{ gap: 6 }}>
              <span className="label-klein" style={{ color: 'var(--accent)' }}>{u.studio_id ? 'Studio' : 'Five'}{u.kategorie ? ` · ${u.kategorie}` : ''}{u.an_geraet ? ' · am Gerät' : ''}</span>
              <h3 style={{ fontSize: 17 }}>{u.name}</h3>
              {u.beschreibung && <p className="klein leise" style={{ margin: 0 }}>{u.beschreibung}</p>}
            </article>
          ))
        )}
      </section>
    </div>
  )
}
