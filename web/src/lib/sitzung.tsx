// Anmeldung, Profil und Einwilligungen der angemeldeten Person.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Einwilligung, EinwilligungArt, Profil } from './db'

const OFFENER_CODE = 'kruger.offenerCode'

interface SitzungWert {
  laedt: boolean
  session: Session | null
  profil: Profil | null
  einwilligungen: Partial<Record<EinwilligungArt, boolean>>
  onboardingFertig: boolean
  istTeam: boolean
  istGruender: boolean
  neuLaden: () => Promise<void>
  abmelden: () => Promise<void>
}

const Kontext = createContext<SitzungWert | null>(null)

export function merkeCode(code: string, name: string) {
  localStorage.setItem(OFFENER_CODE, JSON.stringify({ code, name }))
}
function offenerCode(): { code: string; name: string } | null {
  try {
    return JSON.parse(localStorage.getItem(OFFENER_CODE) ?? 'null')
  } catch {
    return null
  }
}
function vergissCode() {
  localStorage.removeItem(OFFENER_CODE)
}

export function SitzungProvider({ children }: { children: ReactNode }) {
  const [laedt, setLaedt] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<Profil | null>(null)
  const [einwilligungen, setEinwilligungen] = useState<Partial<Record<EinwilligungArt, boolean>>>({})
  const [hatEinwilligungen, setHatEinwilligungen] = useState(false)
  const geladenFuer = useRef<string | null | undefined>(undefined)

  const ladeDaten = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfil(null)
      setEinwilligungen({})
      setHatEinwilligungen(false)
      return
    }
    let { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle<Profil>()

    // Registriert, E-Mail bestätigt, Code gemerkt: jetzt einlösen
    if (!p) {
      const gemerkt = offenerCode()
      if (gemerkt) {
        const { data, error } = await supabase.rpc('code_einloesen', { p_code: gemerkt.code, p_anzeigename: gemerkt.name })
        if (!error && data) {
          p = data as Profil
          vergissCode()
        }
      }
    }
    setProfil(p ?? null)

    if (p) {
      const { data: e } = await supabase.from('einwilligungen').select('*').eq('user_id', p.id).returns<Einwilligung[]>()
      const map: Partial<Record<EinwilligungArt, boolean>> = {}
      for (const x of e ?? []) map[x.art] = x.erteilt
      setEinwilligungen(map)
      setHatEinwilligungen((e ?? []).length > 0)
    }
  }, [])

  useEffect(() => {
    let aktiv = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!aktiv) return
      setSession(data.session)
      await ladeDaten(data.session)
      geladenFuer.current = data.session?.user.id ?? null
      if (aktiv) setLaedt(false)
    })
    const { data: abo } = supabase.auth.onAuthStateChange((ereignis, s) => {
      setSession(s)
      if (ereignis === 'SIGNED_IN' || ereignis === 'SIGNED_OUT' || ereignis === 'USER_UPDATED') {
        const neuePerson = (s?.user.id ?? null) !== geladenFuer.current
        // außerhalb des Callbacks laden, damit Supabase nicht blockiert.
        // Nur bei Personenwechsel den Ladezustand zeigen (SIGNED_IN kommt auch beim Zurückkehren in den Tab).
        setTimeout(() => {
          if (neuePerson) setLaedt(true)
          void ladeDaten(s).finally(() => { geladenFuer.current = s?.user.id ?? null; setLaedt(false) })
        }, 0)
      }
    })
    return () => {
      aktiv = false
      abo.subscription.unsubscribe()
    }
  }, [ladeDaten])

  const wert = useMemo<SitzungWert>(
    () => ({
      laedt,
      session,
      profil,
      einwilligungen,
      onboardingFertig: hatEinwilligungen,
      istTeam: !!profil && profil.rolle !== 'mitglied' && profil.freigeschaltet,
      istGruender: !!profil && profil.rolle === 'gruender' && profil.freigeschaltet,
      neuLaden: () => ladeDaten(session),
      abmelden: async () => {
        await supabase.auth.signOut()
      },
    }),
    [laedt, session, profil, einwilligungen, hatEinwilligungen, ladeDaten],
  )

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>
}

export function useSitzung(): SitzungWert {
  const w = useContext(Kontext)
  if (!w) throw new Error('useSitzung außerhalb von SitzungProvider')
  return w
}

export function vorname(profil: Profil | null): string {
  return profil?.anzeigename.split(' ')[0] ?? ''
}
