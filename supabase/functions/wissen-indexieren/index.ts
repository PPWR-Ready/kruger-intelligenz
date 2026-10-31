// Index-Pflege: bringt Qdrant auf den Stand der freigegebenen Wissensversionen.
//
// Aufruf
//   - von pg_cron jede Minute, wenn etwas zu tun ist (Migration index_automatik):
//     POST mit Kopfzeile x-index-secret: <Geheimnis aus Vault „index_geheimnis“>
//   - optional von außen (z. B. n8n) mit x-index-secret: <INDEX_SECRET>
//   - aus dem Wissens-Studio: POST mit Login-Token einer Person aus dem Team
// Body (optional): { erneut: true }  → auch Versionen mit Status „fehler“ erneut versuchen
//
// Ablauf
//   1. Versionen mit „zu_entfernen“ aus Qdrant löschen → „entfernt“
//   2. Aktuelle Versionen freigegebener Einträge mit „ausstehend“ zerlegen,
//      einbetten, in Qdrant schreiben → „indexiert“ (bei Fehlern „fehler“ mit Meldung)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient, angemeldetePerson, CORS, envOptional, fehler, json, KonfigFehler } from '../_shared/umgebung.ts'
import { zerlege } from '../_shared/zerlegen.ts'
import { einbetten } from '../_shared/embeddings.ts'
import { sicherstellen, speichern, versionEntfernen, type Payload } from '../_shared/qdrant.ts'
import { punktId } from '../_shared/ids.ts'

const PRO_DURCHLAUF = 20

interface Eintrag {
  id: string
  titel: string
  themen: string[]
  sichtbarkeit: Payload['sichtbarkeit']
  studio_id: string | null
  quelle: string | null
  version: { id: string; inhalt: string; index_status: string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fehler('Nur POST ist erlaubt.', 405)

  const admin = adminClient()

  // Zugang: gemeinsames Geheimnis (n8n) oder angemeldete Person aus dem Team
  const kopf = req.headers.get('x-index-secret') ?? ''
  const geheimnis = envOptional('INDEX_SECRET')
  let perGeheimnis = !!kopf && !!geheimnis && kopf === geheimnis
  if (!perGeheimnis && kopf) {
    const { data } = await admin.rpc('index_geheimnis_pruefen', { p_geheimnis: kopf })
    perGeheimnis = data === true
  }
  if (!perGeheimnis) {
    const person = await angemeldetePerson(req, admin)
    if (!person) return fehler('Nicht berechtigt.', 401)
    const { data: profil } = await admin.from('profiles').select('rolle, freigeschaltet').eq('id', person.id).maybeSingle()
    if (!profil || profil.rolle === 'mitglied' || !profil.freigeschaltet) return fehler('Nicht berechtigt.', 403)
  }

  let erneut = false
  try {
    erneut = (await req.json())?.erneut === true
  } catch { /* leerer Body ist erlaubt */ }

  const bericht = { entfernt: 0, indexiert: 0, fehler: 0, abschnitte: 0 }

  try {
    await sicherstellen()

    // 1. Entfernen
    const { data: weg } = await admin
      .from('wissen_versionen')
      .select('id')
      .eq('index_status', 'zu_entfernen')
      .limit(PRO_DURCHLAUF)
    for (const v of weg ?? []) {
      await versionEntfernen(v.id)
      await admin.from('wissen_versionen').update({ index_status: 'entfernt', index_fehler: null }).eq('id', v.id)
      bericht.entfernt++
    }

    // 2. Indexieren
    const status = erneut ? ['ausstehend', 'fehler'] : ['ausstehend']
    const { data: offen, error } = await admin
      .from('wissen_eintraege')
      .select('id, titel, themen, sichtbarkeit, studio_id, quelle, version:wissen_versionen!wissen_eintraege_aktuelle_version_fk!inner(id, inhalt, index_status)')
      .eq('status', 'freigegeben')
      .in('version.index_status', status)
      .limit(PRO_DURCHLAUF)
    if (error) throw error

    for (const e of (offen ?? []) as unknown as Eintrag[]) {
      try {
        const abschnitte = zerlege(e.titel, e.version.inhalt)
        const vektoren = abschnitte.length ? await einbetten(abschnitte) : []
        await versionEntfernen(e.version.id)
        await speichern(
          await Promise.all(
            abschnitte.map(async (text, i) => ({
              id: await punktId(e.version.id, i),
              vektor: vektoren[i],
              payload: {
                eintrag_id: e.id,
                version_id: e.version.id,
                studio_id: e.studio_id ?? 'global',
                titel: e.titel,
                themen: e.themen,
                sichtbarkeit: e.sichtbarkeit,
                quelle: e.quelle,
                abschnitt: i,
                text,
              },
            })),
          ),
        )
        await admin
          .from('wissen_versionen')
          .update({ index_status: 'indexiert', indexiert_am: new Date().toISOString(), index_fehler: null })
          .eq('id', e.version.id)
        bericht.indexiert++
        bericht.abschnitte += abschnitte.length
      } catch (err) {
        console.error(err)
        await admin
          .from('wissen_versionen')
          .update({ index_status: 'fehler', index_fehler: String(err instanceof Error ? err.message : err).slice(0, 500) })
          .eq('id', e.version.id)
        bericht.fehler++
      }
    }
  } catch (e) {
    if (e instanceof KonfigFehler) return fehler(e.message, 503)
    console.error(e)
    return fehler(`Indexierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 500)
  }

  return json(bericht)
})
