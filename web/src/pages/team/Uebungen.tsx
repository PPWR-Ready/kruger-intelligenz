// Team-Bereich: Übungen mit Kamera-Regeln pflegen und live testen.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fehlertext, supabase } from '../../lib/supabase'
import { useSitzung } from '../../lib/sitzung'
import { relativ } from '../../lib/zeit'
import type { InhaltStatus, Uebung } from '../../lib/db'
import { Fehler, Laden, useMitteilung } from '../../components/Bausteine'
import { Icon } from '../../components/Icon'
import { KameraBuehne, type Bild } from '../../components/KameraBuehne'
import { GELENK, GELENKE, type GelenkId } from '../../lib/pose/geometrie'
import { Auswertung, PHASEN, benoetigteGelenke, leereRegeln, leseRegeln, type Modus, type Phase, type Pruefung, type Regeln, type Stand } from '../../lib/pose/regeln'
import { useTeam } from './Layout'

const STATUS: Record<InhaltStatus, { text: string; klasse: string }> = {
  entwurf: { text: 'Entwurf', klasse: 'neutral' },
  eingereicht: { text: 'Wartet auf Freigabe', klasse: 'warnung' },
  freigegeben: { text: 'Freigegeben', klasse: 'erfolg' },
  abgelehnt: { text: 'Abgelehnt', klasse: 'kritisch' },
  archiviert: { text: 'Archiviert', klasse: 'neutral' },
}

type Zeile = Uebung & { updated_at: string }

