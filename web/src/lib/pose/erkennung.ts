// Haltungserkennung mit MediaPipe Pose, komplett im Browser.
// Das Kamerabild verlässt das Gerät nie; wir lesen nur die Körperpunkte aus.
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Punkt } from './geometrie'

const MODELL = '/mediapipe/pose_landmarker_full-1.task'

let laden: Promise<PoseLandmarker> | null = null

/** Lädt die Erkennung einmal (beim ersten Start ca. 25 MB, danach aus dem Cache). */
export function erkennungLaden(): Promise<PoseLandmarker> {
  laden ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
    const dateien = await FilesetResolver.forVisionTasks(__MEDIAPIPE_PFAD__.replace(/\/$/, ''))
    const optionen = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODELL, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      return await PoseLandmarker.createFromOptions(dateien, optionen('GPU'))
    } catch {
      // Ältere Geräte ohne WebGL2: auf dem Prozessor rechnen (langsamer, aber geht)
      return await PoseLandmarker.createFromOptions(dateien, optionen('CPU'))
    }
  })().catch((e) => {
    laden = null
    throw e
  })
  return laden
}

// --- Fotos und einzelne Videobilder (Übungs-Editor) -------------------------
// Eigene Erkennung im Bild-Modus: unabhängig von den Zeitstempeln der Live-Kamera
// und mit verkleinertem Bild (große Handyfotos überschreiten sonst die Grafik-Grenzen).

let bildLaden: Promise<{ lm: PoseLandmarker; gpu: boolean }> | null = null

function bildErkennungLaden(gpu: boolean) {
  return (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
    const dateien = await FilesetResolver.forVisionTasks(__MEDIAPIPE_PFAD__.replace(/\/$/, ''))
    const lm = await PoseLandmarker.createFromOptions(dateien, {
      baseOptions: { modelAssetPath: MODELL, delegate: gpu ? 'GPU' : 'CPU' },
      runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4,
    })
    return { lm, gpu }
  })()
}

/** Zeichnet Foto oder Videobild verkleinert (max. 1280 px) auf eine Leinwand. */
function verkleinert(el: HTMLImageElement | HTMLVideoElement): HTMLCanvasElement {
  const b = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
  const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
  if (!b || !h) throw new Error('Das Bild ist noch nicht geladen.')
  const f = Math.min(1, 1280 / Math.max(b, h))
  const c = document.createElement('canvas')
  c.width = Math.round(b * f); c.height = Math.round(h * f)
  c.getContext('2d')?.drawImage(el, 0, 0, c.width, c.height)
  return c
}

/**
 * Körperpunkte in einem Foto oder dem aktuellen Videobild. Die Koordinaten sind
 * Anteile (0–1) und passen damit auch zum Originalbild. Fällt die Grafik-Berechnung
 * aus, wird automatisch auf den Prozessor gewechselt.
 */
export async function erkenneBild(el: HTMLImageElement | HTMLVideoElement): Promise<Punkt[]> {
  const leinwand = verkleinert(el)
  bildLaden ??= bildErkennungLaden(true).catch(() => bildErkennungLaden(false))
  let { lm, gpu } = await bildLaden.catch((e) => { bildLaden = null; throw e })
  try {
    return (lm.detect(leinwand).landmarks[0] ?? []) as Punkt[]
  } catch (e) {
    if (!gpu) throw e
    bildLaden = bildErkennungLaden(false)
    ;({ lm, gpu } = await bildLaden)
    return (lm.detect(leinwand).landmarks[0] ?? []) as Punkt[]
  }
}

/** Körperpunkte für das aktuelle Videobild, oder leer, wenn niemand erkannt wurde. */
export function erkenne(lm: PoseLandmarker, video: HTMLVideoElement, zeit: number): Punkt[] {
  const r = lm.detectForVideo(video, zeit)
  return (r.landmarks[0] ?? []) as Punkt[]
}

export type Kamera = 'user' | 'environment'

/** Startet die Kamera. Standard ist die Rückkamera: Im Studio hält der Trainingspartner das Handy. */
export async function kameraStarten(video: HTMLVideoElement, richtung: Kamera): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Dieser Browser kann nicht auf die Kamera zugreifen. Öffne die App bitte in Chrome oder Safari.')
  }
  let strom: MediaStream
  try {
    strom = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // 4:3 wie der Kamerasensor: passt zur Fläche in der App, so wird kaum etwas abgeschnitten
      video: { facingMode: { ideal: richtung }, width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 } },
    })
  } catch (e) {
    const name = (e as { name?: string }).name
    if (name === 'NotAllowedError') throw new Error('Bitte erlaube den Zugriff auf die Kamera. Du findest das in den Einstellungen des Browsers.')
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('Es wurde keine passende Kamera gefunden.')
    throw new Error('Die Kamera konnte nicht gestartet werden.')
  }
  video.srcObject = strom
  video.muted = true
  video.playsInline = true
  await video.play()
  return strom
}

/** Kann diese Kamera ihr Licht einschalten? (Android/Chrome mit Rückkamera; viele iPhones erlauben es im Browser nicht.) */
export function lichtMoeglich(strom: MediaStream | null): boolean {
  const spur = strom?.getVideoTracks()[0]
  const faehig = spur?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
  return !!faehig?.torch
}

/** Schaltet das Kameralicht an oder aus. */
export async function lichtSchalten(strom: MediaStream | null, an: boolean): Promise<void> {
  const spur = strom?.getVideoTracks()[0]
  if (!spur) return
  await spur.applyConstraints({ advanced: [{ torch: an } as MediaTrackConstraintSet] })
}

export function kameraStoppen(strom: MediaStream | null): void {
  strom?.getTracks().forEach((t) => t.stop())
}
