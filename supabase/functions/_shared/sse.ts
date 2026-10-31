// Liest Server-Sent Events aus einem Byte-Stream. Reine Logik, testbar.

export interface SseEreignis {
  event: string
  data: string
}

export async function* liesSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEreignis> {
  const leser = body.getReader()
  const dekoder = new TextDecoder()
  let puffer = ''
  let event = 'message'
  let daten: string[] = []

  const abschliessen = (): SseEreignis | null => {
    if (!daten.length) { event = 'message'; return null }
    const e = { event, data: daten.join('\n') }
    event = 'message'
    daten = []
    return e
  }

  while (true) {
    const { value, done } = await leser.read()
    if (value) puffer += dekoder.decode(value, { stream: true })
    if (done) puffer += dekoder.decode()

    let zeilenende: number
    while ((zeilenende = puffer.search(/\r?\n/)) !== -1) {
      const zeile = puffer.slice(0, zeilenende)
      puffer = puffer.slice(zeilenende + (puffer[zeilenende] === '\r' ? 2 : 1))
      if (zeile === '') {
        const e = abschliessen()
        if (e) yield e
        continue
      }
      if (zeile.startsWith(':')) continue
      const doppelpunkt = zeile.indexOf(':')
      const feld = doppelpunkt === -1 ? zeile : zeile.slice(0, doppelpunkt)
      let wert = doppelpunkt === -1 ? '' : zeile.slice(doppelpunkt + 1)
      if (wert.startsWith(' ')) wert = wert.slice(1)
      if (feld === 'event') event = wert
      else if (feld === 'data') daten.push(wert)
    }

    if (done) {
      if (puffer) { daten.push(...(puffer.startsWith('data:') ? [puffer.slice(5).trimStart()] : [])); puffer = '' }
      const e = abschliessen()
      if (e) yield e
      return
    }
  }
}

/** Kodiert ein Objekt als SSE-Zeile für die Antwort an die App. */
export function sseZeile(objekt: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(objekt)}\n\n`)
}
