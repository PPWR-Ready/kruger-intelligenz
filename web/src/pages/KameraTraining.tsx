// Trainer-Modus: Übung mit Kamera. Oben Livebild mit Skelett und Winkeln,
// darunter Zähler, Korrekturen als Text und Sprachausgabe. Keine Einweisung:
// Meldungen kommen nur, wenn die Haltung nicht stimmt.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, fehlertext } from '../lib/supabase'
import { useSitzung } from '../lib/sitzung'
import type { Uebung } from '../lib/db'
import { KameraBuehne, type Bild } from '../components/KameraBuehne'
import { Fehler, Laden, Schalter, Skala } from '../components/Bausteine'
import { Icon } from '../components/Icon'
import { Auswertung, benoetigteGelenke, leseRegeln, satzQualitaet, type Korrektur, type Regeln, type Stand } from '../lib/pose/regeln'
import { GELENK } from '../lib/pose/geometrie'
import { hoereZu, spracheingabeMoeglich, vorlesen, vorlesenStoppen } from '../lib/sprache'
import { frageStellen } from '../lib/chat'
import { speichereEinwilligungen } from './Onboarding'

type Schritt = 'vorbereitung' | 'satz' | 'satz_ende' | 'abschluss'

interface GespeicherterSatz { nr: number; wiederholungen: number; dauer: number | null; qualitaet: 'sauber' | 'gut' | 'anpassen' }

const TON_SCHLUESSEL = 'trainer-ton'

function tonGespeichert(): boolean {
  try { return localStorage.getItem(TON_SCHLUESSEL) !== 'aus' } catch { return true }
}

