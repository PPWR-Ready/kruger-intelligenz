// Regeln einer Übung für den Trainer-Modus und die Auswertung Bild für Bild.
// Die Regeln liegen als JSON in uebungen.regeln und werden im Team-Bereich
// gepflegt. Diese Datei enthält keine Kamera-Logik und ist vollständig testbar.

import { GELENK, type GelenkId } from './geometrie'
import { istFigurPose, type FigurPose } from './figur'

export type Ansicht = 'seitlich' | 'frontal'
export type Modus = 'wiederholungen' | 'halten'
/** Wann eine Prüfung gilt: immer, nur in der Ausgangsstellung, nur in der Bewegung, nur am Umkehrpunkt. */
export type Phase = 'immer' | 'start' | 'bewegung' | 'umkehr'

export interface Pruefung {
  id: string
  gelenk: GelenkId
  min: number | null
  max: number | null
  wann: Phase
  /** Kurze Fehlermeldung, wird angezeigt und vorgelesen. */
  meldung: string
}

export interface Regeln {
  version: 1
  ansicht: Ansicht
  modus: Modus
  /** Wiederholungen: Bewegung von `start` zu `umkehr` und zurück am Gelenk zählt als eine. */
  zaehlen: { gelenk: GelenkId; start: number; umkehr: number } | null
  /** Halten: Zielzeit in Sekunden. */
  halten_sekunden: number | null
  /**
   * Wiederholungen: In der Endposition (so weit wie möglich) so viele Sekunden halten,
   * bevor die Wiederholung zählt. null = nicht halten. Five-Standard: 10.
   */
  endhalten_sekunden?: number | null
  ziel_wiederholungen: number | null
  pruefungen: Pruefung[]
  /** Ausgangs- und Endposition der Figur (Editor-Marionette bzw. vermessenes Foto/Video). */
  figur?: { start: FigurPose; ende: FigurPose } | null
}

export const PHASEN: { id: Phase; name: string }[] = [
  { id: 'immer', name: 'die ganze Zeit' },
  { id: 'start', name: 'in der Ausgangsstellung' },
  { id: 'bewegung', name: 'während der Bewegung' },
  { id: 'umkehr', name: 'am Umkehrpunkt' },
]

export function leereRegeln(modus: Modus = 'wiederholungen'): Regeln {
  return {
    version: 1,
    ansicht: 'seitlich',
    modus,
    zaehlen: modus === 'wiederholungen' ? { gelenk: 'knie', start: 170, umkehr: 100 } : null,
    halten_sekunden: modus === 'halten' ? 30 : null,
    endhalten_sekunden: modus === 'wiederholungen' ? 10 : null,
    ziel_wiederholungen: modus === 'wiederholungen' ? 5 : null,
    pruefungen: [],
  }
}

const zahl = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const istGelenk = (v: unknown): v is GelenkId => typeof v === 'string' && v in GELENK

/**
 * Liest Regeln aus der Datenbank und prüft sie. Liefert null, wenn die Übung
 * (noch) keine nutzbaren Regeln für die Kamera hat, plus verständliche Fehler.
 */
