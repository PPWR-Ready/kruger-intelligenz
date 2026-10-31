// Lädt das Pose-Modell für den Trainer-Modus nach public/mediapipe/ und prüft
// die Prüfsumme. Die App liefert es danach selbst aus (keine Abrufe bei Google
// im Betrieb). Läuft automatisch vor `npm run dev` und `npm run build`.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODELL = {
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  datei: 'pose_landmarker_full-1.task',
  sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
}

const ziel = resolve(dirname(fileURLToPath(import.meta.url)), '../public/mediapipe', MODELL.datei)
const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex')

if (existsSync(ziel) && pruefsumme(readFileSync(ziel)) === MODELL.sha256) {
  process.exit(0)
}

console.log(`Lade Pose-Modell (${MODELL.datei}) …`)
const antwort = await fetch(MODELL.url)
if (!antwort.ok) {
  console.error(`Download fehlgeschlagen: HTTP ${antwort.status}`)
  process.exit(1)
}
const daten = Buffer.from(await antwort.arrayBuffer())
const ist = pruefsumme(daten)
if (ist !== MODELL.sha256) {
  console.error(`Prüfsumme stimmt nicht (erwartet ${MODELL.sha256}, erhalten ${ist}). Abbruch.`)
  process.exit(1)
}
mkdirSync(dirname(ziel), { recursive: true })
writeFileSync(ziel, daten)
console.log(`Pose-Modell gespeichert: ${ziel}`)
