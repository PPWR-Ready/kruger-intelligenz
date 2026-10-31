// Kleiner, sicherer Markdown-Leser für Antworten des Assistenten.
// Erkennt nur, was Antworten wirklich nutzen: Absätze, Aufzählungen,
// nummerierte Listen und **fett**. Es wird nie HTML erzeugt, sondern eine
// Struktur, die React als Text rendert – damit kann nichts eingeschleust werden.

export type Inline = { text: string; fett: boolean }
export type Block =
  | { art: 'absatz'; teile: Inline[] }
  | { art: 'liste'; nummeriert: boolean; punkte: Inline[][] }

/** Zerlegt eine Zeile in normale und fette Teile. */
export function inline(zeile: string): Inline[] {
  const teile: Inline[] = []
  const re = /\*\*(.+?)\*\*|__(.+?)__/g
  let pos = 0
  for (const m of zeile.matchAll(re)) {
    if (m.index > pos) teile.push({ text: zeile.slice(pos, m.index), fett: false })
    teile.push({ text: m[1] ?? m[2], fett: true })
    pos = m.index + m[0].length
  }
  if (pos < zeile.length) teile.push({ text: zeile.slice(pos), fett: false })
  // einzelne Sternchen und Überschrift-Rauten entfernen, die sonst als Zeichen stehen blieben
  return teile.map((t) => ({ ...t, text: t.text.replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, '$1$2') }))
}

const PUNKT = /^\s*[-*•]\s+(.*)$/
const NUMMER = /^\s*\d+[.)]\s+(.*)$/

export function zerlege(text: string): Block[] {
  const bloecke: Block[] = []
  let absatz: string[] = []
  const absatzEnde = () => {
    if (absatz.length) bloecke.push({ art: 'absatz', teile: inline(absatz.join(' ')) })
    absatz = []
  }
  for (const roh of text.replace(/\r/g, '').split('\n')) {
    const zeile = roh.replace(/^#{1,6}\s+/, '') // Überschriften als normale Absätze
    const punkt = PUNKT.exec(zeile)
    const nummer = punkt ? null : NUMMER.exec(zeile)
    if (punkt || nummer) {
      absatzEnde()
      const nummeriert = !!nummer
      const inhalt = inline((punkt ?? nummer)![1])
      const letzte = bloecke[bloecke.length - 1]
      if (letzte?.art === 'liste' && letzte.nummeriert === nummeriert) letzte.punkte.push(inhalt)
      else bloecke.push({ art: 'liste', nummeriert, punkte: [inhalt] })
    } else if (!zeile.trim()) {
      absatzEnde()
    } else {
      absatz.push(zeile.trim())
    }
  }
  absatzEnde()
  return bloecke
}