export function leseRegeln(roh: unknown): { regeln: Regeln | null; fehler: string[] } {
  const fehler: string[] = []
  if (!roh || typeof roh !== 'object' || Object.keys(roh).length === 0) {
    return { regeln: null, fehler: ['Für diese Übung sind noch keine Kamera-Regeln hinterlegt.'] }
  }
  const r = roh as Record<string, unknown>
  const modus: Modus = r.modus === 'halten' ? 'halten' : 'wiederholungen'
  const ansicht: Ansicht = r.ansicht === 'frontal' ? 'frontal' : 'seitlich'

  let zaehlen: Regeln['zaehlen'] = null
  if (modus === 'wiederholungen') {
    const z = (r.zaehlen ?? {}) as Record<string, unknown>
    const start = zahl(z.start), umkehr = zahl(z.umkehr)
    if (!istGelenk(z.gelenk) || start === null || umkehr === null) {
      fehler.push('Zum Zählen fehlen Gelenk, Ausgangswinkel oder Umkehrwinkel.')
    } else if (Math.abs(start - umkehr) < 15) {
      fehler.push('Ausgangs- und Umkehrwinkel müssen mindestens 15° auseinanderliegen.')
    } else {
      zaehlen = { gelenk: z.gelenk, start, umkehr }
    }
  }

  const halten = zahl(r.halten_sekunden)
  if (modus === 'halten' && (halten === null || halten < 3)) fehler.push('Die Haltezeit muss mindestens 3 Sekunden betragen.')
  const endhalten = zahl(r.endhalten_sekunden)
  if (modus === 'wiederholungen' && endhalten !== null && endhalten > 0 && (endhalten < 2 || endhalten > 120)) {
    fehler.push('Die Haltezeit in der Endposition muss zwischen 2 und 120 Sekunden liegen (0 = nicht halten).')
  }

  const pruefungen: Pruefung[] = []
  const liste = Array.isArray(r.pruefungen) ? r.pruefungen : []
  liste.forEach((p, i) => {
    const q = (p ?? {}) as Record<string, unknown>
    const min = zahl(q.min), max = zahl(q.max)
    const meldung = typeof q.meldung === 'string' ? q.meldung.trim() : ''
    if (!istGelenk(q.gelenk)) { fehler.push(`Prüfung ${i + 1}: Gelenk fehlt.`); return }
    if (min === null && max === null) { fehler.push(`Prüfung ${i + 1}: Mindestens ein Grenzwert (min oder max) ist nötig.`); return }
    if (min !== null && max !== null && min >= max) { fehler.push(`Prüfung ${i + 1}: Der Mindestwert muss kleiner als der Höchstwert sein.`); return }
    if (!meldung) { fehler.push(`Prüfung ${i + 1}: Die Fehlermeldung fehlt.`); return }
    const wann = (['immer', 'start', 'bewegung', 'umkehr'] as Phase[]).includes(q.wann as Phase) ? (q.wann as Phase) : 'immer'
    if (modus === 'halten' && wann !== 'immer') { fehler.push(`Prüfung ${i + 1}: Beim Halten gibt es nur „die ganze Zeit“.`); return }
    pruefungen.push({ id: typeof q.id === 'string' && q.id ? q.id : `p${i + 1}`, gelenk: q.gelenk, min, max, wann, meldung: meldung.slice(0, 120) })
  })

  if (fehler.length) return { regeln: null, fehler }
  return {
    regeln: {
      version: 1,
      ansicht,
      modus,
      zaehlen,
      halten_sekunden: modus === 'halten' ? halten : null,
      endhalten_sekunden: modus === 'wiederholungen' && endhalten ? endhalten : null,
      ziel_wiederholungen: modus === 'wiederholungen' ? zahl(r.ziel_wiederholungen) : null,
      pruefungen,
      figur: (() => {
        const f = r.figur as { start?: unknown; ende?: unknown } | null | undefined
        return f && istFigurPose(f.start) && istFigurPose(f.ende) ? { start: f.start, ende: f.ende } : null
      })(),
    },
    fehler,
  }
}

