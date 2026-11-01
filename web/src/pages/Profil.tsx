import { DATENSCHUTZ_URL, Rechtliches } from '../components/Rechtliches'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fehlertext, supabase } from '../lib/supabase'
import { useSitzung } from '../lib/sitzung'
import { datumKurz } from '../lib/zeit'
import type { Abo, EinwilligungArt } from '../lib/db'
import { speichereEinwilligungen } from './Onboarding'
import { Fehler, Schalter, useMitteilung } from '../components/Bausteine'
import { Icon } from '../components/Icon'

const KONTAKT = (import.meta.env.VITE_KONTAKT_EMAIL as string | undefined) ?? ''

const EINWILLIGUNGEN: { art: EinwilligungArt; titel: string; text: string }[] = [
  { art: 'gesundheitsdaten', titel: 'Gesundheitsangaben nutzen', text: 'Ziele, Beschwerden und Befinden, damit Antworten und Pläne zu dir passen.' },
  { art: 'kamera', titel: 'Kamera für den Trainer-Modus', text: 'Das Bild bleibt auf deinem Gerät. Gespeichert werden nur Wiederholungen, Bewertung und Korrekturhinweise.' },
  { art: 'trainer_freigabe', titel: 'Trainer darf Fortschritt sehen', text: 'So kann dich das Team gezielt betreuen. Deine Chats liest das Team nicht – nur Fragen, die der Assistent nicht beantworten kann, gehen an das Team, damit es dir antwortet.' },
]

