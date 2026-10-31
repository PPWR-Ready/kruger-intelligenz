// Datentypen der Tabellen, die die Web-App nutzt (entsprechen den Migrationen
// in supabase/migrations). Vollständige Typen lassen sich jederzeit erzeugen mit
//   npx supabase gen types typescript --project-id lqhkvxlxgatwuszxajrr

export type Rolle = 'mitglied' | 'trainer' | 'gruender'
export type EinwilligungArt = 'gesundheitsdaten' | 'kamera' | 'trainer_freigabe'
export type InhaltStatus = 'entwurf' | 'eingereicht' | 'freigegeben' | 'abgelehnt' | 'archiviert'
export type Sichtbarkeit = 'alle' | 'premium' | 'trainer'
export type IndexStatus = 'ausstehend' | 'indexiert' | 'fehler' | 'zu_entfernen' | 'entfernt'
export type Eingabeweg = 'text' | 'diktat' | 'upload' | 'scan' | 'interview' | 'rueckfrage'
export type RueckfrageStatus = 'offen' | 'beantwortet' | 'verworfen'
export type FreigabeStatus = 'offen' | 'freigegeben' | 'abgelehnt'

export interface Profil {
  id: string
  studio_id: string
  rolle: Rolle
  anzeigename: string
  freigeschaltet: boolean
  freigeschaltet_von: string | null
  external_member_id: string | null
  created_at: string
  updated_at: string
}

export interface Einwilligung {
  user_id: string
  art: EinwilligungArt
  erteilt: boolean
  text_version: string
  aktualisiert_am: string
}

export interface Gesundheitsprofil {
  user_id: string
  ziele: string[]
  beschwerden: string[]
  trainings_pro_woche: '1-2' | '3-4' | '5+' | null
  aktualisiert_am: string
}

export interface Abo {
  user_id: string
  stufe: 'assistent' | 'coach'
  status: 'aktiv' | 'gekuendigt' | 'ueberfaellig' | 'beendet'
  laeuft_bis: string | null
}

export interface Uebung {
  id: string
  studio_id: string | null
  name: string
  kategorie: string | null
  an_geraet: boolean
  beschreibung: string | null
  status: InhaltStatus
  /** Kamera-Regeln für den Trainer-Modus, siehe lib/pose/regeln.ts */
  regeln?: unknown
  erstellt_von?: string | null
  version?: number
}

export interface Einheit {
  id: string
  studio_id: string
  mitglied_id: string
  gestartet_am: string
  beendet_am: string | null
  befinden: number | null
  notiz: string | null
}

export interface ChatNachricht {
  id: string
  verlauf_id: string
  rolle: 'mitglied' | 'assistent' | 'trainer'
  inhalt: string
  quellen: { eintrag_id: string; titel: string }[]
  unsicher: boolean
  warnsignal: boolean
  created_at: string
}

export interface Rueckfrage {
  id: string
  studio_id: string
  mitglied_id: string
  nachricht_id: string | null
  frage: string
  ki_entwurf: string | null
  status: RueckfrageStatus
  beantwortet_von: string | null
  antwort: string | null
  beantwortet_am: string | null
  created_at: string
}

export interface WissenEintrag {
  id: string
  studio_id: string | null
  titel: string
  themen: string[]
  sichtbarkeit: Sichtbarkeit
  quelle: string | null
  status: InhaltStatus
  aktuelle_version_id: string | null
  erstellt_von: string | null
  created_at: string
  updated_at: string
}

export interface WissenVersion {
  id: string
  eintrag_id: string
  version: number
  inhalt: string
  eingabeweg: Eingabeweg
  rueckfrage_id: string | null
  erstellt_von: string | null
  created_at: string
  index_status: IndexStatus
  indexiert_am: string | null
  index_fehler: string | null
}

export interface Freigabe {
  id: string
  studio_id: string
  typ: 'wissen' | 'uebung'
  wissen_version_id: string | null
  uebung_id: string | null
  eingereicht_von: string | null
  status: FreigabeStatus
  ki_pruefung: Record<string, unknown>
  entschieden_von: string | null
  entschieden_am: string | null
  anmerkung: string | null
  created_at: string
}

export interface Einladungscode {
  code: string
  studio_id: string
  erstellt_von: string | null
  gueltig_bis: string | null
  max_nutzungen: number
  genutzt: number
  rolle: Rolle
  created_at: string
}

export interface AmpelZeile {
  mitglied_id: string
  anzeigename: string
  status: 'ansprechen' | 'beobachten' | 'laeuft'
  letzte_einheit: string | null
  schmerz_aktuell: number | null
  schmerz_vorher: number | null
  anteil_anpassen: number | null
  offene_rueckfragen: number
  warnsignal_7_tage: boolean
}

export const THEMEN = ['Training', 'Rücken', 'Ernährung', 'Gesundheit', 'Übungen', 'Regeneration'] as const
export const ZIELE = ['Schmerzfreier Rücken', 'Beweglichkeit', 'Kraft', 'Haltung', 'Fit im Alltag'] as const
export const BESCHWERDEN = ['Unterer Rücken', 'Nacken', 'Schulter', 'Hüfte', 'Knie'] as const
export const EINWILLIGUNG_VERSION = 'v1-2026-10'
