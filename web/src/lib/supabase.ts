import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY müssen gesetzt sein (siehe web/.env.example).')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Ruft eine Edge Function mit dem aktuellen Login-Token auf. */
export async function funktion(name: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_KEY,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
}

/** Übersetzt technische Fehler in verständliche Sätze. */
export function fehlertext(e: unknown): string {
  const nachricht = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/Invalid login credentials/i.test(nachricht)) return 'E-Mail oder Passwort stimmen nicht.'
  if (/Email not confirmed/i.test(nachricht)) return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.'
  if (/User already registered/i.test(nachricht)) return 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an.'
  if (/invalid.*email|email.*invalid|Unable to validate email/i.test(nachricht)) return 'Bitte gib eine gültige E-Mail-Adresse ein.'
  if (/rate limit|too many requests|over_email_send_rate/i.test(nachricht)) return 'Gerade kamen zu viele Anfragen. Bitte warte eine Minute und versuch es dann noch einmal.'
  if (/Password should be at least/i.test(nachricht)) return 'Das Passwort muss mindestens 8 Zeichen haben.'
  if (/Einladungscode/i.test(nachricht)) return 'Der Einladungscode ist ungültig oder abgelaufen.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(nachricht)) return 'Keine Verbindung. Prüfe dein Internet und versuch es noch einmal.'
  if (/row-level security|permission denied|not allowed|42501/i.test(nachricht)) return 'Dafür fehlen dir die Rechte. Bitte wende dich an einen Admin.'
  if (/Nur (Admins|Gründer)/i.test(nachricht)) return nachricht.replace(/^.*?(Nur (Admins|Gründer))/, '$1').replace('Gründer', 'Admins')
  if (/duplicate key|already exists|23505/i.test(nachricht)) return 'Das gibt es schon.'
  if (/JWT|token.*expired|not authenticated/i.test(nachricht)) return 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.'
  if (/timeout|timed out|AbortError/i.test(nachricht)) return 'Das hat zu lange gedauert. Bitte versuch es noch einmal.'
  if (/too large|payload/i.test(nachricht)) return 'Die Datei ist zu groß.'
  // Unbekannte englische Technikmeldungen nicht ungefiltert zeigen
  if (/^[\x00-\x7F]*$/.test(nachricht) && /[a-z]{4,} [a-z]{3,}/i.test(nachricht)) {
    console.warn('Unbekannter Fehler', nachricht)
    return 'Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.'
  }
  return nachricht || 'Da ist etwas schiefgelaufen.'
}
