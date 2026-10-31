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
export async function funktion(name: string, body: unknown): Promise<Response> {
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
  })
}

/** Übersetzt technische Fehler in verständliche Sätze. */
export function fehlertext(e: unknown): string {
  const nachricht = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/Invalid login credentials/i.test(nachricht)) return 'E-Mail oder Passwort stimmen nicht.'
  if (/Email not confirmed/i.test(nachricht)) return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.'
  if (/User already registered/i.test(nachricht)) return 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an.'
  if (/Password should be at least/i.test(nachricht)) return 'Das Passwort muss mindestens 8 Zeichen haben.'
  if (/Einladungscode/i.test(nachricht)) return 'Der Einladungscode ist ungültig oder abgelaufen.'
  if (/Failed to fetch|NetworkError/i.test(nachricht)) return 'Keine Verbindung. Prüfe dein Internet und versuch es noch einmal.'
  return nachricht || 'Da ist etwas schiefgelaufen.'
}
