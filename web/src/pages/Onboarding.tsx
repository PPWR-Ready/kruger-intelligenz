// Willkommen, Registrierung, Anmeldung, Code einlösen und die Onboarding-Schritte.
import { DATENSCHUTZ_URL, Rechtliches } from '../components/Rechtliches'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { supabase, fehlertext } from '../lib/supabase'
import { merkeCode, useSitzung, vorname } from '../lib/sitzung'
import { BESCHWERDEN, EINWILLIGUNG_VERSION, ZIELE, type EinwilligungArt, type Gesundheitsprofil } from '../lib/db'
import { Fehler, Schalter, Schritte } from '../components/Bausteine'
import { Icon } from '../components/Icon'

const UEBER_DICH = 'kruger.ueberDich'

type UeberDich = Pick<Gesundheitsprofil, 'ziele' | 'beschwerden' | 'trainings_pro_woche'>

/* ------------------------------------------------------------ 1 Willkommen */
export function Willkommen() {
  return (
    <main className="mitglied">
      <div className="seite ohne-tabs" style={{ gap: 24 }}>
        <Schritte aktuell={1} />
        <div className="karte" style={{ height: 260, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }} aria-hidden="true">
          <img src="/logo.png" alt="" width={260} height={165} style={{ width: 260, height: 'auto', maxWidth: '85%' }} />
          <span className="leise klein">Donaueschingen · seit 1993</span>
        </div>
        <div className="stapel">
          <p className="eyebrow">Deine Rückgrat-App</p>
          <h1 className="display display-xl">Die Quelle deiner Kraft. <span className="akzent-text">Jetzt in deiner Tasche.</span></h1>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>
            Frag uns alles zu Training, Rücken, Ernährung und Gesundheit. Und trainiere mit Kamera-Coaching, das live mitzählt und dich korrigiert.
          </p>
        </div>
        <div className="unten">
          <Link to="/registrieren" className="knopf primaer voll">Los geht’s</Link>
          <Link to="/anmelden" className="knopf still voll">Ich habe schon einen Zugang</Link>
          <Rechtliches />
        </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------ 2 Registrieren */
export function Registrieren() {
  const ort = useLocation()
  const [code, setCode] = useState(() => (new URLSearchParams(ort.search).get('code') ?? '').toUpperCase())
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [bestaetigen, setBestaetigen] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const sauber = code.trim().toUpperCase()
    if (!/^[A-Z0-9-]{4,20}$/.test(sauber)) return setFehler('Bitte gib den Einladungscode aus dem Studio ein.')
    if (!name.trim()) return setFehler('Bitte gib deinen Namen ein.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.trim())) return setFehler('Bitte gib eine gültige E-Mail-Adresse ein.')
    if (passwort.length < 8) return setFehler('Das Passwort muss mindestens 8 Zeichen haben.')
    setLaeuft(true)
    merkeCode(sauber, name.trim())
    const { data, error } = await supabase.auth.signUp({
      email: mail.trim(),
      password: passwort,
      options: { emailRedirectTo: `${window.location.origin}/anmelden`, data: { anzeigename: name.trim() } },
    })
    setLaeuft(false)
    if (error) return setFehler(fehlertext(error))
    if (!data.session) setBestaetigen(true)
    // Mit Sitzung übernimmt die Sitzungsverwaltung: Code einlösen und weiter.
  }

  if (bestaetigen) {
    return (
      <main className="mitglied">
        <div className="seite ohne-tabs">
          <Schritte aktuell={2} />
          <h1 className="display display-l">Fast geschafft</h1>
          <p style={{ margin: 0 }}>Wir haben dir eine E-Mail an <strong>{mail}</strong> geschickt. Tipp auf den Link darin und melde dich danach an. Dein Einladungscode ist gespeichert.</p>
          <div className="unten"><Link to="/anmelden" className="knopf primaer voll">Zur Anmeldung</Link></div>
        </div>
      </main>
    )
  }

  return (
    <main className="mitglied">
      <form className="seite ohne-tabs" onSubmit={absenden} noValidate>
        <Schritte aktuell={2} />
        <h1 className="display display-l">Dein Zugang</h1>
        <label className="feld">
          <span>Einladungscode aus dem Studio</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. RG-4K7P" autoCapitalize="characters" autoComplete="off" style={{ letterSpacing: '0.08em' }} />
        </label>
        <label className="feld">
          <span>Dein Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Vorname Nachname" />
        </label>
        <label className="feld">
          <span>E-Mail</span>
          <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} autoComplete="email" placeholder="du@beispiel.de" required />
        </label>
        <label className="feld">
          <span>Passwort</span>
          <input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="new-password" placeholder="Mindestens 8 Zeichen" required />
        </label>
        <p className="klein leise" style={{ margin: 0 }}>Dein Zugang wird vom Team bestätigt. Bis dahin kannst du schon alles einrichten.</p>
        <Fehler text={fehler} />
        <div className="unten">
          <button className="knopf primaer voll" disabled={laeuft}>{laeuft ? 'Einen Moment …' : 'Weiter'}</button>
          <Link to="/willkommen" className="knopf still voll">Zurück</Link>
          <Rechtliches />
        </div>
      </form>
    </main>
  )
}

/* ------------------------------------------------------------ Anmelden */
export function Anmelden() {
  const [mail, setMail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLaeuft(true)
    const { error } = await supabase.auth.signInWithPassword({ email: mail.trim(), password: passwort })
    setLaeuft(false)
    if (error) setFehler(fehlertext(error))
  }

  async function vergessen() {
    setFehler(null)
    if (!mail.trim()) return setFehler('Gib zuerst deine E-Mail ein.')
    const { error } = await supabase.auth.resetPasswordForEmail(mail.trim(), { redirectTo: `${window.location.origin}/passwort-neu` })
    if (error) setFehler(fehlertext(error))
    else setHinweis('Wir haben dir einen Link zum Zurücksetzen geschickt.')
  }

  return (
    <main className="mitglied">
      <form className="seite ohne-tabs" onSubmit={absenden}>
        <Link to="/willkommen" className="knopf rund" aria-label="Zurück" style={{ background: 'var(--surface)' }}><Icon name="zurueck" groesse={22} staerke={2} /></Link>
        <h1 className="display display-l">Willkommen zurück</h1>
        <label className="feld"><span>E-Mail</span><input type="email" value={mail} onChange={(e) => setMail(e.target.value)} autoComplete="email" required /></label>
        <label className="feld"><span>Passwort</span><input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" required /></label>
        <Fehler text={fehler} />
        {hinweis && <p className="klein" role="status" style={{ margin: 0, color: 'var(--success)' }}>{hinweis}</p>}
        <div className="unten">
          <button className="knopf primaer voll" disabled={laeuft}>{laeuft ? 'Einen Moment …' : 'Anmelden'}</button>
          <button type="button" className="knopf still voll" onClick={vergessen}>Passwort vergessen</button>
          <Rechtliches />
        </div>
      </form>
    </main>
  )
}

export function PasswortNeu() {
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const navigate = useNavigate()
  async function absenden(e: FormEvent) {
    e.preventDefault()
    if (passwort.length < 8) return setFehler('Das Passwort muss mindestens 8 Zeichen haben.')
    const { error } = await supabase.auth.updateUser({ password: passwort })
    if (error) setFehler(fehlertext(error))
    else navigate('/')
  }
  return (
    <main className="mitglied">
      <form className="seite ohne-tabs" onSubmit={absenden}>
        <h1 className="display display-l">Neues Passwort</h1>
        <label className="feld"><span>Neues Passwort</span><input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="new-password" /></label>
        <Fehler text={fehler} />
        <div className="unten"><button className="knopf primaer voll">Speichern</button></div>
      </form>
    </main>
  )
}

/* ------------------------------------------------------------ Code einlösen (angemeldet, ohne Studio) */
export function CodeEinloesen() {
  const s = useSitzung()
  const [code, setCode] = useState('')
  const [name, setName] = useState((s.session?.user.user_metadata?.anzeigename as string | undefined) ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  if (s.profil) return <Navigate to="/" replace />

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!name.trim()) return setFehler('Bitte gib deinen Namen ein.')
    setLaeuft(true)
    const { error } = await supabase.rpc('code_einloesen', { p_code: code.trim().toUpperCase(), p_anzeigename: name.trim() })
    setLaeuft(false)
    if (error) return setFehler(fehlertext(error))
    await s.neuLaden()
  }

  return (
    <main className="mitglied">
      <form className="seite ohne-tabs" onSubmit={absenden}>
        <h1 className="display display-l">Einladungscode</h1>
        <p style={{ margin: 0 }}>Dein Konto ist noch keinem Studio zugeordnet. Gib den Einladungscode ein, den du im Studio bekommen hast.</p>
        <label className="feld"><span>Einladungscode</span><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. RG-4K7P" autoComplete="off" /></label>
        <label className="feld"><span>Dein Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <Fehler text={fehler} />
        <div className="unten">
          <button className="knopf primaer voll" disabled={laeuft}>Einlösen</button>
          <button type="button" className="knopf still voll" onClick={s.abmelden}>Abmelden</button>
        </div>
      </form>
    </main>
  )
}

