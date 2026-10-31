// Stabile Punkt-IDs für Qdrant: gleiche Version und gleicher Abschnitt
// ergeben immer dieselbe ID, erneutes Indexieren überschreibt also.

export async function punktId(versionId: string, abschnitt: number): Promise<string> {
  const daten = new TextEncoder().encode(`${versionId}:${abschnitt}`)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', daten)).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50 // Version 5 (namensbasiert)
  hash[8] = (hash[8] & 0x3f) | 0x80 // RFC-4122-Variante
  const hex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
