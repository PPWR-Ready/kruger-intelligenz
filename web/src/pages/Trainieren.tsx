import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Uebung } from '../lib/db'
import { leseRegeln } from '../lib/pose/regeln'
import { Icon } from '../components/Icon'

export function Trainieren() {
  const [uebungen, setUebungen] = useState<Uebung[] | null>(null)

  useEffect(() => {
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status, regeln').eq('status', 'freigegeben').order('name')
      .then(({ data }) => setUebungen((data ?? []) as Uebung[]))
  }, [])

  const mitKamera = (u: Uebung) => leseRegeln(u.regeln).regeln !== null

  return (
    <div className="seite">
      <h1 className="titel">Training</h1>

      <section className="karte akzent">
        <p className="eyebrow">Kamera-Coaching</p>
        <p style={{ margin: 0, fontSize: 15 }}>
          Wähle eine Übung mit Kamera-Symbol. Die App erkennt deine Haltung, zeigt Winkel live und sagt dir Bescheid, wenn etwas nicht stimmt. Das Bild bleibt auf deinem Gerät.
        </p>
      </section>

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Übungen</h2>
        {uebungen === null ? null : uebungen.length === 0 ? (
          <div className="leer">Die Übungsbibliothek wird gerade vom Team aufgebaut.</div>
        ) : (
          uebungen.map((u) => {
            const kamera = mitKamera(u)
            const inhalt = (
              <>
                <span className="label-klein" style={{ color: 'var(--accent)' }}>
                  {u.studio_id ? 'Studio' : 'Five'}{u.kategorie ? ` · ${u.kategorie}` : ''}{u.an_geraet ? ' · am Gerät' : ''}
                </span>
                <h3 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {kamera && <Icon name="kamera" groesse={18} />}{u.name}
                </h3>
                {u.beschreibung && <p className="klein leise" style={{ margin: 0 }}>{u.beschreibung}</p>}
              </>
            )
            return kamera ? (
              <Link key={u.id} to={`/trainieren/${u.id}`} className="karte" style={{ gap: 6, textDecoration: 'none', color: 'inherit' }} aria-label={`${u.name} mit Kamera trainieren`}>
                {inhalt}
              </Link>
            ) : (
              <article key={u.id} className="karte" style={{ gap: 6 }}>{inhalt}</article>
            )
          })
        )}
      </section>

      <Link to="/fortschritt/neu" className="knopf voll"><Icon name="plus" groesse={22} staerke={2} />Einheit ohne Kamera eintragen</Link>
    </div>
  )
}
