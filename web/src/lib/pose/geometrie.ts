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

export interface GelenkInfo {
  id: GelenkId
  name: string
  erklaerung: string
  /** Punkte, die sichtbar sein müssen (Indizes für die linke Seite; rechts wird gespiegelt). */
  punkte: number[]
}

export const GELENKE: GelenkInfo[] = [
  { id: 'knie', name: 'Knie', erklaerung: 'Hüfte – Knie – Knöchel. 180° = Bein gestreckt.', punkte: [P.hueftL, P.knieL, P.knoechelL] },
  { id: 'huefte', name: 'Hüfte', erklaerung: 'Schulter – Hüfte – Knie. 180° = Oberkörper und Oberschenkel in einer Linie.', punkte: [P.schulterL, P.hueftL, P.knieL] },
  { id: 'ellbogen', name: 'Ellbogen', erklaerung: 'Schulter – Ellbogen – Handgelenk. 180° = Arm gestreckt.', punkte: [P.schulterL, P.ellbogenL, P.handgelenkL] },
  { id: 'schulter', name: 'Schulter', erklaerung: 'Hüfte – Schulter – Ellbogen. 0° = Arm am Körper, 180° = Arm über Kopf.', punkte: [P.hueftL, P.schulterL, P.ellbogenL] },
  { id: 'sprunggelenk', name: 'Sprunggelenk', erklaerung: 'Knie – Knöchel – Fußspitze.', punkte: [P.knieL, P.knoechelL, P.fussL] },
  { id: 'koerperlinie', name: 'Körperlinie', erklaerung: 'Schulter – Hüfte – Knöchel. 180° = Körper gerade wie ein Brett.', punkte: [P.schulterL, P.hueftL, P.knoechelL] },
  { id: 'rumpfneigung', name: 'Rumpfneigung', erklaerung: 'Neigung Hüfte → Schulter gegen die Senkrechte. 0° = aufrecht, 90° = waagerecht.', punkte: [P.schulterL, P.hueftL] },
  { id: 'kopfhaltung', name: 'Kopfhaltung', erklaerung: 'Neigung Schulter → Ohr gegen die Rumpflinie. 0° = Kopf in Verlängerung der Wirbelsäule.', punkte: [P.ohrL, P.schulterL, P.hueftL] },
]

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
  const flach = gelenkwinkelEinzeln(lm, seite, breite, hoehe, null)
  if (!welt || welt.length !== lm.length) return flach
  const tief = gelenkwinkelEinzeln(lm, seite, breite, hoehe, welt)
  const g = Math.min(1, Math.max(0, (seitenAnteil(welt) - 0.75) / 0.17)) // ≤ 0,75 → nur 3D, ≥ 0,92 → nur 2D
  const aus = {} as Record<GelenkId, number | null>
  for (const id of Object.keys(flach) as GelenkId[]) {
    const a = flach[id], b = tief[id]
    aus[id] = a === null || b === null ? (b ?? a) : b + (a - b) * g
  }
  return aus
}

function gelenkwinkelEinzeln(lm: Punkt[], seite: Seite, breite: number, hoehe: number, welt: Punkt[] | null): Record<GelenkId, number | null> {
  const p = (i: number): Punkt => {
    const j = aufSeite(i, seite), q = lm[j]
    if (welt) { const w = welt[j]; return { x: w.x, y: w.y, z: w.z ?? 0, visibility: q.visibility } }
    return { x: q.x * breite, y: q.y * hoehe, visibility: q.visibility }
  }
  const ergebnis = {} as Record<GelenkId, number | null>
  for (const g of GELENKE) {
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

/** Indizes einer Seite für das Zeichnen (welche Punkte zu einem Gelenk gehören). */
export function gelenkPunkte(id: GelenkId, seite: Seite): number[] {
  return GELENK[id].punkte.map((i) => aufSeite(i, seite))
}

/** Scheitelpunkt, an dem der Winkel angezeigt wird. */
export function gelenkScheitel(id: GelenkId, seite: Seite): number {
  const pk = GELENK[id].punkte
  const i = id === 'rumpfneigung' ? P.hueftL : pk.length === 3 ? pk[1] : pk[0]
  return aufSeite(i, seite)
}
