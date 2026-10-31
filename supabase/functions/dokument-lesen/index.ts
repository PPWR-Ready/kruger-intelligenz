// Dokument-Scan für das Wissens-Studio: Fotos von Seiten → Text.
//
// Nur für das Team. Die Bilder werden nur für die Texterkennung an das
// Sprachmodell geschickt und hier nicht gespeichert (das Original legt die
// Web-App selbst im privaten Bucket „wissen“ ab).
//
// POST { bilder: [{ mime: "image/jpeg", base64: "…" }, …] }   (max. 6 Seiten, je max. 5 MB)
// → { text: "…" }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient, angemeldetePerson, CORS, fehler, json, KonfigFehler } from '../_shared/umgebung.ts'
import { antworte, type Teil } from '../_shared/sprachmodell.ts'

const MAX_SEITEN = 6
const MAX_BYTES = 5 * 1024 * 1024
const ERLAUBT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const ANWEISUNG = `Du bekommst Fotos von Seiten eines Dokuments aus einem Rückentrainings-Studio.
Gib den Text genau so wieder, wie er auf den Seiten steht, auf Deutsch und in der Reihenfolge der Seiten.
- Nichts hinzufügen, nichts weglassen, nichts zusammenfassen oder verbessern.
- Überschriften als Markdown-Überschriften (#, ##), Aufzählungen als Listen, Tabellen als Markdown-Tabellen.
- Unleserliche Stellen markierst du mit [unleserlich].
- Abbildungen beschreibst du in einer Zeile in eckigen Klammern, z. B. [Abbildung: Person im Vierfüßlerstand].
- Ausgabe nur der Text, ohne Einleitung oder Kommentar.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fehler('Nur POST ist erlaubt.', 405)

  try {
    const admin = adminClient()
    const person = await angemeldetePerson(req, admin)
    if (!person) return fehler('Bitte melde dich an.', 401)
    const { data: profil } = await admin.from('profiles').select('rolle, freigeschaltet').eq('id', person.id).maybeSingle()
    if (!profil || profil.rolle === 'mitglied' || !profil.freigeschaltet) return fehler('Nur für das Team.', 403)

    const body = await req.json().catch(() => null) as { bilder?: { mime?: string; base64?: string }[] } | null
    const bilder = body?.bilder ?? []
    if (!Array.isArray(bilder) || bilder.length === 0) return fehler('Es fehlen die Bilder.', 400)
    if (bilder.length > MAX_SEITEN) return fehler(`Bitte höchstens ${MAX_SEITEN} Seiten auf einmal.`, 400)

    const teile: Teil[] = []
    for (const [i, b] of bilder.entries()) {
      if (!b.mime || !ERLAUBT.includes(b.mime) || typeof b.base64 !== 'string') return fehler(`Seite ${i + 1}: Format nicht unterstützt.`, 400)
      if (b.base64.length * 0.75 > MAX_BYTES) return fehler(`Seite ${i + 1} ist zu groß (max. 5 MB).`, 400)
      teile.push({ typ: 'text', text: `Seite ${i + 1}:` }, { typ: 'bild', mime: b.mime, base64: b.base64 })
    }
    teile.push({ typ: 'text', text: 'Bitte gib den Text dieser Seiten wieder.' })

    const text = await antworte({ system: ANWEISUNG, nachrichten: [{ role: 'user', content: teile }], maxTokens: 8000 })
    return json({ text: text.trim() })
  } catch (e) {
    if (e instanceof KonfigFehler) return fehler('Die Texterkennung ist noch nicht eingerichtet.', 503)
    console.error('dokument-lesen', e)
    return fehler('Die Seiten konnten nicht gelesen werden. Bitte versuche es noch einmal.', 502)
  }
})
