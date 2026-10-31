import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fehlertext, funktion, supabase } from '../../lib/supabase'
import { useSitzung } from '../../lib/sitzung'
import { indexAnstossen, wissenSpeichern } from '../../lib/wissen'
import { fotoVorbereiten, IMPORT_TYPEN, seitenLesen, textAusDatei } from '../../lib/dateiimport'
import { hoereZu, spracheingabeMoeglich } from '../../lib/sprache'
import { datumKurz, relativ } from '../../lib/zeit'
import { THEMEN, type Eingabeweg, type IndexStatus, type InhaltStatus, type Sichtbarkeit, type WissenEintrag, type WissenVersion } from '../../lib/db'
import { Ladefehler, Fehler, Laden, useMitteilung, useUngespeichertWarnung, verlassenOk } from '../../components/Bausteine'
import { Icon } from '../../components/Icon'

const STATUS: Record<InhaltStatus, { text: string; klasse: string }> = {
  entwurf: { text: 'Entwurf', klasse: 'neutral' },
  eingereicht: { text: 'Wartet auf Freigabe', klasse: 'warnung' },
  freigegeben: { text: 'Freigegeben', klasse: 'erfolg' },
  abgelehnt: { text: 'Abgelehnt', klasse: 'kritisch' },
  archiviert: { text: 'Archiviert', klasse: 'neutral' },
}
const INDEX: Record<IndexStatus, string> = {
  ausstehend: 'wird eingelesen', indexiert: 'im Assistenten', fehler: 'Fehler beim Einlesen', zu_entfernen: 'wird entfernt', entfernt: 'entfernt',
}
const SICHTBAR: Record<Sichtbarkeit, string> = { alle: 'Alle Mitglieder', premium: 'Nur Coach-Abo', trainer: 'Nur Team' }

type Zeile = WissenEintrag & { version: Pick<WissenVersion, 'version' | 'index_status' | 'index_fehler'> | null }

/* ------------------------------------------------------------ Liste */
const EINGABEWEG: Record<string, string> = { text: 'geschrieben', diktat: 'diktiert', upload: 'aus Datei', scan: 'aus Foto', interview: 'Interview', rueckfrage: 'aus Rückfrage' }

