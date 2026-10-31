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
  let antwort: Response
  try {
    antwort = await funktion('chat', eingabe)
  } catch {
    throw new Error('Der Assistent ist gerade nicht erreichbar. Prüfe deine Internetverbindung und versuch es gleich noch einmal.')
  }
  if (!antwort.ok || !antwort.body) {
    let nachricht = 'Der Assistent ist gerade nicht erreichbar.'
    try {
      nachricht = (await antwort.json()).fehler ?? nachricht
    } catch { /* keine JSON-Antwort */ }
    throw new Error(nachricht)
  }
  let fertig = false
  try {
    for await (const e of liesSse(antwort.body)) {
      const d = JSON.parse(e.data)
      if (d.typ === 'start') r.beimStart?.(d.verlauf_id)
      else if (d.typ === 'text') r.beimText(d.t)
      else if (d.typ === 'ende') { fertig = true; r.beimEnde(d as ChatEnde) }
      else if (d.typ === 'fehler') throw new Error(d.nachricht)
    }
  } catch (e) {
    if (e instanceof Error && !(e instanceof SyntaxError) && e.message && !/network|fetch|abort/i.test(e.message)) throw e
    throw new Error('Die Verbindung ist abgebrochen. Bitte versuch es noch einmal.')
  }
  if (!fertig) throw new Error('Die Verbindung ist abgebrochen. Bitte versuch es noch einmal.')
}

export async function anTeamWeitergeben(nachrichtId: string): Promise<void> {
  const antwort = await funktion('chat', { aktion: 'rueckfrage', nachricht_id: nachrichtId }).catch(() => null)
  if (!antwort?.ok) throw new Error((await antwort?.json().catch(() => null))?.fehler ?? 'Weitergeben hat nicht geklappt. Versuch es gleich noch einmal.')
}
