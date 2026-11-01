import { STEHEN, alsKoerperpunkte, ausKoerperpunkten, ausWeltpunkten, bildBezug, figurWinkel, seitlichkeit, setzeWinkel, zieheAnker } from './figur'
import { gelenkwinkel } from './geometrie'

const laenge = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('Figur / Marionette', () => {
  it('stehend: Knie und Hüfte gestreckt', () => {
    const w = figurWinkel(STEHEN)
    expect(w.knie).toBeCloseTo(180, 0)
    expect(w.huefte).toBeCloseTo(180, 0)
    expect(w.rumpfneigung).toBeCloseTo(0, 0)
  })

  it('Hüfte senken: Knie beugt nach vorn, Füße bleiben, Längen bleiben', () => {
    const p = zieheAnker(STEHEN, 'huefte', [44, 66])
    expect(p.fuss).toEqual(STEHEN.fuss)
    expect(p.knie[0]).toBeGreaterThan(STEHEN.knie[0]) // nach vorn
    expect(laenge(p.huefte, p.knie)).toBeCloseTo(laenge(STEHEN.huefte, STEHEN.knie), 3)
    expect(laenge(p.knie, p.fuss)).toBeCloseTo(laenge(STEHEN.knie, STEHEN.fuss), 3)
    expect(figurWinkel(p).knie).toBeLessThan(130)
  })

  it('Hand ziehen dreht den Unterarm um den Ellbogen', () => {
    const p = zieheAnker(STEHEN, 'hand', [62, 42])
    expect(p.ellbogen).toEqual(STEHEN.ellbogen)
    expect(figurWinkel(p).ellbogen).toBeLessThan(120)
  })

  it('Foto-Punkte → Figur: gleiche Winkel wie direkt gemessen', () => {
    const lm = alsKoerperpunkte(zieheAnker(STEHEN, 'huefte', [44, 66]))
    // als Foto 1280×720 mit gestauchten Koordinaten
    const foto = lm.map((q) => ({ ...q, x: q.x * 0.6 + 0.1, y: q.y * 0.9 }))
    const direkt = gelenkwinkel(foto, 'links', 1280, 720)
    const ueberFigur = figurWinkel(ausKoerperpunkten(foto, 'links', 1280, 720)!)
    expect(ueberFigur.knie).toBeCloseTo(direkt.knie as number, 1)
    expect(ueberFigur.huefte).toBeCloseTo(direkt.huefte as number, 1)
  })
})

describe('Winkel per Schieberegler', () => {
  it.each(['knie', 'ellbogen', 'schulter', 'huefte', 'sprunggelenk', 'koerperlinie', 'rumpfneigung', 'kopfhaltung'] as const)('%s lässt sich genau einstellen', (g) => {
    const basis = zieheAnker(zieheAnker(STEHEN, 'huefte', [44, 66]), 'hand', [64, 46])
    for (const ziel of [20, 60, 95, 140, 175]) {
      if ((g === 'rumpfneigung' || g === 'kopfhaltung') && ziel > 90) continue
      if (g === 'sprunggelenk' && ziel > 130) continue // Fußspitze würde unter den Boden (am Bildrand begrenzt)
      const p = setzeWinkel(basis, g, ziel)
      expect(figurWinkel(p)[g]).toBeCloseTo(ziel, 0)
    }
  })
  it('Knie aus gestreckter Haltung beugt so, dass der Unterschenkel nach hinten geht', () => {
    const p = setzeWinkel(STEHEN, 'knie', 90)
    expect(p.fuss[0]).toBeLessThan(STEHEN.knie[0])
  })
  it('Bild-Bezug ist die Umkehrung', () => {
    const lm = alsKoerperpunkte(zieheAnker(STEHEN, 'huefte', [44, 66])).map((q) => ({ ...q, x: q.x * 0.5 + 0.2, y: q.y * 0.8 }))
    const pose = ausKoerperpunkten(lm, 'links', 1000, 600)!
    const zu = bildBezug(lm, 'links', 1000, 600)!
    const [x, y] = zu(pose.knie)
    expect(x).toBeCloseTo(lm[25].x, 2)
    expect(y).toBeCloseTo(lm[25].y, 2)
  })
})

describe('Rumpfneigung nach vorn', () => {
  it('auch nachdem das Knie gebeugt wurde', () => {
    const p = setzeWinkel(setzeWinkel(STEHEN, 'knie', 90), 'rumpfneigung', 30)
    expect(p.schulter[0]).toBeGreaterThan(p.huefte[0])
  })
})

describe('3D: jede Blickrichtung', () => {
  // Hocke als 3D-Weltpunkte (Meter, y nach unten), beide Körperseiten 15 cm auseinander
  function welt(drehGrad: number) {
    const pose = zieheAnker(zieheAnker(STEHEN, 'huefte', [44, 66]), 'hand', [66, 46])
    const lm = alsKoerperpunkte(pose)
    const a = (drehGrad * Math.PI) / 180
    const w = lm.map((q) => ({ ...q }))
    // rechte Seite = linke Seite, quer versetzt (Körperachse z)
    for (const [l, r] of [[7, 8], [11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [31, 32]]) {
      w[l] = { x: lm[l].x, y: lm[l].y, z: -0.08, visibility: 1 }
      w[r] = { x: lm[l].x, y: lm[l].y, z: 0.08, visibility: 1 }
    }
    // um die senkrechte Achse drehen (Kamera schaut aus einer anderen Richtung)
    return { pose, welt: w.map((q) => ({ ...q, x: (q.x - 0.5) * Math.cos(a) + (q.z ?? 0) * Math.sin(a), z: -(q.x - 0.5) * Math.sin(a) + (q.z ?? 0) * Math.cos(a) })) }
  }
  it.each([0, 45, 90, 135])('gleiche Winkel bei %i° Drehung', (grad) => {
    const { pose, welt: w } = welt(grad)
    const soll = figurWinkel(pose)
    const ist3d = gelenkwinkel(w, 'links', 1, 1, w)
    const seitenansicht = figurWinkel(ausWeltpunkten(w, 'links')!)
    for (const g of ['knie', 'huefte', 'ellbogen'] as const) {
      expect(ist3d[g]).toBeCloseTo(soll[g] as number, 0)
      expect(seitenansicht[g]).toBeCloseTo(soll[g] as number, 0)
    }
  })
  it('erkennt, wie seitlich die Kamera steht', () => {
    expect(seitlichkeit(welt(0).welt)).toBeGreaterThan(0.9)
    expect(seitlichkeit(welt(90).welt)).toBeLessThan(0.1)
  })
})
