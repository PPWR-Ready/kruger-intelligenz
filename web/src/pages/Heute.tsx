import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSitzung, vorname } from '../lib/sitzung'
import { tageszeitGruss, wochenstart, wochentag } from '../lib/zeit'
import type { Einheit, Rueckfrage } from '../lib/db'
import { Kachel } from '../components/Bausteine'
import { Icon } from '../components/Icon'

interface Plan {
  id: string
  name: string
  plan_uebungen: { reihenfolge: number; saetze: number; uebungen: { name: string } | null }[]
}

export function Heute() {
  const s = useSitzung()
  const [einheiten, setEinheiten] = useState<Pick<Einheit, 'gestartet_am' | 'befinden'>[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [antwort, setAntwort] = useState<Rueckfrage | null>(null)

  useEffect(() => {
    if (!s.profil) return
    const seit = new Date(Date.now() - 28 * 86400000).toISOString()
    void supabase.from('einheiten').select('gestartet_am, befinden').eq('mitglied_id', s.profil.id).gte('gestartet_am', seit)
      .then(({ data }) => setEinheiten(data ?? []))
    void supabase.from('plaene').select('id, name, plan_uebungen(reihenfolge, saetze, uebungen(name))').eq('mitglied_id', s.profil.id).eq('aktiv', true).maybeSingle()
      .then(({ data }) => setPlan(data as unknown as Plan | null))
    void supabase.from('rueckfragen').select('*').eq('mitglied_id', s.profil.id).eq('status', 'beantwortet')
      .gte('beantwortet_am', new Date(Date.now() - 14 * 86400000).toISOString()).order('beantwortet_am', { ascending: false }).limit(1)
      .then(({ data }) => setAntwort((data?.[0] as Rueckfrage | undefined) ?? null))
  }, [s.profil])

  const woche = wochenstart(new Date())
  const dieseWoche = einheiten.filter((e) => new Date(e.gestartet_am) >= woche).length
  const mittel = (von: number, bis: number) => {
    const w = einheiten
      .filter((e) => e.befinden !== null && Date.now() - new Date(e.gestartet_am).getTime() >= von * 86400000 && Date.now() - new Date(e.gestartet_am).getTime() < bis * 86400000)
      .map((e) => e.befinden as number)
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null
  }
  const aktuell = mittel(0, 14)
  const vorher = mittel(14, 28)
  const trend = aktuell !== null && vorher !== null ? aktuell - vorher : null
  const uebungen = [...(plan?.plan_uebungen ?? [])].sort((a, b) => a.reihenfolge - b.reihenfolge)

  return (
    <div className="seite">
      <div className="reihe zwischen">
        <div className="stapel" style={{ gap: 4 }}>
          <p className="klein leise" style={{ margin: 0, textTransform: 'capitalize' }}>{wochentag()}</p>
          <h1 className="titel">{tageszeitGruss()}, {vorname(s.profil)}.</h1>
        </div>
        <Link to="/profil" className="knopf rund" aria-label="Profil" style={{ background: 'var(--surface)', fontWeight: 600 }}>{vorname(s.profil).slice(0, 1)}</Link>
      </div>

      {!s.profil?.freigeschaltet && (
        <div className="karte warnung" role="status">
          <p style={{ margin: 0, fontSize: 15 }}>Dein Zugang wird gerade vom Team freigeschaltet. Danach kannst du dem Assistenten Fragen stellen.</p>
        </div>
      )}

      <section className="karte">
        <p className="eyebrow">Dein Plan heute</p>
        {plan ? (
          <>
            <h2 className="display display-l" style={{ fontSize: 34 }}>{plan.name}</h2>
            <p className="leise klein" style={{ margin: 0 }}>{uebungen.length} Übungen · {uebungen.map((u) => u.uebungen?.name).filter(Boolean).join(', ')}</p>
          </>
        ) : (
          <>
            <h2 className="display display-l" style={{ fontSize: 34 }}>Bewegung zählt</h2>
            <p className="leise" style={{ margin: 0, fontSize: 15 }}>Noch kein Plan hinterlegt. Dein Trainer stellt ihn dir zusammen; bis dahin trag deine Einheiten einfach selbst ein.</p>
          </>
        )}
        <Link to="/fortschritt/neu" className="knopf primaer voll"><Icon name="plus" groesse={22} staerke={2} />Einheit eintragen</Link>
      </section>

      <div className="raster-3">
        <Kachel zahl={dieseWoche} label="Einheiten diese Woche" zu="/fortschritt" />
        <Kachel zahl={aktuell === null ? '–' : aktuell.toFixed(1).replace('.', ',')} label="Rücken­schmerz Ø 14 Tage" zu="/fortschritt"
          farbe={aktuell === null ? undefined : aktuell <= 3 ? 'var(--success)' : aktuell <= 6 ? 'var(--warning)' : 'var(--critical)'} />
        <Kachel zahl={trend === null ? '–' : `${trend > 0 ? '+' : ''}${trend.toFixed(1).replace('.', ',')}`} label={trend === null ? 'Trend, sobald genug Einträge da sind' : trend <= 0 ? 'Schmerz gesunken' : 'Schmerz gestiegen'}
          farbe={trend === null ? undefined : trend <= 0 ? 'var(--success)' : 'var(--critical)'} zu="/fortschritt" />
      </div>

      {antwort && (
        <Link to="/assistent" className="karte warnung" style={{ textDecoration: 'none', color: 'var(--text)' }}>
          <span className="label-klein" style={{ color: 'var(--warning)' }}>Antwort vom Team</span>
          <span style={{ fontSize: 15 }}>Zu deiner Frage „{antwort.frage.slice(0, 80)}{antwort.frage.length > 80 ? '…' : ''}“</span>
        </Link>
      )}

      <section className="stapel">
        <h2 className="untertitel" style={{ fontSize: 17 }}>Frag den Assistenten</h2>
        <Link to="/assistent" className="karte" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '8px 8px 8px 16px', textDecoration: 'none' }}>
          <span className="leise">Was möchtest du wissen?</span>
          <span className="knopf rund" style={{ background: 'var(--accent)', color: '#121212', border: 0, width: 40, height: 40 }}><Icon name="mikro" groesse={20} /></span>
        </Link>
        <div className="chips">
          {['Was hilft bei Nackenverspannung?', 'Was esse ich vor dem Training?'].map((f) => (
            <Link key={f} to={`/assistent?frage=${encodeURIComponent(f)}`} className="chip">{f}</Link>
          ))}
        </div>
      </section>
    </div>
  )
}
