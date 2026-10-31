import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSitzung } from '../lib/sitzung'
import { anTeamWeitergeben, frageStellen } from '../lib/chat'
import { hoereZu, spracheingabeMoeglich, vorlesen } from '../lib/sprache'
import { relativ } from '../lib/zeit'
import type { ChatNachricht, Rueckfrage } from '../lib/db'
import { useFrageAusUrl } from './Onboarding'
import { Icon } from '../components/Icon'

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

export function Assistent() {
  const s = useSitzung()
  const navigate = useNavigate()
  const frageAusUrl = useFrageAusUrl()
  const [verlaufId, setVerlaufId] = useState<string | null>(null)
  const [nachrichten, setNachrichten] = useState<Anzeige[]>([])
  const [rueckfragen, setRueckfragen] = useState<Rueckfrage[]>([])
  const [eingabe, setEingabe] = useState('')
  const [zwischen, setZwischen] = useState('')
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [hoert, setHoert] = useState(false)
  const stopp = useRef<() => void>(() => {})
  const ende = useRef<HTMLDivElement>(null)
  const automatischGefragt = useRef(false)

  // Letzten Verlauf und Antworten vom Team laden
  useEffect(() => {
    if (!s.profil) return
    void (async () => {
      const { data: v } = await supabase.from('chat_verlaeufe').select('id').eq('mitglied_id', s.profil!.id).eq('kontext', 'chat')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (v && !frageAusUrl) {
        setVerlaufId(v.id)
        const { data: n } = await supabase.from('chat_nachrichten').select('*').eq('verlauf_id', v.id).order('created_at').returns<ChatNachricht[]>()
        setNachrichten((n ?? []).filter((x) => x.rolle !== 'trainer').map((x) => ({ id: x.id, rolle: x.rolle as 'mitglied' | 'assistent', inhalt: x.inhalt, quellen: x.quellen, unsicher: x.unsicher })))
      }
      const { data: r } = await supabase.from('rueckfragen').select('*').eq('mitglied_id', s.profil!.id).order('created_at', { ascending: false }).limit(5)
      setRueckfragen((r ?? []) as Rueckfrage[])
    })()
  }, [s.profil, frageAusUrl])

  useEffect(() => { ende.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [nachrichten])

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

  const beantwortet = rueckfragen.filter((r) => r.status === 'beantwortet')
  const offen = rueckfragen.filter((r) => r.status === 'offen')

  return (
    <div className="chat">
      <header className="chat-kopf">
        <div className="avatar-lk" aria-hidden="true">LK</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Assistent</h1>
          <p className="klein leise" style={{ margin: 0 }}>Wissen aus dem Rückgrat-Team</p>
        </div>
        {nachrichten.length > 0 && <button className="knopf klein still" onClick={neuesGespraech}>Neues Gespräch</button>}
      </header>

      <div className="chat-verlauf" aria-live="polite">
        {beantwortet.slice(0, 2).map((r) => (
          <div key={r.id} className="karte warnung" style={{ gap: 8 }}>
            <span className="label-klein" style={{ color: 'var(--warning)' }}>Antwort vom Team · {relativ(r.beantwortet_am ?? r.created_at)}</span>
            <span className="klein leise">Deine Frage: „{r.frage}“</span>
            <span style={{ fontSize: 16, whiteSpace: 'pre-wrap' }}>{r.antwort}</span>
          </div>
        ))}
        {offen.length > 0 && (
          <div className="karte" style={{ gap: 6 }}>
            <span className="label-klein">Beim Team nachgefragt</span>
            {offen.map((r) => <span key={r.id} className="klein">„{r.frage}“ · {relativ(r.created_at)}</span>)}
          </div>
        )}

        {nachrichten.length === 0 && (
          <div className="stapel" style={{ marginTop: 12 }}>
            <p className="leise" style={{ margin: 0 }}>Stell deine Frage zu Training, Rücken, Ernährung oder Gesundheit.</p>
            <div className="chips">
              {['Was hilft gegen Verspannungen im Nacken?', 'Wie oft pro Woche trainieren?', 'Gibt es Übungen fürs Büro?'].map((f) => (
                <button key={f} className="chip" onClick={() => void senden(f)}>{f}</button>
              ))}
            </div>
          </div>
        )}

        {nachrichten.map((n) =>
          n.rolle === 'mitglied' ? (
            <div key={n.id} className="blase eigene">{n.inhalt}</div>
          ) : n.rolle === 'system' ? (
            <div key={n.id} className="karte kritisch" role="alert" style={{ fontSize: 15 }}>{n.inhalt}</div>
          ) : (
            <div key={n.id} className="blase assistent">
              <span className={n.laeuft ? 'tippt' : undefined}>{n.inhalt}</span>
              {!n.laeuft && (
                <>
                  {!!n.quellen?.length && <span className="quelle">Aus dem Wissen von Rückgrat: {n.quellen.map((q) => q.titel).join(' · ')}</span>}
                  <div className="reihe" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="knopf klein still" onClick={() => vorlesen(n.inhalt)} aria-label="Antwort vorlesen"><Icon name="lautsprecher" groesse={18} />Vorlesen</button>
                    {n.unsicher && !n.rueckfrage && !n.id.startsWith('neu-') && (
                      n.weitergegeben
                        ? <span className="klein" style={{ color: 'var(--success)' }}>An das Team weitergegeben</span>
                        : <button className="knopf klein" onClick={() => void weitergeben(n.id)}>Beim Team nachfragen</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ),
        )}
        <div ref={ende} />
      </div>

      <form className="chat-eingabe" onSubmit={absenden}>
        <label htmlFor="frage" className="nur-screenreader">Deine Frage</label>
        <textarea id="frage" rows={1} value={hoert && zwischen ? `${eingabe} ${zwischen}`.trim() : eingabe} onChange={(e) => setEingabe(e.target.value)} onKeyDown={taste}
          placeholder={hoert ? 'Ich höre zu …' : 'Frag mich etwas …'} maxLength={2000} />
        {spracheingabeMoeglich() && (
          <button type="button" className="knopf rund" onClick={mikro} aria-label={hoert ? 'Spracheingabe beenden' : 'Frage sprechen'} aria-pressed={hoert}
            style={{ background: hoert ? 'var(--critical)' : 'var(--surface)', color: hoert ? '#121212' : 'var(--text)', border: 0 }}>
            <Icon name={hoert ? 'stopp' : 'mikro'} groesse={22} />
          </button>
        )}
        <button className="knopf rund" disabled={beschaeftigt || !eingabe.trim()} aria-label="Senden" style={{ background: 'var(--accent)', color: '#121212', border: 0 }}>
          <Icon name="senden" groesse={22} staerke={2} />
        </button>
      </form>
    </div>
  )
}
