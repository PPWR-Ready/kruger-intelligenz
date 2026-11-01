// Übung visuell erfassen: Ausgangs- und Endposition entweder aus einem Foto/Video
// vermessen oder an einer Figur (Marionette) einstellen. Die Winkel werden live in
// die Kamera-Regeln übernommen und lassen sich mit Schiebereglern anpassen.
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { FigurDefs, MUSKELN, Mensch } from '../../components/UebungsBild'
import { Icon } from '../../components/Icon'
import { ANKER, STEHEN, VORLAGEN, ausKoerperpunkten, figurWinkel, zieheAnker, type Anker, type FigurPose, type XY } from '../../lib/pose/figur'
import { GELENK, GELENKE, besteSeite, gelenkwinkel, type GelenkId, type Punkt } from '../../lib/pose/geometrie'
import { erkennungLaden } from '../../lib/pose/erkennung'
import type { Pruefung, Regeln } from '../../lib/pose/regeln'

type Phase = 'start' | 'ende'
const TOLERANZ = 15
const ZAEHLBAR: GelenkId[] = ['knie', 'huefte', 'ellbogen', 'schulter', 'sprunggelenk', 'koerperlinie', 'rumpfneigung']
const MELDUNG: Record<GelenkId, string> = {
  knie: 'Knie-Beugung anpassen.', huefte: 'Hüfte so beugen wie gezeigt.', ellbogen: 'Arm-Haltung anpassen.', schulter: 'Arm-Position anpassen.',
  sprunggelenk: 'Fuß-Position anpassen.', koerperlinie: 'Körper gerade halten.', rumpfneigung: 'Oberkörper-Neigung korrigieren.', kopfhaltung: 'Kopf in Verlängerung der Wirbelsäule.',
}
const AUTO = 'auto-'
const rund = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const kl = (v: number) => Math.max(0, Math.min(180, Math.round(v)))

