// Seitenansicht einer Figur aus 8 Ankerpunkten (Koordinaten 0–100).
// Wird von der Marionette im Übungs-Editor, der Foto/Video-Vermessung und der
// animierten Übungsfigur genutzt. Winkel werden über dieselbe Funktion wie im
// Kamera-Training berechnet (gelenkwinkel), damit alle Werte zusammenpassen.
import { GELENKE, P, gelenkwinkel, type GelenkId, type Punkt, type Seite } from './geometrie'

export type XY = [number, number]
export interface FigurPose { fuss: XY; knie: XY; huefte: XY; schulter: XY; kopf: XY; ellbogen: XY; hand: XY; zeh: XY }
export type Anker = keyof FigurPose

export const ANKER: { id: Anker; name: string }[] = [
  { id: 'kopf', name: 'Kopf' }, { id: 'schulter', name: 'Schulter' }, { id: 'ellbogen', name: 'Ellbogen' }, { id: 'hand', name: 'Hand' },
  { id: 'huefte', name: 'Hüfte' }, { id: 'knie', name: 'Knie' }, { id: 'fuss', name: 'Knöchel' }, { id: 'zeh', name: 'Fußspitze' },
]

export const STEHEN: FigurPose = { fuss: [50, 92], knie: [50, 72], huefte: [50, 52], schulter: [50, 30], kopf: [50, 17], ellbogen: [50, 42], hand: [51, 53], zeh: [59, 93] }

/** Eltern-Anker (die Hüfte ist die Wurzel). Kinder drehen beim Ziehen mit. */
export const ELTERN: Partial<Record<Anker, Anker>> = { schulter: 'huefte', kopf: 'schulter', ellbogen: 'schulter', hand: 'ellbogen', knie: 'huefte', fuss: 'knie', zeh: 'fuss' }
const KINDER: Record<Anker, Anker[]> = { huefte: ['schulter', 'knie'], schulter: ['kopf', 'ellbogen'], ellbogen: ['hand'], knie: ['fuss'], fuss: ['zeh'], kopf: [], hand: [], zeh: [] }

function nachkommen(a: Anker): Anker[] {
  return KINDER[a].flatMap((k) => [k, ...nachkommen(k)])
}

const begrenze = (v: number) => Math.max(2, Math.min(98, v))

/**
 * Marionette: Ein Anker wird zum Zeiger gezogen. Die Knochenlänge zum Eltern-Anker
 * bleibt gleich (Drehung um den Eltern-Anker), alles daran Hängende dreht mit.
 * Die Hüfte verschiebt die ganze Figur.
 */
export function zieheAnker(p: FigurPose, a: Anker, ziel: XY): FigurPose {
  const neu = { ...p } as FigurPose
  if (a === 'huefte') return hueftZiehen(p, ziel)
  const e = p[ELTERN[a] as Anker]
  const alt = Math.atan2(p[a][1] - e[1], p[a][0] - e[0])
  const jetzt = Math.atan2(ziel[1] - e[1], ziel[0] - e[0])
  const d = jetzt - alt
  const cos = Math.cos(d), sin = Math.sin(d)
  for (const k of [a, ...nachkommen(a)]) {
    const x = p[k][0] - e[0], y = p[k][1] - e[1]
    neu[k] = [begrenze(e[0] + x * cos - y * sin), begrenze(e[1] + x * sin + y * cos)]
  }
  return neu
}

const abstand = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Hüfte ziehen, Füße bleiben am Boden: Oberkörper wandert mit, das Knie wird über
 * die feste Ober- und Unterschenkellänge neu berechnet (zwei Lösungen – genommen wird
 * die, die näher am bisherigen Knie liegt, damit das Knie nicht durchschlägt).
 */
function hueftZiehen(p: FigurPose, ziel: XY): FigurPose {
  const l1 = abstand(p.huefte, p.knie), l2 = abstand(p.knie, p.fuss)
  const f = p.fuss
  let h: XY = [begrenze(ziel[0]), begrenze(ziel[1])]
  let d = abstand(h, f)
  const dMin = Math.abs(l1 - l2) + 0.5, dMax = l1 + l2 - 0.05
  if (d < dMin || d > dMax) {
    const z = Math.min(dMax, Math.max(dMin, d)) / (d || 1)
    h = [f[0] + (h[0] - f[0]) * z, f[1] + (h[1] - f[1]) * z]
    d = abstand(h, f)
  }
  const ax = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const hh = Math.sqrt(Math.max(0, l1 * l1 - ax * ax))
  const ux = (f[0] - h[0]) / d, uy = (f[1] - h[1]) / d
  const bx = h[0] + ux * ax, by = h[1] + uy * ax
  const k1: XY = [bx - uy * hh, by + ux * hh], k2: XY = [bx + uy * hh, by - ux * hh]
  // Fast gleich weit weg (Bein gestreckt): Knie nach vorn, in Blickrichtung der Figur
  const d1 = abstand(k1, p.knie), d2 = abstand(k2, p.knie)
  const vorn = (p.zeh[0] >= p.fuss[0] ? 1 : -1)
  const knie = Math.abs(d1 - d2) < 1.5 ? ((k1[0] - k2[0]) * vorn >= 0 ? k1 : k2) : d1 <= d2 ? k1 : k2
  const dx = h[0] - p.huefte[0], dy = h[1] - p.huefte[1]
  const neu = { ...p, huefte: h, knie } as FigurPose
  for (const k of ['schulter', 'kopf', 'ellbogen', 'hand'] as Anker[]) neu[k] = [begrenze(p[k][0] + dx), begrenze(p[k][1] + dy)]
  return neu
}

