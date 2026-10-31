// Embeddings über eine OpenAI-kompatible Schnittstelle, z. B. BGE-M3 mit
// Infinity auf dem eigenen VPS (siehe infra/docker-compose.yml).
//   EMBEDDING_URL      vollständige URL, z. B. https://ki.example.de/embeddings
//   EMBEDDING_MODELL   Standard: BAAI/bge-m3
//   EMBEDDING_API_KEY  optional
import { env, envOptional } from './umgebung.ts'

const STAPEL = 16

export async function einbetten(texte: string[]): Promise<number[][]> {
  const ergebnis: number[][] = []
  for (let i = 0; i < texte.length; i += STAPEL) {
    ergebnis.push(...(await stapel(texte.slice(i, i + STAPEL))))
  }
  return ergebnis
}

async function stapel(texte: string[]): Promise<number[][]> {
  const schluessel = envOptional('EMBEDDING_API_KEY')
  const antwort = await fetch(env('EMBEDDING_URL'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(schluessel ? { authorization: `Bearer ${schluessel}` } : {}),
    },
    body: JSON.stringify({ model: env('EMBEDDING_MODELL', 'BAAI/bge-m3'), input: texte }),
  })
  if (!antwort.ok) throw new Error(`Embeddings ${antwort.status}: ${(await antwort.text()).slice(0, 300)}`)
  const daten = (await antwort.json()) as { data: { embedding: number[]; index: number }[] }
  return [...daten.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
}
