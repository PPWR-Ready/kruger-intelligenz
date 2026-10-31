import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSitzung, vorname } from '../lib/sitzung'
import { anTeamWeitergeben, frageStellen } from '../lib/chat'
import { hoereZu, spracheingabeMoeglich, vorlesen } from '../lib/sprache'
import { relativ } from '../lib/zeit'
import type { Rueckfrage } from '../lib/db'
import { useFrageAusUrl } from './Onboarding'
import { Icon } from '../components/Icon'
import { Antworttext } from '../components/Antworttext'

interface Anzeige {
  id: string
  rolle: 'mitglied' | 'assistent' | 'system'
  inhalt: string
  quellen?: { eintrag_id: string; titel: string }[]
  unsicher?: boolean
  rueckfrage?: boolean
  weitergegeben?: boolean
  laeuft?: boolean
}

/**
 * Das laufende Gespräch lebt nur im Speicher der geöffneten App: Beim Wechsel
 * zwischen Tabs bleibt es erhalten, beim nächsten Öffnen der App beginnt ein
 * neuer Chat. Alte Verläufe bleiben in der Datenbank (z. B. für Rückfragen).
 */
let laufenderChat: { verlaufId: string | null; nachrichten: Anzeige[] } = { verlaufId: null, nachrichten: [] }