/** Ganze Figur verschieben (z. B. zum Ausrichten im Bild). */
export function verschiebeFigur(p: FigurPose, dx: number, dy: number): FigurPose {
  const neu = { ...p } as FigurPose
  for (const k of Object.keys(p) as Anker[]) neu[k] = [begrenze(p[k][0] + dx), begrenze(p[k][1] + dy)]
  return neu
}

/** Startfiguren für die Marionette. */
export const VORLAGEN: { name: string; pose: FigurPose }[] = [
  { name: 'Stehen', pose: STEHEN },
  { name: 'Stütz / Liegen', pose: { fuss: [88, 87], knie: [72, 84], huefte: [55, 80], schulter: [31, 74], kopf: [19, 70], ellbogen: [31, 89], hand: [45, 90], zeh: [94, 91] } },
  { name: 'Sitzen', pose: { fuss: [62, 92], knie: [64, 70], huefte: [42, 68], schulter: [42, 45], kopf: [43, 32], ellbogen: [46, 57], hand: [58, 62], zeh: [71, 93] } },
]

/** Figur als MediaPipe-Körperpunkte (linke Seite sichtbar), damit gelenkwinkel() gilt. */
export function alsKoerperpunkte(p: FigurPose): Punkt[] {
  const lm: Punkt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }))
  const setze = (i: number, q: XY) => { lm[i] = { x: q[0] / 100, y: q[1] / 100, visibility: 1 } }
  setze(P.nase, [p.kopf[0] + 3, p.kopf[1] + 1]); setze(P.ohrL, p.kopf); setze(P.schulterL, p.schulter); setze(P.ellbogenL, p.ellbogen)
  setze(P.handgelenkL, p.hand); setze(P.hueftL, p.huefte); setze(P.knieL, p.knie); setze(P.knoechelL, p.fuss); setze(P.fussL, p.zeh)
  return lm
}

export function figurWinkel(p: FigurPose): Record<GelenkId, number | null> {
  return gelenkwinkel(alsKoerperpunkte(p), 'links', 100, 100)
}

/**
 * Aus erkannten Körperpunkten (Foto/Video) eine Figur machen: die sichtbare Seite,
 * auf die 0–100-Fläche skaliert, Füße unten. Fehlt ein Punkt, kommt null zurück.
 */
export function ausKoerperpunkten(lm: Punkt[], seite: Seite, breite: number, hoehe: number): FigurPose | null {
  const r = seite === 'rechts' ? 1 : 0
  const idx: Record<Anker, number> = {
    kopf: P.ohrL + r, schulter: P.schulterL + r, ellbogen: P.ellbogenL + r, hand: P.handgelenkL + r,
    huefte: P.hueftL + r, knie: P.knieL + r, fuss: P.knoechelL + r, zeh: P.fussL + r,
  }
  const roh = {} as Record<Anker, XY>
  for (const a of Object.keys(idx) as Anker[]) {
    const q = lm[idx[a]]
    if (!q || (q.visibility ?? 1) < 0.3) return null
    roh[a] = [q.x * breite, q.y * hoehe]
  }
  // Blickrichtung angleichen: Figur schaut nach rechts (Fußspitze vor dem Knöchel)
  const spiegeln = roh.zeh[0] < roh.fuss[0]
  const xs = Object.values(roh).map((q) => q[0]), ys = Object.values(roh).map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const s = 80 / Math.max(x1 - x0, y1 - y0, 1)
  const versatzX = 50 - ((x1 - x0) * s) / 2, versatzY = 93 - (y1 - y0) * s
  const p = {} as FigurPose
  for (const a of Object.keys(roh) as Anker[]) {
    const x = (roh[a][0] - x0) * s
    p[a] = [begrenze(versatzX + (spiegeln ? (x1 - x0) * s - x : x)), begrenze(versatzY + (roh[a][1] - y0) * s)]
  }
  return p
}

