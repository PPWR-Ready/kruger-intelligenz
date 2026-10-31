// Client für die Chat-Funktion: liest den Antwort-Stream Stück für Stück.
import { funktion } from './supabase'
import { liesSse } from '../../../supabase/functions/_shared/sse.ts'

export interface ChatEnde {
  nachricht_id: string
  verlauf_id: string
  quellen: { eintrag_id: string; titel: string }[]
  unsicher: boolean
  warnsignal: boolean
  rueckfrage: boolean
}

export interface ChatRueckrufe {
  beimStart?: (verlaufId: string) => void
  beimText: (stueck: string) => void
  beimEnde: (ende: ChatEnde) => void
}

export async function frageStellen(
  eingabe: { frage: string; verlauf_id?: string | null; kontext?: 'chat' | 'trainer_modus'; uebung?: string },
  r: ChatRueckrufe,
): Promise<void> {
  // Kommt 45 Sekunden lang nichts an, brechen wir ab, statt endlos zu warten
  const abbruch = new AbortController()
  let zeitUeberschritten = false
  let wecker = 0
  const weiterWarten = () => {
    window.clearTimeout(wecker)
    wecker = window.setTimeout(() => { zeitUeberschritten = true; abbruch.abort() }, 45_000)
  }
  weiterWarten()
  const zuLange = 'Das hat gerade zu lange gedauert. Bitte versuch es noch einmal.'
  let antwort: Response
  try {
    antwort = await funktion('chat', eingabe, abbruch.signal)
  } catch {
    window.clearTimeout(wecker)
    if (zeitUeberschritten) throw new Error(zuLange)
    throw new Error('Der Assistent ist gerade nicht erreichbar. Prüfe deine Internetverbindung und versuch es gleich noch einmal.')
  }
  if (!antwort.ok || !antwort.body) {
    window.clearTimeout(wecker)
    let nachricht = 'Der Assistent ist gerade nicht erreichbar.'
    try {
      nachricht = (await antwort.json()).fehler ?? nachricht
    } catch { /* keine JSON-Antwort */ }
    throw new Error(nachricht)
  }
  let fertig = false
  try {
    for await (const e of liesSse(antwort.body)) {
      weiterWarten()
      const d = JSON.parse(e.data)
      if (d.typ === 'start') r.beimStart?.(d.verlauf_id)
      else if (d.typ === 'text') r.beimText(d.t)
      else if (d.typ === 'ende') { fertig = true; r.beimEnde(d as ChatEnde) }
      else if (d.typ === 'fehler') throw new Error(d.nachricht)
    }
  } catch (e) {
    if (zeitUeberschritten) throw new Error(zuLange)
    if (e instanceof Error && !(e instanceof SyntaxError) && e.message && !/network|fetch|abort/i.test(e.message)) throw e
    throw new Error('Die Verbindung ist abgebrochen. Bitte versuch es noch einmal.')
  } finally {
    window.clearTimeout(wecker)
  }
  if (!fertig) throw new Error('Die Verbindung ist abgebrochen. Bitte versuch es noch einmal.')
}

export async function anTeamWeitergeben(nachrichtId: string): Promise<void> {
  const antwort = await funktion('chat', { aktion: 'rueckfrage', nachricht_id: nachrichtId }).catch(() => null)
  if (!antwort?.ok) throw new Error((await antwort?.json().catch(() => null))?.fehler ?? 'Weitergeben hat nicht geklappt. Versuch es gleich noch einmal.')
}
