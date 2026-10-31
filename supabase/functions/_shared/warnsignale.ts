// Erkennt Warnsignale in Fragen von Mitgliedern. Bewusst eher empfindlich:
// ein Treffer blockiert nichts, sondern ergänzt nur den Hinweis zur ärztlichen
// Abklärung und markiert die Nachricht für das Trainer-Cockpit.
// Die Liste ist ein Startpunkt und wird mit den Gründern abgestimmt.

interface Muster {
  grund: string
  ausdruecke: RegExp[]
}

// Akute Notfälle: Hier zählt nur eins – sofort aufhören und 112 anrufen.
const NOTFALL: RegExp[] = [
  /brustschmerz/, /schmerz.*in der brust/, /(sticht|stiche|drueckt|brennt|zieht|eng) in der brust\b/, /\bbrust\b.*(schmerz|druck|stech|eng|tut weh)/, /(druck|stechen|enge|engegefuehl) (auf|in) der brust/,
  /atemnot/, /keine luft/, /(kaum|schlecht|schwer) luft/, /luft (kriege|bekomme)/, /herzrasen/, /herz (rast|stolpert)/,
  /ohnmacht/, /ohnmaechtig/, /bewusstlos/, /umgekippt/, /(gesicht|mundwinkel).*(haengt|schief)/, /sprachstoerung/, /kann nicht (mehr )?(richtig )?sprechen/,
  /schwindel.*(brust|herz|luft)/, /(brust|herz|luft).*schwindel/,
]

const MUSTER: Muster[] = [
  {
    grund: 'Taubheit oder Kribbeln',
    ausdruecke: [/\btaub/, /taubheit/, /kribbel/, /ameisenlaufen/, /gefuehllos/, /kein gefuehl/],
  },
  {
    grund: 'Lähmung oder Kraftverlust',
    ausdruecke: [/laehmung/, /gelaehmt/, /kraftverlust/, /kraftlos.*(bein|fuss|arm)/, /fuss.*(haengt|nicht mehr heben)/, /kann.*(bein|fuss).*nicht.*(heben|bewegen)/],
  },
  {
    grund: 'Probleme mit Blase oder Darm',
    ausdruecke: [/harnblase/, /\bblase\b/, /blasenschwaech/, /inkontinen/, /urin.*(halten|verlier)/, /stuhl.*(halten|verlier)/, /reithose/, /im schritt.*taub/],
  },
  {
    grund: 'Unfall oder Sturz',
    ausdruecke: [/unfall/, /gestuerzt/, /\bsturz/, /hingefallen/, /aufprall/],
  },
  {
    grund: 'Fieber oder allgemeines Krankheitsgefühl',
    ausdruecke: [/\bfieber/, /schuettelfrost/, /nachtschweiss/],
  },
  {
    grund: 'Brustschmerz oder Atemnot',
    ausdruecke: [/brustschmerz/, /schmerz.*in der brust/, /(sticht|stiche|drueckt|brennt|zieht|eng) in der brust\b/, /druck auf der brust/, /atemnot/, /keine luft/],
  },
  {
    grund: 'Starke Schmerzen in Ruhe oder nachts',
    ausdruecke: [/nachts.*schmerz/, /schmerz.*nachts/, /schmerz.*in ruhe/, /unertraeglich/, /staerkste.*schmerz/],
  },
  {
    grund: 'Ungewollter Gewichtsverlust',
    ausdruecke: [/(ungewollt|unerklaerlich).*abgenommen/, /gewichtsverlust/],
  },
  {
    grund: 'Ausstrahlung bis unter das Knie',
    ausdruecke: [/(strahlt|ausstrahl|zieht).*(unterschenkel|wade|fuss|zehen)/],
  },
]

/** Kleinschreibung und Umlaute vereinheitlichen, damit „Lähmung“ und „Laehmung“ gleich behandelt werden. */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
}

export function pruefeWarnsignale(text: string): { treffer: boolean; notfall: boolean; gruende: string[] } {
  const t = normalisiere(text)
  const notfall = NOTFALL.some((a) => a.test(t))
  const gruende = MUSTER.filter((m) => m.ausdruecke.some((a) => a.test(t))).map((m) => m.grund)
  if (notfall && !gruende.includes('Brustschmerz oder Atemnot')) gruende.unshift('Möglicher Notfall')
  return { treffer: notfall || gruende.length > 0, notfall, gruende }
}

export const NOTFALLHINWEIS =
  '**Bitte hör sofort mit dem Training auf.** Brustschmerz, Druck oder Enge in der Brust, Atemnot, Herzrasen mit Schwindel ' +
  'oder Ohnmacht können ein Notfall sein. **Ruf den Notruf 112** oder sag sofort jemandem im Studio Bescheid. ' +
  'Warte nicht auf eine Antwort hier in der App.'

export const WARNHINWEIS =
  'Wichtig: Was du beschreibst, solltest du ärztlich abklären lassen, bevor du weitertrainierst. ' +
  'Bei plötzlichen Lähmungen, Taubheit im Schritt oder Problemen mit Blase oder Darm bitte sofort ärztliche Hilfe holen.'
