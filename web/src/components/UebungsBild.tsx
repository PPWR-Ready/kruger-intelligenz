// Animierte Figur zur Übung im Stil anatomischer Trainings-Illustrationen:
// Körper mit Volumen und weicher Schattierung, die beanspruchten Muskeln rot hervorgehoben.
// Ablauf: in die Endposition, dort halten, langsam zurück. Abgeleitet aus den Kamera-Regeln.
import { useEffect, useId, useState } from 'react'
import type { Regeln } from '../lib/pose/regeln'

type XY = [number, number]
interface Pose { fuss: XY; knie: XY; huefte: XY; schulter: XY; kopf: XY; ellbogen: XY; hand: XY; zeh: XY }
type Muskel = 'oberschenkel' | 'gesaess' | 'schulter' | 'oberarm' | 'rumpf' | 'ruecken'

const STEHEN: Pose = { fuss: [50, 92], knie: [50, 72], huefte: [50, 52], schulter: [50, 30], kopf: [50, 17], ellbogen: [50, 42], hand: [51, 53], zeh: [59, 93] }

interface Figur { start: Pose; ende: Pose; muskeln: Muskel[] }
const FIGUREN: Record<string, Figur> = {
  knie: {
    start: STEHEN,
    ende: { fuss: [50, 92], knie: [65, 77], huefte: [38, 68], schulter: [52, 45], kopf: [57, 33], ellbogen: [63, 47], hand: [76, 46], zeh: [59, 93] },
    muskeln: ['oberschenkel', 'gesaess'],
  },
  huefte: {
    start: STEHEN,
    ende: { fuss: [50, 92], knie: [52, 72], huefte: [45, 54], schulter: [70, 44], kopf: [81, 40], ellbogen: [71, 56], hand: [72, 67], zeh: [59, 93] },
    muskeln: ['ruecken', 'gesaess'],
  },
  schulter: {
    start: { ...STEHEN, ellbogen: [59, 38], hand: [56, 26] },
    ende: { ...STEHEN, ellbogen: [53, 17], hand: [53, 5] },
    muskeln: ['schulter', 'oberarm'],
  },
  koerperlinie: {
    start: { fuss: [88, 87], knie: [72, 84], huefte: [55, 80], schulter: [31, 74], kopf: [19, 70], ellbogen: [31, 89], hand: [45, 90], zeh: [94, 91] },
    ende: { fuss: [88, 87], knie: [72, 84], huefte: [55, 79], schulter: [31, 74], kopf: [19, 70], ellbogen: [31, 89], hand: [45, 90], zeh: [94, 91] },
    muskeln: ['rumpf', 'schulter'],
  },
}
FIGUREN.ellbogen = { ...FIGUREN.schulter, muskeln: ['oberarm', 'schulter'] }
FIGUREN.sprunggelenk = FIGUREN.knie
FIGUREN.rumpfneigung = FIGUREN.huefte
FIGUREN.kopfhaltung = FIGUREN.koerperlinie

function figurFuer(r: Regeln | null): Figur {
  if (!r) return FIGUREN.knie
  if (r.modus === 'halten') return FIGUREN[r.pruefungen[0]?.gelenk ?? 'koerperlinie'] ?? FIGUREN.koerperlinie
  return FIGUREN[r.zaehlen?.gelenk ?? 'knie'] ?? FIGUREN.knie
}

// --- Zeichnen ---------------------------------------------------------------

const sanft = (x: number) => x * x * (3 - 2 * x)
/** Bewegung über 6 s: hin (0–1,2 s), halten (bis 4,2 s), zurück (bis 5,1 s), Pause. */
function anteil(t: number): number {
  const s = t % 6
  if (s < 1.2) return sanft(s / 1.2)
  if (s < 4.2) return 1
  if (s < 5.1) return 1 - sanft((s - 4.2) / 0.9)
  return 0
}
const mische = (a: Pose, b: Pose, f: number): Pose =>
  Object.fromEntries((Object.keys(a) as (keyof Pose)[]).map((k) => [k, [a[k][0] + (b[k][0] - a[k][0]) * f, a[k][1] + (b[k][1] - a[k][1]) * f]])) as unknown as Pose
const verschiebe = (p: XY, dx: number, dy: number): XY => [p[0] + dx, p[1] + dy]