export function Assistent() {
  const s = useSitzung()
  const navigate = useNavigate()
  const frageAusUrl = useFrageAusUrl()
  const [verlaufId, setVerlaufId] = useState<string | null>(laufenderChat.verlaufId)
  const [nachrichten, setNachrichten] = useState<Anzeige[]>(laufenderChat.nachrichten)
  const [rueckfragen, setRueckfragen] = useState<Rueckfrage[]>([])
  const [eingabe, setEingabe] = useState('')
  const [zwischen, setZwischen] = useState('')
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [hoert, setHoert] = useState(false)
  const stopp = useRef<() => void>(() => {})
  const ende = useRef<HTMLDivElement>(null)
  const feld = useRef<HTMLTextAreaElement>(null)
  const [kopiert, setKopiert] = useState<string | null>(null)
  const automatischGefragt = useRef(false)

  // Gespräch für Tab-Wechsel merken (nicht über einen Neustart der App hinaus)
  useEffect(() => {
    laufenderChat = { verlaufId, nachrichten: nachrichten.filter((n) => !n.laeuft) }
  }, [verlaufId, nachrichten])

  // Antworten vom Team laden (alte Chat-Verläufe bewusst nicht: jeder Start ist ein neuer Chat)
  useEffect(() => {
    if (!s.profil) return
    void supabase.from('rueckfragen').select('*').eq('mitglied_id', s.profil.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setRueckfragen((data ?? []) as Rueckfrage[]))
  }, [s.profil])

  useEffect(() => { ende.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [nachrichten])

  // Eingabefeld wächst mit dem Text (bis zur CSS-Höchsthöhe)
  useEffect(() => {
    const f = feld.current
    if (!f) return
    f.style.height = 'auto'
    f.style.height = `${f.scrollHeight}px`
  }, [eingabe, zwischen])

  async function kopieren(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setKopiert(id)
      window.setTimeout(() => setKopiert((k) => (k === id ? null : k)), 1500)
    } catch { /* Zwischenablage nicht erlaubt: ignorieren */ }
  }

  const senden = useCallback(async (text: string) => {
    const frage = text.trim()
    if (!frage || beschaeftigt) return
    setEingabe('')
    setBeschaeftigt(true)
    const antwortId = `neu-${Date.now()}`
    setNachrichten((n) => [...n, { id: `f-${Date.now()}`, rolle: 'mitglied', inhalt: frage }, { id: antwortId, rolle: 'assistent', inhalt: '', laeuft: true }])
    const aendere = (f: (a: Anzeige) => Anzeige) => setNachrichten((n) => n.map((x) => (x.id === antwortId ? f(x) : x)))
    try {
      await frageStellen({ frage, verlauf_id: verlaufId }, {
        beimStart: (id) => setVerlaufId(id),
        beimText: (t) => aendere((a) => ({ ...a, inhalt: a.inhalt + t })),
        beimEnde: (e) => {
          aendere((a) => ({ ...a, id: e.nachricht_id ?? antwortId, laeuft: false, quellen: e.quellen, unsicher: e.unsicher, rueckfrage: e.rueckfrage }))
          if (e.rueckfrage && s.profil) {
            void supabase.from('rueckfragen').select('*').eq('mitglied_id', s.profil.id).order('created_at', { ascending: false }).limit(5)
              .then(({ data }) => setRueckfragen((data ?? []) as Rueckfrage[]))
          }
        },
      })
    } catch (err) {
      setNachrichten((n) => n.map((x) => (x.id === antwortId ? { id: antwortId, rolle: 'system', inhalt: err instanceof Error ? err.message : String(err) } : x)))
    } finally {
      setBeschaeftigt(false)
    }
  }, [beschaeftigt, verlaufId, s.profil])

  // Frage aus einem Link (z. B. von „Heute“) einmal automatisch stellen
  useEffect(() => {
    if (frageAusUrl && !automatischGefragt.current && s.profil) {
      automatischGefragt.current = true
      navigate('/assistent', { replace: true })
      void senden(frageAusUrl)
    }
  }, [frageAusUrl, s.profil, senden, navigate])

  function absenden(e: FormEvent) {
    e.preventDefault()
    void senden(eingabe)
  }

  function taste(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void senden(eingabe)
    }
  }

  function mikro() {
    if (hoert) return stopp.current()
    setHoert(true)
    stopp.current = hoereZu({
      beimText: (t) => setEingabe((alt) => (alt ? `${alt} ${t}` : t)),
      zwischen: setZwischen,
      beimEnde: () => { setHoert(false); setZwischen('') },
      beimFehler: (f) => setNachrichten((n) => [...n, { id: `s-${Date.now()}`, rolle: 'system', inhalt: f }]),
    })
  }

  async function weitergeben(id: string) {
    try {
      await anTeamWeitergeben(id)
      setNachrichten((n) => n.map((x) => (x.id === id ? { ...x, weitergegeben: true } : x)))
    } catch (err) {
      setNachrichten((n) => [...n, { id: `s-${Date.now()}`, rolle: 'system', inhalt: err instanceof Error ? err.message : String(err) }])
    }
  }

  function neuesGespraech() {
    setVerlaufId(null)
    setNachrichten([])
  }

  // Team-Antworten 14 Tage lang oben zeigen, danach nur noch im Verlauf der Datenbank
  const beantwortet = rueckfragen.filter((r) => r.status === 'beantwortet' && r.beantwortet_am && alterInTagen(r.beantwortet_am) <= 14)
  const offen = rueckfragen.filter((r) => r.status === 'offen')
  const leer = nachrichten.length === 0

  return (
    <div className="chat">
      <header className="chat-kopf">
        <span className="chat-kopf-platz" aria-hidden="true" />
        <div className="chat-kopf-titel">
          <img src="/signet.png" alt="" width={19} height={24} />
          <h1>Rückgrat</h1>
        </div>
        <button type="button" className="chat-kopf-knopf" onClick={neuesGespraech} aria-label="Neuer Chat" disabled={leer}>
          <Icon name="neu" groesse={21} />
        </button>
      </header>

      <div className={`chat-verlauf${leer ? ' leer-start' : ''}`} aria-live="polite">
        {beantwortet.slice(0, 2).map((r) => (
          <article key={r.id} className="team-antwort">
            <p className="team-antwort-kopf">Antwort vom Team · {relativ(r.beantwortet_am ?? r.created_at)}</p>
            <p className="team-antwort-frage">„{r.frage}“</p>
            <Antworttext text={r.antwort ?? ''} />
          </article>
        ))}
        {offen.length > 0 && (
          <p className="chat-hinweis">
            {offen.length === 1 ? 'Eine Frage liegt' : `${offen.length} Fragen liegen`} gerade beim Team. Die Antwort erscheint hier.
          </p>
        )}

        {leer && (
          <div className="chat-start">
            <img src="/signet.png" alt="" width={57} height={72} className="chat-start-signet" />
            <h2>Hallo {vorname(s.profil)}.</h2>
            <p>Frag mich zu Training, Rücken, Ernährung oder Gesundheit.</p>
            <div className="vorschlaege">
              {VORSCHLAEGE.map((v) => (
                <button key={v.frage} type="button" className="vorschlag" onClick={() => void senden(v.frage)}>
                  <span className="vorschlag-titel">{v.titel}</span>
                  <span className="vorschlag-text">{v.frage}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {nachrichten.map((n) =>
          n.rolle === 'mitglied' ? (
            <div key={n.id} className="blase eigene">{n.inhalt}</div>
          ) : n.rolle === 'system' ? (
            <div key={n.id} className="chat-fehler" role="alert"><Icon name="warnung" groesse={18} />{n.inhalt}</div>
          ) : (
            <div key={n.id} className="antwort">
              <img src="/signet.png" alt="" width={19} height={24} className={`antwort-signet${n.laeuft ? ' denkt' : ''}`} />
              <div className="antwort-inhalt">
                {n.laeuft && !n.inhalt ? (
                  <span className="tippt-punkte" aria-label="Antwort wird geschrieben"><i /><i /><i /></span>
                ) : (
                  <Antworttext text={n.inhalt} />
                )}
                {!n.laeuft && (
                  <>
                    {!!n.quellen?.length && <p className="quelle">Aus dem Wissen von Rückgrat: {n.quellen.map((q) => q.titel).join(', ')}</p>}
                    <div className="antwort-aktionen">
                      <button type="button" className="aktion" onClick={() => vorlesen(n.inhalt.replace(/[*_#`]+/g, ''))} aria-label="Vorlesen" title="Vorlesen"><Icon name="lautsprecher" groesse={18} /></button>
                      <button type="button" className="aktion" onClick={() => void kopieren(n.id, n.inhalt)} aria-label="Kopieren" title="Kopieren">
                        <Icon name={kopiert === n.id ? 'haken' : 'kopieren'} groesse={18} />
                      </button>
                      {n.unsicher && !n.rueckfrage && !n.id.startsWith('neu-') && (
                        n.weitergegeben
                          ? <span className="aktion-text erledigt">An das Team weitergegeben</span>
                          : <button type="button" className="aktion-text" onClick={() => void weitergeben(n.id)}>Beim Team nachfragen</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={ende} />
      </div>

      <form className="chat-eingabe" onSubmit={absenden}>
        <div className="eingabe-pille">
          <label htmlFor="frage" className="nur-screenreader">Deine Frage</label>
          <textarea id="frage" ref={feld} rows={1} value={hoert && zwischen ? `${eingabe} ${zwischen}`.trim() : eingabe}
            onChange={(e) => setEingabe(e.target.value)} onKeyDown={taste}
            placeholder={hoert ? 'Ich höre zu …' : 'Frag Rückgrat …'} maxLength={2000} />
          {spracheingabeMoeglich() && (
            <button type="button" className={`pillen-knopf${hoert ? ' aufnahme' : ''}`} onClick={mikro} aria-label={hoert ? 'Spracheingabe beenden' : 'Frage sprechen'} aria-pressed={hoert}>
              <Icon name={hoert ? 'stopp' : 'mikro'} groesse={20} />
            </button>
          )}
          <button className="pillen-knopf senden" disabled={beschaeftigt || !eingabe.trim()} aria-label="Senden">
            <Icon name="hoch" groesse={20} staerke={2.4} />
          </button>
        </div>
      </form>
    </div>
  )
}

const alterInTagen = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000

const VORSCHLAEGE = [
  { titel: 'Nacken', frage: 'Was hilft gegen Verspannungen im Nacken?' },
  { titel: 'Rhythmus', frage: 'Wie oft pro Woche sollte ich trainieren?' },
  { titel: 'Kamera-Coaching', frage: 'Wie funktioniert das Training mit Kamera?' },
  { titel: 'Five-Konzept', frage: 'Was ist das Five-Konzept genau?' },
]