export function Bewegungserfassung({ r, setR }: { r: Regeln; setR: (f: (x: Regeln) => Regeln) => void }) {
  const halten = r.modus === 'halten'
  const [phase, setPhase] = useState<Phase>(halten ? 'ende' : 'start')
  const [quelle, setQuelle] = useState<'figur' | 'medien'>('figur')
  const [zaehlFest, setZaehlFest] = useState(!!r.figur || !!r.zaehlen)
  const posen = useMemo(() => r.figur ?? { start: STEHEN, ende: STEHEN }, [r.figur])
  const aktivePhase: Phase = halten ? 'ende' : phase
  const gemessen = useMemo(() => ({ start: figurWinkel(posen.start), ende: figurWinkel(posen.ende) }), [posen])

  // Neue Posen übernehmen: Zählwinkel und überwachte Gelenke folgen den Messwerten
  function posenSetzen(neu: { start: FigurPose; ende: FigurPose }, festhalten = zaehlFest) {
    const ws = figurWinkel(neu.start), we = figurWinkel(neu.ende)
    setR((x) => {
      let zaehlen = x.zaehlen
      if (x.modus === 'wiederholungen') {
        let g = zaehlen?.gelenk ?? 'knie'
        if (!festhalten) {
          let best = -1
          for (const id of ZAEHLBAR) {
            const d = Math.abs((ws[id] ?? 0) - (we[id] ?? 0))
            if (ws[id] != null && we[id] != null && d > best) { best = d; g = id }
          }
        }
        zaehlen = { gelenk: g, start: kl(ws[g] ?? 170), umkehr: kl(we[g] ?? 100) }
      }
      const pruefungen = x.pruefungen.map((p) => {
        if (!p.id.startsWith(AUTO)) return p
        const a = x.modus === 'halten' ? we[p.gelenk] : ws[p.gelenk], b = we[p.gelenk]
        if (a == null || b == null) return p
        return { ...p, min: kl(Math.min(a, b) - TOLERANZ), max: kl(Math.max(a, b) + TOLERANZ) }
      })
      return { ...x, figur: neu, zaehlen, pruefungen }
    })
  }
  const poseSetzen = (ph: Phase, p: FigurPose) => posenSetzen(halten ? { start: p, ende: p } : { ...posen, [ph]: p })

  function zaehlGelenkWaehlen(g: GelenkId) {
    setZaehlFest(true)
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
  const setzeZaehl = (feld: 'start' | 'umkehr', v: number) => setR((x) => (x.zaehlen ? { ...x, zaehlen: { ...x.zaehlen, [feld]: v } } : x))
  const setzeGrenze = (g: GelenkId, feld: 'min' | 'max', v: number) =>
    setR((x) => ({ ...x, pruefungen: x.pruefungen.map((p) => (p.id === AUTO + g ? { ...p, [feld]: v } : p)) }))

  return (
    <section className="karte erfassung">
      <div className="stapel" style={{ gap: 4 }}>
        <h2 className="untertitel">Bewegung erfassen</h2>
        <p className="klein leise" style={{ margin: 0 }}>
          {halten ? 'Zeig die Halteposition' : 'Zeig Ausgangs- und Endposition'} – per Foto oder Video, oder richte die Figur selbst aus. Die Winkel werden sofort eingetragen und lassen sich unten fein einstellen.
        </p>
      </div>

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
        ? <MedienVermessung halten={halten} phase={aktivePhase} uebernehmen={(ph, p) => { poseSetzen(ph, p); if (!halten) setPhase(ph === 'start' ? 'ende' : 'start') }} beide={(s, e) => posenSetzen({ start: s, ende: e })} />
        : <Marionette pose={posen[aktivePhase]} geist={halten ? null : posen[aktivePhase === 'start' ? 'ende' : 'start']} muskelGelenk={r.zaehlen?.gelenk ?? r.pruefungen[0]?.gelenk ?? 'knie'}
            aendern={(p) => poseSetzen(aktivePhase, p)} />}

      <WinkelRegler r={r} gemessen={gemessen} halten={halten} zaehlGelenkWaehlen={zaehlGelenkWaehlen} ueberwachen={ueberwachen} setzeZaehl={setzeZaehl} setzeGrenze={setzeGrenze} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Marionette
// ---------------------------------------------------------------------------

function Marionette({ pose, geist, muskelGelenk, aendern }: { pose: FigurPose; geist: FigurPose | null; muskelGelenk: GelenkId; aendern: (p: FigurPose) => void }) {
  const id = useId().replace(/:/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const [zieht, setZieht] = useState<Anker | null>(null)
  const aktuell = useRef(pose)
  useEffect(() => { aktuell.current = pose }, [pose])

  function punkt(e: RPointerEvent): XY | null {
    const s = svg.current
    const m = s?.getScreenCTM()
    if (!s || !m) return null
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [q.x, q.y]
  }
  const bewegen = (e: RPointerEvent) => {
    if (!zieht) return
    const q = punkt(e)
    if (q) { aktuell.current = zieheAnker(aktuell.current, zieht, q); aendern(aktuell.current) }
  }
  const linie = (a: Anker, b: Anker) => <line key={a + b} x1={pose[a][0]} y1={pose[a][1]} x2={pose[b][0]} y2={pose[b][1]} className="mario-knochen" />

  return (
    <div className="stapel" style={{ gap: 8 }}>
      <svg ref={svg} viewBox="0 0 100 100" className={`marionette${zieht ? ' zieht' : ''}`} onPointerMove={bewegen} onPointerUp={() => setZieht(null)} onPointerCancel={() => setZieht(null)}
        role="application" aria-label="Figur: Ankerpunkte ziehen, um die Position einzustellen">
        <FigurDefs id={id} />
        <line x1="4" x2="96" y1="96" y2="96" className="mario-boden" />
        {geist && <g opacity="0.18"><Mensch p={geist} muskeln={[]} id={id} /></g>}
        <g filter={`url(#${id}-tiefe)`}><Mensch p={pose} muskeln={MUSKELN[muskelGelenk]} id={id} /></g>
        <g>{[['huefte', 'schulter'], ['schulter', 'kopf'], ['schulter', 'ellbogen'], ['ellbogen', 'hand'], ['huefte', 'knie'], ['knie', 'fuss'], ['fuss', 'zeh']].map(([a, b]) => linie(a as Anker, b as Anker))}</g>
        {ANKER.map(({ id: a, name }) => (
          <g key={a} className={`mario-anker${a === 'huefte' ? ' wurzel' : ''}${zieht === a ? ' aktiv' : ''}`}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); svg.current?.setPointerCapture(e.pointerId); setZieht(a) }}>
            <circle cx={pose[a][0]} cy={pose[a][1]} r="6" className="mario-griff" />
            <circle cx={pose[a][0]} cy={pose[a][1]} r="2.6" className="mario-punkt" />
            <title>{name}{a === 'huefte' ? ' (Körper heben/senken, Füße bleiben stehen)' : ''}</title>
          </g>
        ))}
      </svg>
      <div className="reihe zwischen klein leise" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span>Punkte ziehen – die Glieder drehen sich wie bei einer Marionette. Die Hüfte (dunkler Punkt) senkt oder hebt den Körper, die Füße bleiben dabei am Boden.</span>
      </div>
      <div className="chips">
        <span className="klein leise" style={{ alignSelf: 'center' }}>Ausgangsfigur:</span>
        {VORLAGEN.map((v) => <button key={v.name} type="button" className="chip" onClick={() => aendern(v.pose)}>{v.name}</button>)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Foto / Video vermessen
// ---------------------------------------------------------------------------

let zeitstempel = 0
async function vermesse(el: HTMLVideoElement | HTMLImageElement, breite: number, hoehe: number) {
  const lm = await erkennungLaden()
  zeitstempel += 50
  const r = lm.detectForVideo(el as HTMLVideoElement, zeitstempel)
  const punkte = (r.landmarks[0] ?? []) as Punkt[]
  if (!punkte.length) return null
  const seite = besteSeite(punkte)
  return { punkte, seite, pose: ausKoerperpunkten(punkte, seite, breite, hoehe), winkel: gelenkwinkel(punkte, seite, breite, hoehe) }
}
type Messung = NonNullable<Awaited<ReturnType<typeof vermesse>>>

function MedienVermessung({ halten, phase, uebernehmen, beide }: {
  halten: boolean; phase: Phase
  uebernehmen: (ph: Phase, p: FigurPose) => void
  beide: (s: FigurPose, e: FigurPose) => void
}) {
  const [datei, setDatei] = useState<{ url: string; art: 'bild' | 'video' } | null>(null)
  const [messung, setMessung] = useState<Messung | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [zeit, setZeit] = useState(0)
  const [dauer, setDauer] = useState(0)
  const bild = useRef<HTMLImageElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const leinwand = useRef<HTMLCanvasElement>(null)

  useEffect(() => () => { if (datei) URL.revokeObjectURL(datei.url) }, [datei])

  function waehlen(f: File | undefined) {
    if (!f) return
    if (!/^(image|video)\//.test(f.type)) { setStatus('Bitte ein Foto oder Video wählen.'); return }
    if (f.size > 200 * 1024 * 1024) { setStatus('Die Datei ist zu groß (höchstens 200 MB).'); return }
    setMessung(null)
    setStatus('Datei wird geladen …')
    setDatei({ url: URL.createObjectURL(f), art: f.type.startsWith('video') ? 'video' : 'bild' })
  }

  async function messen() {
    const el = datei?.art === 'video' ? video.current : bild.current
    if (!el) return
    const b = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
    const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
    setStatus('Körper wird vermessen … (beim ersten Mal lädt die Erkennung, ca. 25 MB)')
    try {
      const m = await vermesse(el, b, h)
      setMessung(m)
      setStatus(!m ? 'Keine Person erkannt. Am besten seitlich, ganzer Körper im Bild, gutes Licht.' : !m.pose ? 'Nicht alle Körperpunkte sind sichtbar – bitte ganzer Körper im Bild.' : null)
      zeichne(m)
    } catch {
      setStatus('Die Vermessung hat nicht geklappt. Bitte neu laden und noch einmal versuchen.')
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
    const r = m.seite === 'rechts' ? 1 : 0
    const xy = (i: number): [number, number] => [m.punkte[i + r].x * c.width, m.punkte[i + r].y * c.height]
    ctx.lineCap = 'round'; ctx.lineWidth = 4 * devicePixelRatio; ctx.strokeStyle = '#f2a41c'
    for (const [a, b] of [[7, 11], [11, 13], [13, 15], [11, 23], [23, 25], [25, 27], [27, 31]]) {
      ctx.beginPath(); ctx.moveTo(...xy(a)); ctx.lineTo(...xy(b)); ctx.stroke()
    }
    ctx.fillStyle = '#fff'
    for (const i of [7, 11, 13, 15, 23, 25, 27, 31]) { ctx.beginPath(); ctx.arc(...xy(i), 5 * devicePixelRatio, 0, Math.PI * 2); ctx.fill() }
  }

  function seiteWechseln() {
    const el = datei?.art === 'video' ? video.current : bild.current
    if (!messung || !el) return
    const b = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
    const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
    const seite = messung.seite === 'links' ? 'rechts' : 'links'
    const m: Messung = { ...messung, seite, pose: ausKoerperpunkten(messung.punkte, seite, b, h), winkel: gelenkwinkel(messung.punkte, seite, b, h) }
    setMessung(m); zeichne(m)
  }

  /** Video in Schritten vermessen und die zwei Positionen mit der größten Bewegung finden. */
  async function automatisch() {
    const v = video.current
    if (!v || !dauer) return
    const schritte = 18
    const liste: { t: number; m: Messung }[] = []
    for (let i = 0; i < schritte; i++) {
      setStatus(`Video wird analysiert … ${Math.round((i / schritte) * 100)} %`)
      const t = (dauer * i) / (schritte - 1) * 0.98
      await springe(v, t)
      const m = await vermesse(v, v.videoWidth, v.videoHeight).catch(() => null)
      if (m?.pose) liste.push({ t, m })
    }
    if (liste.length < 3) { setStatus('Im Video war die Person zu selten ganz zu sehen.'); return }
    // Gelenk mit der größten Bewegung; Start = erstes Bild, Ende = weitester Punkt davon
    let best: GelenkId = 'knie', spanne = -1
    for (const g of ZAEHLBAR) {
      const w = liste.map((x) => x.m.winkel[g]).filter((v): v is number => v != null)
      if (w.length && Math.max(...w) - Math.min(...w) > spanne) { spanne = Math.max(...w) - Math.min(...w); best = g }
    }
    const s = liste[0]
    const e = liste.reduce((a, x) => (Math.abs((x.m.winkel[best] ?? 0) - (s.m.winkel[best] ?? 0)) > Math.abs((a.m.winkel[best] ?? 0) - (s.m.winkel[best] ?? 0)) ? x : a), liste[0])
    beide(s.m.pose as FigurPose, e.m.pose as FigurPose)
    await springe(v, e.t); setZeit(e.t)
    setMessung(e.m); zeichne(e.m)
    setStatus(`Gefunden: ${GELENK[best].name} bewegt sich von ${rund(s.m.winkel[best])}° bis ${rund(e.m.winkel[best])}°. Beide Positionen sind übernommen – prüfe sie kurz.`)
  }

  return (
    <div className="stapel" style={{ gap: 10 }}>
      {!datei ? (
        <label className="medien-ablage">
          <input type="file" accept="image/*,video/*" onChange={(e) => waehlen(e.target.files?.[0])} />
          <Icon name="hochladen" groesse={28} />
          <strong>Foto oder Video der perfekten Ausführung</strong>
          <span className="klein leise">Seitlich aufgenommen, ganzer Körper im Bild. Die Datei wird nur hier im Browser vermessen und nicht hochgeladen.</span>
        </label>
      ) : (
        <>
          <div className="medien-buehne">
            {datei.art === 'bild'
              ? <img ref={bild} src={datei.url} alt="Hochgeladene Übung" onLoad={() => void messen()} />
              : <video ref={video} src={datei.url} muted playsInline preload="auto"
                  onLoadedData={() => { setDauer(video.current?.duration ?? 0); void messen() }} onSeeked={() => void messen()} />}
            <canvas ref={leinwand} aria-hidden="true" />
          </div>
          {datei.art === 'video' && dauer > 0 && (
            <label className="feld"><span>Stelle im Video: {zeit.toFixed(1)} s</span>
              <input type="range" min={0} max={dauer} step={0.05} value={zeit} onChange={(e) => { const t = Number(e.target.value); setZeit(t); if (video.current) video.current.currentTime = t }} />
            </label>
          )}
          {status && <p className="klein" role="status" style={{ margin: 0 }}>{status}</p>}
          {messung && (
            <button type="button" className="knopf klein still" style={{ alignSelf: 'flex-start' }} onClick={() => seiteWechseln()}>
              Andere Körperseite messen (jetzt: {messung.seite === 'links' ? 'linke' : 'rechte'})
            </button>
          )}
          {messung?.pose && (
            <div className="medien-werte">
              {GELENKE.filter((g) => messung.winkel[g.id] != null).map((g) => <span key={g.id}>{g.name} <b>{rund(messung.winkel[g.id])}°</b></span>)}
            </div>
          )}
          <div className="reihe" style={{ flexWrap: 'wrap' }}>
            {halten ? (
              <button type="button" className="knopf primaer" disabled={!messung?.pose} onClick={() => messung?.pose && uebernehmen('ende', messung.pose)}>Als Halteposition übernehmen</button>
            ) : (
              <>
                <button type="button" className={`knopf${phase === 'start' ? ' primaer' : ''}`} disabled={!messung?.pose} onClick={() => messung?.pose && uebernehmen('start', messung.pose)}>Als Ausgangsposition</button>
                <button type="button" className={`knopf${phase === 'ende' ? ' primaer' : ''}`} disabled={!messung?.pose} onClick={() => messung?.pose && uebernehmen('ende', messung.pose)}>Als Endposition</button>
              </>
            )}
            {datei.art === 'video' && !halten && <button type="button" className="knopf" onClick={() => void automatisch()}><Icon name="aktualisieren" groesse={18} />Automatisch finden</button>}
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

function WinkelRegler({ r, gemessen, halten, zaehlGelenkWaehlen, ueberwachen, setzeZaehl, setzeGrenze }: {
  r: Regeln; gemessen: Record<Phase, Record<GelenkId, number | null>>; halten: boolean
  zaehlGelenkWaehlen: (g: GelenkId) => void; ueberwachen: (g: GelenkId, an: boolean) => void
  setzeZaehl: (f: 'start' | 'umkehr', v: number) => void; setzeGrenze: (g: GelenkId, f: 'min' | 'max', v: number) => void
}) {
  return (
    <div className="stapel" style={{ gap: 10 }}>
      <h3 className="karte-titel">Winkel</h3>
      {GELENKE.map((g) => {
        const zaehlt = !halten && r.zaehlen?.gelenk === g.id
        const auto = r.pruefungen.find((p) => p.id === AUTO + g.id)
        const ms = rund(gemessen.start[g.id]), me = rund(gemessen.ende[g.id])
        return (
          <div key={g.id} className={`winkel-zeile${zaehlt ? ' zaehlt' : ''}`}>
            <div className="reihe zwischen" style={{ gap: 8 }}>
              <span className="winkel-name" title={g.erklaerung}>{g.name}</span>
              <span className="klein leise">{halten ? `${me ?? '–'}°` : `${ms ?? '–'}° → ${me ?? '–'}°`}</span>
            </div>
            <div className="reihe" style={{ gap: 14, flexWrap: 'wrap' }}>
              {!halten && ZAEHLBAR.includes(g.id) && (
                <label className="reihe klein" style={{ gap: 6 }}><input type="radio" name="zaehlgelenk" checked={zaehlt} onChange={() => zaehlGelenkWaehlen(g.id)} />zählt die Wiederholung</label>
              )}
              {!zaehlt && <label className="reihe klein" style={{ gap: 6 }}><input type="checkbox" checked={!!auto} onChange={(e) => ueberwachen(g.id, e.target.checked)} />überwachen</label>}
            </div>
            {zaehlt && r.zaehlen && (
              <>
                <Regler name="Ausgang" wert={r.zaehlen.start} marke={ms} aendern={(v) => setzeZaehl('start', v)} />
                <Regler name="Ende" wert={r.zaehlen.umkehr} marke={me} aendern={(v) => setzeZaehl('umkehr', v)} />
              </>
            )}
            {auto && (
              <>
                <Regler name="min" wert={auto.min ?? 0} marke={halten ? me : ms} aendern={(v) => setzeGrenze(g.id, 'min', v)} />
                <Regler name="max" wert={auto.max ?? 180} marke={me} aendern={(v) => setzeGrenze(g.id, 'max', v)} />
              </>
            )}
          </div>
        )
      })}
      <p className="klein leise" style={{ margin: 0 }}>Der Punkt auf dem Regler zeigt den gemessenen Wert. „Überwachen“ erlaubt ±{TOLERANZ}° um die gezeigte Haltung – die Meldung dazu kannst du unten bei „Fehlermeldungen“ anpassen.</p>
    </div>
  )
}

function Regler({ name, wert, marke, aendern }: { name: string; wert: number; marke: number | null; aendern: (v: number) => void }) {
  return (
    <label className="regler">
      <span className="regler-name">{name}</span>
      <span className="regler-bahn">
        <input type="range" min={0} max={180} step={1} value={wert} onChange={(e) => aendern(Number(e.target.value))} aria-label={`${name} in Grad`} />
        {marke !== null && <span className="regler-marke" style={{ left: `calc(${(marke / 180) * 100}% )` }} title={`gemessen ${marke}°`} />}
      </span>
      <b className="regler-wert">{wert}°</b>
    </label>
  )
}
