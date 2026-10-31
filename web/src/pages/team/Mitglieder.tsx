import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { fehlertext, supabase } from '../../lib/supabase'
import { useSitzung } from '../../lib/sitzung'
import { datumKurz, relativ } from '../../lib/zeit'
import type { Einladungscode, Profil, Rolle } from '../../lib/db'
import { Fehler, Laden, useMitteilung } from '../../components/Bausteine'
import { useTeam } from './Layout'

const ROLLEN: Record<Rolle, string> = { mitglied: 'Mitglied', trainer: 'Trainer', gruender: 'Admin' }

function neuerCode(): string {
  // ohne verwechselbare Zeichen (0/O, 1/I)
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const zufall = crypto.getRandomValues(new Uint8Array(6))
  return `RG-${Array.from(zufall, (b) => zeichen[b % zeichen.length]).join('')}`
}

export function TeamMitglieder() {
  const s = useSitzung()
  const team = useTeam()
  const [personen, setPersonen] = useState<Profil[] | null>(null)
  const [codes, setCodes] = useState<Einladungscode[]>([])
  const [suche, setSuche] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [mitteilung, zeige] = useMitteilung()

  const laden = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('*').order('freigeschaltet').order('created_at', { ascending: false }),
      supabase.from('einladungscodes').select('*').order('created_at', { ascending: false }),
    ])
    if (p.error) setFehler(fehlertext(p.error))
    setPersonen((p.data ?? []) as Profil[])
    setCodes((c.data ?? []) as Einladungscode[])
  }, [])

  useEffect(() => { void laden() }, [laden])

  async function aendern(p: Profil, aenderung: Partial<Pick<Profil, 'freigeschaltet' | 'rolle'>>, text: string) {
    setFehler(null)
    const { error } = await supabase.from('profiles').update(aenderung).eq('id', p.id)
    if (error) return setFehler(fehlertext(error))
    zeige(text)
    team.zaehlerNeuLaden()
    void laden()
  }

  const gefiltert = (personen ?? []).filter((p) => p.anzeigename.toLowerCase().includes(suche.trim().toLowerCase()))
  const neue = gefiltert.filter((p) => !p.freigeschaltet)
  const aktive = gefiltert.filter((p) => p.freigeschaltet)

  return (
    <>
      <header className="stapel" style={{ gap: 4 }}>
        <p className="eyebrow">Mitglieder</p>
        <h1 className="titel">Zugänge und Einladungen</h1>
      </header>
      <Fehler text={fehler} />

      <div className="zweispaltig">
        <div className="haupt stapel" style={{ gap: 20 }}>
          <label className="feld" style={{ maxWidth: 360 }}>
            <span>Suchen</span>
            <input type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name" />
          </label>

          {!personen ? <Laden /> : (
            <>
              {neue.length > 0 && (
                <section className="stapel">
                  <h2 className="untertitel">Warten auf Freischaltung</h2>
                  {neue.map((p) => (
                    <div key={p.id} className="karte warnung" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div className="stapel" style={{ gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{p.anzeigename}</span>
                        <span className="klein leise">registriert {relativ(p.created_at)}</span>
                      </div>
                      <button className="knopf primaer klein" onClick={() => void aendern(p, { freigeschaltet: true }, `${p.anzeigename} ist freigeschaltet`)}>Freischalten</button>
                    </div>
                  ))}
                </section>
              )}

              <section className="stapel">
                <h2 className="untertitel">Aktiv ({aktive.length})</h2>
                {aktive.length === 0 ? <div className="leer">Noch niemand freigeschaltet.</div> : (
                  <div className="tabelle-rahmen">
                    <table className="tabelle" style={{ minWidth: 0 }}>
                      <thead><tr><th>Name</th><th>Rolle</th><th className="nur-breit">Seit</th><th></th></tr></thead>
                      <tbody>
                        {aktive.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600 }}>{p.anzeigename}{p.id === s.profil?.id && <span className="leise"> (du)</span>}</td>
                            <td>
                              {s.istGruender && p.id !== s.profil?.id ? (
                                <select className="eingabe" style={{ minHeight: 40, padding: '6px 10px' }} value={p.rolle} aria-label={`Rolle von ${p.anzeigename}`}
                                  onChange={(e) => {
                                    const neu = e.target.value as Rolle
                                    if (neu === p.rolle) return
                                    const warnung = neu === 'gruender' ? ' Admins dürfen alles, auch Wissen freigeben und Rollen ändern.' : ''
                                    if (!confirm(`${p.anzeigename} wirklich zu „${ROLLEN[neu]}“ machen?${warnung}`)) { e.target.value = p.rolle; return }
                                    void aendern(p, { rolle: neu }, `${p.anzeigename} ist jetzt ${ROLLEN[neu]}`)
                                  }}>
                                  {(Object.keys(ROLLEN) as Rolle[]).map((r) => <option key={r} value={r}>{ROLLEN[r]}</option>)}
                                </select>
                              ) : ROLLEN[p.rolle]}
                            </td>
                            <td className="leise nur-breit">{datumKurz(p.created_at)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {p.id !== s.profil?.id && (p.rolle === 'mitglied' || s.istGruender) && (
                                <button className="knopf klein still" onClick={() => confirm(`Zugang von ${p.anzeigename} sperren?`) && void aendern(p, { freigeschaltet: false }, 'Zugang gesperrt')}>Sperren</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="neben">
          <Einladungen codes={codes} neuLaden={() => void laden()} zeige={zeige} />
        </aside>
      </div>
      {mitteilung}
    </>
  )
}

function Einladungen({ codes, neuLaden, zeige }: { codes: Einladungscode[]; neuLaden: () => void; zeige: (t: string) => void }) {
  const s = useSitzung()
  const [nutzungen, setNutzungen] = useState('1')
  const [tage, setTage] = useState('30')
  const [laeuft, setLaeuft] = useState(false)
  const [rolle, setRolle] = useState<Rolle>('mitglied')
  const [fehler, setFehler] = useState<string | null>(null)

  const link = (code: string) => `${location.origin}/registrieren?code=${code}`

  async function erstellen(e: FormEvent) {
    e.preventDefault()
    if (!s.profil || laeuft) return
    setFehler(null)
    const n = Number(nutzungen), t = tage.trim() === '' ? NaN : Number(tage)
    if (!Number.isInteger(n) || n < 1 || n > 500) return setFehler('Nutzungen: bitte eine Zahl von 1 bis 500.')
    if (!Number.isInteger(t) || t < 0 || t > 365) return setFehler('Gültig: bitte 0 bis 365 Tage (0 = unbegrenzt).')
    setLaeuft(true)
    const code = neuerCode()
    const { error } = await supabase.from('einladungscodes').insert({
      code, studio_id: s.profil.studio_id, erstellt_von: s.profil.id, max_nutzungen: n, rolle,
      gueltig_bis: t > 0 ? new Date(Date.now() + t * 86400000).toISOString() : null,
    })
    setLaeuft(false)
    if (error) return setFehler(fehlertext(error))
    await kopieren(code)
    neuLaden()
  }

  async function kopieren(code: string) {
    try {
      await navigator.clipboard.writeText(link(code))
      zeige(`Link für ${code} kopiert`)
    } catch {
      zeige(`Code: ${code}`)
    }
  }

  async function loeschen(code: string) {
    if (!confirm(`Code ${code} löschen? Er kann danach nicht mehr eingelöst werden.`)) return
    const { error } = await supabase.from('einladungscodes').delete().eq('code', code)
    if (error) return setFehler(fehlertext(error))
    neuLaden()
  }

  const gueltig = (c: Einladungscode) => c.genutzt < c.max_nutzungen && (!c.gueltig_bis || new Date(c.gueltig_bis) > new Date())

  return (
    <section className="karte" style={{ gap: 16 }}>
      <h2 className="untertitel">Einladungscodes</h2>
      <p className="klein leise" style={{ margin: 0 }}>Mitglieder registrieren sich mit einem Code. Neue Zugänge schaltest du danach unter „Warten auf Freischaltung“ frei.</p>
      <form className="stapel" onSubmit={erstellen}>
        <div className="raster-2">
          <label className="feld"><span>Nutzungen</span><input type="number" inputMode="numeric" min={1} max={500} value={nutzungen} onChange={(e) => setNutzungen(e.target.value)} /></label>
          <label className="feld"><span>Gültig (Tage)</span><input type="number" inputMode="numeric" min={0} max={365} value={tage} onChange={(e) => setTage(e.target.value)} /></label>
        </div>
        {s.istGruender && (
          <label className="feld">
            <span>Für</span>
            <select value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
              <option value="mitglied">Mitglieder</option>
              <option value="trainer">Trainer (sofort freigeschaltet)</option>
              <option value="gruender">Admin (sofort freigeschaltet)</option>
            </select>
          </label>
        )}
        <span className="klein leise">0 Tage = unbegrenzt gültig. Für einen Aushang im Studio z. B. 200 Nutzungen. Team-Codes am besten nur einmal nutzbar.</span>
        <button className="knopf primaer" disabled={laeuft}>{laeuft ? 'Einen Moment …' : 'Code erstellen und Link kopieren'}</button>
      </form>
      <Fehler text={fehler} />
      <div className="stapel" style={{ gap: 8 }}>
        {codes.length === 0 && <span className="klein leise">Noch keine Codes.</span>}
        {codes.map((c) => (
          <div key={c.code} className="reihe zwischen" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, flexWrap: 'wrap', gap: 6 }}>
            <div className="stapel" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace', opacity: gueltig(c) ? 1 : 0.5 }}>{c.code}</span>
              <span className="klein leise">{c.rolle !== 'mitglied' && <strong style={{ color: 'var(--accent-text)' }}>{ROLLEN[c.rolle]} · </strong>}{c.genutzt}/{c.max_nutzungen} genutzt{c.gueltig_bis ? ` · bis ${datumKurz(c.gueltig_bis)}` : ''}{gueltig(c) ? '' : c.genutzt >= c.max_nutzungen ? ' · aufgebraucht' : ' · abgelaufen'}</span>
            </div>
            <div className="reihe" style={{ gap: 6 }}>
              {gueltig(c) && <button className="knopf klein" onClick={() => void kopieren(c.code)}>Link kopieren</button>}
              <button className="knopf klein still" onClick={() => void loeschen(c.code)} aria-label={`Code ${c.code} löschen`}>Löschen</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
