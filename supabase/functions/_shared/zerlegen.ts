// Zerlegt einen Wissenseintrag in Abschnitte für die Suche.
// Reine Logik ohne Abhängigkeiten, damit sie in Deno und in Tests läuft.

export interface ZerlegenOptionen {
  /** angestrebte Länge eines Abschnitts in Zeichen (≈ 400 Tokens) */
  ziel: number
  /** harte Obergrenze; längere Absätze werden an Satzgrenzen geteilt */
  max: number
  /** Zeichen, die vom vorherigen Abschnitt übernommen werden */
  ueberlappung: number
}

const STANDARD: ZerlegenOptionen = { ziel: 1800, max: 2600, ueberlappung: 200 }

/** Teilt einen zu langen Block an Satzgrenzen, notfalls an Wortgrenzen. */
function teileBlock(block: string, max: number): string[] {
  if (block.length <= max) return [block]
  const saetze = block.match(/[^.!?]+(?:[.!?]+["“”»«)]?\s*|$)/g) ?? [block]
  const teile: string[] = []
  let aktuell = ''
  for (const satz of saetze) {
    if (satz.length > max) {
      if (aktuell) { teile.push(aktuell.trim()); aktuell = '' }
      const woerter = satz.split(/\s+/)
      let stueck = ''
      for (const wort of woerter) {
        if ((stueck + ' ' + wort).trim().length > max) { teile.push(stueck.trim()); stueck = wort }
        else stueck = (stueck + ' ' + wort).trim()
      }
      if (stueck) aktuell = stueck + ' '
      continue
    }
    if ((aktuell + satz).length > max) { teile.push(aktuell.trim()); aktuell = satz }
    else aktuell += satz
  }
  if (aktuell.trim()) teile.push(aktuell.trim())
  return teile.filter(Boolean)
}

/** Letzte n Zeichen eines Textes, sauber an einer Wortgrenze beginnend. */
function schwanz(text: string, n: number): string {
  if (n <= 0 || text.length <= n) return n <= 0 ? '' : text
  const stueck = text.slice(text.length - n)
  const leer = stueck.indexOf(' ')
  return leer === -1 ? stueck : stueck.slice(leer + 1)
}

/**
 * Zerlegt Text in Abschnitte. Überschriften (# …) beginnen einen neuen
 * Abschnitt; jeder Abschnitt beginnt mit dem Titel des Eintrags, damit er
 * auch allein verständlich ist.
 */
export function zerlege(titel: string, text: string, optionen: Partial<ZerlegenOptionen> = {}): string[] {
  const o = { ...STANDARD, ...optionen }
  const sauber = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!sauber) return []

  const bloecke = sauber.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const roh: string[] = []
  let aktuell = ''

  for (const block of bloecke) {
    const istUeberschrift = /^#{1,6}\s/.test(block)
    for (const teil of teileBlock(block, o.max)) {
      const passt = (aktuell ? aktuell.length + 2 : 0) + teil.length <= o.ziel
      if (aktuell && (istUeberschrift || !passt)) {
        roh.push(aktuell)
        aktuell = teil
      } else {
        aktuell = aktuell ? `${aktuell}\n\n${teil}` : teil
      }
    }
  }
  if (aktuell) roh.push(aktuell)

  const kopf = titel.trim() ? `${titel.trim()}\n\n` : ''
  return roh.map((abschnitt, i) => {
    if (i === 0 || o.ueberlappung <= 0) return kopf + abschnitt
    const uebernahme = schwanz(roh[i - 1], o.ueberlappung)
    return `${kopf}… ${uebernahme}\n\n${abschnitt}`
  })
}
