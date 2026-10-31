// Livebild mit Skelett und Winkeln. Bild und Erkennung bleiben auf dem Gerät.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { erkenne, erkennungLaden, kameraStarten, kameraStoppen, type Kamera } from '../lib/pose/erkennung'
import { GELENK, Glaetter, besteSeite, gelenkPunkte, gelenkScheitel, gelenkwinkel, type GelenkId, type Punkt, type Seite } from '../lib/pose/geometrie'
import { Icon } from './Icon'

/** Verbindungen des Skeletts ohne Gesicht (Punkte 0–10). */
const KNOCHEN: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
]

export interface Bild {
  winkel: Record<GelenkId, number | null>
  seite: Seite
  zeit: number
  person: boolean
}

interface Props {
  /** Diese Gelenke bekommen Winkel-Beschriftung und Hervorhebung. */
  gelenke: GelenkId[]
  /** Gelenke mit aktuellem Fehler (rot). */
  fehler?: GelenkId[]
  beimBild: (b: Bild) => void
  /** Bild anhalten (z. B. nach Satzende), Kamera läuft weiter. */
  pausiert?: boolean
}

type Status = { art: 'laedt' } | { art: 'laeuft' } | { art: 'fehler'; text: string }

export function KameraBuehne({ gelenke, fehler = [], beimBild, pausiert = false }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const leinwand = useRef<HTMLCanvasElement>(null)
  const [richtung, setRichtung] = useState<Kamera>('environment')
  const [status, setStatus] = useState<Status>({ art: 'laedt' })
  const [langsam, setLangsam] = useState(false)

  // Aktuelle Props für die Schleife, ohne sie bei jeder Änderung neu zu starten
  const aktuell = useRef({ gelenke, fehler, beimBild, pausiert })
  useLayoutEffect(() => { aktuell.current = { gelenke, fehler, beimBild, pausiert } })

  useEffect(() => {
    let aus = false
    let strom: MediaStream | null = null
    let schleife = 0
    let erkennung: PoseLandmarker | null = null
    const glaetter = new Glaetter()
    let seite: Seite | undefined
    let seiteGeprueft = 0
    let letzteVideozeit = -1
    const hinweis = window.setTimeout(() => setLangsam(true), 6000)

    async function start() {
      setStatus({ art: 'laedt' })
      try {
        const v = video.current as HTMLVideoElement
        ;[erkennung, strom] = await Promise.all([erkennungLaden(), kameraStarten(v, richtung)])
        if (aus) { kameraStoppen(strom); return }
        setStatus({ art: 'laeuft' })
        schleife = requestAnimationFrame(bild)
      } catch (e) {
        if (!aus) setStatus({ art: 'fehler', text: e instanceof Error ? e.message : 'Die Kamera konnte nicht gestartet werden.' })
      }
    }

    function bild() {
      if (aus) return
      schleife = requestAnimationFrame(bild)
      const v = video.current, c = leinwand.current
      if (!v || !c || !erkennung || v.readyState < 2 || v.currentTime === letzteVideozeit) return
      letzteVideozeit = v.currentTime
      const jetzt = performance.now()
      const B = v.videoWidth, H = v.videoHeight
      // Das Bild wird auf die 3:4-Fläche zugeschnitten (object-fit: cover). Punkte außerhalb
      // des sichtbaren Ausschnitts gelten als nicht sichtbar – sonst würde die App mit
      // Körperteilen rechnen, die man selbst nicht sieht, und nie „Bitte ganz ins Bild“ sagen.
      const lm = imAusschnitt(erkenne(erkennung, v, jetzt), B, H, c.clientWidth, c.clientHeight)
      if (c.width !== B || c.height !== H) { c.width = B; c.height = H }

      if (lm.length && (!seite || jetzt - seiteGeprueft > 1000)) {
        const neu = besteSeite(lm, seite)
        if (neu !== seite) glaetter.zuruecksetzen() // keine Mischwerte beider Seiten
        seite = neu
        seiteGeprueft = jetzt
      }
      const s = seite ?? 'links'
      const w = glaetter.glaette(gelenkwinkel(lm, s, B, H))
      zeichne(c, lm, w, s, richtung === 'user', aktuell.current.gelenke, aktuell.current.fehler)
      if (!aktuell.current.pausiert) aktuell.current.beimBild({ winkel: w, seite: s, zeit: jetzt, person: lm.length > 0 })
    }

    void start()
    return () => {
      aus = true
      window.clearTimeout(hinweis)
      cancelAnimationFrame(schleife)
      kameraStoppen(strom)
    }
  }, [richtung])

  return (
    <div className="buehne">
      <video ref={video} className={richtung === 'user' ? 'gespiegelt' : undefined} playsInline muted aria-label="Livebild der Kamera" />
      <canvas ref={leinwand} aria-hidden="true" />
      {status.art === 'laedt' && (
        <div className="buehne-hinweis">
          <span>Kamera und Erkennung starten …</span>
          {langsam && <span className="klein leise">Beim ersten Mal wird die Erkennung geladen (ca. 25 MB). Danach geht es schneller.</span>}
        </div>
      )}
      {status.art === 'fehler' && <div className="buehne-hinweis fehler" role="alert">{status.text}</div>}
      <button
        type="button"
        className="buehne-knopf"
        aria-label={richtung === 'environment' ? 'Zur Frontkamera wechseln' : 'Zur Rückkamera wechseln'}
        onClick={() => setRichtung((r) => (r === 'environment' ? 'user' : 'environment'))}
      >
        <Icon name="kamera" groesse={20} />
      </button>
    </div>
  )
}

