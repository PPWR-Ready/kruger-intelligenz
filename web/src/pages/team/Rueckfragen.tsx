import { useCallback, useEffect, useState } from 'react'
import { fehlertext, supabase } from '../../lib/supabase'
import { useSitzung } from '../../lib/sitzung'
import { wissenSpeichern } from '../../lib/wissen'
import { relativ } from '../../lib/zeit'
import { THEMEN, type Rueckfrage } from '../../lib/db'
import { Fehler, Laden, useMitteilung } from '../../components/Bausteine'
import { useTeam } from './Layout'

type Zeile = Rueckfrage & { mitglied: { anzeigename: string } | null }

export function TeamRueckfragen() {
  const team = useTeam()
  const [ansicht, setAnsicht] = useState<'offen' | 'erledigt'>('offen')
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null)
  const [mitteilung, zeige] = useMitteilung()

  const laden = useCallback(async () => {
    const abfrage = supabase.from('rueckfragen').select('*, mitglied:profiles!rueckfragen_mitglied_id_fkey(anzeigename)')
    const { data } = ansicht === 'offen'
      ? await abfrage.eq('status', 'offen').order('created_at')
      : await abfrage.neq('status', 'offen').order('beantwortet_am', { ascending: false }).limit(50)
    setZeilen((data ?? []) as unknown as Zeile[])
  }, [ansicht])

  useEffect(() => { setZeilen(null); void laden() }, [laden])

  function erledigt(text: string) {
    zeige(text)
    team.zaehlerNeuLaden()
    void laden()
  }

  return (
    <>
      <header className="reihe zwischen" style={{ flexWrap: 'wrap' }}>
        <div className="stapel" style={{ gap: 4 }}>
          <p className="eyebrow">Rückfragen</p>
          <h1 className="titel">Fragen, die das Wissen noch nicht beantwortet</h1>
        </div>
        <div className="chips" role="group" aria-label="Ansicht">
          <button className="chip" aria-pressed={ansicht === 'offen'} onClick={() => setAnsicht('offen')}>Offen</button>
          <button className="chip" aria-pressed={ansicht === 'erledigt'} onClick={() => setAnsicht('erledigt')}>Erledigt</button>
        </div>
      </header>
      <p className="klein leise" style={{ margin: 0, maxWidth: 720 }}>
        Deine Antwort sieht das Mitglied direkt im Assistenten. Gespeichert als Wissen, kann der Assistent die Frage beim nächsten Mal selbst beantworten.
      </p>

      {!zeilen ? <Laden /> : zeilen.length === 0 ? (
        <div className="leer">{ansicht === 'offen' ? 'Keine offenen Rückfragen.' : 'Noch nichts erledigt.'}</div>
      ) : ansicht === 'offen' ? (
        zeilen.map((r) => <RueckfrageKarte key={r.id} r={r} fertig={erledigt} />)
      ) : (
        zeilen.map((r) => (
          <article key={r.id} className="karte" style={{ gap: 8, maxWidth: 820 }}>
            <div className="reihe zwischen">
              <span className="klein leise">{r.mitglied?.anzeigename ?? 'Mitglied'} · {relativ(r.beantwortet_am ?? r.created_at)}</span>
              <span className={`status ${r.status === 'beantwortet' ? 'erfolg' : 'neutral'}`}>{r.status === 'beantwortet' ? 'Beantwortet' : 'Verworfen'}</span>
            </div>
            <span style={{ fontWeight: 600 }}>„{r.frage}“</span>
            {r.antwort && <p className="klein" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.antwort}</p>}
          </article>
        ))
      )}
      {mitteilung}
    </>
  )
}

