// Baut die Systemanweisung für das Sprachmodell. Reine Logik, testbar.

export interface Quelle {
  nr: number
  titel: string
  text: string
}

export interface Kontext {
  vorname: string
  studioName: string
  kontext: 'chat' | 'trainer_modus'
  uebung?: string | null
  gesundheit?: { ziele: string[]; beschwerden: string[]; trainings_pro_woche: string | null } | null
  letzteEinheiten?: { datum: string; befinden: number | null }[]
  warnsignal: boolean
  quellen: Quelle[]
}

export function baueSystemanweisung(k: Kontext): string {
  const teile: string[] = []

  teile.push(
    `Du bist der digitale Assistent von ${k.studioName}. Du sprichst für das Team des Studios und für die Gründer, ` +
      'die das Five-Konzept für Rücken und Gelenke entwickelt haben. Five ist aktives Muskellängentraining: ' +
      'Muskeln werden unter Kraft gedehnt, nicht nur passiv gestretcht.',
  )

  teile.push(
    [
      'So antwortest du:',
      '- Duze die Person, sprich warm, kurz und konkret, wie ein erfahrener Trainer im Studio.',
      '- Stütze dich ausschließlich auf die Quellen unten. Allgemeinwissen nur, um die Quellen verständlich zu machen, nie um Lücken zu füllen.',
      '- Reichen die Quellen nicht für eine verlässliche Antwort, sag das offen in einem Satz und setze "unsicher" auf true. Erfinde nichts.',
      '- Stelle keine Diagnosen, nenne keine Medikamente und keine Therapie bei Beschwerden. Bei Schmerzen, die neu, stark oder ungewöhnlich sind, rate zur ärztlichen Abklärung.',
      '- Schreibe in kurzen Absätzen ohne Überschriften; eine kurze Aufzählung nur, wenn sie wirklich hilft. Höchstens etwa 150 Wörter.',
      '- Nenne Quellen nicht im Text; sie werden separat angezeigt.',
    ].join('\n'),
  )

  if (k.warnsignal) {
    teile.push(
      'Achtung: In der Frage stecken mögliche Warnsignale. Gib keine Trainingsempfehlung für die beschriebenen Beschwerden, ' +
        'sondern rate klar und freundlich zur ärztlichen Abklärung. Ein fester Hinweis wird zusätzlich angezeigt.',
    )
  }

  const person: string[] = [`Vorname: ${k.vorname}`]
  if (k.gesundheit) {
    if (k.gesundheit.ziele.length) person.push(`Ziele: ${k.gesundheit.ziele.join(', ')}`)
    if (k.gesundheit.beschwerden.length) person.push(`Bekannte Beschwerden: ${k.gesundheit.beschwerden.join(', ')}`)
    if (k.gesundheit.trainings_pro_woche) person.push(`Trainiert pro Woche: ${k.gesundheit.trainings_pro_woche} Mal`)
  }
  if (k.letzteEinheiten?.length) {
    const liste = k.letzteEinheiten
      .map((e) => `${e.datum}${e.befinden === null ? '' : ` (Rückenschmerz ${e.befinden}/10)`}`)
      .join('; ')
    person.push(`Letzte Einheiten: ${liste}`)
  }
  if (k.kontext === 'trainer_modus') {
    person.push(`Die Person trainiert gerade${k.uebung ? ` die Übung „${k.uebung}“` : ''} und fragt während der Übung. Antworte besonders kurz, höchstens zwei Sätze.`)
  }
  teile.push(`Zur Person:\n${person.join('\n')}`)

  const quellenText = k.quellen.length
    ? k.quellen.map((q) => `[${q.nr}] ${q.titel}\n${q.text}`).join('\n\n')
    : '(keine passenden Quellen gefunden)'
  teile.push(`Quellen aus dem Wissen des Studios:\n${quellenText}`)

  teile.push(
    'Beende jede Antwort mit genau einer letzten Zeile in diesem Format, ohne Text danach:\n' +
      '<<<META{"unsicher":false,"quellen":[1]}>>>\n' +
      '"quellen" enthält die Nummern der Quellen, auf die du dich tatsächlich gestützt hast.',
  )

  return teile.join('\n\n')
}

/**
 * Bringt den bisherigen Verlauf in die Form, die die Messages-API verlangt:
 * abwechselnd user/assistant, beginnend und endend mit user.
 */
export function ordneVerlauf(
  verlauf: { rolle: 'mitglied' | 'assistent' | 'trainer'; inhalt: string }[],
  frage: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const nachrichten: { role: 'user' | 'assistant'; content: string }[] = []
  for (const n of verlauf) {
    if (n.rolle === 'trainer' || !n.inhalt.trim()) continue
    const role = n.rolle === 'mitglied' ? 'user' : 'assistant'
    const letzte = nachrichten[nachrichten.length - 1]
    if (letzte && letzte.role === role) letzte.content += `\n\n${n.inhalt}`
    else nachrichten.push({ role, content: n.inhalt })
  }
  while (nachrichten.length && nachrichten[0].role !== 'user') nachrichten.shift()
  const letzte = nachrichten[nachrichten.length - 1]
  if (letzte && letzte.role === 'user') letzte.content += `\n\n${frage}`
  else nachrichten.push({ role: 'user', content: frage })
  return nachrichten
}
