// Gelenkwinkel aus den 33 Körperpunkten von MediaPipe Pose.
// Gerechnet wird in Bildpunkten (x mal Breite, y mal Höhe), damit das
// Seitenverhältnis der Kamera die Winkel nicht verzerrt.

/** Körperpunkt. Mit `z` (3D-Weltkoordinaten in Metern) sind Winkel unabhängig von der Blickrichtung. */
export interface Punkt { x: number; y: number; z?: number; visibility?: number }

/** Indizes der MediaPipe-Körperpunkte, die wir nutzen. */
export const P = {
  nase: 0,
  ohrL: 7, ohrR: 8,
  schulterL: 11, schulterR: 12,
  ellbogenL: 13, ellbogenR: 14,
  handgelenkL: 15, handgelenkR: 16,
  hueftL: 23, hueftR: 24,
  knieL: 25, knieR: 26,
  knoechelL: 27, knoechelR: 28,
  fussL: 31, fussR: 32,
} as const

export type Seite = 'links' | 'rechts'

export type GelenkId =
  | 'knie' | 'huefte' | 'ellbogen' | 'schulter' | 'sprunggelenk'
  | 'koerperlinie' | 'rumpfneigung' | 'kopfhaltung'
  // Von vorn gesehen (Bewegungen zur Seite), immer aus beiden Körperseiten
  | 'seitneigung' | 'arme_seitlich' | 'ellbogen_beide' | 'beine_gespreizt' | 'kopf_seitlich'

/** Aus welcher Richtung die Kamera die Bewegung sieht. */
export type Ebene = 'seitlich' | 'frontal'

export interface GelenkInfo {
  id: GelenkId
  name: string
  erklaerung: string
  /** Punkte, die sichtbar sein müssen (Indizes für die linke Seite; rechts wird gespiegelt). Von vorn: beide Seiten. */
  punkte: number[]
  ebene: Ebene
  /** Größter sinnvoller Wert für Schieberegler. */
  max: number
}

export const GELENKE: GelenkInfo[] = [
  { id: 'knie', name: 'Knie', erklaerung: 'Hüfte – Knie – Knöchel. 180° = Bein gestreckt.', punkte: [P.hueftL, P.knieL, P.knoechelL], ebene: 'seitlich', max: 180 },
  { id: 'huefte', name: 'Hüfte', erklaerung: 'Schulter – Hüfte – Knie. 180° = Oberkörper und Oberschenkel in einer Linie.', punkte: [P.schulterL, P.hueftL, P.knieL], ebene: 'seitlich', max: 180 },
  { id: 'ellbogen', name: 'Ellbogen', erklaerung: 'Schulter – Ellbogen – Handgelenk. 180° = Arm gestreckt.', punkte: [P.schulterL, P.ellbogenL, P.handgelenkL], ebene: 'seitlich', max: 180 },
  { id: 'schulter', name: 'Schulter', erklaerung: 'Hüfte – Schulter – Ellbogen. 0° = Arm am Körper, 180° = Arm über Kopf.', punkte: [P.hueftL, P.schulterL, P.ellbogenL], ebene: 'seitlich', max: 180 },
  { id: 'sprunggelenk', name: 'Sprunggelenk', erklaerung: 'Knie – Knöchel – Fußspitze.', punkte: [P.knieL, P.knoechelL, P.fussL], ebene: 'seitlich', max: 180 },
  { id: 'koerperlinie', name: 'Körperlinie', erklaerung: 'Schulter – Hüfte – Knöchel. 180° = Körper gerade wie ein Brett.', punkte: [P.schulterL, P.hueftL, P.knoechelL], ebene: 'seitlich', max: 180 },
  { id: 'rumpfneigung', name: 'Rumpfneigung', erklaerung: 'Neigung Hüfte → Schulter gegen die Senkrechte. 0° = aufrecht, 90° = waagerecht.', punkte: [P.schulterL, P.hueftL], ebene: 'seitlich', max: 90 },
  { id: 'kopfhaltung', name: 'Kopfhaltung', erklaerung: 'Neigung Schulter → Ohr gegen die Rumpflinie. 0° = Kopf in Verlängerung der Wirbelsäule.', punkte: [P.ohrL, P.schulterL, P.hueftL], ebene: 'seitlich', max: 90 },
  { id: 'seitneigung', name: 'Seitneigung Oberkörper', erklaerung: 'Von vorn: Beckenmitte → Schultermitte gegen die Senkrechte. 0° = aufrecht, 90° = waagerecht zur Seite.', punkte: [P.schulterL, P.schulterR, P.hueftL, P.hueftR], ebene: 'frontal', max: 90 },
  { id: 'arme_seitlich', name: 'Arme seitlich heben', erklaerung: 'Von vorn: Hüfte – Schulter – Ellbogen, gemessen am höher gehobenen Arm. 0° = Arm am Körper, 90° = waagerecht, 180° = über Kopf.', punkte: [P.hueftL, P.schulterL, P.ellbogenL], ebene: 'frontal', max: 180 },
  { id: 'ellbogen_beide', name: 'Ellbogen', erklaerung: 'Von vorn: Schulter – Ellbogen – Handgelenk, gemessen am stärker gebeugten Arm. 180° = Arme gestreckt.', punkte: [P.schulterL, P.ellbogenL, P.handgelenkL], ebene: 'frontal', max: 180 },
  { id: 'beine_gespreizt', name: 'Beine spreizen', erklaerung: 'Von vorn: Winkel zwischen den Oberschenkeln. 0° = Beine parallel.', punkte: [P.hueftL, P.knieL, P.hueftR, P.knieR], ebene: 'frontal', max: 120 },
  { id: 'kopf_seitlich', name: 'Kopf seitlich neigen', erklaerung: 'Von vorn: Ohrenlinie gegen die Schulterlinie. 0° = Kopf gerade.', punkte: [P.ohrL, P.ohrR, P.schulterL, P.schulterR], ebene: 'frontal', max: 90 },
]

