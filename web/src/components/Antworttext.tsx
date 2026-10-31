// Antwort des Assistenten mit Absätzen, Listen und Fettdruck (ohne HTML).
import { useMemo } from 'react'
import { zerlege, type Inline } from '../lib/markdown'

function Zeile({ teile }: { teile: Inline[] }) {
  return <>{teile.map((t, i) => (t.fett ? <strong key={i}>{t.text}</strong> : <span key={i}>{t.text}</span>))}</>
}

export function Antworttext({ text }: { text: string }) {
  const bloecke = useMemo(() => zerlege(text), [text])
  return (
    <div className="antwort-text">
      {bloecke.map((b, i) =>
        b.art === 'absatz' ? (
          <p key={i}><Zeile teile={b.teile} /></p>
        ) : b.nummeriert ? (
          <ol key={i}>{b.punkte.map((p, j) => <li key={j}><Zeile teile={p} /></li>)}</ol>
        ) : (
          <ul key={i}>{b.punkte.map((p, j) => <li key={j}><Zeile teile={p} /></li>)}</ul>
        ),
      )}
    </div>
  )
}