export function KameraTraining() {
  const { id } = useParams()
  const s = useSitzung()
  const navigate = useNavigate()
  const [uebung, setUebung] = useState<Uebung | null | undefined>(undefined)
  const [schritt, setSchritt] = useState<Schritt>('vorbereitung')
  const [stand, setStand] = useState<Stand | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  /** Positive Hinweise (Halten, Lösen) – anders gefärbt als Fehler */
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [ton, setTon] = useState(tonGespeichert)
  const [saetze, setSaetze] = useState<GespeicherterSatz[]>([])
  const [einheitId, setEinheitId] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [befinden, setBefinden] = useState<number | null>(null)

  // Frage während der Übung
  const [frage, setFrage] = useState<{ status: 'hoert' | 'denkt' | 'antwort'; text: string; antwort: string } | null>(null)
  const verlaufId = useRef<string | null>(null)
  const stoppHoeren = useRef<(() => void) | null>(null)

  const auswertung = useRef<Auswertung | null>(null)
  const startZeit = useRef<string | null>(null) // Beginn des ersten Satzes
  const tonRef = useRef(ton)
  useEffect(() => { tonRef.current = ton }, [ton])
  const letzteAnzeige = useRef(0)
  const hinweisBis = useRef(0) // kurze Hinweise (nicht im Bild, unvollständig) stehen lassen

  useEffect(() => {
    if (!id) return
    void supabase.from('uebungen').select('id, studio_id, name, kategorie, an_geraet, beschreibung, status, regeln').eq('id', id).maybeSingle()
      .then(({ data }) => setUebung((data as Uebung | null) ?? null))
  }, [id])

  const { regeln, regelFehler } = useMemo(() => {
    const r = leseRegeln(uebung?.regeln)
    return { regeln: r.regeln, regelFehler: r.fehler }
  }, [uebung])
  const gelenke = useMemo(() => (regeln ? benoetigteGelenke(regeln) : []), [regeln])

  // Beim Verlassen nichts mehr vorlesen
  useEffect(() => () => { vorlesenStoppen(); stoppHoeren.current?.() }, [])

  const sprich = useCallback((text: string) => { if (tonRef.current) vorlesen(text) }, [])

  // Countdown 3-2-1, damit man sich in Position bringen kann, bevor gezählt wird
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownUhr = useRef(0)
  useEffect(() => () => window.clearInterval(countdownUhr.current), [])

  const satzStarten = useCallback(() => {
    if (!regeln) return
    startZeit.current ??= new Date().toISOString()
    auswertung.current = new Auswertung(regeln)
    setStand(auswertung.current.stand())
    setMeldung(null)
    hinweisBis.current = 0
    setSchritt('satz')
  }, [regeln])

  const mitCountdownStarten = useCallback(() => {
    window.clearInterval(countdownUhr.current)
    let n = 3
    setCountdown(n)
    sprich('Drei')
    countdownUhr.current = window.setInterval(() => {
      n -= 1
      if (n > 0) { setCountdown(n); sprich(n === 2 ? 'Zwei' : 'Eins') }
      else {
        window.clearInterval(countdownUhr.current)
        setCountdown(null)
        sprich('Los!')
        satzStarten()
      }
    }, 1000)
  }, [satzStarten, sprich])

  const beimBild = useCallback((b: Bild) => {
    const a = auswertung.current
    if (!a) return
    const ereignisse = a.schritt(b.winkel, b.zeit)
    for (const e of ereignisse) {
      if (e.art === 'wiederholung') { if (!a.stand().aktiveFehler.length) sprich(e.text); continue }
      if (e.art === 'fertig') { sprich(e.text); setStand(a.stand()); setSchritt('satz_ende'); continue }
      if (e.art === 'halten_zaehlen') { sprich(e.text); continue }
      if (e.art === 'halten_start' || e.art === 'halten_fertig') {
        setHinweis(e.text)
        sprich(e.text)
        hinweisBis.current = b.zeit + 3000
        continue
      }
      setMeldung(e.text)
      sprich(e.text)
      if (e.art !== 'fehler') hinweisBis.current = b.zeit + 2500
    }
    // Anzeige höchstens zehnmal pro Sekunde aktualisieren
    if (ereignisse.length || b.zeit - letzteAnzeige.current > 100) {
      letzteAnzeige.current = b.zeit
      const st = a.stand()
      setStand(st)
      if (st.aktiveFehler.length) setMeldung(st.aktiveFehler[0].meldung)
      else if (st.zustand === 'laeuft' && b.zeit > hinweisBis.current) { setMeldung(null); setHinweis(null) }
    }
  }, [sprich])

  function tonUmschalten() {
    const neu = !ton
    setTon(neu)
    if (!neu) vorlesenStoppen()
    try { localStorage.setItem(TON_SCHLUESSEL, neu ? 'an' : 'aus') } catch { /* privat: egal */ }
  }

  function frageBeginnen() {
    vorlesenStoppen()
    setFrage({ status: 'hoert', text: '', antwort: '' })
    let gesendet = false
    let zwischen = ''
    const senden = (t: string) => { if (gesendet) return; gesendet = true; void frageSenden(t) }
    stoppHoeren.current = hoereZu({
      zwischen: (t) => { zwischen = t; setFrage((f) => (f && f.status === 'hoert' ? { ...f, text: t } : f)) },
      beimText: (t) => { stoppHoeren.current?.(); senden(t) },
      beimFehler: (f) => { gesendet = true; setFrage({ status: 'antwort', text: '', antwort: f }) },
      // Erkennung endet ohne fertigen Satz: Erkanntes trotzdem senden, sonst schließen
      beimEnde: () => { if (zwischen.trim()) senden(zwischen); else if (!gesendet) setFrage(null) },
    })
  }

  async function frageSenden(text: string) {
    if (!text.trim() || !uebung) { setFrage(null); return }
    setFrage({ status: 'denkt', text, antwort: '' })
    let antwort = ''
    try {
      await frageStellen({ frage: text, verlauf_id: verlaufId.current, kontext: 'trainer_modus', uebung: uebung.name }, {
        beimStart: (v) => { verlaufId.current = v },
        beimText: (t) => { antwort += t; setFrage({ status: 'antwort', text, antwort }) },
        beimEnde: () => { setFrage({ status: 'antwort', text, antwort }); if (antwort) vorlesen(ohneMarkdown(antwort)) },
      })
    } catch (e) {
      setFrage({ status: 'antwort', text, antwort: e instanceof Error ? e.message : 'Der Assistent ist gerade nicht erreichbar.' })
    }
  }

  async function satzSpeichern(): Promise<boolean> {
    if (!s.profil || !uebung || !auswertung.current || !regeln) return false
    const st = auswertung.current.stand()
    const halten = regeln.modus === 'halten'
    if (!halten && st.wiederholungen === 0) return true // leerer Satz: nichts speichern
    if (halten && st.gehalten === 0) return true
    setSpeichert(true)
    setFehler(null)
    try {
      let eid = einheitId
      if (!eid) {
        const { data, error } = await supabase.from('einheiten')
          .insert({ studio_id: s.profil.studio_id, mitglied_id: s.profil.id, gestartet_am: startZeit.current ?? new Date().toISOString() })
          .select('id').single()
        if (error) throw error
        eid = data.id as string
        setEinheitId(eid)
      }
      const nr = saetze.length + 1
      const qualitaet = satzQualitaet(st.bewertungen, st.korrekturen.length)
      const { error } = await supabase.from('saetze').insert({
        einheit_id: eid, uebung_id: uebung.id, satz_nr: nr,
        wiederholungen: halten ? 0 : st.wiederholungen,
        dauer_sekunden: halten ? st.gehalten : null,
        qualitaet, wdh_bewertung: st.bewertungen, korrekturen: st.korrekturen,
      })
      if (error) throw error
      setSaetze((x) => [...x, { nr, wiederholungen: st.wiederholungen, dauer: halten ? st.gehalten : null, qualitaet }])
      auswertung.current = null
      return true
    } catch (e) {
      setFehler(fehlertext(e))
      return false
    } finally {
      setSpeichert(false)
    }
  }

  async function trainingBeenden() {
    if (!einheitId) { navigate('/trainieren'); return }
    setSpeichert(true)
    const { error } = await supabase.from('einheiten').update({ beendet_am: new Date().toISOString(), befinden }).eq('id', einheitId)
    setSpeichert(false)
    if (error) return setFehler(fehlertext(error))
    navigate('/fortschritt')
  }

  // --- Darstellung --------------------------------------------------------

  if (uebung === undefined) return <div className="trainer"><Laden /></div>
  if (uebung === null) return <div className="trainer"><Kopf titel="Übung nicht gefunden" /><div className="leer">Diese Übung gibt es nicht (mehr).</div></div>

  if (!regeln) {
    return (
      <div className="trainer">
        <Kopf titel={uebung.name} />
        <div className="karte warnung"><p style={{ margin: 0 }}>Für diese Übung ist das Kamera-Coaching noch nicht eingerichtet.</p>
          {s.istTeam && <ul className="klein" style={{ margin: 0 }}>{regelFehler.map((f) => <li key={f}>{f}</li>)}</ul>}</div>
      </div>
    )
  }

  if (!s.einwilligungen.kamera) {
    return (
      <div className="trainer">
        <Kopf titel={uebung.name} />
        <section className="karte stapel">
          <h2 className="untertitel">Kamera erlauben</h2>
          <p className="klein" style={{ margin: 0 }}>Für das Coaching erkennt die App deine Haltung über die Kamera. Das Bild bleibt auf deinem Gerät und wird nirgends hochgeladen. Gespeichert werden nur deine Wiederholungen, die Bewertung und erkannte Korrekturen mit Winkel.</p>
          <Schalter an={false} titel="Kamera für den Trainer-Modus" text="Jederzeit im Profil widerrufbar." beiAenderung={async (an) => {
            if (!an || !s.profil) return
            const { error } = await speichereEinwilligungen(s.profil.id, { gesundheitsdaten: !!s.einwilligungen.gesundheitsdaten, kamera: true, trainer_freigabe: !!s.einwilligungen.trainer_freigabe })
            if (error) setFehler(fehlertext(error)); else await s.neuLaden()
          }} />
          <Fehler text={fehler} />
        </section>
      </div>
    )
  }

  const ziel = zielText(regeln)
  const aktiveGelenke = stand?.aktiveFehler.map((p) => p.gelenk) ?? []

  return (
    <div className="trainer">
      <Kopf titel={uebung.name} rechts={
        <button type="button" className="knopf klein still" onClick={tonUmschalten} aria-pressed={ton} aria-label={ton ? 'Sprachausgabe ausschalten' : 'Sprachausgabe einschalten'}>
          <Icon name="lautsprecher" groesse={20} />{ton ? 'Ansage an' : 'Ansage aus'}
        </button>
      } />

      <KameraBuehne gelenke={gelenke} fehler={aktiveGelenke} beimBild={beimBild} pausiert={schritt !== 'satz' || frage !== null} />

      {schritt === 'vorbereitung' && (
        <section className="stapel">
          {regeln.endhalten_sekunden && (
            <div className="karte akzent klein" style={{ gap: 4 }}>
              <strong>So geht’s</strong>
              <span>Geh so weit in die Bewegung, wie es gut geht, und halte die Endposition {regeln.endhalten_sekunden} Sekunden. Die App zählt für dich herunter – erst dann zählt die Wiederholung.</span>
            </div>
          )}
          <p className="klein leise" style={{ margin: 0 }}>{ansichtHinweis(regeln)}{uebung.beschreibung ? ` ${uebung.beschreibung}` : ''}</p>
          {countdown !== null ? (
            <div className="countdown" role="status" aria-live="assertive">{countdown}</div>
          ) : (
            <button type="button" className="knopf primaer voll" onClick={mitCountdownStarten}>
              {saetze.length ? `Satz ${saetze.length + 1} starten` : 'Satz starten'}
            </button>
          )}
        </section>
      )}

      {schritt === 'satz' && stand && (
        <section className="stapel">
          <div className="reihe zwischen" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
            <div className="zaehlwerk" aria-live="polite">
              <span className="zahl">{regeln.modus === 'halten' ? `${stand.gehalten}s` : stand.wiederholungen}</span>
              <span className="leise">{ziel}</span>
            </div>
            {regeln.endhalten_sekunden && (stand.halteRest !== null || stand.gehaltenInWdh) && (
              <HalteRing rest={stand.gehaltenInWdh ? 0 : stand.halteRest ?? 0} gesamt={regeln.endhalten_sekunden} pausiert={stand.aktiveFehler.length > 0} />
            )}
          </div>
          {regeln.modus === 'wiederholungen' && <Reichweite fortschritt={stand.fortschritt} best={stand.bestFortschritt} />}
          {regeln.modus === 'wiederholungen' && stand.bewertungen.length > 0 && (
            <div className="wdh-punkte" aria-label={`${stand.bewertungen.filter((b) => b === 'sauber').length} saubere Wiederholungen`}>
              {stand.bewertungen.map((b, i) => <span key={i} className={b} title={b === 'sauber' ? 'sauber' : 'mit Korrektur'} />)}
            </div>
          )}
          <div className={`meldung ${meldung ? 'fehler' : hinweis ? 'lob' : 'ruhig'}`} role="status" aria-live="assertive">
            {meldung ? <><Icon name="warnung" groesse={22} />{meldung}</> : hinweis ? <><Icon name="haken" groesse={22} />{hinweis}</> : stand.zustand === 'laeuft' ? 'Haltung wird geprüft' : 'Stell dich so hin, dass dein ganzer Körper zu sehen ist.'}
          </div>
          {frage && <FrageKarte frage={frage} schliessen={() => { vorlesenStoppen(); setFrage(null) }} />}
          <div className="knopfreihe">
            {spracheingabeMoeglich() && !frage && (
              <button type="button" className="knopf" onClick={frageBeginnen}><Icon name="mikro" groesse={20} />Frage stellen</button>
            )}
            <button type="button" className="knopf primaer" onClick={() => { if (auswertung.current) setStand(auswertung.current.stand()); setSchritt('satz_ende') }}>Satz beenden</button>
          </div>
        </section>
      )}

      {schritt === 'satz_ende' && stand && <SatzZusammenfassung regeln={regeln} stand={stand} />}

      {schritt === 'satz_ende' && (
        <section className="stapel">
          <Fehler text={fehler} />
          <div className="knopfreihe">
            <button type="button" className="knopf primaer" disabled={speichert} onClick={async () => { if (await satzSpeichern()) { setSchritt('vorbereitung'); mitCountdownStarten() } }}>Nächster Satz</button>
            <button type="button" className="knopf" disabled={speichert} onClick={async () => { if (await satzSpeichern()) setSchritt('abschluss') }}>Fertig</button>
          </div>
          <button type="button" className="knopf still klein" disabled={speichert} onClick={() => { auswertung.current = null; setSchritt(saetze.length ? 'abschluss' : 'vorbereitung') }}>Satz verwerfen</button>
        </section>
      )}

      {schritt === 'abschluss' && (
        <section className="stapel">
          {saetze.length === 0 ? (
            <div className="leer">Kein Satz gespeichert.</div>
          ) : (
            <div className="karte">
              <h2 className="untertitel">Gespeichert</h2>
              {saetze.map((x) => (
                <div key={x.nr} className="zeile" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Satz {x.nr}: {x.dauer !== null ? `${x.dauer} s gehalten` : `${x.wiederholungen} Wdh.`}</span>
                  <span className={`status ${x.qualitaet === 'sauber' ? 'erfolg' : x.qualitaet === 'gut' ? 'neutral' : 'warnung'}`}>{x.qualitaet}</span>
                </div>
              ))}
              <p className="klein" style={{ margin: '8px 0 0' }}>Wie geht's deinem Rücken jetzt? (0 = keine Schmerzen)</p>
              <Skala wert={befinden} beiWahl={setBefinden} />
            </div>
          )}
          <Fehler text={fehler} />
          <button type="button" className="knopf primaer voll" disabled={speichert} onClick={() => void trainingBeenden()}>Training abschließen</button>
          <button type="button" className="knopf voll" onClick={() => setSchritt('vorbereitung')}>Noch ein Satz</button>
        </section>
      )}
    </div>
  )
}

