// Tests der reinen Logik. Laufen mit Vitest aus web/ (npm test), globals aktiv.
import { zerlege } from './zerlegen.ts'
import { MetaSplitter, liesMeta } from './meta.ts'
import { pruefeWarnsignale } from './warnsignale.ts'
import { baueSmalltalkAnweisung, baueSystemanweisung, ordneVerlauf } from './systemanweisung.ts'
import { liesSse } from './sse.ts'
import { punktId } from './ids.ts'

describe('zerlege', () => {
  it('liefert für leeren Text keine Abschnitte', () => {
    expect(zerlege('Titel', '   \n\n ')).toEqual([])
  })

  it('stellt jedem Abschnitt den Titel voran', () => {
    const abschnitte = zerlege('Hüftbeuger', 'Erster Absatz.\n\nZweiter Absatz.')
    expect(abschnitte).toHaveLength(1)
    expect(abschnitte[0].startsWith('Hüftbeuger\n\n')).toBe(true)
    expect(abschnitte[0]).toContain('Zweiter Absatz.')
  })

  it('teilt lange Texte und hält die Obergrenze ein', () => {
    const satz = 'Beim Five-Training dehnen wir den Muskel aktiv unter Kraft. '
    const text = Array.from({ length: 12 }, (_, i) => `Absatz ${i}. ${satz.repeat(8)}`).join('\n\n')
    const abschnitte = zerlege('T', text, { ziel: 1200, max: 1600, ueberlappung: 100 })
    expect(abschnitte.length).toBeGreaterThan(3)
    for (const a of abschnitte) expect(a.length).toBeLessThanOrEqual(1600 + 100 + 10)
  })

  it('beginnt bei Überschriften einen neuen Abschnitt', () => {
    const abschnitte = zerlege('T', 'Einleitung kurz.\n\n# Ernährung\n\nIss genug Eiweiß.', { ueberlappung: 0 })
    expect(abschnitte).toHaveLength(2)
    expect(abschnitte[1]).toContain('# Ernährung')
  })

  it('teilt einen einzelnen Riesenabsatz an Satzgrenzen', () => {
    const riese = 'Das ist ein Satz über Rückentraining. '.repeat(200)
    const abschnitte = zerlege('T', riese, { ziel: 1000, max: 1200, ueberlappung: 0 })
    expect(abschnitte.length).toBeGreaterThan(5)
    for (const a of abschnitte) expect(a.length).toBeLessThanOrEqual(1200 + 5)
  })

  it('übernimmt ein Stück des vorherigen Abschnitts als Überlappung', () => {
    const text = `${'Alpha '.repeat(150)}\n\n${'Beta '.repeat(150)}`
    const abschnitte = zerlege('T', text, { ziel: 900, max: 1200, ueberlappung: 60 })
    expect(abschnitte).toHaveLength(2)
    expect(abschnitte[1]).toContain('… Alpha')
  })
})

describe('MetaSplitter', () => {
  const durch = (stuecke: string[]) => {
    const s = new MetaSplitter()
    let sichtbar = ''
    for (const st of stuecke) sichtbar += s.push(st)
    const e = s.ende()
    return { sichtbar: sichtbar + e.rest, ...e }
  }

  it('reicht Text durch und wertet die Meta-Zeile aus', () => {
    const r = durch(['Hallo ', 'Sabine.\n', '<<<META{"unsicher":false,"quellen":[2,1]}>>>'])
    expect(r.sichtbar).toBe('Hallo Sabine.\n')
    expect(r.text).toBe('Hallo Sabine.')
    expect(r.meta).toEqual({ unsicher: false, quellen: [2, 1], fachfrage: false })
  })

  it('erkennt die Meta-Zeile auch, wenn sie über mehrere Stücke verteilt ankommt', () => {
    const r = durch(['Antwort.', '<', '<<', 'ME', 'TA{"unsi', 'cher":true,"quellen":[]}', '>>>'])
    expect(r.sichtbar).toBe('Antwort.')
    expect(r.meta).toEqual({ unsicher: true, quellen: [], fachfrage: false })
  })

  it('gibt ohne Meta-Zeile den kompletten Text aus', () => {
    const r = durch(['Nur ', 'Text ohne Meta <<< aber mit Pfeilen'])
    expect(r.sichtbar).toBe('Nur Text ohne Meta <<< aber mit Pfeilen')
    expect(r.meta).toBeNull()
  })

  it('verwirft ungültige Quellenangaben', () => {
    expect(liesMeta('<<<META{"unsicher":"ja","quellen":[1,"2",-3,4.5,5]}>>>')).toEqual({ unsicher: false, quellen: [1, 5], fachfrage: false })
    expect(liesMeta('<<<META{kaputt')).toBeNull()
  })
})

