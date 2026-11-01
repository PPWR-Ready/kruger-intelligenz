// Figur von vorn (Koordinaten 0–100), für Übungen mit Bewegung zur Seite –
// z. B. Seitneigung, Arme seitlich heben, Beine spreizen. Die Person schaut zur
// Kamera: ihre linke Körperseite (…L) liegt im Bild rechts.
// Winkel laufen über dieselbe Funktion wie im Kamera-Training (gelenkwinkel).
import { P, frontalEbene, gelenkwinkel, seitenAnteil, type GelenkId, type Punkt } from './geometrie'
import type { XY } from './figur'

export interface VornPose {
  kopf: XY
  schulterL: XY; schulterR: XY
  ellbogenL: XY; ellbogenR: XY
  handL: XY; handR: XY
  huefteL: XY; huefteR: XY
  knieL: XY; knieR: XY
  fussL: XY; fussR: XY
}
export type VornAnker = keyof VornPose

/** Ziehbare Punkte (die Hüften sind die feste Basis). */
export const VORN_ANKER: { id: VornAnker; name: string }[] = [
  { id: 'kopf', name: 'Kopf' },
  { id: 'schulterL', name: 'Schulter (Oberkörper neigen)' }, { id: 'schulterR', name: 'Schulter (Oberkörper neigen)' },
  { id: 'ellbogenL', name: 'Ellbogen' }, { id: 'ellbogenR', name: 'Ellbogen' },
  { id: 'handL', name: 'Hand' }, { id: 'handR', name: 'Hand' },
  { id: 'knieL', name: 'Knie' }, { id: 'knieR', name: 'Knie' },
  { id: 'fussL', name: 'Fuß' }, { id: 'fussR', name: 'Fuß' },
]
export const VORN_ALLE: VornAnker[] = ['kopf', 'schulterL', 'schulterR', 'ellbogenL', 'ellbogenR', 'handL', 'handR', 'huefteL', 'huefteR', 'knieL', 'knieR', 'fussL', 'fussR']

/** Knochen zum Zeichnen. */
export const VORN_GLIEDER: [VornAnker, VornAnker][] = [
  ['schulterL', 'schulterR'], ['huefteL', 'huefteR'], ['schulterL', 'huefteL'], ['schulterR', 'huefteR'],
  ['schulterL', 'ellbogenL'], ['ellbogenL', 'handL'], ['schulterR', 'ellbogenR'], ['ellbogenR', 'handR'],
  ['huefteL', 'knieL'], ['knieL', 'fussL'], ['huefteR', 'knieR'], ['knieR', 'fussR'],
]

export const VORN_STEHEN: VornPose = {
  kopf: [50, 13],
  schulterL: [59, 26], schulterR: [41, 26],
  ellbogenL: [62, 40], ellbogenR: [38, 40],
  handL: [63, 52], handR: [37, 52],
  huefteL: [56, 51], huefteR: [44, 51],
  knieL: [56, 71], knieR: [44, 71],
  fussL: [56, 90], fussR: [44, 90],
}

const begrenze = (v: number) => Math.max(2, Math.min(98, v))
const mitte = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const OBERKOERPER: VornAnker[] = ['schulterL', 'schulterR', 'kopf', 'ellbogenL', 'ellbogenR', 'handL', 'handR']

function drehe(p: VornPose, um: XY, teile: VornAnker[], d: number): VornPose {
  const neu = { ...p }
  const cos = Math.cos(d), sin = Math.sin(d)
  for (const k of teile) {
    const x = p[k][0] - um[0], y = p[k][1] - um[1]
    neu[k] = [begrenze(um[0] + x * cos - y * sin), begrenze(um[1] + x * sin + y * cos)]
  }
  return neu
}
const richtung = (von: XY, nach: XY) => Math.atan2(nach[1] - von[1], nach[0] - von[0])
/** Kleinster Unterschied zweier Richtungen (−π … π). */
const diff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

/** Was sich beim Ziehen eines Ankers dreht und um welchen Punkt. */
function drehung(p: VornPose, a: VornAnker): { um: XY; teile: VornAnker[] } | null {
  switch (a) {
    case 'schulterL': case 'schulterR': return { um: mitte(p.huefteL, p.huefteR), teile: OBERKOERPER }
    case 'kopf': return { um: mitte(p.schulterL, p.schulterR), teile: ['kopf'] }
    case 'ellbogenL': return { um: p.schulterL, teile: ['ellbogenL', 'handL'] }
    case 'ellbogenR': return { um: p.schulterR, teile: ['ellbogenR', 'handR'] }
    case 'handL': return { um: p.ellbogenL, teile: ['handL'] }
    case 'handR': return { um: p.ellbogenR, teile: ['handR'] }
    case 'knieL': return { um: p.huefteL, teile: ['knieL', 'fussL'] }
    case 'knieR': return { um: p.huefteR, teile: ['knieR', 'fussR'] }
    case 'fussL': return { um: p.knieL, teile: ['fussL'] }
    case 'fussR': return { um: p.knieR, teile: ['fussR'] }
    default: return null
  }
}