function RueckfrageKarte({ r, fertig }: { r: Zeile; fertig: (text: string) => void }) {
  const s = useSitzung()
  const [antwort, setAntwort] = useState('')
  const [alsWissen, setAlsWissen] = useState(true)
  const [titel, setTitel] = useState(r.frage.slice(0, 120))
  const [themen, setThemen] = useState<string[]>([])
  const [entwurfOffen, setEntwurfOffen] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function senden() {
    if (!s.profil) return
    if (antwort.trim().length < 5) return setFehler('Bitte schreib eine Antwort.')
    setLaeuft(true)
    setFehler(null)
    const { error } = await supabase.from('rueckfragen').update({
      status: 'beantwortet', antwort: antwort.trim(), beantwortet_von: s.profil.id, beantwortet_am: new Date().toISOString(),
    }).eq('id', r.id)
    if (error) { setLaeuft(false); return setFehler(fehlertext(error)) }

    if (alsWissen) {
      try {
        const e = await wissenSpeichern({
          titel, themen, sichtbarkeit: 'alle', quelle: 'Rückfrage aus der App', eingabeweg: 'rueckfrage', rueckfrageId: r.id, global: false,
          inhalt: `Frage: ${r.frage}\n\nAntwort: ${antwort.trim()}`,
        }, s.profil, s.istGruender)
        return fertig(e.freigegeben ? 'Beantwortet und als Wissen freigegeben' : 'Beantwortet, Wissen zur Freigabe eingereicht')
      } catch (err) {
        return fertig(`Beantwortet. Wissen nicht gespeichert: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    fertig('Antwort gesendet')
  }

  async function verwerfen() {
    if (!s.profil || !confirm('Rückfrage verwerfen? Das Mitglied bekommt keine Antwort.')) return
    const { error } = await supabase.from('rueckfragen').update({ status: 'verworfen', beantwortet_von: s.profil.id, beantwortet_am: new Date().toISOString() }).eq('id', r.id)
    if (error) return setFehler(fehlertext(error))
    fertig('Rückfrage verworfen')
  }

  return (
    <article className="karte" style={{ gap: 14, maxWidth: 820 }}>
      <span className="klein leise">{r.mitglied?.anzeigename ?? 'Mitglied'} · {relativ(r.created_at)}</span>
      <h2 className="untertitel">„{r.frage}“</h2>

      {r.ki_entwurf && (
        <div className="stapel" style={{ gap: 8 }}>
          <button className="knopf klein still" style={{ alignSelf: 'flex-start' }} onClick={() => setEntwurfOffen(!entwurfOffen)} aria-expanded={entwurfOffen}>
            {entwurfOffen ? 'Antwort des Assistenten ausblenden' : 'Was der Assistent geantwortet hat'}
          </button>
          {entwurfOffen && (
            <div className="karte" style={{ background: 'var(--bg)', gap: 8 }}>
              <p className="klein" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.ki_entwurf}</p>
              <button className="knopf klein" style={{ alignSelf: 'flex-start' }} onClick={() => setAntwort(r.ki_entwurf ?? '')}>Als Entwurf übernehmen</button>
            </div>
          )}
        </div>
      )}

      <label className="feld">
        <span>Deine Antwort</span>
        <textarea value={antwort} onChange={(e) => setAntwort(e.target.value)} rows={5} maxLength={4000} placeholder="So, wie du es dem Mitglied im Studio erklären würdest." />
      </label>

      <label className="reihe klein" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={alsWissen} onChange={(e) => setAlsWissen(e.target.checked)} style={{ width: 20, height: 20 }} />
        Auch als Wissen speichern{s.istGruender ? ' und freigeben' : ' (zur Freigabe durch die Gründer)'}
      </label>
      {alsWissen && (
        <div className="stapel" style={{ gap: 10 }}>
          <label className="feld"><span>Titel für das Wissen</span><input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={160} /></label>
          <div className="chips" role="group" aria-label="Themen">
            {THEMEN.map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={themen.includes(t)} onClick={() => setThemen(themen.includes(t) ? themen.filter((x) => x !== t) : [...themen, t])}>{t}</button>
            ))}
          </div>
        </div>
      )}

      <Fehler text={fehler} />
      <div className="reihe" style={{ flexWrap: 'wrap' }}>
        <button className="knopf primaer" onClick={() => void senden()} disabled={laeuft}>Antwort senden</button>
        <button className="knopf still" onClick={() => void verwerfen()} disabled={laeuft}>Verwerfen</button>
      </div>
    </article>
  )
}
