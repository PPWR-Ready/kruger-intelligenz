// Das Sprachmodell hängt am Ende jeder Antwort eine Zeile
//   <<<META{"unsicher":false,"quellen":[1,3]}>>>
// an. Dieser Splitter streamt den sichtbaren Text weiter, hält die
// Meta-Zeile zurück und wertet sie am Ende aus.

export const META_ANFANG = '<<<META'
const META_ENDE = '>>>'

export interface AntwortMeta {
  unsicher: boolean
  quellen: number[]
}

export class MetaSplitter {
  private puffer = ''
  private gesehen = false
  private ausgegeben = 0

  /** Nimmt ein Textstück auf und liefert den Teil, der angezeigt werden darf. */
  push(stueck: string): string {
    this.puffer += stueck
    if (this.gesehen) return ''
    const pos = this.puffer.indexOf(META_ANFANG)
    if (pos !== -1) {
      this.gesehen = true
      return this.gib(pos)
    }
    // Ende zurückhalten, falls dort gerade der Anfang der Meta-Zeile entsteht
    return this.gib(Math.max(this.ausgegeben, this.puffer.length - (META_ANFANG.length - 1)))
  }

  /** Liefert den restlichen sichtbaren Text und die ausgewertete Meta-Zeile. */
  ende(): { rest: string; text: string; meta: AntwortMeta | null } {
    const pos = this.puffer.indexOf(META_ANFANG)
    const sichtbarBis = pos === -1 ? this.puffer.length : pos
    const rest = this.puffer.slice(this.ausgegeben, sichtbarBis)
    this.ausgegeben = sichtbarBis
    const text = this.puffer.slice(0, sichtbarBis).trimEnd()
    return { rest, text, meta: pos === -1 ? null : liesMeta(this.puffer.slice(pos)) }
  }

  private gib(bis: number): string {
    if (bis <= this.ausgegeben) return ''
    const teil = this.puffer.slice(this.ausgegeben, bis)
    this.ausgegeben = bis
    return teil
  }
}

export function liesMeta(zeile: string): AntwortMeta | null {
  const start = zeile.indexOf(META_ANFANG)
  if (start === -1) return null
  const ende = zeile.indexOf(META_ENDE, start + META_ANFANG.length)
  const json = zeile.slice(start + META_ANFANG.length, ende === -1 ? undefined : ende).trim()
  try {
    const roh = JSON.parse(json) as Partial<AntwortMeta>
    return {
      unsicher: roh.unsicher === true,
      quellen: Array.isArray(roh.quellen)
        ? roh.quellen.filter((q): q is number => Number.isInteger(q) && q > 0)
        : [],
    }
  } catch {
    return null
  }
}