/** Alle Gelenke, die für die Übung sichtbar sein müssen. */
export function benoetigteGelenke(r: Regeln): GelenkId[] {
  const s = new Set<GelenkId>(r.pruefungen.map((p) => p.gelenk))
  if (r.zaehlen) s.add(r.zaehlen.gelenk)
  return [...s]
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export type WdhBewertung = 'sauber' | 'anpassen'
export type Zustand = 'nicht_im_bild' | 'bereit' | 'laeuft' | 'fertig'

export interface Korrektur {
  pruefung_id: string
  gelenk: GelenkId
  meldung: string
  /** Gemessener Winkel beim Erkennen des Fehlers, gerundet. */
  winkel: number
  /** Nummer der Wiederholung (1-basiert) bzw. Sekunde beim Halten. */
  wdh: number | null
  sekunde: number
}

export interface Stand {
  zustand: Zustand
  wiederholungen: number
  bewertungen: WdhBewertung[]
  /** Sekunden, die beim Halten sauber gehalten wurden. */
  gehalten: number
  aktiveFehler: Pruefung[]
  korrekturen: Korrektur[]
  /** 0 = Ausgangsstellung, 1 = Umkehrpunkt (nur Wiederholungen). */
  fortschritt: number | null
  /** Weiteste Bewegung im Satz (Fortschritt, kann über 1 liegen) und der Winkel dazu. */
  bestFortschritt: number | null
  bestWinkel: number | null
  /** Halten in der Endposition: verbleibende Sekunden (null = gerade nicht am Halten). */
  halteRest: number | null
  /** Halten in der Endposition: geschafft für die laufende Wiederholung. */
  gehaltenInWdh: boolean
}

export interface Ereignis {
  art: 'fehler' | 'nicht_im_bild' | 'unvollstaendig' | 'wiederholung' | 'fertig' | 'halten_start' | 'halten_zaehlen' | 'halten_fertig'
  text: string
}

const FEHLER_NACH_MS = 350        // so lange muss ein Fehler anhalten, bevor er zählt
const FEHLER_WEG_NACH_MS = 300    // so lange muss er weg sein, bevor er als behoben gilt
const MELDUNG_PAUSE_MS = 3500     // dieselbe Meldung höchstens so oft
const NICHT_IM_BILD_NACH_MS = 800
const NICHT_IM_BILD_PAUSE_MS = 6000

export const MELDUNG_NICHT_IM_BILD = 'Bitte ganz ins Bild.'
export const MELDUNG_UNVOLLSTAENDIG = 'Bewegung nicht vollständig.'
export const MELDUNG_HALTEN_START = 'Halten – und wenn es geht, noch ein Stück weiter.'
export const MELDUNG_HALTEN_FERTIG = 'Sehr gut. Und langsam lösen.'
export const meldungZuKurz = (s: number) => `Bitte die Endposition ${s} Sekunden halten.`

/**
 * Wertet Bild für Bild aus. Fehlermeldungen kommen nur bei falscher Haltung,
 * erst wenn sie einen Moment anhält, und dieselbe nicht ständig hintereinander.
 */
export class Auswertung {
  private wdh = 0
  private bewertungen: WdhBewertung[] = []
  private korrekturen: Korrektur[] = []
  private phase: 'start' | 'bewegung' = 'start'
  private umkehrErreicht = false
  private maxFortschritt = 0
  private fehlerInWdh = new Set<string>()
  private fehlerSeit = new Map<string, number>()
  private okSeit = new Map<string, number>()
  private aktiv = new Set<string>()
  private letzteMeldung = new Map<string, number>()
  private unsichtbarSeit: number | null = null
  private gehaltenMs = 0
  private letzteZeit: number | null = null
  private startZeit: number | null = null
  private zustand: Zustand = 'bereit'
  private fortschritt: number | null = null
  private bestFortschritt: number | null = null
  private bestWinkel: number | null = null
  private endHaltMs = 0
  private haeltGerade = false
  private gehaltenInWdh = false
  private letzteAnsage = -1
  private readonly benoetigt: GelenkId[]
  private readonly r: Regeln

  constructor(regeln: Regeln) {
    this.r = regeln
    this.benoetigt = benoetigteGelenke(regeln)
  }

  /** Ein Bild auswerten. `t` in Millisekunden (monoton steigend). */
  schritt(w: Record<GelenkId, number | null>, t: number): Ereignis[] {
    const ereignisse: Ereignis[] = []
    if (this.zustand === 'fertig') return ereignisse
    const dt = this.letzteZeit === null ? 0 : Math.min(250, Math.max(0, t - this.letzteZeit))
    this.letzteZeit = t

    // Sichtbarkeit
    if (this.benoetigt.some((g) => w[g] === null)) {
      this.unsichtbarSeit ??= t
      if (t - this.unsichtbarSeit >= NICHT_IM_BILD_NACH_MS) {
        this.zustand = 'nicht_im_bild'
        this.fehlerZuruecksetzen()
        if (this.darfMelden('__bild', t, NICHT_IM_BILD_PAUSE_MS)) ereignisse.push({ art: 'nicht_im_bild', text: MELDUNG_NICHT_IM_BILD })
      }
      return ereignisse
    }
    this.unsichtbarSeit = null
    if (this.zustand !== 'laeuft') { this.zustand = 'laeuft'; this.startZeit ??= t }

    // Phase bestimmen (nur Wiederholungen)
    let phaseJetzt: Phase = 'immer'
    if (this.r.modus === 'wiederholungen' && this.r.zaehlen) {
      const { gelenk, start, umkehr } = this.r.zaehlen
      const f = ((w[gelenk] as number) - start) / (umkehr - start)
      this.fortschritt = Math.max(0, Math.min(1.5, f))
      if (this.bestFortschritt === null || f > this.bestFortschritt) { this.bestFortschritt = f; this.bestWinkel = Math.round(w[gelenk] as number) }
      phaseJetzt = f >= 0.7 ? 'umkehr' : f < 0.25 ? 'start' : 'bewegung'
    }

    // Prüfungen
    for (const p of this.r.pruefungen) {
      const gilt = p.wann === 'immer' || p.wann === phaseJetzt || (p.wann === 'bewegung' && phaseJetzt === 'umkehr')
      const wert = w[p.gelenk] as number
      const verletzt = gilt && ((p.min !== null && wert < p.min) || (p.max !== null && wert > p.max))
      if (verletzt) {
        this.okSeit.delete(p.id)
        if (!this.fehlerSeit.has(p.id)) this.fehlerSeit.set(p.id, t)
        if (!this.aktiv.has(p.id) && t - (this.fehlerSeit.get(p.id) as number) >= FEHLER_NACH_MS) {
          this.aktiv.add(p.id)
          this.fehlerInWdh.add(p.id)
          this.korrekturen.push({
            pruefung_id: p.id, gelenk: p.gelenk, meldung: p.meldung, winkel: Math.round(wert),
            wdh: this.r.modus === 'wiederholungen' ? this.wdh + 1 : Math.floor(this.gehaltenMs / 1000),
            sekunde: Math.round((t - (this.startZeit ?? t)) / 1000),
          })
          if (this.darfMelden(p.id, t, MELDUNG_PAUSE_MS)) ereignisse.push({ art: 'fehler', text: p.meldung })
        }
      } else {
        this.fehlerSeit.delete(p.id)
        if (this.aktiv.has(p.id)) {
          if (!this.okSeit.has(p.id)) this.okSeit.set(p.id, t)
          if (t - (this.okSeit.get(p.id) as number) >= FEHLER_WEG_NACH_MS) { this.aktiv.delete(p.id); this.okSeit.delete(p.id) }
        }
      }
    }

    if (this.r.modus === 'halten') {
      if (this.aktiv.size === 0) this.gehaltenMs += dt
      if (this.r.halten_sekunden && this.gehaltenMs >= this.r.halten_sekunden * 1000) {
        this.zustand = 'fertig'
        ereignisse.push({ art: 'fertig', text: 'Stark, geschafft!' })
      }
      return ereignisse
    }

    // Wiederholungen zählen (mit Hysterese, damit Wackeln nicht zählt)
    const f = this.fortschritt ?? 0
    if (this.phase === 'start' && f >= 0.25) {
      this.phase = 'bewegung'
      this.umkehrErreicht = false
      this.maxFortschritt = f
    } else if (this.phase === 'bewegung') {
      this.maxFortschritt = Math.max(this.maxFortschritt, f)
      const soll = this.r.endhalten_sekunden ?? 0
      if (!soll) {
        if (f >= 0.85) this.umkehrErreicht = true
      } else if (!this.gehaltenInWdh) {
        // Endposition: ab 85 % beginnen, Zone erst unter 70 % verlassen (Hysterese).
        // Weiter in die Bewegung gehen ist ausdrücklich erwünscht.
        if (!this.haeltGerade && f >= 0.85) {
          this.haeltGerade = true
          this.endHaltMs = 0
          this.letzteAnsage = soll
          ereignisse.push({ art: 'halten_start', text: MELDUNG_HALTEN_START })
        } else if (this.haeltGerade && f < 0.7) {
          this.haeltGerade = false
          this.endHaltMs = 0
        }
        if (this.haeltGerade) {
          if (this.aktiv.size === 0) this.endHaltMs += dt // bei Fehlhaltung pausiert die Uhr
          const rest = Math.ceil(soll - this.endHaltMs / 1000)
          if (rest <= 0) {
            this.gehaltenInWdh = true
            this.umkehrErreicht = true
            this.haeltGerade = false
            ereignisse.push({ art: 'halten_fertig', text: MELDUNG_HALTEN_FERTIG })
          } else if (rest < this.letzteAnsage) {
            this.letzteAnsage = rest
            if (rest <= 3 || rest === 5) ereignisse.push({ art: 'halten_zaehlen', text: String(rest) })
          }
        }
      }
      if (f < 0.2) {
        this.phase = 'start'
        const zuKurz = !!soll && !this.gehaltenInWdh && this.maxFortschritt >= 0.85
        this.haeltGerade = false
        this.gehaltenInWdh = false
        this.endHaltMs = 0
        if (zuKurz) {
          if (this.darfMelden('__zukurz', t, MELDUNG_PAUSE_MS)) ereignisse.push({ art: 'unvollstaendig', text: meldungZuKurz(soll) })
        } else if (this.umkehrErreicht) {
          this.wdh += 1
          this.bewertungen.push(this.fehlerInWdh.size === 0 ? 'sauber' : 'anpassen')
          ereignisse.push({ art: 'wiederholung', text: String(this.wdh) })
          if (this.r.ziel_wiederholungen && this.wdh >= this.r.ziel_wiederholungen) {
            this.zustand = 'fertig'
            ereignisse.push({ art: 'fertig', text: `Stark! ${this.wdh} von ${this.r.ziel_wiederholungen} geschafft.` })
          }
        } else if (this.maxFortschritt >= 0.45 && this.darfMelden('__unvollstaendig', t, MELDUNG_PAUSE_MS)) {
          ereignisse.push({ art: 'unvollstaendig', text: MELDUNG_UNVOLLSTAENDIG })
        }
        this.fehlerInWdh = new Set(this.aktiv)
      }
    }
    return ereignisse
  }

  stand(): Stand {
    return {
      zustand: this.zustand,
      wiederholungen: this.wdh,
      bewertungen: [...this.bewertungen],
      gehalten: Math.floor(this.gehaltenMs / 1000),
      aktiveFehler: this.r.pruefungen.filter((p) => this.aktiv.has(p.id)),
      korrekturen: [...this.korrekturen],
      fortschritt: this.fortschritt,
      bestFortschritt: this.bestFortschritt,
      bestWinkel: this.bestWinkel,
      halteRest: this.haeltGerade && this.r.endhalten_sekunden ? Math.max(0, this.r.endhalten_sekunden - this.endHaltMs / 1000) : null,
      gehaltenInWdh: this.gehaltenInWdh,
    }
  }

  private darfMelden(schluessel: string, t: number, pause: number): boolean {
    const letzte = this.letzteMeldung.get(schluessel)
    if (letzte !== undefined && t - letzte < pause) return false
    this.letzteMeldung.set(schluessel, t)
    return true
  }

  private fehlerZuruecksetzen(): void {
    this.aktiv.clear()
    this.fehlerSeit.clear()
    this.okSeit.clear()
  }
}

/** Gesamtbewertung eines Satzes aus den Einzelbewertungen. */
export function satzQualitaet(bewertungen: WdhBewertung[], korrekturen: number): 'sauber' | 'gut' | 'anpassen' {
  if (bewertungen.length === 0) return korrekturen === 0 ? 'sauber' : korrekturen <= 2 ? 'gut' : 'anpassen'
  const anteil = bewertungen.filter((b) => b === 'sauber').length / bewertungen.length
  return anteil >= 0.8 ? 'sauber' : anteil >= 0.5 ? 'gut' : 'anpassen'
}