export function TeamWissen() {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<'alle' | InhaltStatus>('alle')
  const [indexLaeuft, setIndexLaeuft] = useState(false)
  const [mitteilung, zeige] = useMitteilung()

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from('wissen_eintraege')
      .select('*, version:wissen_versionen!wissen_eintraege_aktuelle_version_fk(version, index_status, index_fehler)')
      .order('updated_at', { ascending: false })
    setLadefehler(error ? fehlertext(error) : null)
    if (error) return
    setZeilen((data ?? []) as unknown as Zeile[])
  }, [])
  useEffect(() => { void laden() }, [laden])

  async function indexieren() {
    setIndexLaeuft(true)
    try {
      const antwort = await funktion('wissen-indexieren', { erneut: true })
      const d = await antwort.json().catch(() => ({}))
      if (!antwort.ok) zeige(d.fehler ?? 'Einlesen fehlgeschlagen')
      else zeige(`Eingelesen: ${d.indexiert ?? 0} · entfernt: ${d.entfernt ?? 0}${d.fehler ? ` · Fehler: ${d.fehler}` : ''}`)
    } catch (e) {
      zeige(fehlertext(e))
    }
    setIndexLaeuft(false)
    void laden()
  }

  const q = suche.trim().toLowerCase()
  const liste = (zeilen ?? []).filter((z) => (filter === 'alle' ? z.status !== 'archiviert' : z.status === filter)
    && (!q || z.titel.toLowerCase().includes(q) || z.themen.some((t) => t.toLowerCase().includes(q))))
  const fehlerhaft = (zeilen ?? []).filter((z) => z.status === 'freigegeben' && z.version?.index_status === 'fehler').length
  const imAssistenten = (zeilen ?? []).filter((z) => z.status === 'freigegeben' && z.version?.index_status === 'indexiert').length

  return (
    <>
      <header className="reihe zwischen" style={{ flexWrap: 'wrap' }}>
        <div className="stapel" style={{ gap: 4 }}>
          <p className="eyebrow">Wissens-Studio</p>
          <h1 className="titel">Wissen</h1>
        </div>
        <div className="reihe" style={{ flexWrap: 'wrap' }}>
          <button className="knopf" onClick={() => void indexieren()} disabled={indexLaeuft}><Icon name="aktualisieren" groesse={18} />{indexLaeuft ? 'Wird aktualisiert …' : 'Assistent aktualisieren'}</button>
          <Link to="/team/wissen/neu" className="knopf primaer"><Icon name="plus" groesse={18} staerke={2} />Neues Wissen</Link>
        </div>
      </header>

      {zeilen && (
        <p className="klein leise" style={{ margin: 0 }}>
          {imAssistenten === 1 ? '1 Eintrag kennt' : `${imAssistenten} Einträge kennt`} der Assistent.{fehlerhaft > 0 && <span style={{ color: 'var(--critical)' }}> {fehlerhaft === 1 ? '1 Eintrag konnte' : `${fehlerhaft} Einträge konnten`} nicht eingelesen werden – „Assistent aktualisieren“ versucht es noch einmal.</span>}
        </p>
      )}

      <div className="reihe" style={{ flexWrap: 'wrap' }}>
        <label className="feld" style={{ flex: '1 1 260px', maxWidth: 360 }}><span>Suchen</span><input type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Thema" /></label>
        <div className="chips" role="group" aria-label="Status" style={{ alignSelf: 'flex-end' }}>
          {(['alle', 'freigegeben', 'eingereicht', 'entwurf', 'abgelehnt', 'archiviert'] as const).map((f) => (
            <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'alle' ? 'Alle' : STATUS[f].text}</button>
          ))}
        </div>
      </div>

      {ladefehler ? <Ladefehler text={ladefehler} erneut={() => void laden()} /> : !zeilen ? <Laden /> : liste.length === 0 ? (
        <div className="leer">{zeilen.length === 0 ? 'Noch kein Wissen erfasst. Leg mit „Neues Wissen“ los: schreiben, diktieren, Datei hochladen oder Seiten fotografieren.' : 'Nichts gefunden.'}</div>
      ) : (
        <div className="tabelle-rahmen">
          <table className="tabelle">
            <thead><tr><th>Titel</th><th>Themen</th><th>Für</th><th>Status</th><th>Assistent</th><th>Geändert</th></tr></thead>
            <tbody>
              {liste.map((z) => (
                <tr key={z.id}>
                  <td><Link to={`/team/wissen/${z.id}`} style={{ fontWeight: 600 }}>{z.titel}</Link><div className="klein leise">{z.studio_id ? 'Studio' : 'Five-Grundwissen'}{z.version ? ` · Version ${z.version.version}` : ''}</div></td>
                  <td className="leise">{z.themen.join(', ') || '–'}</td>
                  <td className="leise">{SICHTBAR[z.sichtbarkeit]}</td>
                  <td><span className={`status ${STATUS[z.status].klasse}`}>{STATUS[z.status].text}</span></td>
                  <td className="leise" title={z.version?.index_fehler ?? undefined} style={z.version?.index_status === 'fehler' ? { color: 'var(--critical)' } : undefined}>
                    {z.status === 'freigegeben' && z.version ? INDEX[z.version.index_status] : '–'}
                    {z.version?.index_status === 'fehler' && z.version.index_fehler && <div className="klein">{z.version.index_fehler.slice(0, 140)}</div>}
                  </td>
                  <td className="leise">{relativ(z.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mitteilung}
    </>
  )
}

/* ------------------------------------------------------------ Editor */
type Weg = 'text' | 'diktat' | 'upload' | 'scan'
const RANG: Record<Weg, number> = { text: 0, diktat: 1, upload: 2, scan: 3 }

export function TeamWissenEditor() {
  const { id } = useParams()
  const s = useSitzung()
  const navigate = useNavigate()
  const neu = !id || id === 'neu'

  const [eintrag, setEintrag] = useState<WissenEintrag | null>(null)
  const [versionen, setVersionen] = useState<Pick<WissenVersion, 'id' | 'version' | 'eingabeweg' | 'created_at' | 'inhalt'>[]>([])
  const [offeneFreigabe, setOffeneFreigabe] = useState(false)
  const [ablehnung, setAblehnung] = useState<string | null>(null)
  const [geladen, setGeladen] = useState(neu)

  const [titel, setTitel] = useState('')
  const [themen, setThemen] = useState<string[]>([])
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>('alle')
  const [quelle, setQuelle] = useState('')
  const [global, setGlobal] = useState(false)
  const [inhalt, setInhalt] = useState('')
  const [weg, setWeg] = useState<Weg>('text')
  const [dateien, setDateien] = useState<{ blob: Blob; name: string; mime: string }[]>([])

  const [hoert, setHoert] = useState(false)
  const [zwischen, setZwischen] = useState('')
  const stopp = useRef<() => void>(() => {})
  const [arbeitet, setArbeitet] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [mitteilung, zeige] = useMitteilung()
  const [basis, setBasis] = useState('\u0000')
  const [gespeichert, setGespeichert] = useState(false)
  const geaendert = !gespeichert && (neu ? !!(titel.trim() || inhalt.trim()) : basis !== '\u0000' && `${titel}\u0000${inhalt}` !== basis)
  useUngespeichertWarnung(geaendert)

  useEffect(() => {
    if (neu) return
    void (async () => {
      const { data: e } = await supabase.from('wissen_eintraege').select('*').eq('id', id).maybeSingle<WissenEintrag>()
      if (!e) { setFehler('Diesen Eintrag gibt es nicht.'); setGeladen(true); return }
      const { data: v } = await supabase.from('wissen_versionen').select('id, version, eingabeweg, created_at, inhalt').eq('eintrag_id', e.id).order('version', { ascending: false })
      const liste = v ?? []
      const ids = liste.map((x) => x.id)
      const { count } = await supabase.from('freigaben').select('id', { count: 'exact', head: true }).eq('status', 'offen').in('wissen_version_id', ids)
      if (e.status === 'abgelehnt') {
        const { data: f } = await supabase.from('freigaben').select('anmerkung').eq('status', 'abgelehnt').in('wissen_version_id', ids).order('entschieden_am', { ascending: false }).limit(1)
        setAblehnung(f?.[0]?.anmerkung ?? '')
      }
      setEintrag(e)
      setVersionen(liste)
      setOffeneFreigabe((count ?? 0) > 0)
      setTitel(e.titel); setThemen(e.themen); setSichtbarkeit(e.sichtbarkeit); setQuelle(e.quelle ?? ''); setGlobal(e.studio_id === null)
      const geladenerInhalt = (liste.find((x) => x.id === e.aktuelle_version_id) ?? liste[0])?.inhalt ?? ''
      setInhalt(geladenerInhalt)
      setBasis(`${e.titel}\u0000${geladenerInhalt}`)
      setGeladen(true)
    })()
  }, [id, neu])

  useEffect(() => () => stopp.current(), [])

  const nutzeWeg = (w: Weg) => setWeg((alt) => (RANG[w] > RANG[alt] ? w : alt))
  const anhaengen = (text: string) => setInhalt((alt) => (alt.trim() ? `${alt.trimEnd()}\n\n${text}` : text))

  function diktat() {
    if (hoert) return stopp.current()
    setHoert(true)
    nutzeWeg('diktat')
    stopp.current = hoereZu({
      beimText: (t) => setInhalt((alt) => (alt && !/\s$/.test(alt) ? `${alt} ${t}` : alt + t)),
      zwischen: setZwischen,
      beimEnde: () => { setHoert(false); setZwischen('') },
      beimFehler: setFehler,
    }, true)
  }

  async function dateiGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0]
    e.target.value = ''
    if (!datei) return
    setFehler(null)
    setArbeitet('Datei wird gelesen …')
    try {
      const text = await textAusDatei(datei)
      anhaengen(text)
      setDateien((d) => [...d, { blob: datei, name: datei.name, mime: datei.type || 'application/octet-stream' }])
      nutzeWeg('upload')
      if (!titel.trim()) setTitel(datei.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    } catch (err) {
      setFehler(fehlertext(err))
    }
    setArbeitet(null)
  }

  async function fotosGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const liste = Array.from(e.target.files ?? []).slice(0, 6)
    e.target.value = ''
    if (!liste.length) return
    setFehler(null)
    setArbeitet(`${liste.length === 1 ? 'Seite wird' : `${liste.length} Seiten werden`} gelesen …`)
    try {
      const vorbereitet = await Promise.all(liste.map(fotoVorbereiten))
      const text = await seitenLesen(vorbereitet.map(({ mime, base64 }) => ({ mime, base64 })))
      anhaengen(text)
      setDateien((d) => [...d, ...vorbereitet.map((v, i) => ({ blob: v.blob, name: `scan-seite-${d.length + i + 1}.jpg`, mime: v.mime }))])
      nutzeWeg('scan')
    } catch (err) {
      setFehler(fehlertext(err))
    }
    setArbeitet(null)
  }

  async function speichern() {
    if (!s.profil) return
    stopp.current()
    setFehler(null)
    setArbeitet('Wird gespeichert …')
    try {
      const ergebnis = await wissenSpeichern({
        eintragId: eintrag?.id, titel, themen, sichtbarkeit, quelle: quelle || null, inhalt,
        eingabeweg: weg as Eingabeweg, global, dateien,
      }, s.profil, s.istGruender)
      setGespeichert(true)
      zeige(ergebnis.freigegeben ? 'Gespeichert und freigegeben' : 'Zur Freigabe eingereicht')
      setTimeout(() => navigate('/team/wissen'), 800)
    } catch (err) {
      setFehler(fehlertext(err))
      setArbeitet(null)
    }
  }

  async function archivieren() {
    if (!eintrag || !confirm('Eintrag archivieren? Der Assistent nutzt ihn dann nicht mehr.')) return
    const { error } = await supabase.from('wissen_eintraege').update({ status: 'archiviert' }).eq('id', eintrag.id)
    if (error) return setFehler(fehlertext(error))
    indexAnstossen()
    navigate('/team/wissen')
  }

  async function wiederherstellen() {
    if (!eintrag?.aktuelle_version_id) return
    const { error } = await supabase.from('wissen_eintraege').update({ status: 'freigegeben' }).eq('id', eintrag.id)
    if (error) return setFehler(fehlertext(error))
    indexAnstossen()
    navigate('/team/wissen')
  }

  if (!geladen) return <Laden />
  const darfBearbeiten = neu || s.istGruender || eintrag?.erstellt_von === s.profil?.id
  const anzeigeInhalt = hoert && zwischen ? `${inhalt}${inhalt && !/\s$/.test(inhalt) ? ' ' : ''}${zwischen}` : inhalt

  return (
    <>
      <header className="reihe" style={{ flexWrap: 'wrap' }}>
        <Link to="/team/wissen" className="knopf rund" aria-label="Zurück zur Liste" style={{ background: 'var(--surface)' }} onClick={(ev) => { if (!verlassenOk(geaendert)) ev.preventDefault() }}><Icon name="zurueck" groesse={22} staerke={2} /></Link>
        <div className="stapel" style={{ gap: 4 }}>
          <p className="eyebrow">{neu ? 'Neues Wissen' : `Version ${versionen[0]?.version ?? 1}`}</p>
          <h1 className="titel">{neu ? 'Wissen erfassen' : eintrag?.titel}</h1>
        </div>
        {eintrag && <span className={`status ${STATUS[eintrag.status].klasse}`}>{STATUS[eintrag.status].text}</span>}
      </header>

      {ablehnung !== null && <div className="karte kritisch klein"><strong>Abgelehnt.</strong> {ablehnung || 'Ohne Anmerkung.'} Überarbeite den Text und reiche ihn erneut ein.</div>}
      {offeneFreigabe && <div className="karte warnung klein">Für diesen Eintrag liegt eine Änderung zur Freigabe bei den Admins.</div>}
      {!darfBearbeiten && <div className="karte warnung klein">Diesen Eintrag hat jemand anderes angelegt. Änderungen können nur Admins vornehmen.</div>}

      <div className="zweispaltig">
        <div className="haupt stapel" style={{ gap: 16 }}>
          <label className="feld"><span>Titel</span><input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={160} placeholder="z. B. Mobilisation der Lendenwirbelsäule im Alltag" disabled={!darfBearbeiten} /></label>

          <div className="stapel" style={{ gap: 8 }}>
            <span className="klein" style={{ fontWeight: 500 }}>Inhalt hinzufügen</span>
            <div className="reihe" style={{ flexWrap: 'wrap', gap: 8 }}>
              {spracheingabeMoeglich() && (
                <button type="button" className="knopf klein" onClick={diktat} aria-pressed={hoert} disabled={!darfBearbeiten}
                  style={hoert ? { background: 'var(--critical)', color: '#fff', borderColor: 'var(--critical)' } : undefined}>
                  <Icon name={hoert ? 'stopp' : 'mikro'} groesse={18} />{hoert ? 'Diktat beenden' : 'Diktieren'}
                </button>
              )}
              <label className={`knopf klein${darfBearbeiten ? '' : ' deaktiviert'}`} style={{ cursor: 'pointer' }}>
                <Icon name="hochladen" groesse={18} />Datei hochladen
                <input type="file" accept={IMPORT_TYPEN} onChange={(e) => void dateiGewaehlt(e)} className="nur-screenreader" disabled={!darfBearbeiten} />
              </label>
              <label className="knopf klein" style={{ cursor: 'pointer' }}>
                <Icon name="kamera" groesse={18} />Seiten fotografieren
                <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => void fotosGewaehlt(e)} className="nur-screenreader" disabled={!darfBearbeiten} />
              </label>
            </div>
            <span className="klein leise">Datei: TXT, Markdown, PDF oder Word. Fotos: bis zu 6 Seiten auf einmal, der Text wird automatisch erkannt. Prüfe den Text danach bitte.</span>
          </div>

          <label className="feld">
            <span>Inhalt</span>
            <textarea value={anzeigeInhalt} onChange={(e) => setInhalt(e.target.value)} rows={18} disabled={!darfBearbeiten || hoert}
              placeholder={'Schreib so, wie du es einem Mitglied erklären würdest.\n\nÜberschriften mit # helfen dem Assistenten, längere Texte sinnvoll aufzuteilen.'}
              style={{ fontSize: 16, lineHeight: 1.55 }} />
          </label>
          <div className="reihe zwischen klein leise">
            <span>{inhalt.trim().split(/\s+/).filter(Boolean).length} Wörter{dateien.length ? ` · ${dateien.length} Original${dateien.length > 1 ? 'e' : ''} wird mitgespeichert` : ''}</span>
            {arbeitet && <span role="status" style={{ color: 'var(--accent-text)' }}>{arbeitet}</span>}
          </div>
        </div>

        <aside className="neben stapel" style={{ gap: 16 }}>
          <section className="karte" style={{ gap: 14 }}>
            <div className="stapel" style={{ gap: 8 }}>
              <span className="klein" style={{ fontWeight: 500 }}>Themen</span>
              <div className="chips">
                {THEMEN.map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={themen.includes(t)} disabled={!darfBearbeiten}
                    onClick={() => setThemen(themen.includes(t) ? themen.filter((x) => x !== t) : [...themen, t])}>{t}</button>
                ))}
              </div>
            </div>
            <label className="feld">
              <span>Sichtbar für</span>
              <select value={sichtbarkeit} onChange={(e) => setSichtbarkeit(e.target.value as Sichtbarkeit)} disabled={!darfBearbeiten}>
                {(Object.keys(SICHTBAR) as Sichtbarkeit[]).map((k) => <option key={k} value={k}>{SICHTBAR[k]}</option>)}
              </select>
            </label>
            <label className="feld"><span>Quelle <span className="leise">(optional)</span></span><input value={quelle} onChange={(e) => setQuelle(e.target.value)} maxLength={200} placeholder="z. B. Five-Handbuch, S. 12" disabled={!darfBearbeiten} /></label>
            {s.istGruender && neu && (
              <label className="reihe klein" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} style={{ width: 20, height: 20 }} />
                Five-Grundwissen (für alle Studios)
              </label>
            )}
          </section>

          <Fehler text={fehler} />
          {darfBearbeiten && (
            <button className="knopf primaer voll" onClick={() => void speichern()} disabled={!!arbeitet || hoert}>
              {s.istGruender ? 'Speichern und freigeben' : 'Zur Freigabe einreichen'}
            </button>
          )}
          {!s.istGruender && darfBearbeiten && <p className="klein leise" style={{ margin: 0 }}>Ein Admin prüft den Text, bevor der Assistent ihn nutzt.</p>}
          {s.istGruender && eintrag?.status === 'freigegeben' && <button className="knopf still voll" onClick={() => void archivieren()}>Archivieren</button>}
          {s.istGruender && eintrag?.status === 'archiviert' && eintrag.aktuelle_version_id && <button className="knopf voll" onClick={() => void wiederherstellen()}>Wieder freigeben</button>}

          {versionen.length > 0 && (
            <section className="karte" style={{ gap: 8 }}>
              <span className="klein" style={{ fontWeight: 500 }}>Versionen</span>
              {versionen.map((v) => (
                <div key={v.id} className="reihe zwischen klein">
                  <span>Version {v.version}{v.id === eintrag?.aktuelle_version_id ? ' · aktuell' : ''}</span>
                  <span className="leise">{datumKurz(v.created_at)} · {EINGABEWEG[v.eingabeweg] ?? v.eingabeweg}</span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
      {mitteilung}
    </>
  )
}
