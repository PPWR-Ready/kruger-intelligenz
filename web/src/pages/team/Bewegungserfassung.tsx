// Übung visuell erfassen: Ausgangs- und Endposition entweder aus einem Foto/Video
// vermessen oder an einer Figur (Marionette) einstellen. Die Winkel werden live in
// die Kamera-Regeln übernommen und lassen sich mit Schiebereglern anpassen.
// Zwei Ansichten: von der Seite (Bewegung nach vorn/hinten) und von vorn (Bewegung zur Seite).
import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type PointerEvent as RPointerEvent } from 'react'
import { FigurDefs, MUSKELN, Mensch, MenschVorn, type Muskel } from '../../components/UebungsBild'
import { Icon } from '../../components/Icon'
import { ANKER, STEHEN, VORLAGEN, ausKoerperpunkten, ausWeltpunkten, bildBezug, figurWinkel, setzeWinkel, zieheAnker, type FigurPose, type XY } from '../../lib/pose/figur'
import { VORN_ALLE, VORN_ANKER, VORN_GLIEDER, VORN_STEHEN, VORN_VORLAGEN, setzeVornWinkel, vornAusErkennung, vornWinkel, zieheVornAnker, type VornPose } from '../../lib/pose/figurVorn'
import { GELENK, besteSeite, gelenkeFuer, gelenkwinkel, seitenAnteil, type GelenkId, type Punkt, type Seite } from '../../lib/pose/geometrie'
import { erkenneBild } from '../../lib/pose/erkennung'
import { STANDARD_ZAEHLEN, ansichtWechseln, type Ansicht, type Pruefung, type Regeln } from '../../lib/pose/regeln'

type Phase = 'start' | 'ende'
type Pose = Record<string, XY>
const TOLERANZ = 15
const MELDUNG: Record<GelenkId, string> = {
  knie: 'Knie-Beugung anpassen.', huefte: 'Hüfte so beugen wie gezeigt.', ellbogen: 'Arm-Haltung anpassen.', schulter: 'Arm-Position anpassen.',
  sprunggelenk: 'Fuß-Position anpassen.', koerperlinie: 'Körper gerade halten.', rumpfneigung: 'Oberkörper-Neigung korrigieren.', kopfhaltung: 'Kopf in Verlängerung der Wirbelsäule.',
  seitneigung: 'Seitneigung des Oberkörpers anpassen.', arme_seitlich: 'Arme so hoch wie gezeigt.', ellbogen_beide: 'Arm-Haltung anpassen.',
  beine_gespreizt: 'Beinstellung anpassen.', kopf_seitlich: 'Kopf gerade halten.',
}
const AUTO = 'auto-'
const rund = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const kl = (v: number) => Math.max(0, Math.min(180, Math.round(v)))

/** Alles, was sich zwischen Seitenansicht und Ansicht von vorn unterscheidet. */
interface Modell {
  ansicht: Ansicht
  standard: Pose
  winkel: (p: Pose) => Record<GelenkId, number | null>
  setze: (p: Pose, g: GelenkId, v: number) => Pose
  ziehe: (p: Pose, a: string, q: XY) => Pose
  /** Ziehbare Punkte. */
  anker: { id: string; name: string }[]
  /** Alle Punkte (auch feste) und Knochen zum Zeichnen. */
  alle: string[]
  glieder: [string, string][]
  wurzel: string | null
  vorlagen: { name: string; pose: Pose }[]
  Figur: ComponentType<{ p: Pose; muskeln: Muskel[]; id: string }>
  hinweis: string
  zaehlbar: GelenkId[]
  /** Zählt bevorzugt, sobald es sich mindestens 15° bewegt (Hauptbewegung der Übung). */
  vorrang: GelenkId | null
}

/** Welches Gelenk die Wiederholung zählt: Vorrang-Gelenk, sonst das mit der größten Bewegung. */
function hauptGelenk(m: Modell, spanne: (g: GelenkId) => number | null): GelenkId | null {
  if (m.vorrang && (spanne(m.vorrang) ?? 0) >= 15) return m.vorrang
  let best: GelenkId | null = null, groesste = -1
  for (const g of m.zaehlbar) { const d = spanne(g); if (d !== null && d > groesste) { groesste = d; best = g } }
  return best
}

const SEITE: Modell = {
  ansicht: 'seitlich',
  standard: STEHEN as unknown as Pose,
  winkel: (p) => figurWinkel(p as unknown as FigurPose),
  setze: (p, g, v) => setzeWinkel(p as unknown as FigurPose, g, v) as unknown as Pose,
  ziehe: (p, a, q) => zieheAnker(p as unknown as FigurPose, a as keyof FigurPose, q) as unknown as Pose,
  anker: ANKER,
  alle: ANKER.map((a) => a.id),
  glieder: [['huefte', 'schulter'], ['schulter', 'kopf'], ['schulter', 'ellbogen'], ['ellbogen', 'hand'], ['huefte', 'knie'], ['knie', 'fuss'], ['fuss', 'zeh']],
  wurzel: 'huefte',
  vorlagen: VORLAGEN as unknown as { name: string; pose: Pose }[],
  Figur: Mensch as unknown as Modell['Figur'],
  hinweis: 'Punkte ziehen – die Glieder drehen sich wie bei einer Marionette. Die Hüfte (dunkler Punkt) senkt oder hebt den Körper, die Füße bleiben dabei am Boden.',
  zaehlbar: ['knie', 'huefte', 'ellbogen', 'schulter', 'sprunggelenk', 'koerperlinie', 'rumpfneigung'],
  vorrang: null,
}