/** Marionette von vorn: Glied dreht um sein Gelenk, alles daran Hängende dreht mit. */
export function zieheVornAnker(p: VornPose, a: VornAnker, ziel: XY): VornPose {
  const d = drehung(p, a)
  if (!d) return p
  return drehe(p, d.um, d.teile, diff(richtung(d.um, ziel), richtung(d.um, p[a])))
}

/** Figur als MediaPipe-Körperpunkte (beide Seiten sichtbar), damit gelenkwinkel() gilt. */
export function vornAlsKoerperpunkte(p: VornPose): Punkt[] {
  const lm: Punkt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }))
  const setze = (i: number, q: XY) => { lm[i] = { x: q[0] / 100, y: q[1] / 100, visibility: 1 } }
  const hals = mitte(p.schulterL, p.schulterR)
  const ax = p.kopf[0] - hals[0], ay = p.kopf[1] - hals[1], l = Math.hypot(ax, ay) || 1
  const nx = -ay / l, ny = ax / l // senkrecht zur Kopfachse, zeigt zur linken Körperseite (im Bild rechts)
  setze(P.nase, [p.kopf[0], p.kopf[1] + 1.5])
  setze(P.ohrL, [p.kopf[0] + nx * 4, p.kopf[1] + ny * 4]); setze(P.ohrR, [p.kopf[0] - nx * 4, p.kopf[1] - ny * 4])
  setze(P.schulterL, p.schulterL); setze(P.schulterR, p.schulterR)
  setze(P.ellbogenL, p.ellbogenL); setze(P.ellbogenR, p.ellbogenR)
  setze(P.handgelenkL, p.handL); setze(P.handgelenkR, p.handR)
  setze(P.hueftL, p.huefteL); setze(P.hueftR, p.huefteR)
  setze(P.knieL, p.knieL); setze(P.knieR, p.knieR)
  setze(P.knoechelL, p.fussL); setze(P.knoechelR, p.fussR)
  setze(P.fussL, [p.fussL[0] + 2, p.fussL[1] + 2]); setze(P.fussR, [p.fussR[0] - 2, p.fussR[1] + 2])
  return lm
}

export function vornWinkel(p: VornPose): Record<GelenkId, number | null> {
  return gelenkwinkel(vornAlsKoerperpunkte(p), 'links', 100, 100)
}

/**
 * Stellt einen Winkel von vorn auf `ziel` Grad ein (Längen bleiben, Neigungsseite bleibt).
 */
export function setzeVornWinkel(p: VornPose, g: GelenkId, ziel: number): VornPose {
  const w = Math.max(0, Math.min(180, ziel)) * Math.PI / 180
  switch (g) {
    case 'seitneigung': {
      // Signierte Neigung: 0 = senkrecht nach oben, positiv = im Bild nach rechts
      const m = mitte(p.huefteL, p.huefteR), s = mitte(p.schulterL, p.schulterR)
      const ist = Math.atan2(s[0] - m[0], m[1] - s[1])
      const seite = Math.abs(ist) > 0.01 ? Math.sign(ist) : 1
      return drehe(p, m, OBERKOERPER, seite * Math.min(w, Math.PI / 2) - ist)
    }
    case 'arme_seitlich': {
      // Beide Arme: Winkel Hüfte – Schulter – Ellbogen, Arm geht nach außen
      let q = p
      for (const [s, e, h, h2, aussen] of [['schulterL', 'ellbogenL', 'huefteL', 'handL', -1], ['schulterR', 'ellbogenR', 'huefteR', 'handR', 1]] as const) {
        const ba = richtung(q[s], q[h])
        q = drehe(q, q[s], [e, h2], ba + aussen * w - richtung(q[s], q[e]))
      }
      return q
    }
    case 'ellbogen_beide': {
      let q = p
      for (const [s, e, h, innen] of [['schulterL', 'ellbogenL', 'handL', -1], ['schulterR', 'ellbogenR', 'handR', 1]] as const) {
        const A = q[s], B = q[e], C = q[h]
        const ba = richtung(B, A)
        // Beugerichtung behalten; gestreckt: Unterarm zur Körpermitte
        const kreuz = (A[0] - B[0]) * (C[1] - B[1]) - (A[1] - B[1]) * (C[0] - B[0])
        const gestreckt = Math.abs(Math.abs(diff(richtung(B, C), ba)) - Math.PI) < 0.03
        const seite = !gestreckt && kreuz !== 0 ? Math.sign(kreuz) : innen
        q = drehe(q, B, [h], ba + seite * w - richtung(B, C))
      }
      return q
    }
    case 'beine_gespreizt': {
      // Beide Oberschenkel gleich weit nach außen, Unterschenkel drehen mit
      let q = p
      for (const [h, k, f, aussen] of [['huefteL', 'knieL', 'fussL', -1], ['huefteR', 'knieR', 'fussR', 1]] as const) {
        q = drehe(q, q[h], [k, f], Math.PI / 2 + aussen * (Math.min(w, Math.PI * 2 / 3) / 2) - richtung(q[h], q[k]))
      }
      return q
    }
    case 'kopf_seitlich': {
      const hals = mitte(p.schulterL, p.schulterR)
      const v = [p.schulterL[0] - p.schulterR[0], p.schulterL[1] - p.schulterR[1]]
      const oben = Math.atan2(-v[0], v[1]) // senkrecht zur Schulterlinie, nach oben
      const ist = diff(richtung(hals, p.kopf), oben)
      const seite = Math.abs(ist) > 0.01 ? Math.sign(ist) : 1
      return drehe(p, hals, ['kopf'], oben + seite * Math.min(w, Math.PI / 2) - richtung(hals, p.kopf))
    }
    default:
      return p
  }
}

