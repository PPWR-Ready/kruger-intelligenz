// Pflichtangaben: Impressum und Datenschutzerklärung des Studios, überall erreichbar.
export const IMPRESSUM_URL = (import.meta.env.VITE_IMPRESSUM_URL as string | undefined) ?? 'https://www.rueckgrat-donau.de/impressum'
export const DATENSCHUTZ_URL = (import.meta.env.VITE_DATENSCHUTZ_URL as string | undefined) ?? 'https://www.rueckgrat-donau.de/datenschutz'

export function Rechtliches() {
  return (
    <nav className="rechtliches" aria-label="Rechtliches">
      <a href={IMPRESSUM_URL} target="_blank" rel="noreferrer">Impressum</a>
      <a href={DATENSCHUTZ_URL} target="_blank" rel="noreferrer">Datenschutz</a>
    </nav>
  )
}
