// Livebild mit Skelett und Winkeln. Bild und Erkennung bleiben auf dem Gerät.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { erkenne, erkennungLaden, kameraStarten, kameraStoppen, lichtMoeglich, lichtSchalten, type Kamera } from '../lib/pose/erkennung'
import { GELENK, Glaetter, besteSeite, gelenkLinien, gelenkScheitel, gelenkwinkel, type GelenkId, type Punkt, type Seite } from '../lib/pose/geometrie'
import { Icon } from './Icon'
import { ausrichtung as berechneAusrichtung, type Ausrichtung } from '../lib/pose/ausrichtung'

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
  /** Hinweis zum Ausrichten (abgeschnitten, zu klein …); kommt auch, wenn pausiert. */
  beiAusrichtung?: (a: Ausrichtung | null) => void
}

type Status = { art: 'laedt' } | { art: 'laeuft' } | { art: 'fehler'; text: string }

export function KameraBuehne({ gelenke, fehler = [], beimBild, pausiert = false, beiAusrichtung }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const leinwand = useRef<HTMLCanvasElement>(null)
  const [richtung, setRichtung] = useState<Kamera>('environment')
  const [status, setStatus] = useState<Status>({ art: 'laedt' })
  const [langsam, setLangsam] = useState(false)
  const strom = useRef<MediaStream | null>(null)
  const [lichtGeht, setLichtGeht] = useState(false)
  const [licht, setLicht] = useState(false)

  // Aktuelle Props für die Schleife, ohne sie bei jeder Änderung neu zu starten
  const aktuell = useRef({ gelenke, fehler, beimBild, pausiert, beiAusrichtung })
  useLayoutEffect(() => { aktuell.current = { gelenke, fehler, beimBild, pausiert, beiAusrichtung } })

  useEffect(() => {
    let aus = false
    let schleife = 0
    let erkennung: PoseLandmarker | null = null
    const glaetter = new Glaetter()
    let seite: Seite | undefined
    let seiteGeprueft = 0
    let letzteVideozeit = -1
    // Ausrichtung erst melden, wenn sie einen Moment gleich bleibt (kein Flackern)
    let ausrichtungKandidat: string | null = null, ausrichtungSeit = 0, ausrichtungGemeldet: string | null = 'start'
    let ausrichtungJetzt: Ausrichtung | null = null
    const hinweis = window.setTimeout(() => setLangsam(true), 6000)

    async function start() {
      setStatus({ art: 'laedt' })
      try {
        const v = video.current as HTMLVideoElement
        const [e, st] = await Promise.all([erkennungLaden(), kameraStarten(v, richtung)])
        erkennung = e
        if (aus) { kameraStoppen(st); return }
        strom.current = st
        setLichtGeht(lichtMoeglich(st))
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
      const erkannt = erkenne(erkennung, v, jetzt)
      const lm = imAusschnitt(erkannt.punkte, B, H, c.clientWidth, c.clientHeight)
      // Ausrichtung: abgeschnitten, zu klein, zu groß? (bezogen auf den sichtbaren Ausschnitt)
      const [rx, ry] = randAnteile(B, H, c.clientWidth, c.clientHeight)
      const a = erkannt.punkte.length ? berechneAusrichtung(erkannt.punkte, rx, ry) : null
      const code = a?.code ?? null
      if (code !== ausrichtungKandidat) { ausrichtungKandidat = code; ausrichtungSeit = jetzt }
      if (code !== ausrichtungGemeldet && jetzt - ausrichtungSeit > 700) {
        ausrichtungGemeldet = code
        ausrichtungJetzt = a
        aktuell.current.beiAusrichtung?.(a)
      }
      if (c.width !== B || c.height !== H) { c.width = B; c.height = H }

      if (lm.length && (!seite || jetzt - seiteGeprueft > 1000)) {
        const neu = besteSeite(lm, seite)
        if (neu !== seite) glaetter.zuruecksetzen() // keine Mischwerte beider Seiten
        seite = neu
        seiteGeprueft = jetzt
      }
      const s = seite ?? 'links'
      // 3D-Weltpunkte: Winkel stimmen aus jeder Richtung (seitlich, schräg, frontal)
      const w = glaetter.glaette(gelenkwinkel(lm, s, B, H, erkannt.welt))
      zeichne(c, lm, w, s, richtung === 'user', aktuell.current.gelenke, aktuell.current.fehler)
      if (ausrichtungJetzt) zeichnePfeil(c, ausrichtungJetzt, richtung === 'user', jetzt)
      if (!aktuell.current.pausiert) aktuell.current.beimBild({ winkel: w, seite: s, zeit: jetzt, person: lm.length > 0 })
    }

    void start()
    return () => {
      aus = true
      window.clearTimeout(hinweis)
      cancelAnimationFrame(schleife)
      kameraStoppen(strom.current) // stoppt auch das Licht
      strom.current = null
      setLicht(false)
      setLichtGeht(false)
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
      {lichtGeht && (
        <button
          type="button"
          className={`buehne-knopf licht${licht ? ' an' : ''}`}
          aria-label={licht ? 'Licht ausschalten' : 'Licht einschalten'}
          aria-pressed={licht}
          onClick={() => {
            const neu = !licht
            lichtSchalten(strom.current, neu).then(() => setLicht(neu), () => setLichtGeht(false))
          }}
        >
          <Icon name="licht" groesse={20} />
        </button>
      )}
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

/** Anteil des Kamerabilds, der links/rechts bzw. oben/unten durch den Zuschnitt verdeckt ist. */
function randAnteile(B: number, H: number, fb: number, fh: number): [number, number] {
  if (!B || !H || !fb || !fh) return [0, 0]
  const massstab = Math.max(fb / B, fh / H)
  return [Math.max(0, (1 - fb / massstab / B) / 2), Math.max(0, (1 - fh / massstab / H) / 2)]
}

/** Großer, pulsierender Pfeil: dorthin soll der Körper im Bild. */
function zeichnePfeil(c: HTMLCanvasElement, a: Ausrichtung, spiegel: boolean, t: number) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const { width: B, height: H } = c
  const s = Math.max(B, H) / 640
  const dx = spiegel ? -a.pfeil.dx : a.pfeil.dx, dy = a.pfeil.dy
  const puls = 0.65 + 0.35 * Math.sin(t / 180)
  ctx.save()
  ctx.globalAlpha = puls
  ctx.fillStyle = '#f2a41c'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 3 * s
  const zeichne = (x: number, y: number, winkel: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(winkel)
    ctx.beginPath(); ctx.moveTo(34 * s, 0); ctx.lineTo(-18 * s, -32 * s); ctx.lineTo(-6 * s, 0); ctx.lineTo(-18 * s, 32 * s); ctx.closePath()
    ctx.fill(); ctx.stroke(); ctx.restore()
  }
  if (dx || dy) {
    // Pfeil am Rand, von dem weg der Körper soll, zeigt in die Bildmitte
    zeichne(B / 2 - dx * B * 0.34, H / 2 - dy * H * 0.36, Math.atan2(dy, dx))
  } else if (a.code === 'naeher' || a.code === 'weiter_weg') {
    // zwei Pfeile: nach innen (näher) bzw. nach außen (weiter weg)
    const aussen = a.code === 'naeher' ? Math.PI : 0 // näher: Pfeile nach außen, weiter weg: nach innen
    zeichne(B * 0.18, H / 2, aussen); zeichne(B * 0.82, H / 2, Math.PI - aussen)
  }
  ctx.restore()
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
    const rot = fehler.includes(g)
    ctx.strokeStyle = rot ? '#f87171' : '#f2a41c'
    ctx.lineWidth = 6 * s
    for (const pk of gelenkLinien(g, seite)) {
      if (!pk.every(sichtbar)) continue
      ctx.beginPath()
      pk.forEach((i, n) => (n === 0 ? ctx.moveTo(...xy(i)) : ctx.lineTo(...xy(i))))
      ctx.stroke()
    }
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
