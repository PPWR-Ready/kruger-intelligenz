import { STEHEN, alsKoerperpunkte, ausKoerperpunkten, figurWinkel, zieheAnker } from './figur'
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