/** Gelenke, die in dieser Kamera-Ansicht gemessen und eingestellt werden. */
export const gelenkeFuer = (ebene: Ebene): GelenkInfo[] => GELENKE.filter((g) => g.ebene === ebene)

/** Gelenke, die nur von einer Körperseite gemessen werden (Seitenansicht). */
const EINSEITIG = new Set<GelenkId>(GELENKE.filter((g) => g.ebene === 'seitlich').map((g) => g.id))

export const GELENK = Object.fromEntries(GELENKE.map((g) => [g.id, g])) as Record<GelenkId, GelenkInfo>

/** Rechter Index zu einem linken (MediaPipe: links ungerade, rechts gerade, Nase 0). */
function aufSeite(index: number, seite: Seite): number {
  if (seite === 'links' || index === 0) return index
  return index % 2 === 1 ? index + 1 : index
}

/** Winkel am Punkt b zwischen den Strecken b→a und b→c, in Grad (0–180). */
export function winkel(a: Punkt, b: Punkt, c: Punkt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v1z = (a.z ?? 0) - (b.z ?? 0)
  const v2x = c.x - b.x, v2y = c.y - b.y, v2z = (c.z ?? 0) - (b.z ?? 0)
  const n = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z)
  if (n === 0) return NaN
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y + v1z * v2z) / n))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Winkel der Strecke unten→oben gegen die Senkrechte (0 = senkrecht, 90 = waagerecht). */
export function neigungZurSenkrechten(unten: Punkt, oben: Punkt): number {
  const dx = oben.x - unten.x, dz = (oben.z ?? 0) - (unten.z ?? 0)
  const dy = unten.y - oben.y // y wächst nach unten
  if (dx === 0 && dy === 0 && dz === 0) return NaN
  return (Math.atan2(Math.hypot(dx, dz), dy) * 180) / Math.PI
}

const SICHTBAR_AB = 0.5

const SEITEN_PUNKTE = [P.schulterL, P.hueftL, P.knieL, P.knoechelL, P.ellbogenL]
const seitenSumme = (lm: Punkt[], s: Seite) => SEITEN_PUNKTE.reduce((acc, i) => acc + (lm[aufSeite(i, s)]?.visibility ?? 0), 0)

