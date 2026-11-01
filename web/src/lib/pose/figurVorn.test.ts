import { gelenkwinkel, P, type GelenkId, type Punkt } from './geometrie'
import { VORN_STEHEN, VORN_VORLAGEN, setzeVornWinkel, vornAlsKoerperpunkte, vornAusErkennung, vornWinkel, zieheVornAnker, type VornPose } from './figurVorn'

const FRONTAL: GelenkId[] = ['seitneigung', 'arme_seitlich', 'ellbogen_beide', 'beine_gespreizt', 'kopf_seitlich']
const laenge = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('Figur von vorn', () => {
  it('Stehen: aufrecht, Arme unten, Beine parallel, Kopf gerade', () => {
    const w = vornWinkel(VORN_STEHEN)
    expect(w.seitneigung).toBeCloseTo(0, 0)
    expect(w.arme_seitlich as number).toBeLessThan(20)
    expect(w.beine_gespreizt).toBeCloseTo(0, 0)
    expect(w.kopf_seitlich).toBeCloseTo(0, 0)
  })

  it.each([
    ['seitneigung', [10, 35, 60]], ['arme_seitlich', [30, 90, 160]], ['ellbogen_beide', [60, 120, 170]],
    ['beine_gespreizt', [15, 45, 80]], ['kopf_seitlich', [10, 30, 45]],
  ] as const)('%s lässt sich exakt einstellen', (g, werte) => {
    for (const v of werte) expect(vornWinkel(setzeVornWinkel(VORN_STEHEN, g, v))[g]).toBeCloseTo(v, 0)
  })

  it('Seitneigung: Oberkörper dreht um die Beckenmitte, Längen bleiben', () => {
    const p = setzeVornWinkel(VORN_STEHEN, 'seitneigung', 30)
    expect(laenge(p.schulterL, p.ellbogenL)).toBeCloseTo(laenge(VORN_STEHEN.schulterL, VORN_STEHEN.ellbogenL), 5)
    expect(p.huefteL).toEqual(VORN_STEHEN.huefteL)
    // Neigt nach einer Seite und behält sie beim Weiterstellen
    const q = setzeVornWinkel(p, 'seitneigung', 45)
    expect(Math.sign(q.kopf[0] - 50)).toBe(Math.sign(p.kopf[0] - 50))
  })

  it('Schulter ziehen neigt den Oberkörper', () => {
    const p = zieheVornAnker(VORN_STEHEN, 'schulterL', [75, 30])
    expect(vornWinkel(p).seitneigung as number).toBeGreaterThan(15)
    expect(laenge(p.kopf, p.schulterL)).toBeCloseTo(laenge(VORN_STEHEN.kopf, VORN_STEHEN.schulterL), 5)
  })

  it('Arm ziehen hebt ihn seitlich', () => {
    const p = zieheVornAnker(VORN_STEHEN, 'ellbogenL', [80, 26])
    expect(vornWinkel(p).arme_seitlich as number).toBeGreaterThan(40)
  })

  it('Vorlagen sind gültig', () => {
    for (const v of VORN_VORLAGEN) expect(vornWinkel(v.pose).seitneigung).not.toBeNull()
  })

  it('Foto genau von vorn: Figur liegt wieder auf dem Bild', () => {
    const ziel = setzeVornWinkel(setzeVornWinkel(VORN_STEHEN, 'arme_seitlich', 160), 'seitneigung', 25)
    const lm = vornAlsKoerperpunkte(ziel)
    const e = vornAusErkennung(lm, null, 1, 1)!
    expect(e.zuBild).not.toBeNull()
    for (const g of FRONTAL) expect(vornWinkel(e.pose)[g] ?? 0).toBeCloseTo(vornWinkel(ziel)[g] ?? 0, 0)
    const zurueck = e.zuBild!(e.pose.schulterL)
    expect(zurueck[0]).toBeCloseTo(ziel.schulterL[0] / 100, 3)
    expect(zurueck[1]).toBeCloseTo(ziel.schulterL[1] / 100, 3)
  })
})

/** Person (Figur von vorn) im Raum um die Senkrechte gedreht; Kamera schaut entlang z. */
function gedreht(p: VornPose, grad: number): { lm: Punkt[]; welt: Punkt[] } {
  const roh = vornAlsKoerperpunkte(p)
  const a = (grad * Math.PI) / 180
  // Tiefe für Füße/Fußspitzen leicht nach vorn, sonst flach
  const welt = roh.map((q, i) => {
    const x = (q.x - 0.5), y = q.y - 0.5, z = i === P.fussL || i === P.fussR ? -0.05 : 0
    return { x: x * Math.cos(a) + z * Math.sin(a), y, z: -x * Math.sin(a) + z * Math.cos(a), visibility: q.visibility }
  })
  const lm = welt.map((w) => ({ x: w.x + 0.5, y: w.y + 0.5, visibility: w.visibility }))
  return { lm, welt }
}

describe('3D von vorn: jede Blickrichtung', () => {
  const pose = setzeVornWinkel(setzeVornWinkel(setzeVornWinkel(VORN_STEHEN, 'seitneigung', 30), 'arme_seitlich', 120), 'beine_gespreizt', 40)
  const soll = vornWinkel(pose)
  it.each([0, 35, 60, 120, 180])('gleiche Winkel bei %i° Drehung', (grad) => {
    const { lm, welt } = gedreht(pose, grad)
    const ist = gelenkwinkel(lm, 'links', 1, 1, welt)
    for (const g of ['seitneigung', 'arme_seitlich', 'beine_gespreizt'] as const) expect(ist[g] as number).toBeCloseTo(soll[g] as number, 0)
  })
  it('schräg gefilmt: Figur von vorn aus 3D', () => {
    const { lm, welt } = gedreht(pose, 50)
    const e = vornAusErkennung(lm, welt, 1, 1)!
    expect(e.zuBild).toBeNull()
    expect(vornWinkel(e.pose).seitneigung as number).toBeCloseTo(soll.seitneigung as number, 0)
  })
})

describe('Arme von vorn bei ungleicher Haltung', () => {
  it('ein Arm oben, einer unten: zählt der gehobene Arm', () => {
    const p = zieheVornAnker(zieheVornAnker(VORN_STEHEN, 'ellbogenL', [64, 10]), 'handL', [66, 0])
    const w = vornWinkel(p)
    expect(w.arme_seitlich as number).toBeGreaterThan(150)
  })
})
