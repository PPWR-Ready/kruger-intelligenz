// Hilft beim Ausrichten vor der Kamera: Ist die Person abgeschnitten oder zu klein,
// gibt es eine konkrete Anweisung („Geh ein Stück nach links“, „Handy etwas höher“).
// Links/rechts wird aus Sicht der trainierenden Person gesagt – dafür wird erkannt,
// ob sie zur Kamera schaut, ihr den Rücken zudreht oder seitlich steht.
import { P, type Punkt } from './geometrie'

export type AusrichtungCode = 'links' | 'rechts' | 'vor' | 'zurueck' | 'hoeher' | 'tiefer' | 'weiter_weg' | 'naeher'

export interface Ausrichtung {
  code: AusrichtungCode
  text: string
  /** Wohin der Körper im (unverspiegelten) Kamerabild wandern soll: −1/0/1. */
  pfeil: { dx: number; dy: number }
}

const KOERPER = [P.nase, P.schulterL, P.schulterR, P.ellbogenL, P.ellbogenR, P.handgelenkL, P.handgelenkR,
  P.hueftL, P.hueftR, P.knieL, P.knieR, P.knoechelL, P.knoechelR, P.fussL, P.fussR]

const TEXT: Record<AusrichtungCode, string> = {
  links: 'Geh ein Stück nach links.',
  rechts: 'Geh ein Stück nach rechts.',
  vor: 'Geh einen kleinen Schritt nach vorn.',
  zurueck: 'Geh einen kleinen Schritt zurück.',
  hoeher: 'Handy etwas höher halten oder nach oben neigen.',
  tiefer: 'Handy etwas tiefer halten oder nach unten neigen.',
  weiter_weg: 'Geh etwas weiter weg vom Handy.',
  naeher: 'Komm etwas näher ans Handy.',
}

/**
 * @param lm Körperpunkte (0–1 im Kamerabild; außerhalb geschätzte Punkte dürfen < 0 oder > 1 sein)
 * @param rx, ry Rand, der durch den Zuschnitt der Anzeige nicht sichtbar ist (Anteil je Seite)
 */
export function ausrichtung(lm: Punkt[], rx = 0, ry = 0): Ausrichtung | null {
  if (lm.length < 33) return null
  const u = (q: Punkt) => (q.x - rx) / (1 - 2 * rx), v = (q: Punkt) => (q.y - ry) / (1 - 2 * ry)
  const pts = KOERPER.map((i) => lm[i])
  const us = pts.map(u), vs = pts.map(v)
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs)
  const rand = 0.02
  const links = minU < rand, rechts = maxU > 1 - rand, oben = minV < rand, unten = maxV > 1 - rand
  const mach = (code: AusrichtungCode, dx: number, dy: number): Ausrichtung => ({ code, text: TEXT[code], pfeil: { dx, dy } })

  if ((oben && unten) || (links && rechts)) return mach('weiter_weg', 0, 0)
  if (oben) return mach('hoeher', 0, 1)   // Kopf abgeschnitten: Körper soll im Bild nach unten
  if (unten) return mach('tiefer', 0, -1) // Füße abgeschnitten: Körper soll im Bild nach oben
  if (links || rechts) {
    const d = links ? 1 : -1 // so muss der Körper im Bild wandern
    return mach(richtungFuerPerson(lm, d), d, 0)
  }
  if (Math.max(maxU - minU, maxV - minV) < 0.4) return mach('naeher', 0, 0)
  return null
}

/** Übersetzt „im Bild nach rechts (d = 1) / links (d = −1)“ in eine Anweisung aus Sicht der Person. */
function richtungFuerPerson(lm: Punkt[], d: number): AusrichtungCode {
  const sl = lm[P.schulterL], sr = lm[P.schulterR], hl = lm[P.hueftL], hr = lm[P.hueftR]
  const breite = (Math.abs(sr.x - sl.x) + Math.abs(hr.x - hl.x)) / 2
  const rumpf = Math.abs((hl.y + hr.y) / 2 - (sl.y + sr.y) / 2) || 0.001
  if (breite / rumpf < 0.35) {
    // Seitlich: Blickrichtung über Nase gegenüber den Ohren
    const ohrX = (lm[P.ohrL].x + lm[P.ohrR].x) / 2
    const blick = lm[P.nase].x >= ohrX ? 1 : -1
    return blick * d > 0 ? 'vor' : 'zurueck'
  }
  // Frontal: Schaut die Person zur Kamera, liegt ihre rechte Hüfte im Bild links
  const zurKamera = hr.x < hl.x
  // Im Bild nach rechts = für die Person (zur Kamera schauend) nach links
  return (d > 0) === zurKamera ? 'links' : 'rechts'
}
