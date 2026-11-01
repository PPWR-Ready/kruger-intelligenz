// Animierte Strichfigur zur Übung: zeigt die Bewegung in die Endposition, das Halten
// (Ring läuft herunter) und das Lösen. Die Figur wird aus den Kamera-Regeln abgeleitet.
import { useMemo } from 'react'
import type { Regeln } from '../lib/pose/regeln'

type XY = [number, number]
interface Pose { fuss: XY; knie: XY; huefte: XY; schulter: XY; kopf: XY; ellbogen: XY; hand: XY; zeh: XY }

const STEHEN: Pose = { fuss: [50, 92], knie: [50, 72], huefte: [50, 52], schulter: [50, 29], kopf: [50, 18], ellbogen: [50, 41], hand: [51, 53], zeh: [58, 92] }

const POSEN: Record<string, { start: Pose; ende: Pose; boden?: boolean; gelenk: keyof Pose }> = {
  // Kniebeuge: tief in die Hocke, Arme nach vorn
  knie: {
    start: STEHEN,
    ende: { fuss: [50, 92], knie: [65, 77], huefte: [38, 67], schulter: [52, 44], kopf: [57, 33], ellbogen: [64, 46], hand: [77, 45], zeh: [58, 92] },
    gelenk: 'knie',
  },
  // Hüfte beugen: Oberkörper nach vorn
  huefte: {
    start: STEHEN,
    ende: { fuss: [50, 92], knie: [52, 72], huefte: [44, 54], schulter: [70, 43], kopf: [80, 39], ellbogen: [71, 56], hand: [72, 68], zeh: [58, 92] },
    gelenk: 'huefte',
  },
  // Schulter/Ellbogen: Arme von Schulterhöhe nach oben
  schulter: {
    start: { ...STEHEN, ellbogen: [58, 38], hand: [56, 26] },
    ende: { ...STEHEN, ellbogen: [52, 16], hand: [53, 4] },
    gelenk: 'schulter',
  },
  // Unterarmstütz: Körper als gerade Linie
  koerperlinie: {
    start: { fuss: [88, 88], knie: [72, 85], huefte: [55, 81], schulter: [30, 75], kopf: [19, 71], ellbogen: [30, 90], hand: [44, 90], zeh: [94, 91] },
    ende: { fuss: [88, 88], knie: [72, 85], huefte: [55, 81], schulter: [30, 75], kopf: [19, 71], ellbogen: [30, 90], hand: [44, 90], zeh: [94, 91] },
    boden: true,
    gelenk: 'huefte',
  },
}
POSEN.ellbogen = POSEN.schulter
POSEN.sprunggelenk = POSEN.knie
POSEN.rumpfneigung = POSEN.huefte
POSEN.kopfhaltung = POSEN.koerperlinie

function poseFuer(r: Regeln | null) {
  if (!r) return POSEN.knie
  if (r.modus === 'halten') return POSEN[r.pruefungen[0]?.gelenk ?? 'koerperlinie'] ?? POSEN.koerperlinie
  return POSEN[r.zaehlen?.gelenk ?? 'knie'] ?? POSEN.knie
}

const pkt = (p: XY[]) => p.map(([x, y]) => `${x},${y}`).join(' ')
const koerper = (p: Pose) => pkt([p.fuss, p.knie, p.huefte, p.schulter])
const arm = (p: Pose) => pkt([p.schulter, p.ellbogen, p.hand])
const fuss = (p: Pose) => pkt([p.fuss, p.zeh])

export function UebungsBild({ regeln, groesse = 104 }: { regeln: Regeln | null; groesse?: number }) {
  const { start, ende, boden, gelenk } = poseFuer(regeln)
  const halten = regeln?.modus === 'halten' || !!regeln?.endhalten_sekunden
  const ruhig = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  // Ablauf (6 s): hin (0–20 %), halten (20–70 %), zurück (70–85 %), Pause
  const zeiten = '0;0.2;0.7;0.85;1'
  const werte = (a: string, b: string) => `${a};${b};${b};${a};${a}`
  const anim = (attr: string, a: string, b: string) =>
    ruhig || a === b ? null : <animate attributeName={attr} values={werte(a, b)} keyTimes={zeiten} dur="6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1;0 0 1 1;0.4 0 0.2 1;0 0 1 1" />

  const zeige = ruhig ? ende : start
  const umfang = 2 * Math.PI * 9
  return (
    <svg viewBox="0 0 100 100" width={groesse} height={groesse} className="uebungs-bild" aria-hidden="true">
      <line x1="8" x2="92" y1={boden ? 92 : 93} y2={boden ? 92 : 93} className="boden" />
      <polyline points={koerper(zeige)} className="glied">{anim('points', koerper(start), koerper(ende))}</polyline>
      <polyline points={arm(zeige)} className="glied">{anim('points', arm(start), arm(ende))}</polyline>
      <polyline points={fuss(zeige)} className="glied">{anim('points', fuss(start), fuss(ende))}</polyline>
      <circle r="6.5" cx={zeige.kopf[0]} cy={zeige.kopf[1]} className="kopf">
        {anim('cx', String(start.kopf[0]), String(ende.kopf[0]))}
        {anim('cy', String(start.kopf[1]), String(ende.kopf[1]))}
      </circle>
      <circle r="3.6" cx={zeige[gelenk][0]} cy={zeige[gelenk][1]} className="marke">
        {anim('cx', String(start[gelenk][0]), String(ende[gelenk][0]))}
        {anim('cy', String(start[gelenk][1]), String(ende[gelenk][1]))}
      </circle>
      {halten && !ruhig && (
        <g transform="translate(84 16) rotate(-90)">
          <circle r="9" className="ring-spur" />
          <circle r="9" className="ring-lauf" strokeDasharray={umfang} strokeDashoffset={umfang}>
            <animate attributeName="stroke-dashoffset" values={`${umfang};${umfang};0;0;${umfang}`} keyTimes="0;0.2;0.7;0.85;1" dur="6s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  )
}
