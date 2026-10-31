import { inline, zerlege } from './markdown'

describe('markdown', () => {
  it('erkennt fett und lässt den Rest als Text', () => {
    expect(inline('Das ist **wichtig** hier')).toEqual([
      { text: 'Das ist ', fett: false }, { text: 'wichtig', fett: true }, { text: ' hier', fett: false },
    ])
  })
  it('macht aus Leerzeilen Absätze und aus Strichen Listen', () => {
    const b = zerlege('Erster Satz.\nNoch einer.\n\n- Punkt A\n- **Punkt B**\n\n1. Eins\n2. Zwei')
    expect(b.map((x) => x.art)).toEqual(['absatz', 'liste', 'liste'])
    expect(b[0]).toEqual({ art: 'absatz', teile: [{ text: 'Erster Satz. Noch einer.', fett: false }] })
    expect(b[1]).toMatchObject({ nummeriert: false, punkte: [[{ text: 'Punkt A' }], [{ text: 'Punkt B', fett: true }]] })
    expect(b[2]).toMatchObject({ nummeriert: true })
  })
  it('erzeugt nie HTML, auch nicht aus Tags im Text', () => {
    const b = zerlege('<img src=x onerror=alert(1)>')
    expect(b).toEqual([{ art: 'absatz', teile: [{ text: '<img src=x onerror=alert(1)>', fett: false }] }])
  })
  it('entfernt Überschrift-Rauten', () => {
    expect(zerlege('## Tipp\nText')[0]).toEqual({ art: 'absatz', teile: [{ text: 'Tipp Text', fett: false }] })
  })
})
