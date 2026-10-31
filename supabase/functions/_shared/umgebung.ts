// Zugriff auf Umgebungsvariablen und gemeinsame Antwort-Helfer.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function env(name: string, standard?: string): string {
  const wert = Deno.env.get(name) ?? standard
  if (wert === undefined || wert === '') throw new KonfigFehler(name)
  return wert
}

export function envOptional(name: string): string | undefined {
  const wert = Deno.env.get(name)
  return wert === undefined || wert === '' ? undefined : wert
}

export class KonfigFehler extends Error {
  constructor(public variable: string) {
    super(`Die Umgebungsvariable ${variable} ist nicht gesetzt.`)
  }
}

export const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ERLAUBTE_HERKUNFT') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-index-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function fehler(nachricht: string, status: number): Response {
  return json({ fehler: nachricht }, status)
}

/** Client mit Service-Role: umgeht RLS, nur für serverseitige Schreibzugriffe. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Liefert die angemeldete Person zum Bearer-Token oder null. */
export async function angemeldetePerson(req: Request, admin: SupabaseClient) {
  const kopf = req.headers.get('Authorization') ?? ''
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : ''
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