function Kopf({ titel, rechts }: { titel: string; rechts?: ReactNode }) {
  return (
    <header className="trainer-kopf">
      <Link to="/trainieren" className="knopf klein still" aria-label="Zurück zu den Übungen"><Icon name="zurueck" groesse={22} /></Link>
      <h1>{titel}</h1>
      {rechts}
    </header>
  )
}

/** Markdown-Zeichen entfernen, damit beim Vorlesen keine Sternchen gesprochen werden. */
function ohneMarkdown(t: string): string {
  return t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_#`>]+/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\n{2,}/g, '. ')
}

function zielText(r: Regeln): string {
  if (r.modus === 'halten') return `von ${r.halten_sekunden} s sauber gehalten`
  const halten = r.endhalten_sekunden ? ` · je ${r.endhalten_sekunden} s halten` : ''
  return (r.ziel_wiederholungen ? `von ${r.ziel_wiederholungen} Wiederholungen` : 'Wiederholungen') + halten
}

/** Kreis, der beim Halten in der Endposition herunterläuft. */
function HalteRing({ rest, gesamt, pausiert }: { rest: number; gesamt: number; pausiert: boolean }) {
  const r = 38, umfang = 2 * Math.PI * r
  const anteil = Math.max(0, Math.min(1, rest / gesamt))
  const fertig = rest <= 0
  return (
    <div className={`halte-ring${fertig ? ' fertig' : ''}${pausiert ? ' pausiert' : ''}`} role="timer" aria-label={fertig ? 'Gehalten' : `Noch ${Math.ceil(rest)} Sekunden halten`}>
      <svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
        <circle cx="44" cy="44" r={r} className="spur" />
        <circle cx="44" cy="44" r={r} className="lauf" strokeDasharray={umfang} strokeDashoffset={umfang * (1 - anteil)} />
      </svg>
      <span className="halte-zahl">{fertig ? '✓' : Math.ceil(rest)}</span>
      <span className="halte-text">{fertig ? 'gehalten' : pausiert ? 'Haltung!' : 'halten'}</span>
    </div>
  )
}

