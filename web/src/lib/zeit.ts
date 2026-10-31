// Datums-Helfer, deutsch formatiert.

export function datumKurz(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export function datumLang(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function wochentag(d = new Date()): string {
  return d.toLocaleDateString('de-DE', { weekday: 'long' })
}

export function relativ(iso: string): string {
  const tage = Math.floor((startDesTages(new Date()).getTime() - startDesTages(new Date(iso)).getTime()) / 86400000)
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} Tagen`
  return datumKurz(iso)
}

export function startDesTages(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Montag der Woche, in der d liegt. */
export function wochenstart(d: Date): Date {
  const x = startDesTages(d)
  const tag = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - tag)
  return x
}

export function tageswert(d: Date): string {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return x.toISOString().slice(0, 10)
}

export function tageszeitGruss(d = new Date()): string {
  const h = d.getHours()
  if (h < 11) return 'Morgen'
  if (h < 17) return 'Hallo'
  return 'Guten Abend'
}

/** Durchschnitt pro Woche für die letzten n Wochen (älteste zuerst). */
export function wochenmittel(
  einheiten: { gestartet_am: string; befinden: number | null }[],
  wochen: number,
  heute = new Date(),
): (number | null)[] {
  const start = wochenstart(heute)
  const ergebnis: (number | null)[] = []
  for (let i = wochen - 1; i >= 0; i--) {
    const von = new Date(start)
    von.setDate(von.getDate() - 7 * i)
    const bis = new Date(von)
    bis.setDate(bis.getDate() + 7)
    const werte = einheiten
      .filter((e) => e.befinden !== null && new Date(e.gestartet_am) >= von && new Date(e.gestartet_am) < bis)
      .map((e) => e.befinden as number)
    ergebnis.push(werte.length ? Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 10) / 10 : null)
  }
  return ergebnis
}
