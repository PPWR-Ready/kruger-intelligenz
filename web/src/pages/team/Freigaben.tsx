import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fehlertext, supabase } from '../../lib/supabase'
import { useSitzung } from '../../lib/sitzung'
import { indexAnstossen } from '../../lib/wissen'
import { relativ } from '../../lib/zeit'
import type { Freigabe, Sichtbarkeit } from '../../lib/db'
import { Fehler, Laden, useMitteilung } from '../../components/Bausteine'
import { Antworttext } from '../../components/Antworttext'
import { useTeam } from './Layout'
import { leseRegeln } from '../../lib/pose/regeln'

type Zeile = Freigabe & {
  einreicher: { anzeigename: string } | null
  version: {
    id: string; version: number; inhalt: string; eingabeweg: string
    eintrag: { id: string; titel: string; themen: string[]; sichtbarkeit: Sichtbarkeit; studio_id: string | null; status: string; aktuelle_version_id: string | null } | null
  } | null
  uebung: { id: string; name: string; beschreibung: string | null; regeln: unknown } | null
}

const SICHTBAR: Record<Sichtbarkeit, string> = { alle: 'alle Mitglieder', premium: 'Coach-Abo', trainer: 'nur Team' }

export function TeamFreigaben() {
  const s = useSitzung()
  const team = useTeam()
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null)
  const [mitteilung, zeige] = useMitteilung()
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [alleLaeuft, setAlleLaeuft] = useState(false)

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from('freigaben')
      .select(`*, einreicher:profiles!freigaben_eingereicht_von_fkey(anzeigename),
        version:wissen_versionen(id, version, inhalt, eingabeweg, eintrag:wissen_eintraege!wissen_versionen_eintrag_id_fkey(id, titel, themen, sichtbarkeit, studio_id, status, aktuelle_version_id)),
        uebung:uebungen(id, name, beschreibung, regeln)`)
      .eq('status', 'offen').order('created_at')
    if (error) { setLadefehler(fehlertext(error)); return }
    setLadefehler(null)
    setZeilen((data ?? []) as unknown as Zeile[])
  }, [])
  useEffect(() => { void laden() }, [laden])

  const wissenOffen = (zeilen ?? []).filter((f) => f.typ === 'wissen' && f.version)

  async function alleFreigeben() {
    if (!confirm(`Alle ${wissenOffen.length} Wissenstexte freigeben? Habt ihr sie gelesen? Danach nutzt der Assistent sie für Antworten.`)) return
    setAlleLaeuft(true)
    const { error } = await supabase.from('freigaben').update({ status: 'freigegeben' }).in('id', wissenOffen.map((f) => f.id))
    setAlleLaeuft(false)
    if (error) return zeige(fehlertext(error))
    indexAnstossen()
    fertig(`${wissenOffen.length} Texte freigegeben. Der Assistent kennt sie in etwa einer Minute.`)
  }

  function fertig(text: string) {
    zeige(text)
    team.zaehlerNeuLaden()
    void laden()
  }

  return (
    <>
      <header className="stapel" style={{ gap: 4 }}>
        <p className="eyebrow">Freigaben</p>
        <h1 className="titel">{s.istGruender ? 'Was der Assistent lernen soll' : 'Deine Einreichungen'}</h1>
      </header>
      <p className="klein leise" style={{ margin: 0, maxWidth: 720 }}>
        {s.istGruender
          ? 'Erst nach eurer Freigabe nutzt der Assistent einen Text. Prüft besonders medizinische Aussagen.'
          : 'Ein Admin prüft jeden Text, bevor der Assistent ihn nutzt.'}
      </p>
      {ladefehler && (
        <div className="karte kritisch">
          <span>Die Freigaben konnten nicht geladen werden. {ladefehler}</span>
          <button className="knopf klein" onClick={() => void laden()}>Erneut laden</button>
        </div>
      )}
      {s.istGruender && wissenOffen.length > 1 && (
        <div className="karte akzent reihe zwischen">
          <span>{wissenOffen.length} Wissenstexte warten auf eure Freigabe.</span>
          <button className="knopf primaer klein" disabled={alleLaeuft} onClick={() => void alleFreigeben()}>{alleLaeuft ? 'Wird freigegeben …' : `Alle ${wissenOffen.length} freigeben`}</button>
        </div>
      )}
      {ladefehler ? null : !zeilen ? <Laden /> : zeilen.length === 0 ? (
        <div className="leer">Nichts offen.</div>
      ) : zeilen.map((f) => <FreigabeKarte key={f.id} f={f} fertig={fertig} />)}
      {mitteilung}
    </>
  )
}