/* ------------------------------------------------------------ 3 Über dich (auch zum Bearbeiten im Profil) */
export function UeberDichSchritt({ bearbeiten = false }: { bearbeiten?: boolean }) {
  const s = useSitzung()
  const navigate = useNavigate()
  const gespeichert = (() => {
    try { return JSON.parse(sessionStorage.getItem(UEBER_DICH) ?? 'null') as UeberDich | null } catch { return null }
  })()
  const [ziele, setZiele] = useState<string[]>(gespeichert?.ziele ?? [])
  const [beschwerden, setBeschwerden] = useState<string[]>(gespeichert?.beschwerden ?? [])
  const [haeufigkeit, setHaeufigkeit] = useState<UeberDich['trainings_pro_woche']>(gespeichert?.trainings_pro_woche ?? null)
  const [geladen, setGeladen] = useState(!bearbeiten)
  const [fehler, setFehler] = useState<string | null>(null)

  const profilId = s.profil?.id
  useEffect(() => {
    if (!bearbeiten || geladen || !profilId) return
    void supabase.from('gesundheitsprofil').select('*').eq('user_id', profilId).maybeSingle<Gesundheitsprofil>().then(({ data }) => {
      if (data) { setZiele(data.ziele); setBeschwerden(data.beschwerden); setHaeufigkeit(data.trainings_pro_woche) }
      setGeladen(true)
    })
  }, [bearbeiten, geladen, profilId])

  const umschalten = (liste: string[], setze: (l: string[]) => void, wert: string) =>
    setze(liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert])

  async function weiter() {
    const daten: UeberDich = { ziele, beschwerden: beschwerden.filter((b) => b !== 'Keine'), trainings_pro_woche: haeufigkeit }
    if (!bearbeiten) {
      sessionStorage.setItem(UEBER_DICH, JSON.stringify(daten))
      return navigate('/start/datenschutz')
    }
    if (!s.einwilligungen.gesundheitsdaten) return setFehler('Zum Speichern brauchst du die Einwilligung „Gesundheitsangaben nutzen“ im Profil.')
    const { error } = await supabase.from('gesundheitsprofil').upsert({ user_id: s.profil!.id, ...daten, aktualisiert_am: new Date().toISOString() })
    if (error) return setFehler(fehlertext(error))
    navigate('/profil')
  }

  return (
    <main className="mitglied">
      <div className="seite ohne-tabs">
        {bearbeiten ? <Link to="/profil" className="knopf rund" aria-label="Zurück" style={{ background: 'var(--surface)' }}><Icon name="zurueck" groesse={22} staerke={2} /></Link> : <Schritte aktuell={3} />}
        {!bearbeiten && <p className="klein leise" style={{ margin: '-12px 0 0' }}>Alles freiwillig</p>}
        <h1 className="display display-l">Woran willst du arbeiten?</h1>
        <div className="raster-2" role="group" aria-label="Ziele">
          {ZIELE.map((z) => (
            <button key={z} type="button" className="chip" aria-pressed={ziele.includes(z)} style={{ minHeight: 56, borderRadius: 8, justifyContent: 'flex-start' }} onClick={() => umschalten(ziele, setZiele, z)}>{z}</button>
          ))}
        </div>
        <div className="stapel">
          <h2 className="untertitel" style={{ fontSize: 17 }}>Wo hast du Beschwerden?</h2>
          <div className="chips" role="group" aria-label="Beschwerden">
            {[...BESCHWERDEN, 'Keine'].map((b) => (
              <button key={b} type="button" className="chip" aria-pressed={beschwerden.includes(b)}
                onClick={() => (b === 'Keine' ? setBeschwerden(beschwerden.includes('Keine') ? [] : ['Keine']) : umschalten(beschwerden.filter((x) => x !== 'Keine'), setBeschwerden, b))}>{b}</button>
            ))}
          </div>
        </div>
        <div className="stapel">
          <h2 className="untertitel" style={{ fontSize: 17 }}>Wie oft trainierst du pro Woche?</h2>
          <div className="raster-3" role="group" aria-label="Trainingshäufigkeit">
            {(['1-2', '3-4', '5+'] as const).map((h) => (
              <button key={h} type="button" className="chip" aria-pressed={haeufigkeit === h} style={{ borderRadius: 8, justifyContent: 'center' }} onClick={() => setHaeufigkeit(haeufigkeit === h ? null : h)}>{h.replace('-', '–')}-mal</button>
            ))}
          </div>
        </div>
        <Fehler text={fehler} />
        <div className="unten">
          <button className="knopf primaer voll" onClick={weiter}>{bearbeiten ? 'Speichern' : 'Weiter'}</button>
          {!bearbeiten && <button className="knopf still voll" onClick={() => { sessionStorage.removeItem(UEBER_DICH); navigate('/start/datenschutz') }}>Später ausfüllen</button>}
        </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------ 4 Datenschutz */
export async function speichereEinwilligungen(userId: string, werte: Record<EinwilligungArt, boolean>) {
  const zeilen = (Object.keys(werte) as EinwilligungArt[]).map((art) => ({ user_id: userId, art, erteilt: werte[art], text_version: EINWILLIGUNG_VERSION }))
  return await supabase.from('einwilligungen').upsert(zeilen)
}

export function DatenschutzSchritt() {
  const s = useSitzung()
  const navigate = useNavigate()
  const [werte, setWerte] = useState<Record<EinwilligungArt, boolean>>({ gesundheitsdaten: false, kamera: false, trainer_freigabe: false })
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const setze = (art: EinwilligungArt) => (an: boolean) => setWerte((w) => ({ ...w, [art]: an }))

  async function weiter() {
    if (!s.profil) return
    setLaeuft(true)
    setFehler(null)
    const { error } = await speichereEinwilligungen(s.profil.id, werte)
    if (error) { setLaeuft(false); return setFehler(fehlertext(error)) }
    const ueberDich = (() => { try { return JSON.parse(sessionStorage.getItem(UEBER_DICH) ?? 'null') as UeberDich | null } catch { return null } })()
    if (werte.gesundheitsdaten && ueberDich) {
      await supabase.from('gesundheitsprofil').upsert({ user_id: s.profil.id, ...ueberDich, aktualisiert_am: new Date().toISOString() })
    }
    sessionStorage.removeItem(UEBER_DICH)
    await s.neuLaden()
    navigate('/start/erste-frage')
  }

  return (
    <main className="mitglied">
      <div className="seite ohne-tabs">
        <Schritte aktuell={4} />
        <h1 className="display display-l">Deine Daten bleiben deine.</h1>
        <div className="karte"><Schalter an={werte.gesundheitsdaten} beiAenderung={setze('gesundheitsdaten')} titel="Gesundheitsangaben nutzen" text="Ziele, Beschwerden und Befinden, damit Antworten und Pläne zu dir passen." /></div>
        <div className="karte"><Schalter an={werte.kamera} beiAenderung={setze('kamera')} titel="Kamera für den Trainer-Modus" text="Das Bild bleibt auf deinem Gerät. Gespeichert werden nur Wiederholungen, Bewertung und Korrekturhinweise." /></div>
        <div className="karte"><Schalter an={werte.trainer_freigabe} beiAenderung={setze('trainer_freigabe')} titel="Trainer darf Fortschritt sehen" text="So kann dich das Team gezielt betreuen. Deine Chats liest das Team nur, wenn eine Frage an das Team weitergegeben wird." /></div>
        <p className="klein leise" style={{ margin: 0 }}>Alles freiwillig und jederzeit im Profil änderbar. <a href={DATENSCHUTZ_URL} target="_blank" rel="noreferrer">Datenschutzerklärung lesen</a></p>
        <Fehler text={fehler} />
        <div className="unten">
          <button className="knopf primaer voll" onClick={weiter} disabled={laeuft}>Speichern und weiter</button>
          <Link to="/start/ueber-dich" className="knopf still voll">Zurück</Link>
        </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------ 5 Erste Frage */
export function ErsteFrage() {
  const s = useSitzung()
  const vorschlaege = ['Was ist das Five-Konzept genau?', 'Wie kann ich ein Probetraining machen?', 'Welche Five-Kurse gibt es in der Woche?']
  return (
    <main className="mitglied">
      <div className="seite ohne-tabs">
        <Schritte aktuell={5} />
        <div className="reihe">
          <div className="avatar-lk" aria-hidden="true"><img src="/signet.png" alt="" width={19} height={24} /></div>
          <div><div style={{ fontWeight: 600 }}>Dein Assistent</div><div className="klein leise">Wissen aus dem Rückgrat-Team</div></div>
        </div>
        <div className="blase assistent" style={{ maxWidth: '100%' }}>
          Hallo {vorname(s.profil)}, schön, dass du da bist. Ich kenne das Wissen unseres Teams rund um Five, Training und das Studio. Womit fangen wir an?
        </div>
        {!s.profil?.freigeschaltet && (
          <div className="karte warnung"><p className="klein" style={{ margin: 0 }}>Dein Zugang wird gerade vom Team freigeschaltet. Fragen kannst du stellen, sobald das erledigt ist.</p></div>
        )}
        <div className="stapel">
          {vorschlaege.map((v) => (
            <Link key={v} to={`/assistent?frage=${encodeURIComponent(v)}`} className="knopf" style={{ justifyContent: 'space-between', textAlign: 'left' }}>{v}<Icon name="weiter" groesse={18} /></Link>
          ))}
        </div>
        <div className="unten"><Link to="/assistent" className="knopf primaer voll">Los geht’s</Link></div>
      </div>
    </main>
  )
}

/** Für Links mit ?frage=… */
export function useFrageAusUrl(): string | null {
  const ort = useLocation()
  return new URLSearchParams(ort.search).get('frage')
}
