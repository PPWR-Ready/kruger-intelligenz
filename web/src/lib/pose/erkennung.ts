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

export function kameraStoppen(strom: MediaStream | null): void {
  strom?.getTracks().forEach((t) => t.stop())
}