/** Glied als „Kapsel“: Trapez zwischen zwei Kreisen mit Radius ra/rb (ohne Bogen-Fallstricke). */
function kapsel(a: XY, b: XY, ra: number, rb: number): string {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 0.001
  const nx = -dy / l, ny = dx / l
  const f = (n: number) => n.toFixed(2)
  const kreis = (q: XY, r: number) => `M ${f(q[0] - r)} ${f(q[1])} a ${r} ${r} 0 1 0 ${f(2 * r)} 0 a ${r} ${r} 0 1 0 ${f(-2 * r)} 0 Z`
  return `M ${f(a[0] + nx * ra)} ${f(a[1] + ny * ra)} L ${f(b[0] + nx * rb)} ${f(b[1] + ny * rb)} L ${f(b[0] - nx * rb)} ${f(b[1] - ny * rb)} L ${f(a[0] - nx * ra)} ${f(a[1] - ny * ra)} Z ${kreis(a, ra)} ${kreis(b, rb)}`
}
/** Punkt auf der Strecke a→b (0…1), seitlich um `seite` versetzt. */
function auf(a: XY, b: XY, t: number, seite = 0): XY {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 0.001
  return [a[0] + dx * t - (dy / l) * seite, a[1] + dy * t + (dx / l) * seite]
}

function Mensch({ p, muskeln, id }: { p: Pose; muskeln: Muskel[]; id: string }) {
  const haut = `url(#${id}-haut)`, hautHinten = `url(#${id}-hinten)`, muskel = `url(#${id}-muskel)`
  const an = (m: Muskel) => muskeln.includes(m)
  // Hinteres Bein und hinterer Arm leicht versetzt und dunkler
  const h = (q: XY) => verschiebe(q, 2.6, -1.2)
  const bein = (q: Pose, fill: string, vorn: boolean) => (
    <g>
      <path d={kapsel(q.huefte, q.knie, 6.4, 4.6)} fill={fill} />
      <path d={kapsel(q.knie, q.fuss, 4.5, 2.9)} fill={fill} />
      <path d={kapsel(q.fuss, q.zeh, 2.9, 1.9)} fill={fill} />
      {vorn && an('oberschenkel') && <path d={kapsel(auf(q.huefte, q.knie, 0.18, 1.2), auf(q.huefte, q.knie, 0.86, 1), 4.6, 3.1)} fill={muskel} />}
      {vorn && <path d={kapsel(auf(q.knie, q.fuss, 0.15, -1.3), auf(q.knie, q.fuss, 0.55, -0.9), 3.2, 2.1)} fill={an('oberschenkel') ? muskel : 'rgba(0,0,0,0.05)'} opacity={an('oberschenkel') ? 0.55 : 1} />}
    </g>
  )
  const arm = (q: Pose, fill: string, vorn: boolean) => (
    <g>
      <path d={kapsel(q.schulter, q.ellbogen, 4.2, 3.2)} fill={fill} />
      <path d={kapsel(q.ellbogen, q.hand, 3.1, 2.2)} fill={fill} />
      <circle cx={q.hand[0]} cy={q.hand[1]} r={2.5} fill={fill} />
      {vorn && an('oberarm') && <path d={kapsel(auf(q.schulter, q.ellbogen, 0.25), auf(q.schulter, q.ellbogen, 0.85), 2.8, 2.2)} fill={muskel} />}
      {vorn && an('schulter') && <circle cx={q.schulter[0]} cy={q.schulter[1]} r={4.6} fill={muskel} />}
    </g>
  )
  const hinten: Pose = { ...p, huefte: h(p.huefte), knie: h(p.knie), fuss: h(p.fuss), zeh: h(p.zeh), schulter: h(p.schulter), ellbogen: h(p.ellbogen), hand: h(p.hand) }
  const brust = auf(p.huefte, p.schulter, 0.72, -2.2)
  const bauch = auf(p.huefte, p.schulter, 0.32, -1.6)
  const nacken = auf(p.schulter, p.kopf, 0.45)
  return (
    <g>
      {bein(hinten, hautHinten, false)}
      {arm(hinten, hautHinten, false)}
      {/* Rumpf: Becken, Taille, Brustkorb */}
      <path d={kapsel(p.huefte, brust, 7.4, 8.4)} fill={haut} />
      <path d={kapsel(nacken, p.schulter, 2.6, 4)} fill={haut} />
      {an('gesaess') && <circle cx={auf(p.huefte, p.schulter, 0.05, 2.8)[0]} cy={auf(p.huefte, p.schulter, 0.05, 2.8)[1]} r={5.2} fill={muskel} />}
      {an('rumpf') && <path d={kapsel(auf(p.huefte, p.schulter, 0.12, -3.6), auf(p.huefte, p.schulter, 0.78, -4), 3, 3.4)} fill={muskel} />}
      {an('ruecken') && <path d={kapsel(auf(p.huefte, p.schulter, 0.15, 3.8), auf(p.huefte, p.schulter, 0.85, 4.2), 2.8, 3.6)} fill={muskel} />}
      {/* Andeutung von Brust- und Bauchmuskeln */}
      {!an('rumpf') && <path d={kapsel(bauch, brust, 2.2, 3)} fill="rgba(0,0,0,0.045)" transform={`translate(${(brust[0] - p.schulter[0]) * 0.15} 0)`} />}
      {bein(p, haut, true)}
      <circle cx={p.kopf[0]} cy={p.kopf[1]} r={6.6} fill={haut} />
      {arm(p, haut, true)}
    </g>
  )
}

