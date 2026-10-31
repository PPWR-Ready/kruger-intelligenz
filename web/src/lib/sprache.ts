// Spracheingabe und Vorlesen über die Web-Speech-Schnittstelle des Browsers.
// Spracheingabe funktioniert in Chrome, Edge und Safari; Vorlesen überall.

interface Erkennung {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

type ErkennungsKlasse = new () => Erkennung

function klasse(): ErkennungsKlasse | null {
  const w = window as unknown as { SpeechRecognition?: ErkennungsKlasse; webkitSpeechRecognition?: ErkennungsKlasse }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const spracheingabeMoeglich = () => klasse() !== null

/**
 * Startet die Spracheingabe. `beimText` erhält fertige Sätze, `zwischen`
 * den gerade erkannten, noch vorläufigen Text. Liefert eine Stopp-Funktion.
 */
export function hoereZu(
  r: { beimText: (text: string) => void; zwischen?: (text: string) => void; beimEnde?: () => void; beimFehler?: (f: string) => void },
  dauerhaft = false,
): () => void {
  const K = klasse()
  if (!K) {
    r.beimFehler?.('Spracheingabe wird von diesem Browser nicht unterstützt.')
    return () => {}
  }
  const e = new K()
  e.lang = 'de-DE'
  e.continuous = dauerhaft
  e.interimResults = true
  e.onresult = (ev) => {
    let vorlaeufig = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const ergebnis = ev.results[i]
      if (ergebnis.isFinal) r.beimText(ergebnis[0].transcript.trim())
      else vorlaeufig += ergebnis[0].transcript
    }
    r.zwischen?.(vorlaeufig)
  }
  e.onerror = (ev) => {
    if (ev.error === 'not-allowed') r.beimFehler?.('Bitte erlaube den Zugriff aufs Mikrofon.')
    else if (ev.error !== 'no-speech' && ev.error !== 'aborted') r.beimFehler?.('Die Spracheingabe hat nicht geklappt.')
  }
  e.onend = () => r.beimEnde?.()
  e.start()
  return () => e.stop()
}

export function vorlesen(text: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const a = new SpeechSynthesisUtterance(text)
  a.lang = 'de-DE'
  a.rate = 1
  const stimme = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'))
  if (stimme) a.voice = stimme
  window.speechSynthesis.speak(a)
}

export function vorlesenStoppen(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
