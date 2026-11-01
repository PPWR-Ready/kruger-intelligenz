import { ausrichtung } from './ausrichtung'
import { P, type Punkt } from './geometrie'

/** Stehende Person, frontal zur Kamera (rechte Körperseite im Bild links). */
function frontal(dx = 0, dy = 0, s = 1, zurKamera = true): Punkt[] {
  const lm: Punkt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  const setze = (i: number, x: number, y: number) => { lm[i] = { x: 0.5 + (x - 0.5) * s + dx, y: 0.5 + (y - 0.5) * s + dy, visibility: 1 } }
  const l = zurKamera ? 1 : -1 // linke Körperseite im Bild rechts, wenn zur Kamera
  setze(P.nase, 0.5, 0.15); setze(P.ohrL, 0.5 + 0.03 * l, 0.14); setze(P.ohrR, 0.5 - 0.03 * l, 0.14)
  for (const [li, re, y, b] of [[P.schulterL, P.schulterR, 0.3, 0.1], [P.ellbogenL, P.ellbogenR, 0.45, 0.12], [P.handgelenkL, P.handgelenkR, 0.58, 0.12],
    [P.hueftL, P.hueftR, 0.55, 0.07], [P.knieL, P.knieR, 0.72, 0.07], [P.knoechelL, P.knoechelR, 0.88, 0.07], [P.fussL, P.fussR, 0.9, 0.08]] as const) {
    setze(li, 0.5 + b * l, y); setze(re, 0.5 - b * l, y)
  }
  return lm
}

/** Seitlich, Blick nach rechts im Bild. */
function seitlich(dx = 0): Punkt[] {
  const lm = frontal(dx)
  for (const i of [P.schulterL, P.ellbogenL, P.handgelenkL, P.hueftL, P.knieL, P.knoechelL, P.fussL]) lm[i] = { ...lm[i], x: 0.5 + dx }
  for (const i of [P.schulterR, P.ellbogenR, P.handgelenkR, P.hueftR, P.knieR, P.knoechelR, P.fussR]) lm[i] = { ...lm[i - 1], x: lm[i - 1].x + 0.005 }
  lm[P.nase] = { ...lm[P.nase], x: 0.53 + dx }; lm[P.ohrL] = { ...lm[P.ohrL], x: 0.49 + dx }; lm[P.ohrR] = { ...lm[P.ohrR], x: 0.49 + dx }
  return lm
}

describe('Ausrichtung vor der Kamera', () => {
  it('alles gut: kein Hinweis', () => {
    expect(ausrichtung(frontal())).toBeNull()
  })
  it('im Bild links abgeschnitten, Person schaut zur Kamera → nach links (aus ihrer Sicht)', () => {
    expect(ausrichtung(frontal(-0.42))?.code).toBe('links')
  })
  it('im Bild rechts abgeschnitten → nach rechts', () => {
    expect(ausrichtung(frontal(0.42))?.code).toBe('rechts')
  })
  it('Rücken zur Kamera: Richtung dreht sich um', () => {
    expect(ausrichtung(frontal(-0.42, 0, 1, false))?.code).toBe('rechts')
  })
  it('seitlich: nach vorn bzw. zurück', () => {
    expect(ausrichtung(seitlich(-0.5))?.code).toBe('vor') // muss im Bild nach rechts = Blickrichtung
    expect(ausrichtung(seitlich(0.5))?.code).toBe('zurueck')
  })
  it('Kopf oder Füße abgeschnitten → Handy höher bzw. tiefer', () => {
    expect(ausrichtung(frontal(0, -0.15))?.code).toBe('hoeher')
    expect(ausrichtung(frontal(0, 0.12))?.code).toBe('tiefer')
  })
  it('zu groß bzw. zu klein', () => {
    expect(ausrichtung(frontal(0, 0, 1.4))?.code).toBe('weiter_weg')
    expect(ausrichtung(frontal(0, 0, 0.4))?.code).toBe('naeher')
  })
  it('Zuschnitt der Anzeige wird berücksichtigt', () => {
    expect(ausrichtung(frontal(-0.3), 0.15, 0)?.code).toBe('links')
  })
})
