// Texte aus Dateien und Fotos für das Wissens-Studio gewinnen.
import { funktion } from './supabase'

export const IMPORT_TYPEN = '.txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Liest Text aus .txt, .md, .pdf (mit Textebene) oder .docx. */
export async function textAusDatei(datei: File): Promise<string> {
  const name = datei.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown') || datei.type.startsWith('text/')) {
    return (await datei.text()).trim()
  }
  if (name.endsWith('.pdf') || datei.type === 'application/pdf') return await pdfText(datei)
  if (name.endsWith('.docx')) return await docxText(datei)
  throw new Error('Dieses Dateiformat wird nicht unterstützt. Möglich sind TXT, Markdown, PDF und Word (.docx).')
}

async function pdfText(datei: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise
  const seiten: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const seite = await pdf.getPage(i)
    const inhalt = await seite.getTextContent()
    let zeile = ''
    const zeilen: string[] = []
    for (const teil of inhalt.items) {
      if (!('str' in teil)) continue
      zeile += teil.str
      if (teil.hasEOL) { zeilen.push(zeile); zeile = '' }
    }
    if (zeile) zeilen.push(zeile)
    seiten.push(zeilen.join('\n'))
  }
  const text = seiten.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length < 20) throw new Error('Dieses PDF enthält keinen lesbaren Text (vermutlich eingescannt). Nutze dafür „Seiten fotografieren“.')
  return text
}

async function docxText(datei: File): Promise<string> {
  const { default: mammoth } = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await datei.arrayBuffer() })
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

/** Verkleinert ein Foto auf höchstens 2000 px und gibt JPEG als Base64 zurück. */
export async function fotoVorbereiten(datei: File): Promise<{ mime: string; base64: string; blob: Blob }> {
  const bild = await createImageBitmap(datei)
  const faktor = Math.min(1, 2000 / Math.max(bild.width, bild.height))
  const leinwand = document.createElement('canvas')
  leinwand.width = Math.round(bild.width * faktor)
  leinwand.height = Math.round(bild.height * faktor)
  leinwand.getContext('2d')!.drawImage(bild, 0, 0, leinwand.width, leinwand.height)
  bild.close()
  const blob = await new Promise<Blob>((ok, nein) => leinwand.toBlob((b) => (b ? ok(b) : nein(new Error('Foto konnte nicht verarbeitet werden.'))), 'image/jpeg', 0.85))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binaer = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binaer += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { mime: 'image/jpeg', base64: btoa(binaer), blob }
}

/** Schickt Fotos an die Texterkennung und liefert den erkannten Text. */
export async function seitenLesen(bilder: { mime: string; base64: string }[]): Promise<string> {
  const antwort = await funktion('dokument-lesen', { bilder })
  const daten = await antwort.json().catch(() => ({}))
  if (!antwort.ok) throw new Error(daten.fehler ?? 'Die Seiten konnten nicht gelesen werden.')
  return daten.text as string
}
