import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fehlertext, supabase } from '../../lib/supabase'
import { relativ, tageszeitGruss } from '../../lib/zeit'
import { useSitzung, vorname } from '../../lib/sitzung'
import type { AmpelZeile } from '../../lib/db'
import { Fehler, Kachel, Laden } from '../../components/Bausteine'

const STATUS: Record<AmpelZeile['status'], { text: string; klasse: string }> = {
  ansprechen: { text: 'Ansprechen', klasse: 'kritisch' },
  beobachten: { text: 'Beobachten', klasse: 'warnung' },
  laeuft: { text: 'Läuft', klasse: 'erfolg' },
}

function grund(z: AmpelZeile): string {
  const g: string[] = []
  if (z.warnsignal_7_tage) g.push('Warnsignal im Chat')
  if (!z.letzte_einheit) g.push('noch keine Einheit')
  else if (Date.now() - new Date(z.letzte_einheit).getTime() > 14 * 86400000) g.push('14 Tage kein Training')
  if (z.schmerz_aktuell !== null && z.schmerz_vorher !== null && z.schmerz_aktuell - z.schmerz_vorher >= 2) g.push('Schmerz gestiegen')
  if (z.offene_rueckfragen > 0) g.push(`${z.offene_rueckfragen} offene Rückfrage${z.offene_rueckfragen > 1 ? 'n' : ''}`)
  if ((z.anteil_anpassen ?? 0) > 0.3) g.push('viele Sätze zum Anpassen')
  return g.join(' · ')
}

const zahl = (n: number | null) => (n === null ? '–' : String(n).replace('.', ','))

export function TeamUebersicht() {
  const s = useSitzung()
  const [zeilen, setZeilen] = useState<AmpelZeile[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    void supabase.rpc('mitglieder_ampel').then(({ data, error }) => {
      if (error) setFehler(fehlertext(error))
      setZeilen((data ?? []) as AmpelZeile[])
    })
  }, [])

  const anzahl = (st: AmpelZeile['status']) => zeilen?.filter((z) => z.status === st).length ?? 0

  return (
    <>
      <header className="stapel" style={{ gap: 4 }}>
        <p className="eyebrow">Übersicht</p>
        <h1 className="titel">{tageszeitGruss()}, {vorname(s.profil)}.</h1>
      </header>

      <Fehler text={fehler} />
      {!zeilen ? <Laden /> : (
        <>
          <div className="raster-3" style={{ maxWidth: 640 }}>
            <Kachel zahl={anzahl('ansprechen')} label="ansprechen" farbe="var(--critical)" />
            <Kachel zahl={anzahl('beobachten')} label="beobachten" farbe="var(--warning)" />
            <Kachel zahl={anzahl('laeuft')} label="läuft" farbe="var(--success)" />
          </div>

          <section className="stapel">
            <h2 className="untertitel">Mitglieder-Ampel</h2>
            <p className="klein leise" style={{ margin: 0 }}>Nur Mitglieder, die dem Team ihren Fortschritt freigegeben haben. Chats sind nie sichtbar.</p>
            {zeilen.length === 0 ? (
              <div className="leer">Noch keine Mitglieder mit Freigabe. Sobald Mitglieder „Trainer darf Fortschritt sehen“ einschalten, erscheinen sie hier.</div>
            ) : (
              <div className="tabelle-rahmen">
                <table className="tabelle">
                  <thead><tr><th>Mitglied</th><th>Status</th><th>Letzte Einheit</th><th>Schmerz 14 T.</th><th>davor</th><th>Grund</th></tr></thead>
                  <tbody>
                    {zeilen.map((z) => (
                      <tr key={z.mitglied_id}>
                        <td style={{ fontWeight: 600 }}>{z.anzeigename}</td>
                        <td><span className={`status ${STATUS[z.status].klasse}`}>{STATUS[z.status].text}</span></td>
                        <td>{z.letzte_einheit ? relativ(z.letzte_einheit) : '–'}</td>
                        <td>{zahl(z.schmerz_aktuell)}</td>
                        <td className="leise">{zahl(z.schmerz_vorher)}</td>
                        <td className="leise">{grund(z) || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reihe" style={{ flexWrap: 'wrap' }}>
            <Link to="/team/rueckfragen" className="knopf">Rückfragen beantworten</Link>
            <Link to="/team/wissen/neu" className="knopf">Wissen erfassen</Link>
            <Link to="/team/mitglieder" className="knopf">Einladungscode erstellen</Link>
          </section>
        </>
      )}
    </>
  )
}