/** Wie weit die Bewegung gerade geht – mit Markierung für das Ziel und den Bestwert im Satz. */
function Reichweite({ fortschritt, best }: { fortschritt: number | null; best: number | null }) {
  const skala = (f: number | null) => `${Math.round(Math.max(0, Math.min(1, (f ?? 0) / 1.3)) * 100)}%`
  return (
    <div className="reichweite" aria-hidden="true">
      <div className="reichweite-kopf"><span>So weit wie möglich</span>{best !== null && best > 0.85 && <span className="reichweite-lob">Bestwert</span>}</div>
      <div className="reichweite-bahn">
        <div className="reichweite-fuellung" style={{ width: skala(fortschritt) }} />
        <div className="reichweite-ziel" style={{ left: skala(0.85) }} />
        {best !== null && best > 0.05 && <div className="reichweite-best" style={{ left: skala(best) }} />}
      </div>
    </div>
  )
}

function ansichtHinweis(r: Regeln): string {
  return r.ansicht === 'seitlich'
    ? 'Handy seitlich zu dir aufstellen oder vom Trainingspartner halten lassen.'
    : 'Handy frontal vor dir aufstellen oder vom Trainingspartner halten lassen.'
}

function SatzZusammenfassung({ regeln, stand }: { regeln: Regeln; stand: Stand }) {
  const gruppen = new Map<string, Korrektur[]>()
  for (const k of stand.korrekturen) gruppen.set(k.meldung, [...(gruppen.get(k.meldung) ?? []), k])
  const q = satzQualitaet(stand.bewertungen, stand.korrekturen.length)
  return (
    <section className="karte">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="untertitel">{regeln.modus === 'halten' ? `${stand.gehalten} s sauber gehalten` : `${stand.wiederholungen} Wiederholungen`}</h2>
        {(regeln.modus === 'halten' ? stand.gehalten > 0 : stand.wiederholungen > 0) && <span className={`status ${q === 'sauber' ? 'erfolg' : q === 'gut' ? 'neutral' : 'warnung'}`}>{q}</span>}
      </div>
      {(regeln.modus === 'halten' ? stand.gehalten === 0 : stand.wiederholungen === 0) ? (
        <p className="klein" style={{ margin: 0 }}>Noch nichts erkannt. Stell das Handy so auf, dass dein ganzer Körper zu sehen ist, und versuch es noch einmal.</p>
      ) : gruppen.size === 0 ? (
        <p className="klein" style={{ margin: 0 }}>Keine Korrekturen nötig.{regeln.zaehlen && stand.bestWinkel !== null ? ` Weiteste Bewegung: ${GELENK[regeln.zaehlen.gelenk].name} ${stand.bestWinkel}°.` : ''}</p>
      ) : (
        <ul className="klein" style={{ margin: 0, paddingLeft: 18 }}>
          {[...gruppen].map(([text, liste]) => (
            <li key={text}>{text} <span className="leise">({liste.length}× · {GELENK[liste[0].gelenk].name} bis {liste[0].winkel}°)</span></li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FrageKarte({ frage, schliessen }: { frage: { status: 'hoert' | 'denkt' | 'antwort'; text: string; antwort: string }; schliessen: () => void }) {
  return (
    <section className="karte akzent" aria-live="polite">
      <p className="klein" style={{ margin: 0 }}>
        {frage.status === 'hoert' ? (frage.text || 'Ich höre zu …') : <>Du: {frage.text}</>}
      </p>
      {frage.status === 'denkt' && <p className="klein leise" style={{ margin: 0 }}>Einen Moment …</p>}
      {frage.antwort && <p style={{ margin: 0, fontSize: 15 }}>{frage.antwort}</p>}
      {frage.status !== 'hoert' && <button type="button" className="knopf klein" onClick={schliessen}>Weiter trainieren</button>}
    </section>
  )
}