const IDX: Record<VornAnker, number> = {
  kopf: P.nase, schulterL: P.schulterL, schulterR: P.schulterR, ellbogenL: P.ellbogenL, ellbogenR: P.ellbogenR,
  handL: P.handgelenkL, handR: P.handgelenkR, huefteL: P.hueftL, huefteR: P.hueftR,
  knieL: P.knieL, knieR: P.knieR, fussL: P.knoechelL, fussR: P.knoechelR,
}

/** Kopfpunkt: Mitte der Ohren (stabiler als die Nase), sonst Nase. */
function kopfPunkt(q: (i: number) => Punkt): Punkt {
  const a = q(P.ohrL), b = q(P.ohrR)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Einpassung in die 0–100-Fläche (Füße unten, mittig) und zurück. */
function einpassung(roh: Record<VornAnker, XY>) {
  const xs = Object.values(roh).map((q) => q[0]), ys = Object.values(roh).map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const s = 80 / Math.max(x1 - x0, y1 - y0, 1e-6)
  const vx = 50 - ((x1 - x0) * s) / 2, vy = 93 - (y1 - y0) * s
  return {
    hin: (q: XY): XY => [begrenze(vx + (q[0] - x0) * s), begrenze(vy + (q[1] - y0) * s)],
    zurueck: (q: XY): XY => [(q[0] - vx) / s + x0, (q[1] - vy) / s + y0],
  }
}

function rohPunkte(q: (i: number) => Punkt): Record<VornAnker, XY> {
  const roh = {} as Record<VornAnker, XY>
  for (const a of VORN_ALLE) { const p = a === 'kopf' ? kopfPunkt(q) : q(IDX[a]); roh[a] = [p.x, p.y] }
  return roh
}

/** Rumpf muss erkannt sein, sonst ergibt die Figur keinen Sinn. */
const rumpfDa = (lm: Punkt[]) => lm.length >= 33 && [P.schulterL, P.schulterR, P.hueftL, P.hueftR].every((i) => (lm[i]?.visibility ?? 0) >= 0.3)

/**
 * Figur von vorn aus einem Foto/Video. Genau von vorn aufgenommen direkt aus dem Bild
 * (dann liegt das Skelett genau auf der Person), sonst aus den 3D-Punkten auf die
 * Körper-Vorderebene gedreht.
 */
export function vornAusErkennung(lm: Punkt[], welt: Punkt[] | null, breite: number, hoehe: number): { pose: VornPose; zuBild: ((q: XY) => XY) | null } | null {
  if (!rumpfDa(lm)) return null
  if (welt && welt.length >= 33 && seitenAnteil(welt) > 0.35) {
    const roh = rohPunkte(frontalEbene(welt))
    return { pose: abbilden(roh, einpassung(roh).hin), zuBild: null }
  }
  const roh = rohPunkte((i) => ({ x: lm[i].x * breite, y: lm[i].y * hoehe }))
  const e = einpassung(roh)
  return { pose: abbilden(roh, e.hin), zuBild: (q) => { const [x, y] = e.zurueck(q); return [x / breite, y / hoehe] } }
}

function abbilden(roh: Record<VornAnker, XY>, f: (q: XY) => XY): VornPose {
  const p = {} as VornPose
  for (const a of VORN_ALLE) p[a] = f(roh[a])
  return p
}

/** Startfiguren für die Marionette von vorn. */
export const VORN_VORLAGEN: { name: string; pose: VornPose }[] = [
  { name: 'Stehen', pose: VORN_STEHEN },
  { name: 'Arme hoch', pose: setzeVornWinkel(VORN_STEHEN, 'arme_seitlich', 170) },
  {
    name: 'Sitzen',
    pose: {
      ...VORN_STEHEN,
      kopf: [50, 25], schulterL: [59, 38], schulterR: [41, 38], ellbogenL: [62, 52], ellbogenR: [38, 52], handL: [61, 63], handR: [39, 63],
      huefteL: [56, 63], huefteR: [44, 63], knieL: [58, 70], knieR: [42, 70], fussL: [58, 90], fussR: [42, 90],
    },
  },
]

export function istVornPose(v: unknown): v is VornPose {
  if (!v || typeof v !== 'object') return false
  return VORN_ALLE.every((id) => {
    const q = (v as Record<string, unknown>)[id]
    return Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === 'number' && Number.isFinite(n))
  })
}