const VORN: Modell = {
  ansicht: 'frontal',
  standard: VORN_STEHEN as unknown as Pose,
  winkel: (p) => vornWinkel(p as unknown as VornPose),
  setze: (p, g, v) => setzeVornWinkel(p as unknown as VornPose, g, v) as unknown as Pose,
  ziehe: (p, a, q) => zieheVornAnker(p as unknown as VornPose, a as keyof VornPose, q) as unknown as Pose,
  anker: VORN_ANKER,
  alle: VORN_ALLE,
  glieder: VORN_GLIEDER,
  wurzel: null,
  vorlagen: VORN_VORLAGEN as unknown as { name: string; pose: Pose }[],
  Figur: MenschVorn as unknown as Modell['Figur'],
  hinweis: 'Die Figur schaut dich an. Punkte ziehen – eine Schulter neigt den ganzen Oberkörper zur Seite, Ellbogen und Hände bewegen die Arme, Knie und Füße die Beine.',
  zaehlbar: ['seitneigung', 'arme_seitlich', 'ellbogen_beide', 'beine_gespreizt', 'kopf_seitlich'],
  vorrang: 'seitneigung',
}
const MODELL: Record<Ansicht, Modell> = { seitlich: SEITE, frontal: VORN }

/** Ohne gespeicherte Figur: Figur aus der Zählregel bauen, damit Regler und Zählregel übereinstimmen. */
function figurAusZaehlen(m: Modell, z: Regeln['zaehlen']): { start: Pose; ende: Pose } {
  if (!z || GELENK[z.gelenk].ebene !== m.ansicht) return { start: m.standard, ende: m.standard }
  return { start: m.setze(m.standard, z.gelenk, z.start), ende: m.setze(m.standard, z.gelenk, z.umkehr) }
}

/** Zählregel aus der erfassten Figur der aktuellen Ansicht (Hauptbewegung), oder null. */
export function zaehlenAusFigur(r: Regeln): Regeln['zaehlen'] {
  const m = MODELL[r.ansicht]
  const f = (r.ansicht === 'frontal' ? r.figur_vorn : r.figur) as { start: Pose; ende: Pose } | null | undefined
  if (!f) return null
  const ws = m.winkel(f.start), we = m.winkel(f.ende)
  const g = hauptGelenk(m, (id) => (ws[id] != null && we[id] != null ? Math.abs((ws[id] as number) - (we[id] as number)) : null))
  if (!g || ws[g] == null || we[g] == null || Math.abs((ws[g] as number) - (we[g] as number)) < 15) return null
  return { gelenk: g, start: kl(ws[g] as number), umkehr: kl(we[g] as number) }
}