describe('pruefeWarnsignale', () => {
  it.each([
    ['Seit gestern ist mein linkes Bein ganz taub', 'Taubheit oder Kribbeln'],
    ['Ich kann den Fuß nicht mehr heben', 'Lähmung oder Kraftverlust'],
    ['Ich habe Probleme, den Urin zu halten', 'Probleme mit Blase oder Darm'],
    ['Nach meinem Sturz auf der Treppe tut der Rücken weh', 'Unfall oder Sturz'],
    ['Die Schmerzen wecken mich nachts auf', 'Starke Schmerzen in Ruhe oder nachts'],
    ['Der Schmerz strahlt bis in die Wade aus', 'Ausstrahlung bis unter das Knie'],
  ])('erkennt: %s', (frage, grund) => {
    const r = pruefeWarnsignale(frage)
    expect(r.treffer).toBe(true)
    expect(r.gruende).toContain(grund)
  })

  it.each([
    'Wie oft pro Woche soll ich trainieren?',
    'Was esse ich vor dem Training?',
    'Mein unterer Rücken zieht nach langem Sitzen',
    'Ich habe Blasen an den Füßen vom Laufen',
    'Ich habe Lampenfieber vor dem Kurs',
    'Wie trainiere ich meine Brustmuskeln?',
    'Meine Brustmuskeln ziehen nach dem Training',
  ])('bleibt ruhig bei: %s', (frage) => {
    expect(pruefeWarnsignale(frage).treffer).toBe(false)
  })

  it.each([
    'Ich habe Brustschmerzen beim Training',
    'Ich spüre Druck in der Brust',
    'Es sticht in der Brust',
    'Mein Herz rast und mir ist schwindelig',
    'Ich bekomme schlecht Luft',
    'Ich war kurz ohnmächtig',
  ])('erkennt Notfall: %s', (frage) => {
    const r = pruefeWarnsignale(frage)
    expect(r.notfall).toBe(true)
    expect(r.treffer).toBe(true)
  })

  it('Rückenschmerz ist kein Notfall', () => {
    expect(pruefeWarnsignale('Mein Rücken tut weh').notfall).toBe(false)
  })
})

describe('baueSystemanweisung', () => {
  it('enthält Quellen, Person, Warnhinweis und das Meta-Format', () => {
    const s = baueSystemanweisung({
      vorname: 'Sabine',
      studioName: 'Rückgrat Donaueschingen',
      kontext: 'trainer_modus',
      uebung: 'Hüftbeuger',
      gesundheit: { ziele: ['schmerzfreier Rücken'], beschwerden: ['Unterer Rücken'], trainings_pro_woche: '3-4' },
      letzteEinheiten: [{ datum: '30.10.2026', befinden: 3 }],
      warnsignal: true,
      quellen: [{ nr: 1, titel: 'Hüftbeuger', text: 'Becken ruhig halten.' }],
    })
    expect(s).toContain('Rückgrat Donaueschingen')
    expect(s).toContain('<quelle nr="1" titel="Hüftbeuger">')
    expect(s).toContain('Vorname: Sabine')
    expect(s).toContain('„Hüftbeuger“')
    expect(s).toContain('Warnsignale')
    expect(s).toContain('<<<META{')
  })

  it('kommt ohne Gesundheitsdaten aus', () => {
    const s = baueSystemanweisung({ vorname: 'Tom', studioName: 'X', kontext: 'chat', warnsignal: false, quellen: [] })
    expect(s).not.toContain('Ziele:')
    expect(s).toContain('(keine passenden Quellen gefunden)')
  })
})

describe('Smalltalk-Modus ohne Wissen', () => {
  it('erlaubt nur Smalltalk und App-Fragen und verlangt die Fachfrage-Markierung', () => {
    const s = baueSmalltalkAnweisung({ vorname: 'Gabriel', studioName: 'Rückgrat Donaueschingen', kontext: 'chat' })
    expect(s).toContain('Rückgrat Donaueschingen')
    expect(s).toContain('Im Zweifel ist es eine Fachfrage')
    expect(s).toContain('<<<META{"fachfrage":true}>>>')
    expect(s).toContain('<<<META{"fachfrage":false}>>>')
  })
  it('liesMeta erkennt die Fachfrage-Markierung', () => {
    expect(liesMeta('<<<META{"fachfrage":true}>>>')?.fachfrage).toBe(true)
    expect(liesMeta('Hallo!\n<<<META{"fachfrage":false}>>>')?.fachfrage).toBe(false)
    // alte Meta-Zeilen ohne Feld gelten nicht als Fachfrage
    expect(liesMeta('<<<META{"unsicher":false,"quellen":[1]}>>>')?.fachfrage).toBe(false)
  })
})

describe('ordneVerlauf', () => {
  it('erzeugt abwechselnde Rollen, beginnt und endet mit user', () => {
    const r = ordneVerlauf(
      [
        { rolle: 'assistent', inhalt: 'Begrüßung' },
        { rolle: 'mitglied', inhalt: 'Frage 1' },
        { rolle: 'mitglied', inhalt: 'Nachtrag' },
        { rolle: 'trainer', inhalt: 'ignoriert' },
        { rolle: 'assistent', inhalt: 'Antwort 1' },
      ],
      'Frage 2',
    )
    expect(r.map((n) => n.role)).toEqual(['user', 'assistant', 'user'])
    expect(r[0].content).toBe('Frage 1\n\nNachtrag')
    expect(r[2].content).toBe('Frage 2')
  })

  it('hängt die Frage an, wenn der Verlauf mit einer Frage endet', () => {
    const r = ordneVerlauf([{ rolle: 'mitglied', inhalt: 'Abgebrochen' }], 'Neu')
    expect(r).toEqual([{ role: 'user', content: 'Abgebrochen\n\nNeu' }])
  })
})

describe('liesSse', () => {
  const strom = (teile: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const t of teile) c.enqueue(new TextEncoder().encode(t))
        c.close()
      },
    })

  it('setzt Ereignisse über Stückgrenzen hinweg zusammen', async () => {
    const ereignisse = []
    for await (const e of liesSse(strom(['event: content_block_delta\ndata: {"a"', ':1}\n\n', ': kommentar\n', 'data: zwei\r\n\r\n', 'data: [DONE]']))) {
      ereignisse.push(e)
    }
    expect(ereignisse).toEqual([
      { event: 'content_block_delta', data: '{"a":1}' },
      { event: 'message', data: 'zwei' },
      { event: 'message', data: '[DONE]' },
    ])
  })
})

describe('punktId', () => {
  it('ist stabil und hat UUID-Form', async () => {
    const a = await punktId('version-1', 0)
    expect(a).toBe(await punktId('version-1', 0))
    expect(a).not.toBe(await punktId('version-1', 1))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