/** Quadratischer Ausschnitt, der Start- und Endpose mit Rand umschließt – die Figur füllt das Bild. */
function ausschnitt(a: Pose, b: Pose): string {
  const pts = [...Object.values(a), ...Object.values(b)] as XY[]
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const x0 = Math.min(...xs) - 9, x1 = Math.max(...xs) + 9, y0 = Math.min(...ys) - 9, y1 = Math.max(...ys) + 7
  const g = Math.max(x1 - x0, y1 - y0)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return `${(cx - g / 2).toFixed(1)} ${(cy - g / 2).toFixed(1)} ${g.toFixed(1)} ${g.toFixed(1)}`
}

export function UebungsBild({ regeln, groesse = 104 }: { regeln: Regeln | null; groesse?: number }) {
  const { start, ende, muskeln } = figurFuer(regeln)
  const id = useId().replace(/:/g, '')
  const [t, setT] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setT(2); return }
    let rahmen = 0
    const beginn = performance.now()
    const lauf = () => { setT((performance.now() - beginn) / 1000); rahmen = requestAnimationFrame(lauf) }
    rahmen = requestAnimationFrame(lauf)
    return () => cancelAnimationFrame(rahmen)
  }, [])
  const p = mische(start, ende, anteil(t))
  const boden = Math.max(p.fuss[1], p.zeh[1], p.hand[1], p.ellbogen[1]) + 3

  return (
    <svg viewBox={ausschnitt(start, ende)} width={groesse} height={groesse} className="uebungs-bild" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-haut`} gradientUnits="userSpaceOnUse" x1="20" y1="5" x2="85" y2="95">
          <stop offset="0" stopColor="#f7f4f0" />
          <stop offset="0.5" stopColor="#d6d0c7" />
          <stop offset="1" stopColor="#a49b8f" />
        </linearGradient>
        <linearGradient id={`${id}-hinten`} gradientUnits="userSpaceOnUse" x1="20" y1="5" x2="85" y2="95">
          <stop offset="0" stopColor="#c9c2b8" />
          <stop offset="1" stopColor="#8c8378" />
        </linearGradient>
        <linearGradient id={`${id}-muskel`} gradientUnits="userSpaceOnUse" x1="25" y1="10" x2="80" y2="95">
          <stop offset="0" stopColor="#f06a4a" />
          <stop offset="1" stopColor="#b8321d" />
        </linearGradient>
        <filter id={`${id}-tiefe`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.6" dy="0.9" stdDeviation="0.7" floodColor="#5a4a38" floodOpacity="0.35" />
        </filter>
        <radialGradient id={`${id}-schatten`}>
          <stop offset="0" stopColor="rgba(60,45,30,0.28)" />
          <stop offset="1" stopColor="rgba(60,45,30,0)" />
        </radialGradient>
      </defs>
      <ellipse cx={(p.fuss[0] + p.zeh[0]) / 2 + (start === ende ? -12 : 0)} cy={boden} rx={start === ende ? 40 : 18} ry={3.2} fill={`url(#${id}-schatten)`} />
      <g filter={`url(#${id}-tiefe)`}><Mensch p={p} muskeln={muskeln} id={id} /></g>
    </svg>
  )
}