export function Bewegungserfassung({ r, setR }: { r: Regeln; setR: (f: (x: Regeln) => Regeln) => void }) {
  const halten = r.modus === 'halten'
  const m = MODELL[r.ansicht]
  const [phase, setPhase] = useState<Phase>(halten ? 'ende' : 'start')
  const [quelle, setQuelle] = useState<'figur' | 'medien'>('figur')
  const gespeichert = (r.ansicht === 'frontal' ? r.figur_vorn : r.figur) as { start: Pose; ende: Pose } | null | undefined
  // Zählgelenk von Hand gewählt (gilt nur für diese Ansicht). Bei gespeicherter Figur bleibt die Wahl stehen.
  const [festFuer, setFestFuer] = useState<Ansicht | null>(gespeichert ? r.ansicht : null)
  const zaehlFest = festFuer === r.ansicht
  // Die Ansicht wurde bewusst gewählt (Umschalter oder erkanntes Foto): Fotos stellen sie nicht mehr um
  const [ansichtFest, setAnsichtFest] = useState(!!gespeichert)
  const posen = useMemo(() => gespeichert ?? figurAusZaehlen(m, r.zaehlen), [gespeichert, m, r.zaehlen])
  const aktivePhase: Phase = halten ? 'ende' : phase
  const gemessen = useMemo(() => ({ start: m.winkel(posen.start), ende: m.winkel(posen.ende) }), [posen, m])

  // Neue Posen übernehmen: Zählwinkel und überwachte Gelenke folgen den Messwerten
  function posenSetzen(neu: { start: Pose; ende: Pose }, festhalten = zaehlFest, modell = m) {
    const ws = modell.winkel(neu.start), we = modell.winkel(neu.ende)
    setR((x) => {
      let zaehlen = x.zaehlen
      if (x.modus === 'wiederholungen') {
        let g = zaehlen && GELENK[zaehlen.gelenk].ebene === modell.ansicht ? zaehlen.gelenk : STANDARD_ZAEHLEN[modell.ansicht].gelenk
        if (!festhalten) g = hauptGelenk(modell, (id) => (ws[id] != null && we[id] != null ? Math.abs((ws[id] as number) - (we[id] as number)) : null)) ?? g
        zaehlen = { gelenk: g, start: kl(ws[g] ?? STANDARD_ZAEHLEN[modell.ansicht].start), umkehr: kl(we[g] ?? STANDARD_ZAEHLEN[modell.ansicht].umkehr) }
      }
      let pruefungen = x.pruefungen.map((p) => {
        if (!p.id.startsWith(AUTO) || p.fest) return p
        const a = x.modus === 'halten' ? we[p.gelenk] : ws[p.gelenk], b = we[p.gelenk]
        if (a == null || b == null) return p
        return { ...p, min: kl(Math.min(a, b) - TOLERANZ), max: kl(Math.max(a, b) + TOLERANZ) }
      })
      // Halten ohne Prüfung würde auch bloßes Stehen zählen: die Gelenke überwachen, die sich vom Stehen unterscheiden
      if (x.modus === 'halten' && pruefungen.length === 0) {
        const stehen = modell.winkel(modell.standard)
        pruefungen = modell.zaehlbar
          .filter((g) => we[g] != null && stehen[g] != null && Math.abs((we[g] as number) - (stehen[g] as number)) >= 20)
          .sort((a, b) => Math.abs((we[b] as number) - (stehen[b] as number)) - Math.abs((we[a] as number) - (stehen[a] as number)))
          .slice(0, 3)
          .map((g) => ({ id: AUTO + g, gelenk: g, min: kl((we[g] as number) - TOLERANZ), max: kl((we[g] as number) + TOLERANZ), wann: 'immer' as const, meldung: MELDUNG[g] }))
      }
      const feld = modell.ansicht === 'frontal' ? { figur_vorn: neu as unknown as Regeln['figur_vorn'] } : { figur: neu as unknown as Regeln['figur'] }
      return { ...x, ...feld, zaehlen, pruefungen }
    })
  }
  // Halten: nur die Halteposition ändern, die Ausgangsposition bleibt (für einen späteren Wechsel auf Wiederholungen)
  const poseSetzen = (ph: Phase, p: Pose, festhalten = zaehlFest) => posenSetzen(halten ? { ...posen, ende: p } : { ...posen, [ph]: p }, festhalten)
  // Schieberegler: Gelenk in der gerade gewählten Position drehen – Figur und Foto-Skelett folgen
  const winkelSetzen = (g: GelenkId, v: number) => poseSetzen(aktivePhase, m.setze(posen[aktivePhase], g, v), true)

  function zaehlGelenkWaehlen(g: GelenkId) {
    setFestFuer(r.ansicht)
    setR((x) => ({ ...x, zaehlen: { gelenk: g, start: kl(gemessen.start[g] ?? 170), umkehr: kl(gemessen.ende[g] ?? 100) }, pruefungen: x.pruefungen.filter((p) => p.id !== AUTO + g) }))
  }
  function ueberwachen(g: GelenkId, an: boolean) {
    setR((x) => {
      const ohne = x.pruefungen.filter((p) => p.id !== AUTO + g)
      if (!an) return { ...x, pruefungen: ohne }
      const a = (halten ? gemessen.ende[g] : gemessen.start[g]) ?? 90, b = gemessen.ende[g] ?? 90
      const neu: Pruefung = { id: AUTO + g, gelenk: g, min: kl(Math.min(a, b) - TOLERANZ), max: kl(Math.max(a, b) + TOLERANZ), wann: 'immer', meldung: MELDUNG[g] }
      return { ...x, pruefungen: [...ohne, neu] }
    })
  }
  const setzeGrenze = (g: GelenkId, feld: 'min' | 'max', v: number) =>
    setR((x) => ({ ...x, pruefungen: x.pruefungen.map((p) => (p.id === AUTO + g ? { ...p, [feld]: v, fest: true } : p)) }))

  /** Foto zeigt eine andere Ansicht: Übung umstellen und die gemessenen Positionen dort übernehmen. */
  function ansichtSetzen(a: Ansicht) {
    setAnsichtFest(true)
    setR((x) => {
      const y = ansichtWechseln(x, a)
      // Zählregel zur schon vorhandenen Figur dieser Ansicht passend machen
      return y.modus === 'wiederholungen' ? { ...y, zaehlen: zaehlenAusFigur(y) ?? y.zaehlen } : y
    })
  }

  return (
    <section className="karte erfassung">
      <div className="stapel" style={{ gap: 4 }}>
        <h2 className="untertitel">Bewegung erfassen</h2>
        <p className="klein leise" style={{ margin: 0 }}>
          {halten ? 'Zeig die Halteposition' : 'Zeig Ausgangs- und Endposition'} – per Foto oder Video, oder richte die Figur selbst aus. Die Winkel werden sofort eingetragen und lassen sich unten fein einstellen.
        </p>
      </div>

      <div className="segment" role="tablist" aria-label="Kamera sieht die Person">
        <button type="button" role="tab" aria-selected={r.ansicht === 'seitlich'} onClick={() => ansichtSetzen('seitlich')}>Von der Seite</button>
        <button type="button" role="tab" aria-selected={r.ansicht === 'frontal'} onClick={() => ansichtSetzen('frontal')}>Von vorn</button>
      </div>
      <p className="klein leise" style={{ margin: '-4px 0 0' }}>
        {r.ansicht === 'frontal'
          ? 'Für Bewegungen zur Seite – z. B. Seitneigung, Arme oder Beine seitlich. Die Kamera steht vor der Person.'
          : 'Für Bewegungen nach vorn und hinten – z. B. Beugen, Strecken, Kniebeuge. Die Kamera steht seitlich oder schräg.'}
      </p>

      <div className="segment" role="tablist" aria-label="Erfassen über">
        <button type="button" role="tab" aria-selected={quelle === 'medien'} onClick={() => setQuelle('medien')}><Icon name="kamera" groesse={18} />Foto oder Video</button>
        <button type="button" role="tab" aria-selected={quelle === 'figur'} onClick={() => setQuelle('figur')}><Icon name="profil" groesse={18} />Figur ausrichten</button>
      </div>

      {!halten && (
        <div className="phasen" role="tablist" aria-label="Position">
          {(['start', 'ende'] as Phase[]).map((ph) => (
            <button key={ph} type="button" role="tab" aria-selected={phase === ph} onClick={() => setPhase(ph)}>
              <span className="phasen-nr">{ph === 'start' ? 1 : 2}</span>{ph === 'start' ? 'Ausgangsposition' : 'Endposition'}
            </button>
          ))}
        </div>
      )}

      {quelle === 'medien'
        ? <MedienVermessung modell={m} festgelegt={ansichtFest} halten={halten} phase={aktivePhase} posen={posen} ansichtSetzen={ansichtSetzen}
            uebernehmen={(ph, p) => { poseSetzen(ph, p); if (!halten && ph === 'start') setPhase('ende') }}
            beide={(s, e) => posenSetzen({ start: s, ende: e })} />
        : <Marionette key={m.ansicht} modell={m} pose={posen[aktivePhase]} geist={halten ? null : posen[aktivePhase === 'start' ? 'ende' : 'start']}
            muskelGelenk={r.zaehlen?.gelenk ?? r.pruefungen[0]?.gelenk ?? STANDARD_ZAEHLEN[r.ansicht].gelenk}
            aendern={(p) => poseSetzen(aktivePhase, p)} />}

      <WinkelRegler r={r} modell={m} gemessen={gemessen} halten={halten} phase={aktivePhase} zaehlGelenkWaehlen={zaehlGelenkWaehlen} ueberwachen={ueberwachen} winkelSetzen={winkelSetzen} setzeGrenze={setzeGrenze} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Marionette
// ---------------------------------------------------------------------------

function Marionette({ modell: m, pose, geist, muskelGelenk, aendern }: { modell: Modell; pose: Pose; geist: Pose | null; muskelGelenk: GelenkId; aendern: (p: Pose) => void }) {
  const id = useId().replace(/:/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const [zieht, setZieht] = useState<string | null>(null)
  const aktuell = useRef(pose)
  useEffect(() => { aktuell.current = pose }, [pose])

  function punkt(e: RPointerEvent): XY | null {
    const s = svg.current
    const mx = s?.getScreenCTM()
    if (!s || !mx) return null
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(mx.inverse())
    return [q.x, q.y]
  }
  const bewegen = (e: RPointerEvent) => {
    if (!zieht) return
    const q = punkt(e)
    if (q) { aktuell.current = m.ziehe(aktuell.current, zieht, q); aendern(aktuell.current) }
  }
  const Figur = m.Figur
  const ziehbar = new Set(m.anker.map((a) => a.id))

  return (
    <div className="stapel" style={{ gap: 8 }}>
      <svg ref={svg} viewBox="0 0 100 100" className={`marionette${zieht ? ' zieht' : ''}`} onPointerMove={bewegen} onPointerUp={() => setZieht(null)} onPointerCancel={() => setZieht(null)}
        role="application" aria-label="Figur: Ankerpunkte ziehen, um die Position einzustellen">
        <FigurDefs id={id} />
        <line x1="4" x2="96" y1="96" y2="96" className="mario-boden" />
        {geist && <g opacity="0.18"><Figur p={geist} muskeln={[]} id={id} /></g>}
        <g filter={`url(#${id}-tiefe)`}><Figur p={pose} muskeln={MUSKELN[muskelGelenk]} id={id} /></g>
        <g>{m.glieder.map(([a, b]) => <line key={a + b} x1={pose[a][0]} y1={pose[a][1]} x2={pose[b][0]} y2={pose[b][1]} className="mario-knochen" />)}</g>
        {m.alle.filter((a) => !ziehbar.has(a)).map((a) => <circle key={a} cx={pose[a][0]} cy={pose[a][1]} r="1.8" className="mario-punkt" />)}
        {m.anker.map(({ id: a, name }) => (
          <g key={a} className={`mario-anker${a === m.wurzel ? ' wurzel' : ''}${zieht === a ? ' aktiv' : ''}`}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); svg.current?.setPointerCapture(e.pointerId); setZieht(a) }}>
            <circle cx={pose[a][0]} cy={pose[a][1]} r="6" className="mario-griff" />
            <circle cx={pose[a][0]} cy={pose[a][1]} r="2.6" className="mario-punkt" />
            <title>{name}{a === m.wurzel ? ' (Körper heben/senken, Füße bleiben stehen)' : ''}</title>
          </g>
        ))}
      </svg>
      <div className="reihe zwischen klein leise" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span>{m.hinweis}</span>
      </div>
      <div className="chips">
        <span className="klein leise" style={{ alignSelf: 'center' }}>Ausgangsfigur:</span>
        {m.vorlagen.map((v) => <button key={v.name} type="button" className="chip" onClick={() => aendern(v.pose)}>{v.name}</button>)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Foto / Video vermessen
// ---------------------------------------------------------------------------

/** Ganzes erkanntes Skelett (beide Seiten, ohne Gesicht). */
const KNOCHEN: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32],
]

interface Figurmessung { pose: Pose; zuBild: ((q: XY) => XY) | null }
interface Messung {
  punkte: Punkt[]; welt: Punkt[] | null; seite: Seite
  /** 0 = genau von vorn/hinten, 1 = genau seitlich (nur mit 3D), sonst null */
  anteil: number | null
  seitlich: Figurmessung | null
  vorn: Figurmessung | null
  winkel: Record<GelenkId, number | null>
}

async function vermesse(el: HTMLVideoElement | HTMLImageElement, breite: number, hoehe: number): Promise<Messung | null> {
  const { punkte, welt } = await erkenneBild(el)
  if (!punkte.length) return null
  return auswerten(punkte, welt, besteSeite(punkte), breite, hoehe)
}

/**
 * Winkel in 3D (aus jeder Richtung). Beide Figuren werden berechnet: Ist das Foto aus
 * der passenden Richtung, liegt das Skelett genau auf der Person (zuBild), sonst kommt
 * die Figur aus den 3D-Punkten.
 */
function auswerten(punkte: Punkt[], welt: Punkt[] | null, seite: Seite, breite: number, hoehe: number): Messung {
  const anteil = welt && welt.length >= 33 ? seitenAnteil(welt) : null
  const vonSeite = anteil === null || anteil > 0.75
  const seitPose = vonSeite || !welt ? ausKoerperpunkten(punkte, seite, breite, hoehe) : ausWeltpunkten(welt, seite)
  const seitlich: Figurmessung | null = seitPose
    ? { pose: seitPose as unknown as Pose, zuBild: vonSeite ? bildBezug(punkte, seite, breite, hoehe) : null }
    : null
  const v = vornAusErkennung(punkte, welt, breite, hoehe)
  const vorn: Figurmessung | null = v ? { pose: v.pose as unknown as Pose, zuBild: v.zuBild } : null
  return { punkte, welt, seite, anteil, seitlich, vorn, winkel: gelenkwinkel(punkte, seite, breite, hoehe, welt) }
}
const figurAus = (m: Messung | null, a: Ansicht) => (m ? (a === 'frontal' ? m.vorn : m.seitlich) : null)

function MedienVermessung({ modell, festgelegt, halten, phase, posen, uebernehmen, beide, ansichtSetzen }: {
  /** Positionen dieser Ansicht sind schon erfasst: Ansicht nicht mehr automatisch umstellen. */
  modell: Modell; festgelegt: boolean; halten: boolean; phase: Phase; posen: { start: Pose; ende: Pose }
  uebernehmen: (ph: Phase, p: Pose) => void
  beide: (s: Pose, e: Pose) => void
  ansichtSetzen: (a: Ansicht) => void
}) {
  const ansicht = modell.ansicht
  const [datei, setDatei] = useState<{ url: string; art: 'bild' | 'video' } | null>(null)
  const [messung, setMessung] = useState<Messung | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [zeit, setZeit] = useState(0)
  const [dauer, setDauer] = useState(0)
  /** Für übernommene Positionen: wie Figur-Koordinaten zurück aufs Bild kommen (und zu welchem Video-Zeitpunkt). */
  const [bezug, setBezug] = useState<Partial<Record<Phase, { zuBild: (q: XY) => XY; zeit: number; ansicht: Ansicht }>>>({})
  const bild = useRef<HTMLImageElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const leinwand = useRef<HTMLCanvasElement>(null)
  /** Erste Messung einer neuen Datei: Ansicht der Übung ggf. automatisch anpassen. */
  const neueDatei = useRef(false)
  /** Aufnahmerichtung unklar (schräg): kurz nachfragen bzw. Umstellen anbieten. */
  const [richtung, setRichtung] = useState<'fragen' | Ansicht | null>(null)
  /** Video wird automatisch analysiert: Einzelmessungen beim Spulen und Knöpfe ruhen. */
  const [analyse, setAnalyse] = useState(false)
  const analyseRef = useRef(false)
  const figur = figurAus(messung, ansicht)
  // Angezeigt werden die Winkel der Figur, die auch übernommen wird
  const figurWerte = figur ? modell.winkel(figur.pose) : null

  useEffect(() => () => { if (datei) URL.revokeObjectURL(datei.url) }, [datei])

  function waehlen(f: File | undefined) {
    if (!f) return
    if (!/^(image|video)\//.test(f.type)) { setStatus('Bitte ein Foto oder Video wählen.'); return }
    if (f.size > 200 * 1024 * 1024) { setStatus('Die Datei ist zu groß (höchstens 200 MB).'); return }
    setMessung(null)
    setBezug({})
    setStatus('Datei wird geladen …')
    neueDatei.current = true
    setRichtung(null)
    setDatei({ url: URL.createObjectURL(f), art: f.type.startsWith('video') ? 'video' : 'bild' })
  }

  const masse = (el: HTMLVideoElement | HTMLImageElement) =>
    el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight]

  async function messen() {
    const el = datei?.art === 'video' ? video.current : bild.current
    if (!el) return
    const [b, h] = masse(el)
    setStatus('Körper wird vermessen … (beim ersten Mal lädt die Erkennung, ca. 25 MB)')
    try {
      const m = await vermesse(el, b, h)
      setMessung(m)
      let a = ansicht, umgestellt = false, abweichend = false, fragen = false
      if (m && neueDatei.current && m.anteil !== null) {
        // Aufnahmerichtung erkannt: beim ersten Foto die Übung auf die passende Ansicht stellen
        const erkannt: Ansicht | null = m.anteil < 0.4 ? 'frontal' : m.anteil > 0.6 ? 'seitlich' : null
        if (erkannt && erkannt !== ansicht) {
          if (festgelegt) { abweichend = true; setRichtung(erkannt) }
          else { a = erkannt; umgestellt = true; ansichtSetzen(erkannt) }
        } else if (!erkannt && !festgelegt) {
          fragen = true; setRichtung('fragen')
        }
      }
      if (m) neueDatei.current = false
      const f = figurAus(m, a)
      setStatus(!m ? 'Keine Person erkannt. Bitte ganzer Körper im Bild und gutes Licht.'
        : !f ? 'Nicht alle Körperpunkte sind sichtbar – bitte ganzer Körper im Bild.'
        : fragen ? 'Schräg aufgenommen. Wie bewegt sich die Person bei dieser Übung?'
        : umgestellt ? (a === 'frontal'
          ? 'Von vorn aufgenommen – die Übung ist jetzt auf „Von vorn“ gestellt. Gemessen werden Bewegungen zur Seite (Seitneigung, Arme, Beine, Kopf).'
          : 'Von der Seite aufgenommen – die Übung ist jetzt auf „Von der Seite“ gestellt.')
        : abweichend ? `Dieses Foto ist eher ${a === 'frontal' ? 'von der Seite' : 'von vorn'} aufgenommen. Gemessen wird trotzdem ${a === 'frontal' ? 'von vorn' : 'von der Seite'} – in 3D.`
        : !f.zuBild ? 'Schräg aufgenommen: Die Winkel werden in 3D gemessen.'
        : null)
    } catch (e) {
      console.error('Vermessung fehlgeschlagen', e)
      setStatus(`Die Vermessung hat nicht geklappt. Bitte die Seite neu laden und noch einmal versuchen. (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  function zeichne(m: Messung | null) {
    const c = leinwand.current, el = datei?.art === 'video' ? video.current : bild.current
    if (!c || !el) return
    c.width = el.clientWidth * devicePixelRatio; c.height = el.clientHeight * devicePixelRatio
    c.style.width = `${el.clientWidth}px`; c.style.height = `${el.clientHeight}px`
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    if (!m) return
    const px = devicePixelRatio
    ctx.lineCap = 'round'
    const linie = (a: [number, number], b: [number, number]) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke() }
    const punkt = (q: [number, number], r: number) => { ctx.beginPath(); ctx.arc(...q, r * px, 0, Math.PI * 2); ctx.fill() }
    const lmXY = (i: number): [number, number] => [m.punkte[i].x * c.width, m.punkte[i].y * c.height]

    // Übernommene (und evtl. per Regler verstellte) Position, sonst die Messung selbst – als Figur auf dem Bild
    const b = bezug[phase]
    const passt = b && b.ansicht === ansicht && (datei?.art !== 'video' || Math.abs(b.zeit - (video.current?.currentTime ?? 0)) < 0.08)
    const f = figurAus(m, ansicht)
    const figurBild = passt ? { pose: posen[phase], zuBild: b.zuBild } : f?.zuBild ? { pose: f.pose, zuBild: f.zuBild } : null

    // Ganzes erkanntes Skelett: dünn als Vergleich, kräftig wenn keine Figur aufs Bild passt
    ctx.strokeStyle = figurBild ? 'rgba(255,255,255,0.6)' : '#f2a41c'
    ctx.lineWidth = (figurBild ? 2 : 4) * px
    for (const [a, z] of KNOCHEN) linie(lmXY(a), lmXY(z))
    if (!figurBild) {
      ctx.fillStyle = '#fff'
      for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) punkt(lmXY(i), 4.5)
      return
    }
    const pos = (a: string): [number, number] => { const [x, y] = figurBild.zuBild(figurBild.pose[a]); return [x * c.width, y * c.height] }
    ctx.strokeStyle = '#f2a41c'; ctx.lineWidth = 4 * px
    for (const [a, z] of modell.glieder) linie(pos(a), pos(z))
    ctx.fillStyle = '#fff'
    for (const a of modell.alle) punkt(pos(a), 5)
  }
  const zeichneAktuell = useRef(zeichne)
  zeichneAktuell.current = zeichne
  // Neu zeichnen, wenn sich die Figur (Schieberegler), die Position oder die Ansicht ändert
  useEffect(() => { zeichneAktuell.current(messung) }, [posen, phase, bezug, messung, ansicht])

  function merkeBezug(ph: Phase, f: Figurmessung) {
    if (f.zuBild) setBezug((x) => ({ ...x, [ph]: { zuBild: f.zuBild as (q: XY) => XY, zeit: video.current?.currentTime ?? 0, ansicht } }))
    else setBezug((x) => { const y = { ...x }; delete y[ph]; return y })
  }
  function uebernimm(ph: Phase) {
    if (!figur) return
    merkeBezug(ph, figur)
    uebernehmen(ph, figur.pose)
  }

  function seiteWechseln() {
    const el = datei?.art === 'video' ? video.current : bild.current
    if (!messung || !el) return
    const [b, h] = masse(el)
    const m = auswerten(messung.punkte, messung.welt, messung.seite === 'links' ? 'rechts' : 'links', b, h)
    setMessung(m)
  }

  /** Video in Schritten vermessen und die zwei Positionen mit der größten Bewegung finden. */
  async function automatisch() {
    const v = video.current
    if (!v || !dauer || analyseRef.current) return
    analyseRef.current = true; setAnalyse(true)
    try { await analysieren(v) } finally { analyseRef.current = false; setAnalyse(false) }
  }
  async function analysieren(v: HTMLVideoElement) {
    const schritte = 18
    const liste: { t: number; m: Messung; f: Figurmessung }[] = []
    for (let i = 0; i < schritte; i++) {
      setStatus(`Video wird analysiert … ${Math.round((i / schritte) * 100)} %`)
      const t = (dauer * i) / (schritte - 1) * 0.98
      await springe(v, t)
      const m = await vermesse(v, v.videoWidth, v.videoHeight).catch(() => null)
      const f = figurAus(m, ansicht)
      if (m && f) liste.push({ t, m, f })
    }
    if (liste.length < 3) { setStatus('Im Video war die Person zu selten ganz zu sehen.'); return }
    // Gelenk mit der größten Bewegung; Start = erstes Bild, Ende = weitester Punkt davon
    const wf = (x: { f: Figurmessung }) => modell.winkel(x.f.pose)
    const best = hauptGelenk(modell, (g) => {
      const w = liste.map((x) => wf(x)[g]).filter((x): x is number => x != null)
      return w.length ? Math.max(...w) - Math.min(...w) : null
    }) ?? modell.zaehlbar[0]
    const s = liste[0]
    const abst = (x: typeof s) => Math.abs((wf(x)[best] ?? 0) - (wf(s)[best] ?? 0))
    const e = liste.reduce((a, x) => (abst(x) > abst(a) ? x : a), liste[0])
    beide(s.f.pose, e.f.pose)
    setBezug({
      ...(s.f.zuBild ? { start: { zuBild: s.f.zuBild, zeit: s.t, ansicht } } : {}),
      ...(e.f.zuBild ? { ende: { zuBild: e.f.zuBild, zeit: e.t, ansicht } } : {}),
    })
    await springe(v, e.t); setZeit(e.t)
    setMessung(e.m)
    setStatus(`Gefunden: ${GELENK[best].name} bewegt sich von ${rund(wf(s)[best])}° bis ${rund(wf(e)[best])}°. Beide Positionen sind übernommen – prüfe sie kurz.`)
  }

  const werte = gelenkeFuer(ansicht).filter((g) => figurWerte?.[g.id] != null)

  return (
    <div className="stapel" style={{ gap: 10 }}>
      {!datei ? (
        <label className="medien-ablage">
          <input type="file" accept="image/*,video/*" onChange={(e) => waehlen(e.target.files?.[0])} />
          <Icon name="hochladen" groesse={28} />
          <strong>Foto oder Video der perfekten Ausführung</strong>
          <span className="klein leise">Von vorn, von der Seite oder schräg – ganzer Körper im Bild. Die App erkennt die Richtung selbst. Die Datei wird nur hier im Browser vermessen und nicht hochgeladen.</span>
        </label>
      ) : (
        <>
          <div className="medien-buehne">
            {datei.art === 'bild'
              ? <img ref={bild} src={datei.url} alt="Hochgeladene Übung" onLoad={() => void messen()}
                  onError={() => setStatus('Dieses Bildformat kann der Browser nicht öffnen (z. B. HEIC vom iPhone). Bitte das Foto als JPG wählen oder einen Screenshot davon nehmen.')} />
              : <video ref={video} src={datei.url} muted playsInline preload="auto"
                  onLoadedData={() => { setDauer(video.current?.duration ?? 0); void messen() }} onSeeked={() => { if (!analyseRef.current) void messen() }}
                  onError={() => setStatus('Dieses Videoformat kann der Browser nicht abspielen. Bitte als MP4 aufnehmen oder exportieren.')} />}
            <canvas ref={leinwand} aria-hidden="true" />
          </div>
          {datei.art === 'video' && dauer > 0 && (
            <label className="feld"><span>Stelle im Video: {zeit.toFixed(1)} s</span>
              <input type="range" min={0} max={dauer} step={0.05} value={zeit} onChange={(e) => { const t = Number(e.target.value); setZeit(t); if (video.current) video.current.currentTime = t }} />
            </label>
          )}
          {status && <p className="klein" role="status" style={{ margin: 0 }}>{status}</p>}
          {richtung === 'fragen' && (
            <div className="reihe" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="knopf klein" onClick={() => { setRichtung(null); setStatus(null); ansichtSetzen('frontal') }}>Zur Seite (Kamera von vorn)</button>
              <button type="button" className="knopf klein" onClick={() => { setRichtung(null); setStatus(null); ansichtSetzen('seitlich') }}>Nach vorn/hinten (Kamera seitlich)</button>
            </div>
          )}
          {(richtung === 'frontal' || richtung === 'seitlich') && richtung !== ansicht && (
            <button type="button" className="knopf klein still" style={{ alignSelf: 'flex-start' }} onClick={() => { const a = richtung; setRichtung(null); setStatus(null); ansichtSetzen(a) }}>
              Auf „{richtung === 'frontal' ? 'Von vorn' : 'Von der Seite'}“ umstellen
            </button>
          )}
          {messung && ansicht === 'seitlich' && (
            <button type="button" className="knopf klein still" style={{ alignSelf: 'flex-start' }} onClick={() => seiteWechseln()}>
              Andere Körperseite messen (jetzt: {messung.seite === 'links' ? 'linke' : 'rechte'})
            </button>
          )}
          {figur && werte.length > 0 && (
            <div className="medien-werte">
              {werte.map((g) => <span key={g.id}>{g.name} <b>{rund(figurWerte?.[g.id])}°</b></span>)}
            </div>
          )}
          <div className="reihe" style={{ flexWrap: 'wrap' }}>
            {halten ? (
              <button type="button" className="knopf primaer" disabled={!figur || analyse} onClick={() => uebernimm('ende')}>Als Halteposition übernehmen</button>
            ) : (
              <>
                <button type="button" className={`knopf${phase === 'start' ? ' primaer' : ''}`} disabled={!figur || analyse} onClick={() => uebernimm('start')}>Als Ausgangsposition</button>
                <button type="button" className={`knopf${phase === 'ende' ? ' primaer' : ''}`} disabled={!figur || analyse} onClick={() => uebernimm('ende')}>Als Endposition</button>
              </>
            )}
            {datei.art === 'video' && !halten && <button type="button" className="knopf" disabled={analyse} onClick={() => void automatisch()}><Icon name="aktualisieren" groesse={18} />{analyse ? 'Wird analysiert …' : 'Automatisch finden'}</button>}
            <label className="knopf still">
              <input type="file" accept="image/*,video/*" hidden onChange={(e) => waehlen(e.target.files?.[0])} />Andere Datei
            </label>
          </div>
          {!halten && datei.art === 'bild' && <p className="klein leise" style={{ margin: 0 }}>Für die zweite Position einfach ein weiteres Foto wählen.</p>}
        </>
      )}
    </div>
  )
}

function springe(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((ok) => {
    const fertig = () => { v.removeEventListener('seeked', fertig); ok() }
    v.addEventListener('seeked', fertig)
    v.currentTime = t
  })
}

// ---------------------------------------------------------------------------
// Winkel mit Schiebereglern
// ---------------------------------------------------------------------------

function WinkelRegler({ r, modell, gemessen, halten, phase, zaehlGelenkWaehlen, ueberwachen, winkelSetzen, setzeGrenze }: {
  r: Regeln; modell: Modell; gemessen: Record<Phase, Record<GelenkId, number | null>>; halten: boolean; phase: Phase
  zaehlGelenkWaehlen: (g: GelenkId) => void; ueberwachen: (g: GelenkId, an: boolean) => void
  winkelSetzen: (g: GelenkId, v: number) => void; setzeGrenze: (g: GelenkId, f: 'min' | 'max', v: number) => void
}) {
  const positionName = halten ? 'Position' : phase === 'start' ? 'Ausgang' : 'Ende'
  return (
    <div className="stapel" style={{ gap: 10 }}>
      <div className="stapel" style={{ gap: 2 }}>
        <h3 className="karte-titel">Winkel {halten ? '' : phase === 'start' ? '– Ausgangsposition' : '– Endposition'}</h3>
        <span className="klein leise">Schieberegler bewegen die Figur{' '}und das Skelett auf dem Foto mit. Oben zwischen Ausgangs- und Endposition wechseln.</span>
      </div>
      {gelenkeFuer(modell.ansicht).map((g) => {
        const zaehlt = !halten && r.zaehlen?.gelenk === g.id
        const auto = r.pruefungen.find((p) => p.id === AUTO + g.id)
        const ms = rund(gemessen.start[g.id]), me = rund(gemessen.ende[g.id])
        const jetzt = rund(gemessen[phase][g.id])
        return (
          <div key={g.id} className={`winkel-zeile${zaehlt ? ' zaehlt' : ''}`}>
            <div className="reihe zwischen" style={{ gap: 8 }}>
              <span className="winkel-name" title={g.erklaerung}>{g.name}</span>
              <span className="klein leise">{halten ? `${me ?? '–'}°` : `${ms ?? '–'}° → ${me ?? '–'}°`}</span>
            </div>
            {jetzt !== null && <Regler name={positionName} wert={jetzt} max={g.max} aendern={(v) => winkelSetzen(g.id, v)} />}
            <div className="reihe" style={{ gap: 14, flexWrap: 'wrap' }}>
              {!halten && modell.zaehlbar.includes(g.id) && (
                <label className="reihe klein" style={{ gap: 6 }}><input type="radio" name="zaehlgelenk" checked={zaehlt} onChange={() => zaehlGelenkWaehlen(g.id)} />zählt die Wiederholung</label>
              )}
              {!zaehlt && <label className="reihe klein" style={{ gap: 6 }}><input type="checkbox" checked={!!auto} onChange={(e) => ueberwachen(g.id, e.target.checked)} />überwachen</label>}
            </div>
            {auto && (
              <div className="spielraum">
                <span className="klein leise">Erlaubter Bereich während der Übung</span>
                <Regler name="min" wert={auto.min ?? 0} marke={halten ? me : Math.min(ms ?? 0, me ?? 0)} aendern={(v) => setzeGrenze(g.id, 'min', v)} />
                <Regler name="max" wert={auto.max ?? 180} marke={halten ? me : Math.max(ms ?? 0, me ?? 0)} aendern={(v) => setzeGrenze(g.id, 'max', v)} />
              </div>
            )}
          </div>
        )
      })}
      <p className="klein leise" style={{ margin: 0 }}>„Zählt“: Die Wiederholung zählt, wenn dieses Gelenk von der Ausgangs- zur Endposition und zurück geht. „Überwachen“: erlaubt anfangs ±{TOLERANZ}° um die gezeigte Haltung – die Meldung dazu kannst du unten bei „Fehlermeldungen“ anpassen.</p>
    </div>
  )
}

function Regler({ name, wert, marke = null, max = 180, aendern }: { name: string; wert: number; marke?: number | null; max?: number; aendern: (v: number) => void }) {
  return (
    <label className="regler">
      <span className="regler-name">{name}</span>
      <span className="regler-bahn">
        <input type="range" min={0} max={max} step={1} value={Math.min(wert, max)} onChange={(e) => aendern(Number(e.target.value))} aria-label={`${name} in Grad`} />
        {marke !== null && <span className="regler-marke" style={{ left: `calc(${(Math.min(marke, max) / max) * 100}% )` }} title={`gemessen ${marke}°`} />}
      </span>
      <b className="regler-wert">{wert}°</b>
    </label>
  )
}
