// Tests für Winkelberechnung und Regel-Auswertung des Trainer-Modus.
import { GELENKE, P, besteSeite, gelenkwinkel, neigungZurSenkrechten, winkel, type GelenkId, type Punkt } from './geometrie'
import { Auswertung, MELDUNG_HALTEN_FERTIG, MELDUNG_HALTEN_START, MELDUNG_NICHT_IM_BILD, leseRegeln, meldungZuKurz, satzQualitaet, type Regeln } from './regeln'

const leer = (): Record<GelenkId, number | null> =>
  Object.fromEntries(GELENKE.map((g) => [g.id, null])) as Record<GelenkId, number | null>

describe('winkel', () => {
  it('rechter Winkel', () => {
    expect(winkel({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90)
  })
  it('gestreckt = 180°', () => {
    expect(winkel({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })).toBeCloseTo(180)
  })
  it('gleiche Punkte ergeben NaN statt Absturz', () => {
    expect(winkel({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNaN()
  })
})

describe('neigungZurSenkrechten', () => {
  it('aufrecht = 0°, waagerecht = 90°', () => {
    expect(neigungZurSenkrechten({ x: 0, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(0)
    expect(neigungZurSenkrechten({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90)
  })
  it('45° vorgebeugt', () => {
    expect(neigungZurSenkrechten({ x: 0, y: 10 }, { x: 10, y: 0 })).toBeCloseTo(45)
  })
})

/** Erzeugt 33 Punkte; die angegebenen werden gesetzt und sichtbar. */
function koerper(punkte: Record<number, [number, number]>, sichtbarkeit = 0.99): Punkt[] {
  const lm: Punkt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.01 }))
  for (const [i, [x, y]] of Object.entries(punkte)) lm[Number(i)] = { x, y, visibility: sichtbarkeit }
  return lm
}

describe('gelenkwinkel', () => {
  it('rechnet in Bildpunkten, damit das Seitenverhältnis nicht verzerrt', () => {
    // Hüfte über Knie, Knöchel rechts vom Knie: im Quadrat 90°
    const lm = koerper({ [P.hueftL]: [0.5, 0.25], [P.knieL]: [0.5, 0.5], [P.knoechelL]: [0.75, 0.5] })
    expect(gelenkwinkel(lm, 'links', 1000, 1000).knie).toBeCloseTo(90)
    // Gleiches Bild, aber 1000×500: Strecken skalieren unterschiedlich, Winkel bleibt 90°
    expect(gelenkwinkel(lm, 'links', 1000, 500).knie).toBeCloseTo(90)
  })
  it('liefert null für nicht sichtbare Gelenke', () => {
    const lm = koerper({ [P.hueftL]: [0.5, 0.25], [P.knieL]: [0.5, 0.5] })
    expect(gelenkwinkel(lm, 'links', 100, 100).knie).toBeNull()
  })
  it('nutzt auf der rechten Seite die geraden Indizes', () => {
    const lm = koerper({ [P.hueftR]: [0.5, 0.2], [P.knieR]: [0.5, 0.5], [P.knoechelR]: [0.5, 0.8] })
    expect(gelenkwinkel(lm, 'rechts', 100, 100).knie).toBeCloseTo(180)
    expect(gelenkwinkel(lm, 'links', 100, 100).knie).toBeNull()
  })
  it('besteSeite wählt die sichtbarere Seite', () => {
    const lm = koerper({ [P.schulterR]: [0, 0], [P.hueftR]: [0, 0], [P.knieR]: [0, 0] })
    expect(besteSeite(lm)).toBe('rechts')
  })
  it('besteSeite wechselt nur bei deutlichem Vorsprung (keine springende Seite)', () => {
    const fast = koerper({}, 0.9)
    for (const i of [P.schulterL, P.hueftL, P.knieL, P.knoechelL, P.ellbogenL]) fast[i] = { x: 0, y: 0, visibility: 0.8 }
    for (const i of [P.schulterR, P.hueftR, P.knieR, P.knoechelR, P.ellbogenR]) fast[i] = { x: 0, y: 0, visibility: 0.9 }
    expect(besteSeite(fast, 'links')).toBe('links')     // rechts nur knapp besser: bleiben
    const klar = koerper({ [P.schulterR]: [0, 0], [P.hueftR]: [0, 0], [P.knieR]: [0, 0] })
    expect(besteSeite(klar, 'links')).toBe('rechts')    // rechts deutlich besser: wechseln
  })
})

describe('leseRegeln', () => {
  it('leere Regeln sind nicht nutzbar', () => {
    expect(leseRegeln({}).regeln).toBeNull()
  })
  it('meldet unsinnige Grenzwerte verständlich', () => {
    const { regeln, fehler } = leseRegeln({
      modus: 'wiederholungen', zaehlen: { gelenk: 'knie', start: 170, umkehr: 100 },
      pruefungen: [{ gelenk: 'knie', min: 120, max: 90, meldung: 'x' }],
    })
    expect(regeln).toBeNull()
    expect(fehler[0]).toMatch(/Mindestwert/)
  })
  it('akzeptiert gültige Regeln und vergibt IDs', () => {
    const { regeln } = leseRegeln({
      modus: 'wiederholungen', zaehlen: { gelenk: 'knie', start: 170, umkehr: 100 }, ziel_wiederholungen: 8,
      pruefungen: [{ gelenk: 'rumpfneigung', max: 45, wann: 'immer', meldung: 'Oberkörper aufrichten.' }],
    })
    expect(regeln?.pruefungen[0].id).toBe('p1')
    expect(regeln?.ziel_wiederholungen).toBe(8)
  })
})

const kniebeuge: Regeln = {
  version: 1, ansicht: 'seitlich', modus: 'wiederholungen',
  zaehlen: { gelenk: 'knie', start: 170, umkehr: 100 }, halten_sekunden: null, ziel_wiederholungen: 3,
  pruefungen: [{ id: 'rumpf', gelenk: 'rumpfneigung', min: null, max: 45, wann: 'immer', meldung: 'Oberkörper aufrichten.' }],
}

/** Spielt eine Folge von Knie-/Rumpfwinkeln mit 30 Bildern pro Sekunde ab. */
function spiele(a: Auswertung, folge: { knie: number; rumpf: number; frames?: number }[], t0 = 0) {
  let t = t0
  const ereignisse: string[] = []
  for (const s of folge) {
    for (let i = 0; i < (s.frames ?? 1); i++) {
      t += 33
      for (const e of a.schritt({ ...leer(), knie: s.knie, rumpfneigung: s.rumpf }, t)) ereignisse.push(`${e.art}:${e.text}`)
    }
  }
  return { ereignisse, t }
}

/** Eine saubere Kniebeuge: runter bis 95°, wieder hoch. */
const beuge = (rumpf = 20) => [
  ...[170, 150, 130, 110, 95].map((knie) => ({ knie, rumpf, frames: 4 })),
  ...[110, 130, 150, 170].map((knie) => ({ knie, rumpf, frames: 4 })),
]

describe('Auswertung Wiederholungen', () => {
  it('zählt saubere Wiederholungen und meldet den Satz als fertig', () => {
    const a = new Auswertung(kniebeuge)
    const { ereignisse } = spiele(a, [...beuge(), ...beuge(), ...beuge()])
    expect(a.stand().wiederholungen).toBe(3)
    expect(a.stand().bewertungen).toEqual(['sauber', 'sauber', 'sauber'])
    expect(ereignisse.filter((e) => e.startsWith('fehler'))).toEqual([])
    expect(ereignisse.at(-1)).toMatch(/^fertig:Stark! \d+ von \d+ geschafft\.$/)
  })

  it('kleines Wackeln in der Ausgangsstellung zählt nicht', () => {
    const a = new Auswertung(kniebeuge)
    spiele(a, [165, 172, 160, 168, 158, 170].map((knie) => ({ knie, rumpf: 10, frames: 5 })))
    expect(a.stand().wiederholungen).toBe(0)
  })

  it('meldet anhaltenden Fehler genau einmal und bewertet die Wiederholung mit „anpassen“', () => {
    const a = new Auswertung(kniebeuge)
    const { ereignisse } = spiele(a, beuge(60))
    expect(ereignisse.filter((e) => e === 'fehler:Oberkörper aufrichten.')).toHaveLength(1)
    expect(a.stand().bewertungen).toEqual(['anpassen'])
    expect(a.stand().korrekturen[0]).toMatchObject({ pruefung_id: 'rumpf', gelenk: 'rumpfneigung', wdh: 1 })
  })

  it('ignoriert kurze Ausreißer unter 350 ms', () => {
    const a = new Auswertung(kniebeuge)
    const { ereignisse } = spiele(a, [{ knie: 170, rumpf: 20, frames: 10 }, { knie: 170, rumpf: 70, frames: 5 }, { knie: 170, rumpf: 20, frames: 10 }])
    expect(ereignisse).toEqual([])
  })

  it('meldet eine unvollständige Bewegung, zählt sie aber nicht', () => {
    const a = new Auswertung(kniebeuge)
    const { ereignisse } = spiele(a, [170, 150, 130, 125, 140, 160, 170].map((knie) => ({ knie, rumpf: 10, frames: 4 })))
    expect(a.stand().wiederholungen).toBe(0)
    expect(ereignisse).toContain('unvollstaendig:Bewegung nicht vollständig.')
  })

  it('pausiert und bittet ins Bild, wenn Gelenke fehlen', () => {
    const a = new Auswertung(kniebeuge)
    let t = 0
    const ereignisse: string[] = []
    for (let i = 0; i < 40; i++) {
      t += 33
      for (const e of a.schritt(leer(), t)) ereignisse.push(e.text)
    }
    expect(a.stand().zustand).toBe('nicht_im_bild')
    expect(ereignisse).toEqual([MELDUNG_NICHT_IM_BILD])
  })
})

describe('Auswertung Halten', () => {
  const plank: Regeln = {
    version: 1, ansicht: 'seitlich', modus: 'halten', zaehlen: null, halten_sekunden: 3, ziel_wiederholungen: null,
    pruefungen: [{ id: 'linie', gelenk: 'koerperlinie', min: 160, max: null, wann: 'immer', meldung: 'Hüfte anheben.' }],
  }
  const schritt = (a: Auswertung, linie: number, n: number, t0: number) => {
    let t = t0
    const ev: string[] = []
    for (let i = 0; i < n; i++) { t += 100; for (const e of a.schritt({ ...leer(), koerperlinie: linie }, t)) ev.push(e.art) }
    return { t, ev }
  }

  it('zählt nur Zeit mit sauberer Haltung und meldet „fertig“', () => {
    const a = new Auswertung(plank)
    let r = schritt(a, 175, 15, 0)          // 1,5 s sauber
    r = schritt(a, 140, 10, r.t)            // 1 s durchgehangen
    expect(r.ev).toContain('fehler')
    const gehaltenVorher = a.stand().gehalten
    expect(gehaltenVorher).toBeLessThan(2)
    r = schritt(a, 175, 20, r.t)            // weiter sauber bis 3 s
    expect(r.ev).toContain('fertig')
    expect(a.stand().zustand).toBe('fertig')
  })
})

describe('satzQualitaet', () => {
  it('bewertet nach Anteil sauberer Wiederholungen', () => {
    expect(satzQualitaet(['sauber', 'sauber', 'sauber', 'sauber', 'anpassen'], 1)).toBe('sauber')
    expect(satzQualitaet(['sauber', 'anpassen'], 1)).toBe('gut')
    expect(satzQualitaet(['anpassen', 'anpassen', 'sauber'], 2)).toBe('anpassen')
  })
})

describe('Auswertung mit Halten in der Endposition', () => {
  const mitHalten: Regeln = { ...kniebeuge, endhalten_sekunden: 3, ziel_wiederholungen: 2 }
  const runter = [170, 150, 130, 110].map((knie) => ({ knie, rumpf: 20, frames: 4 }))
  const hoch = [110, 130, 150, 170].map((knie) => ({ knie, rumpf: 20, frames: 4 }))

  it('zählt erst, wenn die Endposition lange genug gehalten wurde', () => {
    const a = new Auswertung(mitHalten)
    const { ereignisse } = spiele(a, [...runter, { knie: 95, rumpf: 20, frames: 100 }, ...hoch])
    expect(ereignisse).toContain(`halten_start:${MELDUNG_HALTEN_START}`)
    expect(ereignisse).toContain('halten_zaehlen:2')
    expect(ereignisse).toContain(`halten_fertig:${MELDUNG_HALTEN_FERTIG}`)
    expect(a.stand().wiederholungen).toBe(1)
  })

  it('zu kurz gehalten: zählt nicht und sagt, wie lange', () => {
    const a = new Auswertung(mitHalten)
    const { ereignisse } = spiele(a, [...runter, { knie: 95, rumpf: 20, frames: 30 }, ...hoch])
    expect(a.stand().wiederholungen).toBe(0)
    expect(ereignisse).toContain(`unvollstaendig:${meldungZuKurz(3)}`)
  })

  it('Fehlhaltung hält die Uhr an', () => {
    const a = new Auswertung(mitHalten)
    spiele(a, [...runter, { knie: 95, rumpf: 70, frames: 100 }])
    expect(a.stand().halteRest).toBeGreaterThan(2.5)
    expect(a.stand().gehaltenInWdh).toBe(false)
  })

  it('merkt sich die weiteste Bewegung', () => {
    const a = new Auswertung(mitHalten)
    spiele(a, [...runter, { knie: 95, rumpf: 20, frames: 20 }, { knie: 80, rumpf: 20, frames: 20 }])
    expect(a.stand().bestWinkel).toBe(80)
    expect(a.stand().bestFortschritt).toBeGreaterThan(1)
  })

  it('liest die Haltezeit aus den Regeln', () => {
    expect(leseRegeln({ ...mitHalten, endhalten_sekunden: 10 }).regeln?.endhalten_sekunden).toBe(10)
    expect(leseRegeln({ ...mitHalten, endhalten_sekunden: 0 }).regeln?.endhalten_sekunden).toBeNull()
    expect(leseRegeln({ ...mitHalten, endhalten_sekunden: 500 }).regeln).toBeNull()
  })
})
