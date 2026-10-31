// Kleine wiederverwendbare Bausteine.
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'

export function Schritte({ aktuell, gesamt = 5 }: { aktuell: number; gesamt?: number }) {
  return (
    <div className="stapel" style={{ gap: 10 }}>
      <div className="schritte" style={{ gridTemplateColumns: `repeat(${gesamt}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length: gesamt }, (_, i) => (
          <span key={i} className={i < aktuell ? 'an' : ''} />
        ))}
      </div>
      <p className="klein leise" style={{ margin: 0 }}>Schritt {aktuell} von {gesamt}</p>
    </div>
  )
}

export function Schalter({ an, beiAenderung, titel, text }: { an: boolean; beiAenderung: (an: boolean) => void; titel: string; text?: string }) {
  return (
    <label className="schalter">
      <span className="schalter-text">
        <span style={{ fontSize: 16, fontWeight: 600 }}>{titel}</span>
        {text && <span className="klein leise">{text}</span>}
      </span>
      <input type="checkbox" role="switch" checked={an} onChange={(e) => beiAenderung(e.target.checked)} />
      <span className="spur" aria-hidden="true" />
    </label>
  )
}

export function Kachel({ zahl, label, farbe, zu }: { zahl: ReactNode; label: string; farbe?: string; zu?: string }) {
  const inhalt = (
    <>
      <span className="kachel-zahl" style={farbe ? { color: farbe } : undefined}>{zahl}</span>
      <span className="kachel-label">{label}</span>
    </>
  )
  return zu ? <Link to={zu} className="kachel">{inhalt}</Link> : <div className="kachel">{inhalt}</div>
}

export function Zurueck({ zu, label = 'Zurück' }: { zu: string; label?: string }) {
  return (
    <Link to={zu} className="knopf rund" aria-label={label} style={{ background: 'var(--surface)' }}>
      <Icon name="zurueck" groesse={22} staerke={2} />
    </Link>
  )
}

export function Laden({ text = 'Lädt …' }: { text?: string }) {
  return <p className="leise" role="status" style={{ padding: 24, textAlign: 'center' }}>{text}</p>
}

export function Fehler({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="fehlertext" role="alert">{text}</p>
}

/** Kurze Bestätigung am unteren Rand, verschwindet von selbst. */
export function useMitteilung(): [ReactNode, (text: string) => void] {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    const t = setTimeout(() => setText(null), 2800)
    return () => clearTimeout(t)
  }, [text])
  return [text ? <div className="mitteilung" role="status">{text}</div> : null, setText]
}

/** Befindens-Skala 0–10: große Tasten, Farbe von Limette über Gelb zu Rot. */
export function Skala({ wert, beiWahl }: { wert: number | null; beiWahl: (w: number) => void }) {
  const farbe = (i: number) => (i <= 3 ? 'var(--success)' : i <= 6 ? 'var(--warning)' : 'var(--critical)')
  return (
    <div className="stapel">
      <div className="skala" role="radiogroup" aria-label="Rückenschmerz von 0 bis 10">
        {Array.from({ length: 11 }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={wert === i} style={{ background: farbe(i) }} onClick={() => beiWahl(i)}
            aria-label={i === 0 ? '0, kein Schmerz' : i === 10 ? '10, sehr stark' : String(i)}>
            {i}
          </button>
        ))}
      </div>
      <div className="reihe zwischen klein leise"><span>0 = kein Schmerz</span><span>10 = sehr stark</span></div>
    </div>
  )
}

/** Linienverlauf für Wochenwerte (0–10), leere Wochen werden übersprungen. */
export function Verlauf({ werte, beschriftung, farbe = 'var(--success)' }: { werte: (number | null)[]; beschriftung: string; farbe?: string }) {
  const b = 320, h = 120, rand = 8
  const x = (i: number) => rand + (i * (b - 2 * rand)) / Math.max(1, werte.length - 1)
  const y = (w: number) => h - rand - (w / 10) * (h - 2 * rand)
  const punkte = werte.map((w, i) => (w === null ? null : [x(i), y(w)] as const)).filter((p): p is readonly [number, number] => p !== null)
  const pfad = punkte.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  const letzter = punkte[punkte.length - 1]
  return (
    <svg viewBox={`0 0 ${b} ${h}`} width="100%" height={h} role="img" aria-label={beschriftung} preserveAspectRatio="none">
      {[0, 5, 10].map((g) => <line key={g} x1={0} x2={b} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={1} />)}
      {punkte.length > 1 && <path d={pfad} fill="none" stroke={farbe} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      {letzter && <circle cx={letzter[0]} cy={letzter[1]} r={5} fill={farbe} />}
    </svg>
  )
}

/** Laden hat nicht geklappt: klar sagen statt leere Liste zeigen. */
export function Ladefehler({ text, erneut }: { text: string; erneut: () => void }) {
  return (
    <div className="karte kritisch" role="alert">
      <span>Das konnte gerade nicht geladen werden. {text}</span>
      <button className="knopf klein" style={{ alignSelf: 'flex-start' }} onClick={erneut}>Erneut laden</button>
    </div>
  )
}

/** Warnt beim Schließen oder Neuladen des Tabs, solange etwas nicht gespeichert ist. */
export function useUngespeichertWarnung(aktiv: boolean) {
  useEffect(() => {
    if (!aktiv) return
    const warnen = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [aktiv])
}

/** Fragt nach, bevor ein Klick ungespeicherte Änderungen verwirft. */
export const verlassenOk = (geaendert: boolean) => !geaendert || confirm('Deine Änderungen sind noch nicht gespeichert. Trotzdem verlassen?')
