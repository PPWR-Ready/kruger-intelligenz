// Animierte Figur zur Übung im Stil anatomischer Trainings-Illustrationen:
// Körper mit Volumen und weicher Schattierung, die beanspruchten Muskeln rot hervorgehoben.
// Ablauf: in die Endposition, dort halten, langsam zurück. Abgeleitet aus den Kamera-Regeln.
import { useEffect, useId, useState } from 'react'
import type { Regeln } from '../lib/pose/regeln'
import { STEHEN, type FigurPose as Pose, type XY } from '../lib/pose/figur'
import { VORN_STEHEN, setzeVornWinkel, type VornPose } from '../lib/pose/figurVorn'
import type { GelenkId } from '../lib/pose/geometrie'

export type Muskel = 'oberschenkel' | 'gesaess' | 'schulter' | 'oberarm' | 'rumpf' | 'ruecken' | 'flanke' | 'nacken'

/** Welche Muskeln bei welchem Hauptgelenk hervorgehoben werden. */
export const MUSKELN: Record<GelenkId, Muskel[]> = {
  knie: ['oberschenkel', 'gesaess'], sprunggelenk: ['oberschenkel'], huefte: ['ruecken', 'gesaess'], rumpfneigung: ['ruecken', 'gesaess'],
  schulter: ['schulter', 'oberarm'], ellbogen: ['oberarm', 'schulter'], koerperlinie: ['rumpf', 'schulter'], kopfhaltung: ['rumpf'],
  seitneigung: ['flanke'], arme_seitlich: ['schulter', 'oberarm'], ellbogen_beide: ['oberarm'], beine_gespreizt: ['oberschenkel'], kopf_seitlich: ['nacken'],
}

interface FigurVorn { start: VornPose; ende: VornPose; muskeln: Muskel[] }
const vorn = (g: GelenkId, start: VornPose, wert: number): FigurVorn => ({ start, ende: setzeVornWinkel(start, g, wert), muskeln: MUSKELN[g] })
const ARME_HOCH = setzeVornWinkel(VORN_STEHEN, 'arme_seitlich', 165)
const FIGUREN_VORN: Partial<Record<GelenkId, FigurVorn>> = {
  seitneigung: vorn('seitneigung', ARME_HOCH, 30),
  arme_seitlich: vorn('arme_seitlich', VORN_STEHEN, 90),
  ellbogen_beide: vorn('ellbogen_beide', setzeVornWinkel(VORN_STEHEN, 'arme_seitlich', 90), 80),
  beine_gespreizt: vorn('beine_gespreizt', VORN_STEHEN, 40),
  kopf_seitlich: vorn('kopf_seitlich', VORN_STEHEN, 30),
}

function figurVornFuer(r: Regeln): FigurVorn {
  const g: GelenkId = r.modus === 'halten' ? (r.pruefungen[0]?.gelenk ?? 'seitneigung') : (r.zaehlen?.gelenk ?? 'seitneigung')
  if (r.figur_vorn) return { start: r.modus === 'halten' ? r.figur_vorn.ende : r.figur_vorn.start, ende: r.figur_vorn.ende, muskeln: MUSKELN[g] }
  return FIGUREN_VORN[g] ?? FIGUREN_VORN.seitneigung as FigurVorn
}

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
  // Im Editor erfasste Figur (Marionette oder vermessenes Foto/Video) hat Vorrang
  if (r.figur) {
    const g: GelenkId = r.modus === 'halten' ? (r.pruefungen[0]?.gelenk ?? 'koerperlinie') : (r.zaehlen?.gelenk ?? 'knie')
    return { start: r.modus === 'halten' ? r.figur.ende : r.figur.start, ende: r.figur.ende, muskeln: MUSKELN[g] }
  }
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
function mische<T extends object>(a: T, b: T, f: number): T {
  const A = a as Record<string, XY>, B = b as Record<string, XY>
  return Object.fromEntries(Object.keys(A).map((k) => [k, [A[k][0] + (B[k][0] - A[k][0]) * f, A[k][1] + (B[k][1] - A[k][1]) * f]])) as T
}
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