/**
 * Wählt die Körperseite, die der Kamera zugewandt ist (höhere Sichtbarkeit).
 * Mit `bisher` wird nur gewechselt, wenn die andere Seite deutlich besser zu
 * sehen ist; sonst springt die Seite in der Seitenansicht hin und her, und die
 * Winkel (und damit das Zählen) würden mitten in der Bewegung umschlagen.
 */
export function besteSeite(lm: Punkt[], bisher?: Seite): Seite {
  const links = seitenSumme(lm, 'links'), rechts = seitenSumme(lm, 'rechts')
  if (!bisher) return rechts > links ? 'rechts' : 'links'
  const andere: Seite = bisher === 'links' ? 'rechts' : 'links'
  const vorsprung = (andere === 'rechts' ? rechts - links : links - rechts)
  return vorsprung > 0.75 ? andere : bisher
}

export function punkteSichtbar(lm: Punkt[], indizes: number[], seite: Seite): boolean {
  return indizes.every((i) => (lm[aufSeite(i, seite)]?.visibility ?? 0) >= SICHTBAR_AB)
}

/**
 * Berechnet alle Gelenkwinkel einer Seite. Nicht sichtbare Gelenke ergeben null.
 * `breite`/`hoehe`: Bildmaße, damit x und y gleich skaliert sind.
 */
/**
 * Wie seitlich die Kamera zur Person steht (1 = genau seitlich, 0 = von vorn/hinten),
 * aus der Querachse Hüfte/Schulter in 3D.
 */
export function seitenAnteil(welt: Punkt[]): number {
  if (welt.length < 33) return 0
  const d = (a: number, b: number) => [welt[b].x - welt[a].x, welt[b].y - welt[a].y, (welt[b].z ?? 0) - (welt[a].z ?? 0)]
  const h = d(P.hueftL, P.hueftR), s = d(P.schulterL, P.schulterR)
  const q = [h[0] + s[0], h[1] + s[1], h[2] + s[2]]
  return Math.abs(q[2]) / (Math.hypot(q[0], q[1], q[2]) || 1)
}

/**
 * Gelenkwinkel aus jeder Blickrichtung. Mit 3D-Weltpunkten wird gemischt: von der Seite
 * zählt die genaue Bildmessung (2D), von vorn die 3D-Schätzung, dazwischen fließend.
 */
export function gelenkwinkel(lm: Punkt[], seite: Seite, breite: number, hoehe: number, welt?: Punkt[] | null): Record<GelenkId, number | null> {
  const bild = (i: number): Punkt => ({ x: lm[i].x * breite, y: lm[i].y * hoehe })
  const flach = { ...gelenkwinkelEinzeln(lm, seite, breite, hoehe, null), ...frontalWinkel(lm, bild) }
  if (!welt || welt.length !== lm.length || lm.length < 33) return flach
  const tief = { ...gelenkwinkelEinzeln(lm, seite, breite, hoehe, welt), ...frontalWinkel(lm, frontalEbene(welt)) }
  const anteil = seitenAnteil(welt)
  // Seitenansicht-Winkel: genau seitlich zählt das Bild, sonst 3D (≤ 0,75 → nur 3D, ≥ 0,92 → nur Bild).
  // Frontal-Winkel: genau von vorn zählt das Bild, sonst 3D (≤ 0,2 → nur Bild, ≥ 0,45 → nur 3D).
  const gSeite = Math.min(1, Math.max(0, (anteil - 0.75) / 0.17))
  const gVorn = Math.min(1, Math.max(0, (0.45 - anteil) / 0.25))
  const aus = {} as Record<GelenkId, number | null>
  for (const id of Object.keys(flach) as GelenkId[]) {
    const a = flach[id], b = tief[id]
    const g = EINSEITIG.has(id) ? gSeite : gVorn
    aus[id] = a === null || b === null ? (b ?? a) : b + (a - b) * g
  }
  return aus
}

/**
 * 3D-Weltpunkte auf die Körper-Vorderebene projiziert (x = nach rechts im Bild, y = nach unten):
 * so werden Bewegungen zur Seite auch gemessen, wenn die Kamera schräg oder seitlich steht.
 * Die Querachse kommt aus dem Becken (bleibt bei Seitneigung ruhig).
 */
