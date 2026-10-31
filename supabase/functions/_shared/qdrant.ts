// Zugriff auf Qdrant über die REST-Schnittstelle.
//   QDRANT_URL         z. B. https://qdrant.example.de
//   QDRANT_API_KEY     optional, empfohlen
//   QDRANT_COLLECTION  Standard: wissen
//   EMBEDDING_DIM      Standard: 1024 (BGE-M3)
import { env, envOptional } from './umgebung.ts'

export interface Payload {
  eintrag_id: string
  version_id: string
  studio_id: string // „global“ für Five-Grundwissen
  titel: string
  themen: string[]
  sichtbarkeit: 'alle' | 'premium' | 'trainer'
  quelle: string | null
  abschnitt: number
  text: string
}

export interface Treffer {
  id: string
  score: number
  payload: Payload
}

const collection = () => env('QDRANT_COLLECTION', 'wissen')

async function anfrage(methode: string, pfad: string, body?: unknown): Promise<Response> {
  const schluessel = envOptional('QDRANT_API_KEY')
  return await fetch(`${env('QDRANT_URL').replace(/\/$/, '')}${pfad}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(schluessel ? { 'api-key': schluessel } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
}

async function pruefe(antwort: Response, was: string) {
  if (!antwort.ok) throw new Error(`Qdrant ${was} ${antwort.status}: ${(await antwort.text()).slice(0, 300)}`)
  return await antwort.json()
}

/** Legt Collection und Payload-Indizes an, falls sie fehlen. */
export async function sicherstellen(): Promise<void> {
  const c = collection()
  const vorhanden = await anfrage('GET', `/collections/${c}`)
  if (vorhanden.status === 404) {
    await pruefe(
      await anfrage('PUT', `/collections/${c}`, {
        vectors: { dense: { size: Number(env('EMBEDDING_DIM', '1024')), distance: 'Cosine' } },
      }),
      'Collection anlegen',
    )
    for (const feld of ['studio_id', 'sichtbarkeit', 'themen', 'version_id', 'eintrag_id']) {
      await pruefe(
        await anfrage('PUT', `/collections/${c}/index?wait=true`, { field_name: feld, field_schema: 'keyword' }),
        `Index ${feld}`,
      )
    }
  } else {
    await pruefe(vorhanden, 'Collection lesen')
  }
}

export async function speichern(punkte: { id: string; vektor: number[]; payload: Payload }[]): Promise<void> {
  if (!punkte.length) return
  await pruefe(
    await anfrage('PUT', `/collections/${collection()}/points?wait=true`, {
      points: punkte.map((p) => ({ id: p.id, vector: { dense: p.vektor }, payload: p.payload })),
    }),
    'Punkte speichern',
  )
}

export async function versionEntfernen(versionId: string): Promise<void> {
  await pruefe(
    await anfrage('POST', `/collections/${collection()}/points/delete?wait=true`, {
      filter: { must: [{ key: 'version_id', match: { value: versionId } }] },
    }),
    'Punkte löschen',
  )
}

export async function suchen(
  vektor: number[],
  filter: { studioId: string; sichtbarkeiten: string[] },
  anzahl: number,
  mindestScore: number,
): Promise<Treffer[]> {
  const daten = await pruefe(
    await anfrage('POST', `/collections/${collection()}/points/query`, {
      query: vektor,
      using: 'dense',
      limit: anzahl,
      with_payload: true,
      score_threshold: mindestScore,
      filter: {
        must: [
          { key: 'studio_id', match: { any: [filter.studioId, 'global'] } },
          { key: 'sichtbarkeit', match: { any: filter.sichtbarkeiten } },
        ],
      },
    }),
    'Suche',
  )
  return (daten.result?.points ?? []) as Treffer[]
}