/* ------------------------------------------------------------ Liste */
export function TeamUebungen() {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null)
  const [archiv, setArchiv] = useState(false)

  useEffect(() => {
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status, regeln, updated_at').order('name')
      .then(({ data }) => setZeilen((data ?? []) as Zeile[]))
  }, [])

  const liste = (zeilen ?? []).filter((z) => (archiv ? z.status === 'archiviert' : z.status !== 'archiviert'))

  return (
    <>
      <header className="reihe zwischen" style={{ flexWrap: 'wrap' }}>
        <div className="stapel" style={{ gap: 4 }}>
          <p className="eyebrow">Trainer-Modus</p>
          <h1 className="titel">Übungen</h1>
        </div>
        <Link to="/team/uebungen/neu" className="knopf primaer"><Icon name="plus" groesse={18} staerke={2} />Neue Übung</Link>
      </header>
      <p className="klein leise" style={{ margin: 0, maxWidth: 720 }}>
        Jede Übung braucht Kamera-Regeln: welches Gelenk die Wiederholungen zählt und welche Winkel als Fehler gemeldet werden. Mit „Kamera-Test“ im Editor siehst du alle Winkel live und kannst Werte direkt übernehmen.
      </p>
      <div className="chips" role="group" aria-label="Ansicht">
        <button className="chip" aria-pressed={!archiv} onClick={() => setArchiv(false)}>Aktiv</button>
        <button className="chip" aria-pressed={archiv} onClick={() => setArchiv(true)}>Archiviert</button>
      </div>

      {!zeilen ? <Laden /> : liste.length === 0 ? (
        <div className="leer">{archiv ? 'Keine archivierten Übungen.' : 'Noch keine Übungen. Leg mit „Neue Übung“ los.'}</div>
      ) : (
        <div className="tabelle-rahmen">
          <table className="tabelle">
            <thead><tr><th>Übung</th><th>Art</th><th>Kamera</th><th>Status</th><th>Geändert</th></tr></thead>
            <tbody>
              {liste.map((z) => {
                const r = leseRegeln(z.regeln)
                return (
                  <tr key={z.id}>
                    <td><Link to={`/team/uebungen/${z.id}`} style={{ fontWeight: 600 }}>{z.name}</Link><div className="klein leise">{z.studio_id ? 'Studio' : 'Five'}{z.kategorie ? ` · ${z.kategorie}` : ''}{z.an_geraet ? ' · am Gerät' : ''}</div></td>
                    <td className="leise">{r.regeln ? (r.regeln.modus === 'halten' ? `Halten ${r.regeln.halten_sekunden} s` : `Wiederholungen (${GELENK[r.regeln.zaehlen!.gelenk].name})`) : '–'}</td>
                    <td>{r.regeln ? <span className="status erfolg">{r.regeln.pruefungen.length} Prüfungen</span> : <span className="status neutral">nicht eingerichtet</span>}</td>
                    <td><span className={`status ${STATUS[z.status].klasse}`}>{STATUS[z.status].text}</span></td>
                    <td className="leise">{relativ(z.updated_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ Editor */
let zaehler = 0
const neueId = () => `p${Date.now().toString(36)}${(zaehler++).toString(36)}`

export function TeamUebungEditor() {
  const { id } = useParams()
  const neu = !id || id === 'neu'
  const s = useSitzung()
  const team = useTeam()
  const navigate = useNavigate()
  const [mitteilung, zeige] = useMitteilung()

  const [geladen, setGeladen] = useState(neu)
  const [uebung, setUebung] = useState<Uebung | null>(null)
  const [name, setName] = useState('')
  const [kategorie, setKategorie] = useState('')
  const [anGeraet, setAnGeraet] = useState(false)
  const [beschreibung, setBeschreibung] = useState('')
  const [r, setR] = useState<Regeln>(leereRegeln())
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [test, setTest] = useState(false)

  useEffect(() => {
    if (neu) return
    void supabase.from('uebungen').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      const u = data as Uebung | null
      setUebung(u)
      if (u) {
        setName(u.name); setKategorie(u.kategorie ?? ''); setAnGeraet(u.an_geraet); setBeschreibung(u.beschreibung ?? '')
        const roh = (u.regeln ?? {}) as Partial<Regeln>
        const basis = leereRegeln(roh.modus === 'halten' ? 'halten' : 'wiederholungen')
        setR({ ...basis, ...roh, pruefungen: (roh.pruefungen ?? []).map((p) => ({ ...p, id: p.id || neueId() })) } as Regeln)
      }
      setGeladen(true)
    })
  }, [id, neu])

  const pruefung = useMemo(() => leseRegeln(r), [r])
  const istGruender = s.profil?.rolle === 'gruender'
  const darfBearbeiten = neu || (uebung !== null && (uebung.studio_id !== null || istGruender))

  function modusWechseln(m: Modus) {
    const basis = leereRegeln(m)
    setR((x) => ({ ...basis, ansicht: x.ansicht, pruefungen: x.pruefungen.map((p) => (m === 'halten' ? { ...p, wann: 'immer' } : p)) }))
  }
  const aendere = (teil: Partial<Regeln>) => setR((x) => ({ ...x, ...teil }))
  const aenderePruefung = (pid: string, teil: Partial<Pruefung>) =>
    setR((x) => ({ ...x, pruefungen: x.pruefungen.map((p) => (p.id === pid ? { ...p, ...teil } : p)) }))

  async function speichern(ziel: 'behalten' | 'einreichen' | 'freigeben' | 'archivieren') {
    if (!s.profil) return
    setFehler(null)
    if (!name.trim()) return setFehler('Bitte gib der Übung einen Namen.')
    if (ziel !== 'behalten' && ziel !== 'archivieren' && !pruefung.regeln) return setFehler('Die Kamera-Regeln sind noch nicht vollständig (siehe Hinweise).')
    setSpeichert(true)
    try {
      const status: InhaltStatus =
        ziel === 'freigeben' ? 'freigegeben'
          : ziel === 'archivieren' ? 'archiviert'
            : ziel === 'einreichen' ? 'eingereicht'
              // Trainer: Änderungen an freigegebenen Übungen gehen erneut zur Freigabe
              : uebung?.status === 'freigegeben' && !istGruender ? 'eingereicht' : (uebung?.status ?? 'entwurf')
      const daten = {
        name: name.trim(), kategorie: kategorie.trim() || null, an_geraet: anGeraet,
        beschreibung: beschreibung.trim() || null,
        regeln: pruefung.regeln ?? r, status,
      }
      let uid = uebung?.id
      if (neu) {
        const { data, error } = await supabase.from('uebungen')
          .insert({ ...daten, studio_id: s.profil.studio_id, erstellt_von: s.profil.id }).select('*').single()
        if (error) throw error
        uid = data.id
        setUebung(data as Uebung)
      } else {
        const regelnGeaendert = JSON.stringify(uebung?.regeln ?? {}) !== JSON.stringify(daten.regeln)
        const { data, error } = await supabase.from('uebungen')
          .update({ ...daten, version: (uebung?.version ?? 1) + (regelnGeaendert ? 1 : 0) }).eq('id', uid).select('*').single()
        if (error) throw error
        setUebung(data as Uebung)
      }
      if (status === 'eingereicht' && uebung?.status !== 'eingereicht') {
        const { error } = await supabase.from('freigaben').insert({ studio_id: s.profil.studio_id, typ: 'uebung', uebung_id: uid, eingereicht_von: s.profil.id, status: 'offen' })
        if (error) throw error
      }
      team.zaehlerNeuLaden()
      zeige(ziel === 'freigeben' ? 'Freigegeben – Mitglieder sehen die Übung jetzt' : ziel === 'einreichen' || status === 'eingereicht' ? 'Zur Freigabe eingereicht' : ziel === 'archivieren' ? 'Archiviert' : 'Gespeichert')
      if (neu && uid) navigate(`/team/uebungen/${uid}`, { replace: true })
    } catch (e) {
      setFehler(fehlertext(e))
    } finally {
      setSpeichert(false)
    }
  }

  if (!geladen) return <Laden />
  if (!neu && !uebung) return <div className="leer">Diese Übung gibt es nicht.</div>

  const status = uebung?.status ?? 'entwurf'

  return (
    <>
      <header className="reihe zwischen" style={{ flexWrap: 'wrap' }}>
        <div className="stapel" style={{ gap: 4 }}>
          <Link to="/team/uebungen" className="klein">← Alle Übungen</Link>
          <h1 className="titel">{neu ? 'Neue Übung' : name || 'Übung'}</h1>
        </div>
        {!neu && <span className={`status ${STATUS[status].klasse}`}>{STATUS[status].text}</span>}
      </header>

      {!darfBearbeiten && <div className="karte warnung"><p className="klein" style={{ margin: 0 }}>Five-Übungen können nur Gründer ändern.</p></div>}

      <div className="editor-raster" style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <fieldset disabled={!darfBearbeiten} className="stapel" style={{ border: 0, padding: 0, margin: 0, gap: 16 }}>
          <section className="karte">
            <h2 className="untertitel">Übung</h2>
            <label className="feld"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
            <div className="reihe" style={{ flexWrap: 'wrap' }}>
              <label className="feld" style={{ flex: 1 }}><span>Kategorie</span><input value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="z. B. Rumpf" maxLength={60} /></label>
              <label className="reihe" style={{ gap: 8, marginTop: 22 }}><input type="checkbox" checked={anGeraet} onChange={(e) => setAnGeraet(e.target.checked)} />am Gerät</label>
            </div>
            <label className="feld"><span>Kurze Beschreibung für Mitglieder</span><textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} maxLength={500} style={{ minHeight: 80 }} /></label>
          </section>

          <section className="karte">
            <h2 className="untertitel">Kamera-Regeln</h2>
            <div className="reihe" style={{ flexWrap: 'wrap' }}>
              <label className="feld" style={{ flex: 1 }}><span>Art</span>
                <select value={r.modus} onChange={(e) => modusWechseln(e.target.value as Modus)}>
                  <option value="wiederholungen">Wiederholungen zählen</option>
                  <option value="halten">Position halten</option>
                </select>
              </label>
              <label className="feld" style={{ flex: 1 }}><span>Kamera steht</span>
                <select value={r.ansicht} onChange={(e) => aendere({ ansicht: e.target.value as Regeln['ansicht'] })}>
                  <option value="seitlich">seitlich</option>
                  <option value="frontal">frontal</option>
                </select>
              </label>
            </div>

            {r.modus === 'wiederholungen' && r.zaehlen && (
              <div className="stapel" style={{ gap: 10 }}>
                <label className="feld"><span>Gelenk, das die Wiederholungen zählt</span>
                  <GelenkWahl wert={r.zaehlen.gelenk} beiWahl={(g) => aendere({ zaehlen: { ...r.zaehlen!, gelenk: g } })} />
                </label>
                <div className="reihe" style={{ flexWrap: 'wrap' }}>
                  <Zahlfeld label="Ausgangswinkel (°)" wert={r.zaehlen.start} beiAenderung={(v) => aendere({ zaehlen: { ...r.zaehlen!, start: v ?? 0 } })} />
                  <Zahlfeld label="Umkehrwinkel (°)" wert={r.zaehlen.umkehr} beiAenderung={(v) => aendere({ zaehlen: { ...r.zaehlen!, umkehr: v ?? 0 } })} />
                  <Zahlfeld label="Ziel-Wiederholungen" wert={r.ziel_wiederholungen} beiAenderung={(v) => aendere({ ziel_wiederholungen: v })} />
                </div>
                <p className="klein leise" style={{ margin: 0 }}>{GELENK[r.zaehlen.gelenk].erklaerung} Eine Wiederholung zählt, wenn der Winkel vom Ausgangs- zum Umkehrwinkel und zurück geht.</p>
              </div>
            )}
            {r.modus === 'halten' && (
              <Zahlfeld label="Haltezeit (Sekunden)" wert={r.halten_sekunden} beiAenderung={(v) => aendere({ halten_sekunden: v })} />
            )}
          </section>

          <section className="karte">
            <div className="reihe zwischen">
              <h2 className="untertitel">Fehlermeldungen</h2>
              <button type="button" className="knopf klein" onClick={() => aendere({ pruefungen: [...r.pruefungen, { id: neueId(), gelenk: 'rumpfneigung', min: null, max: null, wann: 'immer', meldung: '' }] })}>
                <Icon name="plus" groesse={16} />Prüfung
              </button>
            </div>
            <p className="klein leise" style={{ margin: 0 }}>Die App sagt nur etwas, wenn ein Winkel außerhalb der Grenzen liegt. Leeres Feld = keine Grenze.</p>
            {r.pruefungen.length === 0 && <div className="leer" style={{ padding: 14 }}>Noch keine Prüfung. Ohne Prüfung zählt die App nur.</div>}
            {r.pruefungen.map((p, i) => (
              <div key={p.id} className="stapel" style={{ gap: 8, borderTop: i ? '1px solid var(--line-soft)' : undefined, paddingTop: i ? 12 : 0 }}>
                <div className="reihe" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label className="feld" style={{ flex: '1 1 140px' }}><span>Gelenk</span><GelenkWahl wert={p.gelenk} beiWahl={(g) => aenderePruefung(p.id, { gelenk: g })} /></label>
                  <Zahlfeld label="min °" wert={p.min} beiAenderung={(v) => aenderePruefung(p.id, { min: v })} schmal />
                  <Zahlfeld label="max °" wert={p.max} beiAenderung={(v) => aenderePruefung(p.id, { max: v })} schmal />
                  {r.modus === 'wiederholungen' && (
                    <label className="feld" style={{ flex: '1 1 150px' }}><span>Gilt</span>
                      <select value={p.wann} onChange={(e) => aenderePruefung(p.id, { wann: e.target.value as Phase })}>
                        {PHASEN.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                      </select>
                    </label>
                  )}
                  <button type="button" className="knopf klein still" aria-label={`Prüfung ${i + 1} entfernen`} onClick={() => aendere({ pruefungen: r.pruefungen.filter((x) => x.id !== p.id) })}>Entfernen</button>
                </div>
                <label className="feld"><span>Meldung (wird vorgelesen)</span><input value={p.meldung} onChange={(e) => aenderePruefung(p.id, { meldung: e.target.value })} maxLength={120} placeholder="z. B. Rücken gerade halten." /></label>
              </div>
            ))}
            {pruefung.fehler.length > 0 && (
              <ul className="klein" style={{ margin: 0, color: 'var(--warning)', paddingLeft: 18 }}>{pruefung.fehler.map((f) => <li key={f}>{f}</li>)}</ul>
            )}
          </section>

          <Fehler text={fehler} />
          <div className="reihe" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="knopf" disabled={speichert} onClick={() => void speichern('behalten')}>Speichern</button>
            {istGruender ? (
              <button type="button" className="knopf primaer" disabled={speichert || !pruefung.regeln} onClick={() => void speichern('freigeben')}>{status === 'freigegeben' ? 'Speichern & freigegeben lassen' : 'Freigeben'}</button>
            ) : (
              status !== 'eingereicht' && <button type="button" className="knopf primaer" disabled={speichert || !pruefung.regeln} onClick={() => void speichern('einreichen')}>Zur Freigabe einreichen</button>
            )}
            {!neu && status !== 'archiviert' && <button type="button" className="knopf still" disabled={speichert} onClick={() => void speichern('archivieren')}>Archivieren</button>}
          </div>
        </fieldset>

        <section className="stapel" style={{ position: 'sticky', top: 16 }}>
          {!test ? (
            <div className="karte akzent">
              <h2 className="untertitel">Kamera-Test</h2>
              <p className="klein" style={{ margin: 0 }}>Zeigt alle Winkel live und prüft die Regeln oben sofort, ohne zu speichern. Ideal, um die Übung einmal vorzumachen und Werte abzulesen.</p>
              <button type="button" className="knopf primaer" onClick={() => setTest(true)}><Icon name="kamera" groesse={20} />Kamera-Test starten</button>
            </div>
          ) : (
            <Messmodus regeln={pruefung.regeln} zaehlGelenk={r.zaehlen?.gelenk ?? null}
              uebernehmen={(feld, wert) => r.zaehlen && aendere({ zaehlen: { ...r.zaehlen, [feld]: wert } })}
              beenden={() => setTest(false)} />
          )}
        </section>
      </div>
      {mitteilung}
    </>
  )
}

function GelenkWahl({ wert, beiWahl }: { wert: GelenkId; beiWahl: (g: GelenkId) => void }) {
  return (
    <select value={wert} onChange={(e) => beiWahl(e.target.value as GelenkId)}>
      {GELENKE.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  )
}

function Zahlfeld({ label, wert, beiAenderung, schmal }: { label: string; wert: number | null; beiAenderung: (v: number | null) => void; schmal?: boolean }) {
  return (
    <label className="feld" style={{ flex: schmal ? '0 1 90px' : '1 1 130px' }}>
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={0} max={360} value={wert ?? ''}
        onChange={(e) => beiAenderung(e.target.value === '' ? null : Math.max(0, Math.min(360, Math.round(Number(e.target.value)))))} />
    </label>
  )
}

/** Live-Messung aller Winkel plus Probelauf der aktuellen (ungespeicherten) Regeln. */
function Messmodus({ regeln, zaehlGelenk, uebernehmen, beenden }: {
  regeln: Regeln | null
  zaehlGelenk: GelenkId | null
  uebernehmen: (feld: 'start' | 'umkehr', wert: number) => void
  beenden: () => void
}) {
  const [winkel, setWinkel] = useState<Record<GelenkId, number | null> | null>(null)
  const [stand, setStand] = useState<Stand | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const auswertung = useRef<{ schluessel: string; a: Auswertung } | null>(null)
  const zuletzt = useRef(0)

  // Bei jeder Regeländerung frisch auswerten (die Bildschleife merkt es am Schlüssel)
  const schluessel = JSON.stringify(regeln)
  const aktuelleRegeln = useRef({ regeln, schluessel })
  useLayoutEffect(() => { aktuelleRegeln.current = { regeln, schluessel } })

  const beimBild = useCallback((b: Bild) => {
    const { regeln: rg, schluessel: k } = aktuelleRegeln.current
    if (!rg) auswertung.current = null
    else if (auswertung.current?.schluessel !== k) { auswertung.current = { schluessel: k, a: new Auswertung(rg) }; setMeldung(null) }
    const a = auswertung.current?.a
    if (a) for (const e of a.schritt(b.winkel, b.zeit)) if (e.art !== 'wiederholung') setMeldung(e.text)
    if (b.zeit - zuletzt.current > 150) {
      zuletzt.current = b.zeit
      setWinkel(b.winkel)
      setStand(a ? a.stand() : null)
    }
  }, [])

  const anzeige = regeln ? benoetigteGelenke(regeln) : GELENKE.map((g) => g.id)
  const aktuell = zaehlGelenk && winkel?.[zaehlGelenk] != null ? Math.round(winkel[zaehlGelenk] as number) : null

  return (
    <div className="stapel">
      <KameraBuehne gelenke={anzeige} fehler={stand?.aktiveFehler.map((p) => p.gelenk)} beimBild={beimBild} />
      {regeln && stand && (
        <div className="reihe zwischen" style={{ flexWrap: 'wrap' }}>
          <span className="untertitel">{regeln.modus === 'halten' ? `${stand.gehalten} s gehalten` : `${stand.wiederholungen} Wdh.`}</span>
          <span className={`status ${meldung && stand.aktiveFehler.length ? 'kritisch' : 'neutral'}`}>{stand.aktiveFehler[0]?.meldung ?? (stand.zustand === 'nicht_im_bild' ? 'nicht im Bild' : 'ok')}</span>
          <button type="button" className="knopf klein" onClick={() => { auswertung.current = null; setStand(null); setMeldung(null) }}>Zähler zurücksetzen</button>
        </div>
      )}
      {!regeln && <p className="klein" style={{ margin: 0, color: 'var(--warning)' }}>Regeln unvollständig – es werden nur die Winkel angezeigt.</p>}
      {zaehlGelenk && (
        <div className="reihe" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="knopf klein" disabled={aktuell === null} onClick={() => aktuell !== null && uebernehmen('start', aktuell)}>Jetzt = Ausgangswinkel{aktuell !== null ? ` (${aktuell}°)` : ''}</button>
          <button type="button" className="knopf klein" disabled={aktuell === null} onClick={() => aktuell !== null && uebernehmen('umkehr', aktuell)}>Jetzt = Umkehrwinkel{aktuell !== null ? ` (${aktuell}°)` : ''}</button>
        </div>
      )}
      <div className="winkel-tabelle" aria-live="off">
        {GELENKE.map((g) => (
          <div key={g.id} title={g.erklaerung}>
            <span className="klein leise">{g.name}</span>
            <b>{winkel?.[g.id] != null ? `${Math.round(winkel[g.id] as number)}°` : '–'}</b>
          </div>
        ))}
      </div>
      <button type="button" className="knopf still" onClick={beenden}>Kamera-Test beenden</button>
    </div>
  )
}