/** Setzt die Sichtbarkeit von Punkten außerhalb des zugeschnittenen Ausschnitts auf 0. */
function imAusschnitt(lm: Punkt[], B: number, H: number, fb: number, fh: number): Punkt[] {
  if (!lm.length || !B || !H || !fb || !fh) return lm
  const massstab = Math.max(fb / B, fh / H)
  const rx = (1 - fb / massstab / B) / 2, ry = (1 - fh / massstab / H) / 2
  if (rx <= 0.001 && ry <= 0.001) return lm
  const rand = 0.01 // kleiner Puffer, damit Punkte direkt am Rand nicht flackern
  return lm.map((q) => (q.x < rx - rand || q.x > 1 - rx + rand || q.y < ry - rand || q.y > 1 - ry + rand ? { ...q, visibility: 0 } : q))
}

function zeichne(
  c: HTMLCanvasElement, lm: Punkt[], w: Record<GelenkId, number | null>, seite: Seite,
  spiegel: boolean, gelenke: GelenkId[], fehler: GelenkId[],
) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const B = c.width, H = c.height
  ctx.clearRect(0, 0, B, H)
  if (!lm.length) return
  const s = Math.max(B, H) / 640 // Strichstärke unabhängig von der Auflösung
  const xy = (i: number): [number, number] => [(spiegel ? 1 - lm[i].x : lm[i].x) * B, lm[i].y * H]
  const sichtbar = (i: number) => (lm[i]?.visibility ?? 0) > 0.5

  // Grundskelett
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 3 * s
  for (const [a, b] of KNOCHEN) {
    if (!sichtbar(a) || !sichtbar(b)) continue
    ctx.beginPath(); ctx.moveTo(...xy(a)); ctx.lineTo(...xy(b)); ctx.stroke()
  }

  // Ausgewertete Gelenke hervorheben
  for (const g of gelenke) {
    const pk = gelenkPunkte(g, seite)
    if (!pk.every(sichtbar)) continue
    const rot = fehler.includes(g)
    ctx.strokeStyle = rot ? '#f87171' : '#f2a41c'
    ctx.lineWidth = 6 * s
    ctx.beginPath()
    pk.forEach((i, n) => (n === 0 ? ctx.moveTo(...xy(i)) : ctx.lineTo(...xy(i))))
    ctx.stroke()
  }

  // Gelenkpunkte
  for (let i = 11; i < 33; i++) {
    if (!sichtbar(i)) continue
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(...xy(i), 4 * s, 0, Math.PI * 2); ctx.fill()
  }

  // Winkel-Beschriftungen
  ctx.font = `600 ${15 * s}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  for (const g of gelenke) {
    const wert = w[g]
    if (wert === null) continue
    const [x, y] = xy(gelenkScheitel(g, seite))
    const text = `${GELENK[g].name} ${Math.round(wert)}°`
    const breite = ctx.measureText(text).width + 14 * s
    const hoehe = 24 * s
    const rx = Math.min(B - breite - 4, x + 12 * s), ry = Math.max(4, y - hoehe / 2)
    ctx.fillStyle = fehler.includes(g) ? 'rgba(248,113,113,0.92)' : 'rgba(18,18,18,0.82)'
    ctx.beginPath(); ctx.roundRect(rx, ry, breite, hoehe, 6 * s); ctx.fill()
    ctx.fillStyle = fehler.includes(g) ? '#121212' : '#ffffff'
    ctx.fillText(text, rx + 7 * s, ry + hoehe / 2)
  }
}
