import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fehlertext, supabase } from '../lib/supabase'
import { Laden, Ladefehler } from '../components/Bausteine'
import type { Uebung } from '../lib/db'
import { leseRegeln } from '../lib/pose/regeln'
import { Icon } from '../components/Icon'
import { UebungsBild } from '../components/UebungsBild'
import { ErklaervideoLink } from '../components/Erklaervideo'
import { erkennungVorladen } from '../lib/pose/erkennung'

export function Trainieren() {
  const [uebungen, setUebungen] = useState<Uebung[] | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)

  const laden = useCallback(() => {
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status, regeln').eq('status', 'freigegeben').order('name')
      .then(({ data, error }) => {
        // Bei schlechtem Netz nicht „keine Übungen“ zeigen, sondern ehrlich den Fehler
        setLadefehler(error ? fehlertext(error) : null)
        if (!error) setUebungen((data ?? []) as Uebung[])
      })
  }, [])

  useEffect(() => {
    laden()
    // Wer die Übungen ansieht, startet wahrscheinlich gleich die Kamera
    erkennungVorladen()
  }, [laden])

  return (
    <div className="seite">
      <h1 className="titel">Training</h1>

      <p className="leise" style={{ margin: '-8px 0 0', fontSize: 16 }}>
        Wähle eine Übung. Die App erkennt deine Haltung, zählt mit und sagt dir live, wenn du nachkorrigieren solltest – das Bild bleibt auf deinem Gerät.
      </p>
      <ErklaervideoLink />

      <section className="stapel" style={{ gap: 14 }}>
        {ladefehler ? <Ladefehler text={ladefehler} erneut={laden} /> : uebungen === null ? <Laden text="Übungen werden geladen …" /> : uebungen.length === 0 ? (
          <div className="leer">Die Übungsbibliothek wird gerade vom Team aufgebaut.</div>
        ) : (
          uebungen.map((u) => {
            const regeln = leseRegeln(u.regeln).regeln
            const fakten = regeln ? [
              regeln.modus === 'halten' ? `${regeln.halten_sekunden} s halten` : `${regeln.ziel_wiederholungen ?? 10} ×`,
              ...(regeln.endhalten_sekunden ? [`je ${regeln.endhalten_sekunden} s halten`] : []),
              regeln.ansicht === 'seitlich' ? 'Handy seitlich' : 'Handy von vorn',
            ] : []
            const inhalt = (
              <>
                <div className="uebung-bild-flaeche">{regeln ? <UebungsBild regeln={regeln} /> : <Icon name="fortschritt" groesse={40} />}</div>
                <div className="uebung-text">
                  {(u.kategorie || u.an_geraet) && <span className="uebung-kategorie">{[u.kategorie, u.an_geraet ? 'am Gerät' : null].filter(Boolean).join(' · ')}</span>}
                  <h2 className="uebung-name">{u.name}</h2>
                  {fakten.length > 0 && <div className="uebung-fakten">{fakten.map((f) => <span key={f}>{f}</span>)}</div>}
                  {regeln
                    ? <span className="uebung-start"><Icon name="kamera" groesse={16} />Mit Kamera starten</span>
                    : <>
                        {u.beschreibung && <p className="klein leise" style={{ margin: 0 }}>{u.beschreibung}</p>}
                        <Link to="/fortschritt/neu" className="uebung-start"><Icon name="plus" groesse={16} />Ohne Kamera – hier eintragen</Link>
                      </>}
                </div>
              </>
            )
            return regeln ? (
              <Link key={u.id} to={`/trainieren/${u.id}`} className="uebung-karte">{inhalt}</Link>
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
