import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useSitzung } from './lib/sitzung'
import { Laden } from './components/Bausteine'
import { TabLeiste } from './components/TabLeiste'
import { Anmelden, CodeEinloesen, DatenschutzSchritt, ErsteFrage, PasswortNeu, Registrieren, UeberDichSchritt, Willkommen } from './pages/Onboarding'
import { Heute } from './pages/Heute'
import { Assistent } from './pages/Assistent'
import { Trainieren } from './pages/Trainieren'
import { EinheitErfassen, Fortschritt } from './pages/Fortschritt'
import { Profil } from './pages/Profil'

// Team-Bereich nur bei Bedarf laden, damit die App für Mitglieder schlank bleibt
const TeamLayout = lazy(() => import('./pages/team/Layout').then((m) => ({ default: m.TeamLayout })))
const TeamUebersicht = lazy(() => import('./pages/team/Uebersicht').then((m) => ({ default: m.TeamUebersicht })))
const TeamRueckfragen = lazy(() => import('./pages/team/Rueckfragen').then((m) => ({ default: m.TeamRueckfragen })))
const TeamMitglieder = lazy(() => import('./pages/team/Mitglieder').then((m) => ({ default: m.TeamMitglieder })))
const TeamWissen = lazy(() => import('./pages/team/Wissen').then((m) => ({ default: m.TeamWissen })))
const TeamWissenEditor = lazy(() => import('./pages/team/Wissen').then((m) => ({ default: m.TeamWissenEditor })))
const TeamFreigaben = lazy(() => import('./pages/team/Freigaben').then((m) => ({ default: m.TeamFreigaben })))
const TeamUebungen = lazy(() => import('./pages/team/Uebungen').then((m) => ({ default: m.TeamUebungen })))
const TeamUebungEditor = lazy(() => import('./pages/team/Uebungen').then((m) => ({ default: m.TeamUebungEditor })))
// Trainer-Modus mit Kamera erst laden, wenn er gebraucht wird (Erkennung ist groß)
const KameraTraining = lazy(() => import('./pages/KameraTraining').then((m) => ({ default: m.KameraTraining })))

/** Wohin eine Person gehört, je nachdem wie weit sie ist. */
function ziel(s: ReturnType<typeof useSitzung>): string {
  if (!s.session) return '/willkommen'
  if (!s.profil) return '/zugang'
  if (!s.onboardingFertig) return '/start/ueber-dich'
  return '/assistent'
}

/** Nur ohne Anmeldung (Willkommen, Registrieren, Anmelden). */
function Oeffentlich({ children }: { children: ReactNode }) {
  const s = useSitzung()
  return s.session ? <Navigate to={ziel(s)} replace /> : <>{children}</>
}

/** Angemeldet; stufe bestimmt, wie weit die Einrichtung schon sein muss. */
function Geschuetzt({ stufe }: { stufe: 'konto' | 'profil' | 'fertig' | 'team' }) {
  const s = useSitzung()
  const ort = useLocation()
  if (!s.session) return <Navigate to="/anmelden" replace state={{ von: ort.pathname }} />
  if (stufe === 'konto') return s.profil ? <Navigate to={ziel(s)} replace /> : <Outlet />
  if (!s.profil) return <Navigate to="/zugang" replace />
  if (stufe === 'profil') return <Outlet />
  if (!s.onboardingFertig) return <Navigate to="/start/ueber-dich" replace />
  if (stufe === 'team' && !s.istTeam) return <Navigate to="/assistent" replace />
  return <Outlet />
}

/** Hauptseiten, von denen die App beim Start immer in einen neuen Chat springt. */
const START_IN_CHAT = new Set(['/', '/heute', '/fortschritt', '/profil', '/trainieren'])
let startGeprueft = false

/**
 * Beim Öffnen der App beginnt man im Chat – auch wenn der Browser die zuletzt
 * offene Seite wiederherstellt oder die Verknüpfung auf eine andere Seite zeigt.
 * Gilt nur einmal pro Start; Direktlinks (Übung, Team, Passwort) bleiben unberührt.
 */
function StartImChat() {
  const ort = useLocation()
  // Nur beim allerersten Anzeigen nach dem Start: Hauptseite → neuer Chat. Danach nie wieder.
  const [umleiten, setUmleiten] = useState(() => !startGeprueft && START_IN_CHAT.has(ort.pathname) && !ort.search)
  if (umleiten && ort.pathname === '/assistent') setUmleiten(false) // im Chat angekommen
  useEffect(() => { startGeprueft = true }, [])
  return umleiten && ort.pathname !== '/assistent' ? <Navigate to="/assistent" replace /> : <Outlet />
}

function MitgliedRahmen() {
  return (
    <main className="mitglied">
      <Outlet />
      <TabLeiste />
    </main>
  )
}

export default function App() {
  const s = useSitzung()
  // Nach der ersten echten Anzeige gilt der Start als erledigt (egal auf welcher Seite)
  useEffect(() => { if (!s.laedt) startGeprueft = true }, [s.laedt])
  if (s.laedt) return <main className="mitglied"><Laden text="Rückgrat wird geladen …" /></main>

  return (
    <Routes>
      <Route path="/" element={<Navigate to={ziel(s)} replace />} />
      <Route path="/willkommen" element={<Oeffentlich><Willkommen /></Oeffentlich>} />
      <Route path="/registrieren" element={<Oeffentlich><Registrieren /></Oeffentlich>} />
      <Route path="/anmelden" element={<Oeffentlich><Anmelden /></Oeffentlich>} />
      {/* Link aus der Passwort-E-Mail meldet kurzzeitig an, daher ohne Schutz */}
      <Route path="/passwort-neu" element={<PasswortNeu />} />

      <Route element={<Geschuetzt stufe="konto" />}>
        <Route path="/zugang" element={<CodeEinloesen />} />
      </Route>

      <Route element={<Geschuetzt stufe="profil" />}>
        <Route path="/start/ueber-dich" element={<UeberDichSchritt />} />
        <Route path="/start/datenschutz" element={<DatenschutzSchritt />} />
        <Route path="/start/erste-frage" element={<ErsteFrage />} />
      </Route>

      <Route element={<Geschuetzt stufe="fertig" />}>
        <Route element={<StartImChat />}>
        <Route element={<MitgliedRahmen />}>
          <Route path="/heute" element={<Heute />} />
          <Route path="/assistent" element={<Assistent />} />
          <Route path="/trainieren" element={<Trainieren />} />
          <Route path="/fortschritt" element={<Fortschritt />} />
          <Route path="/fortschritt/neu" element={<EinheitErfassen />} />
          <Route path="/profil" element={<Profil />} />
        </Route>
        </Route>
        <Route path="/profil/ziele" element={<UeberDichSchritt bearbeiten />} />
        <Route path="/trainieren/:id" element={<Suspense fallback={<main className="trainer"><Laden /></main>}><KameraTraining /></Suspense>} />
      </Route>

      <Route element={<Geschuetzt stufe="team" />}>
        <Route path="/team" element={<Suspense fallback={<Laden />}><TeamLayout /></Suspense>}>
          <Route index element={<TeamUebersicht />} />
          <Route path="rueckfragen" element={<TeamRueckfragen />} />
          <Route path="wissen" element={<TeamWissen />} />
          <Route path="wissen/:id" element={<TeamWissenEditor />} />
          <Route path="freigaben" element={<TeamFreigaben />} />
          <Route path="uebungen" element={<TeamUebungen />} />
          <Route path="uebungen/:id" element={<TeamUebungEditor />} />
          <Route path="mitglieder" element={<TeamMitglieder />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
