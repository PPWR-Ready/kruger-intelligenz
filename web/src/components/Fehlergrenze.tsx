// Fängt Anzeigefehler ab: statt einer weißen Seite gibt es einen Knopf zum Neuladen.
import { Component, type ReactNode } from 'react'

export class Fehlergrenze extends Component<{ children: ReactNode }, { fehler: boolean }> {
  state = { fehler: false }

  static getDerivedStateFromError() {
    return { fehler: true }
  }

  componentDidCatch(e: unknown) {
    console.error('Anzeigefehler', e)
  }

  render() {
    if (!this.state.fehler) return this.props.children
    return (
      <main className="fehlerseite">
        <img src="/signet.png" alt="" width={48} height={61} />
        <h1 className="titel" style={{ fontSize: 26 }}>Da hat etwas nicht geklappt.</h1>
        <p className="leise" style={{ margin: 0, maxWidth: '32ch' }}>Vermutlich gibt es gerade eine neue Version der App. Einmal neu laden, dann geht es weiter.</p>
        <button className="knopf primaer" onClick={() => location.reload()}>Neu laden</button>
      </main>
    )
  }
}
