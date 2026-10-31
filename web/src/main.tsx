import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SitzungProvider } from './lib/sitzung'
import App from './App'
// Schriften lokal ausgeliefert (kein Abruf bei Google, DSGVO)
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './styles/basis.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SitzungProvider>
        <App />
      </SitzungProvider>
    </BrowserRouter>
  </StrictMode>,
)