export function frontalEbene(welt: Punkt[]): (i: number) => Punkt {
  const hl = welt[P.hueftL], hr = welt[P.hueftR]
  let q = [hl.x - hr.x, 0, (hl.z ?? 0) - (hr.z ?? 0)] // Senkrechte (y) herausgenommen
  const l = Math.hypot(q[0], q[2]) || 1
  q = [q[0] / l, 0, q[2] / l]
  // Blickt die Person zur Kamera, liegt ihre linke Hüfte im Bild rechts: Querachse zeigt dann nach +x.
  // Steht die Kamera hinter ihr, bleibt die Achse so – dann ist das Bild gespiegelt, die Winkel bleiben gleich.
  return (i: number) => { const w = welt[i]; return { x: w.x * q[0] + (w.z ?? 0) * q[2], y: w.y } }
}

/** Winkel von vorn aus beiden Körperseiten (Koordinaten von `q`, Sichtbarkeit aus `lm`). */
function frontalWinkel(lm: Punkt[], q: (i: number) => Punkt): Pick<Record<GelenkId, number | null>, 'seitneigung' | 'arme_seitlich' | 'ellbogen_beide' | 'beine_gespreizt' | 'kopf_seitlich'> {
  const leer = { seitneigung: null, arme_seitlich: null, ellbogen_beide: null, beine_gespreizt: null, kopf_seitlich: null }
  if (lm.length < 33) return leer
  const sieht = (...i: number[]) => i.every((j) => (lm[j]?.visibility ?? 0) >= SICHTBAR_AB)
  const mitte = (a: number, b: number): Punkt => { const pa = q(a), pb = q(b); return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } }
  const endlich = (v: number) => (Number.isFinite(v) ? v : null)
  /** Wert aus beiden Seiten (nur sichtbare): größter bzw. kleinster. */
  const beide = (art: 'max' | 'min', paare: [number[], () => number][]) => {
    const w = paare.filter(([i]) => sieht(...i)).map(([, f]) => f()).filter(Number.isFinite)
    return w.length ? (art === 'max' ? Math.max(...w) : Math.min(...w)) : null
  }
  /** Winkel zwischen zwei Linien ohne Richtung (0–90°). */
  const linienWinkel = (a1: Punkt, a2: Punkt, b1: Punkt, b2: Punkt) => {
    const w = Math.abs(Math.atan2(a2.y - a1.y, a2.x - a1.x) - Math.atan2(b2.y - b1.y, b2.x - b1.x)) * 180 / Math.PI % 180
    return Math.min(w, 180 - w)
  }
  const rumpf = sieht(P.schulterL, P.schulterR, P.hueftL, P.hueftR)
  return {
    seitneigung: rumpf ? endlich(neigungZurSenkrechten(mitte(P.hueftL, P.hueftR), mitte(P.schulterL, P.schulterR))) : null,
    // Höher gehobener Arm (bei Seitneigung ist einer oben, der andere stützt)
    arme_seitlich: beide('max', [
      [[P.hueftL, P.schulterL, P.ellbogenL], () => winkel(q(P.hueftL), q(P.schulterL), q(P.ellbogenL))],
      [[P.hueftR, P.schulterR, P.ellbogenR], () => winkel(q(P.hueftR), q(P.schulterR), q(P.ellbogenR))],
    ]),
    // Stärker gebeugter Ellbogen
    ellbogen_beide: beide('min', [
      [[P.schulterL, P.ellbogenL, P.handgelenkL], () => winkel(q(P.schulterL), q(P.ellbogenL), q(P.handgelenkL))],
      [[P.schulterR, P.ellbogenR, P.handgelenkR], () => winkel(q(P.schulterR), q(P.ellbogenR), q(P.handgelenkR))],
    ]),
    beine_gespreizt: sieht(P.hueftL, P.knieL, P.hueftR, P.knieR) ? (() => {
      const hl = q(P.hueftL), kl = q(P.knieL), hr = q(P.hueftR), kr = q(P.knieR)
      return endlich(winkel({ x: hl.x + kr.x - hr.x, y: hl.y + kr.y - hr.y }, hl, kl))
    })() : null,
    kopf_seitlich: sieht(P.ohrL, P.ohrR, P.schulterL, P.schulterR) ? endlich(linienWinkel(q(P.ohrR), q(P.ohrL), q(P.schulterR), q(P.schulterL))) : null,
  }
}

