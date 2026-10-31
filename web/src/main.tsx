import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SitzungProvider } from './lib/sitzung'
import App from './App'
import { Fehlergrenze } from './components/Fehlergrenze'
// Schriften lokal ausgeliefert (kein Abruf bei Google, DSGVO)
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './styles/basis.css'

// Nach einem Update fehlen alte Programmteile: dann einmal neu laden (höchstens alle 30 s)
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  try {
    const zuletzt = Number(sessionStorage.getItem('neu-geladen') ?? 0)
    if (Date.now() - zuletzt < 30_000) return
    sessionStorage.setItem('neu-geladen', String(Date.now()))
  } catch { /* ohne Speicher trotzdem neu laden */ }
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SitzungProvider>
        <Fehlergrenze>
          <App />
        </Fehlergrenze>
      </SitzungProvider>
    </BrowserRouter>
  </StrictMode>,
)