function FreigabeKarte({ f, fertig }: { f: Zeile; fertig: (t: string) => void }) {
  const s = useSitzung()
  const [anmerkung, setAnmerkung] = useState('')
  const [bisher, setBisher] = useState<string | null>(null)
  const [vergleich, setVergleich] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  // Übungen nur mit vollständigen Kamera-Regeln freigeben (sonst fehlt Mitgliedern die Kamera)
  const regelFehler = f.uebung ? leseRegeln(f.uebung.regeln).fehler : []

  const e = f.version?.eintrag
  const istAenderung = !!e?.aktuelle_version_id && e.aktuelle_version_id !== f.version?.id
  const ueberholt = istAenderung && e?.status === 'freigegeben'

  async function vergleichen() {
    if (!e?.aktuelle_version_id) return
    if (bisher === null) {
      const { data } = await supabase.from('wissen_versionen').select('inhalt').eq('id', e.aktuelle_version_id).maybeSingle()
      setBisher(data?.inhalt ?? '')
    }
    setVergleich(!vergleich)
  }

  async function entscheiden(status: 'freigegeben' | 'abgelehnt') {
    if (status === 'abgelehnt' && !anmerkung.trim()) return setFehler('Bitte schreib kurz, warum – das hilft beim Überarbeiten.')
    setLaeuft(true)
    setFehler(null)
    const { error } = await supabase.from('freigaben').update({ status, anmerkung: anmerkung.trim() || null }).eq('id', f.id)
    if (error) { setLaeuft(false); return setFehler(fehlertext(error)) }
    if (status === 'freigegeben' && f.typ === 'wissen') indexAnstossen()
    fertig(status === 'freigegeben' ? 'Freigegeben' : 'Abgelehnt')
  }

  return (
    <article className="karte" style={{ gap: 14, maxWidth: 900 }}>
      <div className="reihe zwischen" style={{ flexWrap: 'wrap' }}>
        <span className="klein leise">
          {f.typ === 'wissen' ? (istAenderung ? 'Änderung' : 'Neues Wissen') : 'Übung'} · von {f.einreicher?.anzeigename ?? 'Team'} · {relativ(f.created_at)}
        </span>
        {e && <span className="klein leise">{e.studio_id ? 'Studio' : 'Five-Grundwissen'} · für {SICHTBAR[e.sichtbarkeit]}{e.themen.length ? ` · ${e.themen.join(', ')}` : ''}</span>}
      </div>

      {f.typ === 'wissen' && f.version ? (
        <>
          <h2 className="untertitel">{e ? <Link to={`/team/wissen/${e.id}`}>{e.titel}</Link> : 'Eintrag'} <span className="leise klein">Version {f.version.version}</span></h2>
          {ueberholt && <div className="karte warnung klein">Seit dieser Einreichung wurde bereits eine andere Version freigegeben. Prüf den Vergleich, bevor du diese übernimmst.</div>}
          {istAenderung && <button className="knopf klein still" style={{ alignSelf: 'flex-start' }} onClick={() => void vergleichen()} aria-expanded={vergleich}>{vergleich ? 'Vergleich ausblenden' : 'Mit bisheriger Version vergleichen'}</button>}
          <div className={vergleich ? 'raster-2' : undefined} style={vergleich ? { alignItems: 'start' } : undefined}>
            {vergleich && (
              <div className="stapel" style={{ gap: 6 }}>
                <span className="label-klein">Bisher</span>
                <div className="karte" style={{ background: 'var(--bg)', whiteSpace: 'pre-wrap', fontSize: 14, maxHeight: 420, overflow: 'auto' }}>{bisher}</div>
              </div>
            )}
            <div className="stapel" style={{ gap: 6 }}>
              {vergleich && <span className="label-klein">Neu</span>}
              <div className="karte" style={{ background: 'var(--bg)', fontSize: 15, lineHeight: 1.55, maxHeight: 420, overflow: 'auto' }}><Antworttext text={f.version.inhalt} /></div>
            </div>
          </div>
        </>
      ) : f.uebung ? (
        <>
          <h2 className="untertitel">{f.uebung.name}</h2>
          {f.uebung.beschreibung && <p className="klein" style={{ margin: 0 }}>{f.uebung.beschreibung}</p>}
          <Link to={`/team/uebungen/${f.uebung.id}`} className="knopf klein" style={{ alignSelf: 'flex-start' }}>Regeln ansehen und mit Kamera testen</Link>
          {regelFehler.length > 0 && (
            <div className="karte" style={{ background: 'var(--bg)', gap: 4 }} role="note">
              <strong className="klein">Kamera-Regeln unvollständig – so kann die Übung nicht freigegeben werden:</strong>
              <ul className="klein" style={{ margin: 0, paddingLeft: 18 }}>{regelFehler.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
        </>
      ) : <span className="leise">Inhalt nicht mehr vorhanden.</span>}

      {s.istGruender && (
        <>
          <label className="feld"><span>Anmerkung <span className="leise">(bei Ablehnung Pflicht)</span></span><textarea rows={2} value={anmerkung} onChange={(ev) => setAnmerkung(ev.target.value)} maxLength={1000} /></label>
          <Fehler text={fehler} />
          <div className="reihe" style={{ flexWrap: 'wrap' }}>
            <button className="knopf primaer" onClick={() => void entscheiden('freigegeben')} disabled={laeuft || regelFehler.length > 0}>Freigeben</button>
            <button className="knopf still" onClick={() => void entscheiden('abgelehnt')} disabled={laeuft}>Ablehnen</button>
          </div>
        </>
      )}
    </article>
  )
}
