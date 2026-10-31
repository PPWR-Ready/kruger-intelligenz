// Speichern von Wissen: Admins geben direkt frei, Trainer reichen zur Freigabe ein.
import { funktion, supabase } from './supabase'
import type { Eingabeweg, Profil, Sichtbarkeit } from './db'

export interface WissenEingabe {
  eintragId?: string
  titel: string
  themen: string[]
  sichtbarkeit: Sichtbarkeit
  quelle: string | null
  inhalt: string
  eingabeweg: Eingabeweg
  rueckfrageId?: string
  /** Five-Grundwissen für alle Studios (nur Admins) */
  global: boolean
  /** Originaldateien (Upload oder Fotos), landen im privaten Bucket „wissen“ */
  dateien?: { blob: Blob; name: string; mime: string }[]
}

export interface WissenErgebnis { eintragId: string; versionId: string; freigegeben: boolean }

function pruefe(e: { error: { message: string } | null }, was: string) {
  if (e.error) throw new Error(`${was}: ${e.error.message}`)
}

export async function wissenSpeichern(e: WissenEingabe, profil: Profil, istGruender: boolean): Promise<WissenErgebnis> {
  const titel = e.titel.trim()
  const inhalt = e.inhalt.trim()
  if (!titel) throw new Error('Bitte gib einen Titel ein.')
  if (inhalt.length < 20) throw new Error('Der Inhalt ist zu kurz.')

  // 1. Eintrag anlegen oder Angaben aktualisieren
  let eintragId = e.eintragId
  if (!eintragId) {
    const r = await supabase.from('wissen_eintraege').insert({
      studio_id: e.global && istGruender ? null : profil.studio_id,
      titel, themen: e.themen, sichtbarkeit: e.sichtbarkeit, quelle: e.quelle?.trim() || null,
      status: istGruender ? 'entwurf' : 'eingereicht', erstellt_von: profil.id,
    }).select('id').single()
    pruefe(r, 'Eintrag anlegen')
    eintragId = r.data!.id as string
  } else {
    const aenderung: Record<string, unknown> = { titel, themen: e.themen, sichtbarkeit: e.sichtbarkeit, quelle: e.quelle?.trim() || null }
    const r = await supabase.from('wissen_eintraege').update(aenderung).eq('id', eintragId)
    // Trainer dürfen freigegebene Einträge nicht direkt ändern – die neue Version läuft dann über die Freigabe
    if (r.error && istGruender) pruefe(r, 'Eintrag ändern')
  }

  // 2. Neue Version
  const { data: letzte } = await supabase.from('wissen_versionen').select('version').eq('eintrag_id', eintragId).order('version', { ascending: false }).limit(1)
  const v = await supabase.from('wissen_versionen').insert({
    eintrag_id: eintragId, version: (letzte?.[0]?.version ?? 0) + 1, inhalt,
    eingabeweg: e.eingabeweg, rueckfrage_id: e.rueckfrageId ?? null, erstellt_von: profil.id,
  }).select('id').single()
  pruefe(v, 'Version speichern')
  const versionId = v.data!.id as string

  // 3. Originale ablegen (Fehler hier verhindern das Speichern nicht)
  for (const [i, d] of (e.dateien ?? []).entries()) {
    const sicher = d.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || `datei-${i + 1}`
    const pfad = `${profil.studio_id}/${eintragId}/${versionId}-${i + 1}-${sicher}`
    const hoch = await supabase.storage.from('wissen').upload(pfad, d.blob, { contentType: d.mime, upsert: false })
    if (hoch.error) { console.warn('Original nicht gespeichert', hoch.error); continue }
    await supabase.from('wissen_dateien').insert({ version_id: versionId, storage_pfad: pfad, mime_typ: d.mime, transkript: inhalt, verarbeitet: true })
  }

  // 4. Freigeben oder einreichen
  if (istGruender) {
    const r = await supabase.from('wissen_eintraege').update({ status: 'freigegeben', aktuelle_version_id: versionId }).eq('id', eintragId)
    pruefe(r, 'Freigeben')
    indexAnstossen()
    return { eintragId, versionId, freigegeben: true }
  }
  const f = await supabase.from('freigaben').insert({ studio_id: profil.studio_id, typ: 'wissen', wissen_version_id: versionId, eingereicht_von: profil.id, status: 'offen' })
  pruefe(f, 'Einreichen')
  return { eintragId, versionId, freigegeben: false }
}

/** Indexierung im Hintergrund anstoßen; n8n macht es sonst beim nächsten Lauf. */
export function indexAnstossen(erneut = false) {
  void funktion('wissen-indexieren', erneut ? { erneut: true } : {}).catch(() => {})
}