export function Profil() {
  const s = useSitzung()
  const [name, setName] = useState(s.profil?.anzeigename ?? '')
  const [abo, setAbo] = useState<Abo | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [mitteilung, zeige] = useMitteilung()

  useEffect(() => {
    if (!s.profil) return
    void supabase.from('abos').select('user_id, stufe, status, laeuft_bis').eq('user_id', s.profil.id).maybeSingle<Abo>().then(({ data }) => setAbo(data))
  }, [s.profil])

  async function nameSpeichern() {
    const neu = name.trim()
    if (!s.profil || !neu || neu === s.profil.anzeigename) return
    const { error } = await supabase.from('profiles').update({ anzeigename: neu }).eq('id', s.profil.id)
    if (error) return setFehler(fehlertext(error))
    await s.neuLaden()
    zeige('Name gespeichert')
  }

  async function einwilligungAendern(art: EinwilligungArt, an: boolean) {
    if (!s.profil) return
    if (art === 'gesundheitsdaten' && !an && !confirm('Deine gespeicherten Ziele und Beschwerden werden dabei gelöscht. Fortfahren?')) return
    setFehler(null)
    // Nur die geänderte Einwilligung speichern – sonst könnte ein schneller zweiter Klick einen Widerruf überschreiben
    const { error } = await speichereEinwilligungen(s.profil.id, { [art]: an })
    if (error) return setFehler(fehlertext(error))
    // Widerruf: gespeicherte Gesundheitsangaben sofort löschen
    if (art === 'gesundheitsdaten' && !an) await supabase.from('gesundheitsprofil').delete().eq('user_id', s.profil.id)
    await s.neuLaden()
    zeige(an ? 'Einwilligung erteilt' : 'Einwilligung widerrufen')
  }

  async function datenExportieren() {
    if (!s.profil) return
    const id = s.profil.id
    const [profil, einwilligungen, gesundheit, einheiten, verlaeufe, rueckfragen, abos] = await Promise.all([
      supabase.from('profiles').select('anzeigename, rolle, created_at').eq('id', id).single(),
      supabase.from('einwilligungen').select('art, erteilt, text_version, aktualisiert_am').eq('user_id', id),
      supabase.from('gesundheitsprofil').select('ziele, beschwerden, trainings_pro_woche, aktualisiert_am').eq('user_id', id).maybeSingle(),
      supabase.from('einheiten').select('gestartet_am, beendet_am, befinden, notiz, saetze(satz_nr, wiederholungen, qualitaet, korrekturen, uebungen(name))').eq('mitglied_id', id).order('gestartet_am'),
      supabase.from('chat_verlaeufe').select('kontext, created_at, chat_nachrichten(rolle, inhalt, created_at)').eq('mitglied_id', id).order('created_at'),
      supabase.from('rueckfragen').select('frage, status, antwort, created_at, beantwortet_am').eq('mitglied_id', id),
      supabase.from('abos').select('stufe, status, laeuft_bis').eq('user_id', id),
    ])
    const daten = {
      exportiert_am: new Date().toISOString(),
      email: s.session?.user.email,
      profil: profil.data, einwilligungen: einwilligungen.data, gesundheitsprofil: gesundheit.data,
      einheiten: einheiten.data, chats: verlaeufe.data, rueckfragen: rueckfragen.data, abos: abos.data,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rueckgrat-meine-daten-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loeschLink = KONTAKT
    ? `mailto:${KONTAKT}?subject=${encodeURIComponent('Konto löschen')}&body=${encodeURIComponent('Bitte löscht mein Konto in der Rückgrat-App und alle zugehörigen Daten.')}`
    : null

  return (
    <div className="seite">
      <h1 className="titel">Profil</h1>

      <section className="karte">
        <label className="feld">
          <span>Dein Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={nameSpeichern} maxLength={60} autoComplete="name" />
        </label>
        <p className="klein leise" style={{ margin: 0 }}>{s.session?.user.email}</p>
        {s.profil?.rolle !== 'mitglied' && <span className="status neutral">{s.profil?.rolle === 'gruender' ? 'Admin' : 'Trainer'}</span>}
      </section>

      {s.istTeam && (
        <Link to="/team" className="knopf voll" style={{ justifyContent: 'space-between' }}>
          <span className="reihe" style={{ gap: 8 }}><Icon name="team" groesse={20} />Team-Bereich öffnen</span><Icon name="weiter" groesse={18} />
        </Link>
      )}

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Meine Ziele</h2>
        <Link to="/profil/ziele" className="knopf voll" style={{ justifyContent: 'space-between' }}>Ziele und Beschwerden bearbeiten<Icon name="weiter" groesse={18} /></Link>
      </section>

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Datenschutz</h2>
        {EINWILLIGUNGEN.map((e) => (
          <div key={e.art} className="karte">
            <Schalter an={!!s.einwilligungen[e.art]} beiAenderung={(an) => void einwilligungAendern(e.art, an)} titel={e.titel} text={e.text} />
          </div>
        ))}
        <p className="klein leise" style={{ margin: 0 }}>Beim Widerruf der Gesundheitsangaben werden deine gespeicherten Ziele und Beschwerden gelöscht. <a href={DATENSCHUTZ_URL} target="_blank" rel="noreferrer">Datenschutzerklärung</a></p>
        <Fehler text={fehler} />
      </section>

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Abo</h2>
        <div className="karte" style={{ gap: 6 }}>
          {abo && ['aktiv', 'gekuendigt'].includes(abo.status) ? (
            <>
              <span style={{ fontWeight: 600 }}>{abo.stufe === 'coach' ? 'Coach' : 'Assistent'}</span>
              <span className="klein leise">{abo.status === 'gekuendigt' ? 'Gekündigt' : 'Aktiv'}{abo.laeuft_bis ? ` · läuft bis ${datumKurz(abo.laeuft_bis)}` : ''}</span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>Mitgliedschaft</span>
              <span className="klein leise">Assistent und Kamera-Coaching sind in deiner Mitgliedschaft enthalten.</span>
            </>
          )}
        </div>
      </section>

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Meine Daten</h2>
        <button className="knopf voll" onClick={() => void datenExportieren()}><Icon name="herunterladen" groesse={20} />Alle Daten herunterladen (Datei für Fachleute)</button>
        {loeschLink
          ? <a className="knopf still voll" href={loeschLink}>Konto löschen lassen</a>
          : <p className="klein leise" style={{ margin: 0 }}>Konto löschen: Sprich das Team im Studio an.</p>}
      </section>

      <button className="knopf kritisch voll" onClick={() => { if (confirm('Wirklich abmelden?')) void s.abmelden() }}><Icon name="abmelden" groesse={20} />Abmelden</button>
      <Rechtliches />
      {mitteilung}
    </div>
  )
}