/**
 * Umkehrung zu ausKoerperpunkten: rechnet Figur-Koordinaten (0–100) zurück in
 * Bildanteile (0–1), damit ein geändertes Skelett wieder auf dem Foto liegt.
 */
export function bildBezug(lm: Punkt[], seite: Seite, breite: number, hoehe: number): ((q: XY) => XY) | null {
  const r = seite === 'rechts' ? 1 : 0
  const ids = [P.ohrL, P.schulterL, P.ellbogenL, P.handgelenkL, P.hueftL, P.knieL, P.knoechelL, P.fussL].map((i) => i + r)
  const roh = ids.map((i) => lm[i]).filter(Boolean).map((q) => [q.x * breite, q.y * hoehe] as XY)
  if (roh.length < 8) return null
  const spiegeln = roh[7][0] < roh[6][0]
  const xs = roh.map((q) => q[0]), ys = roh.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const sk = 80 / Math.max(x1 - x0, y1 - y0, 1)
  const versatzX = 50 - ((x1 - x0) * sk) / 2, versatzY = 93 - (y1 - y0) * sk
  return ([fx, fy]) => {
    const x = (fx - versatzX) / sk
    const bx = spiegeln ? (x1 - x0) - x + x0 : x + x0
    return [bx / breite, ((fy - versatzY) / sk + y0) / hoehe]
  }
}

// --- Winkel per Schieberegler setzen ---------------------------------------

const OBERKOERPER: Anker[] = ['schulter', 'kopf', 'ellbogen', 'hand']
/** Welcher Teil sich dreht, um welchen Punkt, gemessen gegen welchen Bezugspunkt. */
const DREHUNG: Partial<Record<GelenkId, { a: Anker; b: Anker; c: Anker; teile: Anker[] }>> = {
  knie: { a: 'huefte', b: 'knie', c: 'fuss', teile: ['fuss', 'zeh'] },
  ellbogen: { a: 'schulter', b: 'ellbogen', c: 'hand', teile: ['hand'] },
  schulter: { a: 'huefte', b: 'schulter', c: 'ellbogen', teile: ['ellbogen', 'hand'] },
  huefte: { a: 'knie', b: 'huefte', c: 'schulter', teile: OBERKOERPER },
  koerperlinie: { a: 'fuss', b: 'huefte', c: 'schulter', teile: OBERKOERPER },
  sprunggelenk: { a: 'knie', b: 'fuss', c: 'zeh', teile: ['zeh'] },
}

function drehe(p: FigurPose, um: XY, teile: Anker[], d: number): FigurPose {
  const neu = { ...p } as FigurPose
  const cos = Math.cos(d), sin = Math.sin(d)
  for (const k of teile) {
    const x = p[k][0] - um[0], y = p[k][1] - um[1]
    neu[k] = [begrenze(um[0] + x * cos - y * sin), begrenze(um[1] + x * sin + y * cos)]
  }
  return neu
}

/**
 * Stellt einen Gelenkwinkel auf `ziel` Grad ein, indem der äußere Teil um das Gelenk
 * gedreht wird (Längen bleiben). Die Beugerichtung bleibt erhalten.
 */
