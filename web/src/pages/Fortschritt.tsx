import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fehlertext, supabase } from '../lib/supabase'
import { useSitzung } from '../lib/sitzung'
import { datumLang, relativ, tageswert, wochenmittel, wochenstart } from '../lib/zeit'
import type { Einheit, Uebung } from '../lib/db'
import { Fehler, Kachel, Laden, Ladefehler, Skala, Verlauf, Zurueck, useMitteilung } from '../components/Bausteine'
import { Icon } from '../components/Icon'

type EinheitMitSaetzen = Einheit & { saetze: { uebung_id: string; wiederholungen: number; uebungen: { name: string } | null }[] }

/* ------------------------------------------------------------ Übersicht */
export function Fortschritt() {
  const s = useSitzung()
  const [einheiten, setEinheiten] = useState<EinheitMitSaetzen[] | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    if (!s.profil) return
    const seit = new Date(Date.now() - 12 * 7 * 86400000).toISOString()
    void supabase.from('einheiten').select('*, saetze(uebung_id, wiederholungen, uebungen(name))').eq('mitglied_id', s.profil.id).gte('gestartet_am', seit)
      .order('gestartet_am', { ascending: false })
      .then(({ data, error }) => {
        setLadefehler(error ? fehlertext(error) : null)
        if (!error) setEinheiten((data ?? []) as unknown as EinheitMitSaetzen[])
      })
  }, [s.profil, versuch])

  if (ladefehler) return <div className="seite"><Ladefehler text={ladefehler} erneut={() => setVersuch((v) => v + 1)} /></div>
  if (!einheiten) return <div className="seite"><Laden /></div>

  const werte = wochenmittel(einheiten, 8)
  const start = wochenstart(new Date())
  const dieseWoche = einheiten.filter((e) => new Date(e.gestartet_am) >= start).length
  const proWoche = Math.round((einheiten.filter((e) => Date.now() - new Date(e.gestartet_am).getTime() < 28 * 86400000).length / 4) * 10) / 10
  const vorhanden = werte.filter((w): w is number => w !== null)
  const erster = vorhanden[0]
  const letzter = vorhanden[vorhanden.length - 1]

  return (
    <div className="seite">
      <div className="reihe zwischen">
        <h1 className="titel">Fortschritt</h1>
        <Link to="/fortschritt/neu" className="knopf klein primaer"><Icon name="plus" groesse={18} staerke={2} />Eintragen</Link>
      </div>

      <section className="karte">
        <p className="eyebrow">Rückenschmerz · 8 Wochen</p>
        {vorhanden.length >= 2 ? (
          <>
            <div className="reihe" style={{ alignItems: 'baseline', gap: 12 }}>
              <span className="display display-l" style={{ fontSize: 44 }}>{letzter.toFixed(1).replace('.', ',')}</span>
              <span className="klein" style={{ color: letzter <= erster ? 'var(--success)' : 'var(--critical)' }}>
                Ø zuletzt pro Woche · vorher {erster.toFixed(1).replace('.', ',')}, {letzter <= erster ? 'gesunken' : 'gestiegen'}
              </span>
            </div>
            <Verlauf werte={werte} beschriftung={`Wochenmittel Rückenschmerz, zuletzt ${letzter}`} farbe={letzter <= erster ? 'var(--success)' : 'var(--critical)'} />
          </>
        ) : (
          <p className="leise" style={{ margin: 0, fontSize: 15 }}>Sobald du in zwei Wochen dein Befinden eingetragen hast, siehst du hier deinen Verlauf.</p>
        )}
      </section>

      <div className="raster-2">
        <Kachel zahl={dieseWoche} label="Einheiten diese Woche" />
        <Kachel zahl={String(proWoche).replace('.', ',')} label="pro Woche, letzte 4 Wochen" />
      </div>

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Tagebuch</h2>
        {einheiten.length === 0 ? (
          <div className="leer">Noch keine Einheiten. Trag deine erste ein, auch eine kurze zählt.</div>
        ) : (
          einheiten.map((e) => {
            const namen = [...new Set(e.saetze.map((x) => x.uebungen?.name).filter(Boolean))]
            return (
              <article key={e.id} className="karte" style={{ gap: 6 }}>
                <div className="reihe zwischen">
                  <span style={{ fontWeight: 600 }}>{datumLang(e.gestartet_am)}</span>
                  {e.befinden !== null && (
                    <span className={`status ${e.befinden <= 3 ? 'erfolg' : e.befinden <= 6 ? 'warnung' : 'kritisch'}`}>Schmerz {e.befinden}</span>
                  )}
                </div>
                {(() => {
                  const teile = [Date.now() - new Date(e.gestartet_am).getTime() < 7 * 86400000 ? relativ(e.gestartet_am) : '', namen.join(', '), e.saetze.length ? `${e.saetze.length} Sätze` : ''].filter(Boolean)
                  return teile.length ? <span className="klein leise">{teile.join(' · ')}</span> : null
                })()}
                {e.notiz && <p className="klein" style={{ margin: 0 }}>{e.notiz}</p>}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------ Einheit erfassen */
interface Zeile { uebung_id: string; saetze: number; wiederholungen: number }

export function EinheitErfassen() {
  const s = useSitzung()
  const navigate = useNavigate()
  const [tag, setTag] = useState(tageswert(new Date()))
  const [befinden, setBefinden] = useState<number | null>(null)
  const [notiz, setNotiz] = useState('')
  const [uebungen, setUebungen] = useState<Uebung[]>([])
  const [zeilen, setZeilen] = useState<Zeile[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [mitteilung, zeige] = useMitteilung()

  useEffect(() => {
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status').eq('status', 'freigegeben').order('name')
      .then(({ data }) => setUebungen((data ?? []) as Uebung[]))
  }, [])

  const aendere = (i: number, teil: Partial<Zeile>) => setZeilen((z) => z.map((x, j) => (j === i ? { ...x, ...teil } : x)))

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (!s.profil) return
    setFehler(null)
    setLaeuft(true)
    // Uhrzeit: heute jetzt, an anderen Tagen 18 Uhr
    const zeit = tag === tageswert(new Date()) ? new Date() : new Date(`${tag}T18:00:00`)
    if (zeit.getTime() > Date.now() + 60000) { setLaeuft(false); return setFehler('Das Datum liegt in der Zukunft.') }
    const { data: einheit, error } = await supabase.from('einheiten')
      .insert({ studio_id: s.profil.studio_id, mitglied_id: s.profil.id, gestartet_am: zeit.toISOString(), beendet_am: zeit.toISOString(), befinden, notiz: notiz.trim() || null })
      .select('id').single()
    if (error || !einheit) { setLaeuft(false); return setFehler(fehlertext(error)) }

    const saetze = zeilen.filter((z) => z.uebung_id).flatMap((z) =>
      Array.from({ length: z.saetze }, (_, i) => ({ einheit_id: einheit.id, uebung_id: z.uebung_id, satz_nr: i + 1, wiederholungen: z.wiederholungen })))
    // Gleiche Übung zweimal ausgewählt: Satznummern fortlaufend machen
    const zaehler = new Map<string, number>()
    for (const satz of saetze) {
      const n = (zaehler.get(satz.uebung_id) ?? 0) + 1
      zaehler.set(satz.uebung_id, n)
      satz.satz_nr = n
    }
    if (saetze.length) {
      const { error: f } = await supabase.from('saetze').insert(saetze)
      if (f) { setLaeuft(false); return setFehler(`Einheit gespeichert, Übungen nicht: ${fehlertext(f)}`) }
    }
    zeige('Einheit gespeichert')
    setTimeout(() => navigate('/fortschritt'), 700)
  }

  return (
    <div className="seite">
      <div className="reihe">
        <Zurueck zu="/fortschritt" />
        <h1 className="titel">Einheit eintragen</h1>
      </div>
      <form className="stapel" style={{ gap: 20 }} onSubmit={speichern}>
        <label className="feld">
          <span>Tag</span>
          <input type="date" value={tag} max={tageswert(new Date())} onChange={(e) => setTag(e.target.value)} required />
        </label>

        <div className="stapel">
          <h2 className="untertitel" style={{ fontSize: 17 }}>Wie stark sind deine Rückenschmerzen gerade?</h2>
          <Skala wert={befinden} beiWahl={(w) => setBefinden(befinden === w ? null : w)} />
        </div>

        <div className="stapel">
          <h2 className="untertitel" style={{ fontSize: 17 }}>Übungen <span className="leise klein">(optional)</span></h2>
          {uebungen.length === 0 && <p className="klein leise" style={{ margin: 0 }}>Die Übungsbibliothek wird gerade aufgebaut. Du kannst die Einheit trotzdem speichern.</p>}
          {zeilen.map((z, i) => (
            <div key={i} className="karte" style={{ gap: 12 }}>
              <label className="feld">
                <span>Übung</span>
                <select value={z.uebung_id} onChange={(e) => aendere(i, { uebung_id: e.target.value })} required>
                  <option value="">Bitte wählen</option>
                  {uebungen.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <div className="raster-2">
                <label className="feld"><span>Sätze</span><input type="number" inputMode="numeric" min={1} max={10} value={z.saetze} onChange={(e) => aendere(i, { saetze: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} /></label>
                <label className="feld"><span>Wdh. pro Satz</span><input type="number" inputMode="numeric" min={0} max={100} value={z.wiederholungen} onChange={(e) => aendere(i, { wiederholungen: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label>
              </div>
              <button type="button" className="knopf klein still" onClick={() => setZeilen((x) => x.filter((_, j) => j !== i))}>Entfernen</button>
            </div>
          ))}
          {uebungen.length > 0 && (
            <button type="button" className="knopf" onClick={() => setZeilen((x) => [...x, { uebung_id: '', saetze: 2, wiederholungen: 12 }])}>
              <Icon name="plus" groesse={20} />Übung hinzufügen
            </button>
          )}
        </div>

        <label className="feld">
          <span>Notiz <span className="leise">(optional)</span></span>
          <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} maxLength={1000} placeholder="Wie lief es? Was ist dir aufgefallen?" />
        </label>

        <Fehler text={fehler} />
        <button className="knopf primaer voll" disabled={laeuft}>Speichern</button>
      </form>
      {mitteilung}
    </div>
  )
}