function gelenkwinkelEinzeln(lm: Punkt[], seite: Seite, breite: number, hoehe: number, welt: Punkt[] | null): Record<GelenkId, number | null> {
  const p = (i: number): Punkt => {
    const j = aufSeite(i, seite), q = lm[j]
    if (welt) { const w = welt[j]; return { x: w.x, y: w.y, z: w.z ?? 0, visibility: q.visibility } }
    return { x: q.x * breite, y: q.y * hoehe, visibility: q.visibility }
  }
  const ergebnis = {} as Record<GelenkId, number | null>
  for (const g of GELENKE) {
    if (g.ebene !== 'seitlich') continue
    if (!lm.length || !punkteSichtbar(lm, g.punkte, seite)) { ergebnis[g.id] = null; continue }
    let w: number
    if (g.id === 'rumpfneigung') {
      w = neigungZurSenkrechten(p(P.hueftL), p(P.schulterL))
    } else if (g.id === 'kopfhaltung') {
      // Abweichung des Kopfes von der Verlängerung Hüfte → Schulter
      w = 180 - winkel(p(P.ohrL), p(P.schulterL), p(P.hueftL))
    } else {
      const [a, b, c] = g.punkte
      w = winkel(p(a), p(b), p(c))
    }
    ergebnis[g.id] = Number.isFinite(w) ? w : null
  }
  return ergebnis
}

/** Glättet Winkel über die Zeit (exponentiell), damit Anzeige und Regeln nicht flattern. */
export class Glaetter {
  private letzte: Partial<Record<GelenkId, number>> = {}
  private readonly alpha: number
  constructor(alpha = 0.45) { this.alpha = alpha }

  glaette(w: Record<GelenkId, number | null>): Record<GelenkId, number | null> {
    const aus = {} as Record<GelenkId, number | null>
    for (const id of Object.keys(w) as GelenkId[]) {
      const neu = w[id]
      if (neu === null) { delete this.letzte[id]; aus[id] = null; continue }
      const alt = this.letzte[id]
      const wert = alt === undefined ? neu : alt + this.alpha * (neu - alt)
      this.letzte[id] = wert
      aus[id] = wert
    }
    return aus
  }

  zuruecksetzen(): void { this.letzte = {} }
}

/** Linienzüge zum Hervorheben eines Gelenks (Indizes; von vorn auf beiden Seiten). */
export function gelenkLinien(id: GelenkId, seite: Seite): number[][] {
  switch (id) {
    case 'seitneigung': return [[P.hueftL, P.schulterL], [P.hueftR, P.schulterR], [P.hueftL, P.hueftR], [P.schulterL, P.schulterR]]
    case 'arme_seitlich': return [[P.hueftL, P.schulterL, P.ellbogenL], [P.hueftR, P.schulterR, P.ellbogenR]]
    case 'ellbogen_beide': return [[P.schulterL, P.ellbogenL, P.handgelenkL], [P.schulterR, P.ellbogenR, P.handgelenkR]]
    case 'beine_gespreizt': return [[P.knieL, P.hueftL, P.hueftR, P.knieR]]
    case 'kopf_seitlich': return [[P.ohrL, P.ohrR], [P.schulterL, P.schulterR]]
    default: return [GELENK[id].punkte.map((i) => aufSeite(i, seite))]
  }
}

/** Punkt, an dem der Winkel angezeigt wird. */
export function gelenkScheitel(id: GelenkId, seite: Seite): number {
  switch (id) {
    case 'seitneigung': return P.schulterL
    case 'arme_seitlich': return P.schulterL
    case 'ellbogen_beide': return P.ellbogenL
    case 'beine_gespreizt': return P.hueftL
    case 'kopf_seitlich': return P.ohrL
  }
  const pk = GELENK[id].punkte
  const i = id === 'rumpfneigung' ? P.hueftL : pk.length === 3 ? pk[1] : pk[0]
  return aufSeite(i, seite)
}