export function setzeWinkel(p: FigurPose, g: GelenkId, ziel: number): FigurPose {
  const w = Math.max(0, Math.min(180, ziel)) * Math.PI / 180
  if (g === 'rumpfneigung') {
    // Neigung Hüfte → Schulter gegen die Senkrechte, nach vorn (Blickrichtung) bzw. wie bisher
    const v = [p.schulter[0] - p.huefte[0], p.schulter[1] - p.huefte[1]]
    // Figuren schauen nach rechts (Foto-Vermessung spiegelt entsprechend): nach vorn = +x
    const seite = Math.abs(v[0]) > 0.5 ? Math.sign(v[0]) : 1
    const ist = Math.atan2(v[1], v[0])
    const soll = Math.atan2(-Math.cos(w), seite * Math.sin(w))
    return drehe(p, p.huefte, OBERKOERPER, soll - ist)
  }
  if (g === 'kopfhaltung') {
    // 0° = Kopf in Verlängerung Hüfte → Schulter
    const r = [p.schulter[0] - p.huefte[0], p.schulter[1] - p.huefte[1]]
    const k = [p.kopf[0] - p.schulter[0], p.kopf[1] - p.schulter[1]]
    const kreuz = r[0] * k[1] - r[1] * k[0]
    const seite = Math.abs(kreuz) > 0.01 ? Math.sign(kreuz) : 1
    const soll = Math.atan2(r[1], r[0]) + seite * w
    return drehe(p, p.schulter, ['kopf'], soll - Math.atan2(k[1], k[0]))
  }
  const d = DREHUNG[g]
  if (!d) return p
  const A = p[d.a], B = p[d.b], C = p[d.c]
  const ba = Math.atan2(A[1] - B[1], A[0] - B[0]), bc = Math.atan2(C[1] - B[1], C[0] - B[0])
  // Beugerichtung aus der aktuellen Haltung; bei gestrecktem Gelenk natürliche Richtung
  let seite = Math.sign((A[0] - B[0]) * (C[1] - B[1]) - (A[1] - B[1]) * (C[0] - B[0]))
  if (seite === 0 || Math.abs(Math.PI - Math.abs(((bc - ba + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)) < 0.03) {
    seite = g === 'knie' ? -1 : 1 // Figur schaut nach rechts: Knie beugt nach hinten unten, Arme nach vorn
  }
  const soll = ba + seite * w
  return drehe(p, B, d.teile, soll - bc)
}


// --- 3D: Figur aus Weltpunkten (jede Blickrichtung) ------------------------

type V3 = [number, number, number]
const v3 = (q: Punkt): V3 => [q.x, q.y, q.z ?? 0]
const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const punktProd = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const kreuz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** Querachse des Körpers (links → rechts) aus Hüften und Schultern. */
function querachse(welt: Punkt[]): V3 {
  const h = minus(v3(welt[P.hueftR]), v3(welt[P.hueftL])), s = minus(v3(welt[P.schulterR]), v3(welt[P.schulterL]))
  return norm([h[0] + s[0], h[1] + s[1], h[2] + s[2]])
}

/**
 * Wie seitlich die Kamera steht: 1 = genau von der Seite, 0 = genau von vorn/hinten.
 * (Die Querachse des Körpers zeigt dann in die Bildtiefe.)
 */
export function seitlichkeit(welt: Punkt[] | null): number | null {
  if (!welt || welt.length < 33) return null
  return Math.abs(querachse(welt)[2])
}

/**
 * Figur aus 3D-Weltpunkten: der Körper wird auf seine Seitenebene projiziert –
 * so entsteht eine Seitenansicht, egal ob von vorn, schräg oder seitlich gefilmt.
 */
export function ausWeltpunkten(welt: Punkt[], seite: Seite): FigurPose | null {
  if (welt.length < 33) return null
  const r = seite === 'rechts' ? 1 : 0
  const quer = querachse(welt)
  // Senkrechte: Bild-y (nach unten), ohne Anteil der Querachse
  const unten0: V3 = [0, 1, 0]
  const unten = norm(minus(unten0, quer.map((q) => q * punktProd(unten0, quer)) as V3))
  let vorn = norm(kreuz(unten, quer))
  // Blickrichtung: Fußspitze liegt vor dem Knöchel
  const fussVor = minus(v3(welt[P.fussL + r]), v3(welt[P.knoechelL + r]))
  if (punktProd(fussVor, vorn) < 0) vorn = vorn.map((q) => -q) as V3
  const idx: Record<Anker, number> = {
    kopf: P.ohrL + r, schulter: P.schulterL + r, ellbogen: P.ellbogenL + r, hand: P.handgelenkL + r,
    huefte: P.hueftL + r, knie: P.knieL + r, fuss: P.knoechelL + r, zeh: P.fussL + r,
  }
  const roh = {} as Record<Anker, XY>
  for (const a of Object.keys(idx) as Anker[]) {
    const q = v3(welt[idx[a]])
    roh[a] = [punktProd(q, vorn), punktProd(q, unten)]
  }
  return einpassen(roh)
}

/** Rohkoordinaten (Figur schaut nach rechts) in die 0–100-Fläche einpassen, Füße unten. */
function einpassen(roh: Record<Anker, XY>): FigurPose {
  const xs = Object.values(roh).map((q) => q[0]), ys = Object.values(roh).map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const s = 80 / Math.max(x1 - x0, y1 - y0, 1e-6)
  const versatzX = 50 - ((x1 - x0) * s) / 2, versatzY = 93 - (y1 - y0) * s
  const p = {} as FigurPose
  for (const a of Object.keys(roh) as Anker[]) p[a] = [begrenze(versatzX + (roh[a][0] - x0) * s), begrenze(versatzY + (roh[a][1] - y0) * s)]
  return p
}

export function istFigurPose(v: unknown): v is FigurPose {
  if (!v || typeof v !== 'object') return false
  return ANKER.every(({ id }) => {
    const q = (v as Record<string, unknown>)[id]
    return Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === 'number' && Number.isFinite(n))
  })
}

export const ALLE_GELENKE = GELENKE.map((g) => g.id)
