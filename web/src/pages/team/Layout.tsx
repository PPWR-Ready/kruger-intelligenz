import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSitzung } from '../../lib/sitzung'
import { Icon } from '../../components/Icon'

interface Zaehler { rueckfragen: number; freigaben: number; neue: number }
interface TeamKontext { zaehlerNeuLaden: () => void }

export function useTeam(): TeamKontext {
  return useOutletContext<TeamKontext>()
}

export function TeamLayout() {
  const s = useSitzung()
  const ort = useLocation()
  const [z, setZ] = useState<Zaehler>({ rueckfragen: 0, freigaben: 0, neue: 0 })

  const laden = useCallback(async () => {
    const [r, f, n] = await Promise.all([
      supabase.from('rueckfragen').select('id', { count: 'exact', head: true }).eq('status', 'offen'),
      supabase.from('freigaben').select('id', { count: 'exact', head: true }).eq('status', 'offen'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('freigeschaltet', false),
    ])
    setZ({ rueckfragen: r.count ?? 0, freigaben: f.count ?? 0, neue: n.count ?? 0 })
  }, [])

  useEffect(() => { void laden() }, [laden, ort.pathname])

  const zahl = (n: number) => (n > 0 ? <span className="zaehler">{n}</span> : null)

  return (
    <div className="team">
      <aside className="team-leiste">
        <div className="stapel" style={{ gap: 2 }}>
          <span className="wortmarke">RÜCKGRAT</span>
          <span className="klein leise">Team · {s.profil?.anzeigename}</span>
        </div>
        <nav className="team-nav" aria-label="Team-Bereich">
          <NavLink to="/team" end><Icon name="team" groesse={20} />Übersicht</NavLink>
          <NavLink to="/team/rueckfragen"><Icon name="chat" groesse={20} />Rückfragen{zahl(z.rueckfragen)}</NavLink>
          <NavLink to="/team/wissen"><Icon name="buch" groesse={20} />Wissen</NavLink>
          <NavLink to="/team/uebungen"><Icon name="kamera" groesse={20} />Übungen</NavLink>
          <NavLink to="/team/freigaben"><Icon name="freigabe" groesse={20} />Freigaben{zahl(z.freigaben)}</NavLink>
          <NavLink to="/team/mitglieder"><Icon name="profil" groesse={20} />Mitglieder{zahl(z.neue)}</NavLink>
        </nav>
        <div className="stapel" style={{ marginTop: 'auto' }}>
          <Link to="/heute" className="knopf klein still" style={{ justifyContent: 'flex-start' }}><Icon name="zurueck" groesse={18} />Zur Mitglieder-App</Link>
          <button className="knopf klein still" style={{ justifyContent: 'flex-start' }} onClick={() => void s.abmelden()}><Icon name="abmelden" groesse={18} />Abmelden</button>
        </div>
      </aside>
      <main className="team-inhalt">
        <Outlet context={{ zaehlerNeuLaden: () => void laden() } satisfies TeamKontext} />
      </main>
    </div>
  )
}