export function Mensch({ p, muskeln, id }: { p: Pose; muskeln: Muskel[]; id: string }) {
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

/** Dieselbe Figur von vorn: beide Körperseiten, Rumpf mit Taille. */
export function MenschVorn({ p, muskeln, id }: { p: VornPose; muskeln: Muskel[]; id: string }) {
  const haut = `url(#${id}-haut)`, muskel = `url(#${id}-muskel)`
  const an = (m: Muskel) => muskeln.includes(m)
  const f = (q: XY) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`
  const mitteS: XY = [(p.schulterL[0] + p.schulterR[0]) / 2, (p.schulterL[1] + p.schulterR[1]) / 2]
  const mitteH: XY = [(p.huefteL[0] + p.huefteR[0]) / 2, (p.huefteL[1] + p.huefteR[1]) / 2]
  // Taille: zwischen Hüfte und Schulter, etwas nach innen gezogen
  const taille = (s: XY, h: XY): XY => { const q = auf(h, s, 0.45); return [q[0] + (mitteH[0] + (mitteS[0] - mitteH[0]) * 0.45 - q[0]) * 0.18, q[1]] }
  const tL = taille(p.schulterL, p.huefteL), tR = taille(p.schulterR, p.huefteR)
  const rumpf = `M ${f(p.schulterR)} L ${f(p.schulterL)} Q ${f(tL)} ${f(tL)} L ${f(p.huefteL)} L ${f(p.huefteR)} Q ${f(tR)} ${f(tR)} Z`
  const bein = (h: XY, k: XY, fu: XY, aussen: number) => (
    <g>
      <path d={kapsel(h, k, 5.6, 4.3)} fill={haut} />
      <path d={kapsel(k, fu, 4.2, 2.8)} fill={haut} />
      <path d={kapsel(fu, [fu[0] + aussen * 2.6, fu[1] + 1.4], 2.7, 2)} fill={haut} />
      {an('oberschenkel') && <path d={kapsel(auf(h, k, 0.15), auf(h, k, 0.85), 3.9, 2.9)} fill={muskel} />}
    </g>
  )
  const arm = (s: XY, e: XY, h: XY) => (
    <g>
      <path d={kapsel(s, e, 3.8, 3)} fill={haut} />
      <path d={kapsel(e, h, 2.9, 2.1)} fill={haut} />
      <circle cx={h[0]} cy={h[1]} r={2.4} fill={haut} />
      {an('oberarm') && <path d={kapsel(auf(s, e, 0.25), auf(s, e, 0.85), 2.6, 2)} fill={muskel} />}
      {an('schulter') && <circle cx={s[0]} cy={s[1]} r={4.2} fill={muskel} />}
    </g>
  )
  const hals = auf(mitteS, p.kopf, 0.4)
  return (
    <g>
      {bein(p.huefteR, p.knieR, p.fussR, -1)}
      {bein(p.huefteL, p.knieL, p.fussL, 1)}
      <path d={kapsel(p.huefteR, p.huefteL, 5.8, 5.8)} fill={haut} />
      <path d={rumpf} fill={haut} stroke={haut} strokeWidth={6.5} strokeLinejoin="round" />
      {an('rumpf') && <path d={kapsel(auf(mitteH, mitteS, 0.12), auf(mitteH, mitteS, 0.75), 3, 3.4)} fill={muskel} />}
      {an('flanke') && <>
        <path d={kapsel(auf(p.huefteL, p.schulterL, 0.12, -2.4), auf(p.huefteL, p.schulterL, 0.7, -2.4), 2.3, 2.7)} fill={muskel} />
        <path d={kapsel(auf(p.huefteR, p.schulterR, 0.12, 2.4), auf(p.huefteR, p.schulterR, 0.7, 2.4), 2.3, 2.7)} fill={muskel} />
      </>}
      {!an('rumpf') && <path d={kapsel(auf(mitteH, mitteS, 0.2), auf(mitteH, mitteS, 0.62), 2.2, 2.8)} fill="rgba(0,0,0,0.045)" />}
      <path d={kapsel(hals, mitteS, 2.6, 3.4)} fill={haut} />
      {an('nacken') && <>
        <path d={kapsel(hals, p.schulterL, 2, 2.4)} fill={muskel} />
        <path d={kapsel(hals, p.schulterR, 2, 2.4)} fill={muskel} />
      </>}
      {arm(p.schulterR, p.ellbogenR, p.handR)}
      {arm(p.schulterL, p.ellbogenL, p.handL)}
      <circle cx={p.kopf[0]} cy={p.kopf[1]} r={6.2} fill={haut} />
    </g>
  )
}

/** Quadratischer Ausschnitt, der Start- und Endpose mit Rand umschließt – die Figur füllt das Bild. */
function ausschnitt(a: object, b: object): string {
  const pts = [...Object.values(a), ...Object.values(b)] as XY[]
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const x0 = Math.min(...xs) - 9, x1 = Math.max(...xs) + 9, y0 = Math.min(...ys) - 9, y1 = Math.max(...ys) + 7
  const g = Math.max(x1 - x0, y1 - y0)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return `${(cx - g / 2).toFixed(1)} ${(cy - g / 2).toFixed(1)} ${g.toFixed(1)} ${g.toFixed(1)}`
}

export function UebungsBild({ regeln, groesse = 104 }: { regeln: Regeln | null; groesse?: number }) {
  if (regeln?.ansicht === 'frontal') return <UebungsBildVorn regeln={regeln} groesse={groesse} />
  return <UebungsBildSeite regeln={regeln} groesse={groesse} />
}

/** Bewegungsablauf in Sekunden seit dem Einblenden (bei reduzierter Bewegung: Endposition). */
function useZeit(): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setT(2); return }
    let rahmen = 0
    const beginn = performance.now()
    const lauf = () => { setT((performance.now() - beginn) / 1000); rahmen = requestAnimationFrame(lauf) }
    rahmen = requestAnimationFrame(lauf)
    return () => cancelAnimationFrame(rahmen)
  }, [])
  return t
}

function UebungsBildVorn({ regeln, groesse }: { regeln: Regeln; groesse: number }) {
  const { start, ende, muskeln } = figurVornFuer(regeln)
  const id = useId().replace(/:/g, '')
  const p = mische(start, ende, anteil(useZeit()))
  const boden = Math.max(p.fussL[1], p.fussR[1]) + 3
  return (
    <svg viewBox={ausschnitt(start, ende)} width={groesse} height={groesse} className="uebungs-bild" aria-hidden="true">
      <FigurDefs id={id} />
      <ellipse cx={(p.fussL[0] + p.fussR[0]) / 2} cy={boden} rx={16} ry={3.2} fill={`url(#${id}-schatten)`} />
      <g filter={`url(#${id}-tiefe)`}><MenschVorn p={p} muskeln={muskeln} id={id} /></g>
    </svg>
  )
}

function UebungsBildSeite({ regeln, groesse }: { regeln: Regeln | null; groesse: number }) {
  const { start, ende, muskeln } = figurFuer(regeln)
  const id = useId().replace(/:/g, '')
  const p = mische(start, ende, anteil(useZeit()))
  const boden = Math.max(p.fuss[1], p.zeh[1], p.hand[1], p.ellbogen[1]) + 3

  return (
    <svg viewBox={ausschnitt(start, ende)} width={groesse} height={groesse} className="uebungs-bild" aria-hidden="true">
      <FigurDefs id={id} />
      <ellipse cx={(p.fuss[0] + p.zeh[0]) / 2 + (start === ende ? -12 : 0)} cy={boden} rx={start === ende ? 40 : 18} ry={3.2} fill={`url(#${id}-schatten)`} />
      <g filter={`url(#${id}-tiefe)`}><Mensch p={p} muskeln={muskeln} id={id} /></g>
    </svg>
  )
}

/** Farbverläufe und Schatten für <Mensch>; einmal je SVG einbinden. */
export function FigurDefs({ id }: { id: string }) {
  return (
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
  )
}
