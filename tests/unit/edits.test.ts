import { describe, expect, it } from 'vitest'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { Flag, type Frame, type Kolumnregel } from '../../src/core/types.js'
import { cell, type Selection } from '../../src/state/selection.js'
import { aggregera } from '../../src/state/selection.js'
import { nyTab, redo, undo, type Tab } from '../../src/state/store.js'
import {
  dupliceraRader,
  fyllNedat,
  klistraIn,
  laggTillLopnummer,
  planeraInklistring,
  redigeraCell,
  sattMarkering,
  selectableColumns,
  selectedRows,
  stadaKolumner,
  taBortRader,
  taBortTommaKolumner,
  taBortTommaRader,
  slappRegel,
  uppdateraRegler,
} from '../../src/state/edits.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

function tabOf(headers: string[], rows: string[][]): Tab {
  return nyTab(frameOf(headers, rows))
}

const dump = (tab: Tab): string[][] =>
  Array.from({ length: tab.frame.rowCount }, (_, r) => tab.frame.columns.map((c) => getCell(c, r)))

const omrade = (r1: number, k1: number, r2: number, k2: number): Selection => ({
  ankareRad: r1,
  ankareKol: k1,
  fokusRad: r2,
  fokusKol: k2,
})

const bas = () =>
  tabOf(['Namn', 'Ort', 'Belopp'], [
    ['Anna', 'Lund', '1 240,50'],
    ['Bo', 'Boden', '980,00'],
    ['Cia', 'Kiruna', ''],
    ['Dan', 'Malmö', '412,00'],
  ])

describe('cellredigering', () => {
  it('skriver, ångrar och gör om', () => {
    const tab = bas()
    redigeraCell(tab, 1, 0, 'Bosse')
    expect(dump(tab)[1]![0]).toBe('Bosse')

    undo(tab)
    expect(dump(tab)[1]![0]).toBe('Bo')

    redo(tab)
    expect(dump(tab)[1]![0]).toBe('Bosse')

    undo(tab)
    expect(dump(tab)[1]![0]).toBe('Bo')
  })

  it('lägger inget steg när värdet är oförändrat', () => {
    const tab = bas()
    redigeraCell(tab, 0, 0, 'Anna')
    expect(tab.history).toHaveLength(0)
  })
})

describe('markeringsåtgärder', () => {
  it('tömmer markerade celler och tar tillbaka dem', () => {
    const tab = bas()
    const sel = omrade(0, 0, 1, 1)
    expect(sattMarkering(tab, sel, '')).toBe(4)
    expect(dump(tab)[0]).toEqual(['', '', '1 240,50'])
    expect(dump(tab)[1]).toEqual(['', '', '980,00'])

    undo(tab)
    expect(dump(tab)[0]).toEqual(['Anna', 'Lund', '1 240,50'])
    expect(dump(tab)[1]).toEqual(['Bo', 'Boden', '980,00'])
  })

  it('fyller nedåt från översta raden i markeringen', () => {
    const tab = bas()
    expect(fyllNedat(tab, omrade(1, 1, 3, 1))).toBe(2)
    expect(dump(tab).map((r) => r[1])).toEqual(['Lund', 'Boden', 'Boden', 'Boden'])

    undo(tab)
    expect(dump(tab).map((r) => r[1])).toEqual(['Lund', 'Boden', 'Kiruna', 'Malmö'])
  })

  it('räknar snabbsumman som Excel gör', () => {
    const tab = bas()
    const agg = aggregera(tab.frame, selectableColumns(tab), omrade(0, 2, 3, 2))
    expect(agg.celler).toBe(4)
    expect(agg.ifyllda).toBe(3)
    expect(agg.tal).toBe(3)
    // 1 240,50 med hårt mellanslag ska tolkas som tal.
    expect(agg.summa).toBeCloseTo(2632.5, 2)
  })
})

describe('inklistring', () => {
  it('rapporterar hur mycket större det inklistrade är än markeringen', () => {
    const tab = bas()
    const plan = planeraInklistring(tab, cell(2, 1), [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ])
    // Två rader kvar nedanför rad 2, tre klistras in → en rad över.
    expect(plan.extraRader).toBe(1)
    // Två kolumner kvar till höger om kolumn 1, tre klistras in → en över.
    expect(plan.extraKolumner).toBe(1)
  })

  it('utökar tabellen och kan ångra hela utökningen', () => {
    const tab = bas()
    const sel = cell(3, 2)
    const plan = planeraInklistring(tab, sel, [['x'], ['y'], ['z']])
    expect(plan.extraRader).toBe(2)

    klistraIn(tab, sel, plan, true)
    expect(tab.frame.rowCount).toBe(6)
    expect(dump(tab).map((r) => r[2])).toEqual(['1 240,50', '980,00', '', 'x', 'y', 'z'])

    undo(tab)
    expect(tab.frame.rowCount).toBe(4)
    expect(dump(tab).map((r) => r[2])).toEqual(['1 240,50', '980,00', '', '412,00'])
    expect(tab.frame.columns).toHaveLength(3)
  })

  it('lägger till kolumner när det inklistrade är bredare', () => {
    const tab = bas()
    const sel = cell(0, 2)
    const plan = planeraInklistring(tab, sel, [['x', 'y', 'z']])
    expect(plan.extraKolumner).toBe(2)

    klistraIn(tab, sel, plan, true)
    expect(tab.frame.columns).toHaveLength(5)
    expect(dump(tab)[0]).toEqual(['Anna', 'Lund', 'x', 'y', 'z'])

    undo(tab)
    expect(tab.frame.columns).toHaveLength(3)
    expect(dump(tab)[0]).toEqual(['Anna', 'Lund', '1 240,50'])
  })

  it('klipper av bara när användaren valt det', () => {
    const tab = bas()
    const sel = cell(3, 2)
    const plan = planeraInklistring(tab, sel, [['x'], ['y'], ['z']])
    klistraIn(tab, sel, plan, false)
    expect(tab.frame.rowCount).toBe(4)
    expect(dump(tab)[3]![2]).toBe('x')
  })
})

describe('radoperationer via redigeringslagret', () => {
  it('tar bort markerade rader och tar tillbaka dem med radnummer', () => {
    const tab = bas()
    const rader = selectedRows(tab, omrade(1, 0, 2, 0))
    taBortRader(tab, rader)
    expect(dump(tab).map((r) => r[0])).toEqual(['Anna', 'Dan'])
    expect(Array.from(tab.frame.sourceRow)).toEqual([1, 4])

    undo(tab)
    expect(dump(tab).map((r) => r[0])).toEqual(['Anna', 'Bo', 'Cia', 'Dan'])
    expect(Array.from(tab.frame.sourceRow)).toEqual([1, 2, 3, 4])
  })

  it('dubblerar rader och ångrar exakt', () => {
    const tab = bas()
    dupliceraRader(tab, [1, 3])
    expect(dump(tab).map((r) => r[0])).toEqual(['Anna', 'Bo', 'Bo', 'Cia', 'Dan', 'Dan'])

    undo(tab)
    expect(dump(tab).map((r) => r[0])).toEqual(['Anna', 'Bo', 'Cia', 'Dan'])
  })

  it('tar bort tomma rader', () => {
    const tab = tabOf(['a', 'b'], [['1', '2'], ['', ''], ['3', '4'], ['', '']])
    expect(taBortTommaRader(tab)).toBe(2)
    expect(dump(tab)).toEqual([['1', '2'], ['3', '4']])
    undo(tab)
    expect(tab.frame.rowCount).toBe(4)
  })

  it('tar bort tomma kolumner och sätter tillbaka dem på rätt plats', () => {
    const tab = tabOf(['a', 'tom', 'b'], [['1', '', '2'], ['3', '', '4']])
    expect(taBortTommaKolumner(tab)).toBe(1)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['a', 'b'])
    undo(tab)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['a', 'tom', 'b'])
  })
})

describe('städning', () => {
  const trimma = { id: 'trim', etikett: 'Trimmade blanksteg', beskrivning: '', fn: (v: string) => v.trim() }

  it('trimmar en kolumn och ångrar', () => {
    const tab = tabOf(['Ort'], [['Lund '], [' Boden'], ['Kiruna']])
    expect(stadaKolumner(tab, tab.frame.columns, trimma)).toBe(2)
    expect(dump(tab).map((r) => r[0])).toEqual(['Lund', 'Boden', 'Kiruna'])

    undo(tab)
    expect(dump(tab).map((r) => r[0])).toEqual(['Lund ', ' Boden', 'Kiruna'])
  })

  it('överlever upprepade ångra och gör om', () => {
    const tab = tabOf(['Ort'], [['Lund '], [' Boden']])
    stadaKolumner(tab, tab.frame.columns, trimma)
    for (let varv = 0; varv < 3; varv++) {
      undo(tab)
      expect(dump(tab).map((r) => r[0])).toEqual(['Lund ', ' Boden'])
      redo(tab)
      expect(dump(tab).map((r) => r[0])).toEqual(['Lund', 'Boden'])
    }
  })
})

describe('löpnummer', () => {
  it('numrerar raderna i nuvarande ordning, först i filen', () => {
    const tab = bas()
    const col = laggTillLopnummer(tab)

    expect(tab.frame.columns[0]).toBe(col)
    expect(col.name).toBe('Nr')
    expect(dump(tab).map((r) => r[0])).toEqual(['1', '2', '3', '4'])
    // Namnen efter numret står kvar där de stod.
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['Nr', 'Namn', 'Ort', 'Belopp'])
  })

  it('låser typen till tal, så sorteringen slipper svensk kollation', () => {
    const tab = bas()
    const col = laggTillLopnummer(tab)
    expect(col.type).toBe('number')
    expect(col.typeLocked).toBe(true)
  })

  it('viker undan för ett upptaget namn', () => {
    const tab = tabOf(['Nr', 'Ort'], [['x', 'Lund']])
    expect(laggTillLopnummer(tab).name).toBe('Nr (2)')
    expect(laggTillLopnummer(tab, 'Rad').name).toBe('Rad')
  })

  it('är ett enda ångra-steg', () => {
    const tab = bas()
    laggTillLopnummer(tab)
    expect(tab.frame.columns).toHaveLength(4)

    undo(tab)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['Namn', 'Ort', 'Belopp'])

    redo(tab)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['Nr', 'Namn', 'Ort', 'Belopp'])
    expect(dump(tab).map((r) => r[0])).toEqual(['1', '2', '3', '4'])
  })

  it('lämnar ett profilsteg efter sig', () => {
    const tab = bas()
    laggTillLopnummer(tab, 'Ordning')
    expect(tab.history.at(-1)?.profil).toEqual({ typ: 'lopnummer', namn: 'Ordning' })
  })

  it('klarar en tom fil utan rader', () => {
    const tab = tabOf(['Ort'], [])
    const col = laggTillLopnummer(tab)
    expect(col.codes).toHaveLength(0)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['Nr', 'Ort'])
  })
})

describe('uppdateraRegler', () => {
  const regel = (over: Partial<Kolumnregel> = {}): Kolumnregel => ({
    typ: 'mall',
    mall: "('{Namn}'),",
    stadaLuckor: true,
    kallor: ['Namn'],
    avtryck: 0,
    ...over,
  })

  function medRegel(): { tab: Tab; namn: () => string[] } {
    const frame = frameOf(
      ['Namn', 'SQL', 'Ort'],
      [
        ['Anna', "('Anna'),", 'Lund'],
        ['Bo', "('Bo'),", 'Malmö'],
      ],
    )
    frame.columns[1]!.regel = regel()
    const tab = nyTab(frame)
    return {
      tab,
      namn: () =>
        Array.from({ length: tab.frame.rowCount }, (_, r) => getCell(tab.frame.columns[1]!, r)),
    }
  }

  it('fyller kolumnen på nytt ur mallen', () => {
    const { tab, namn } = medRegel()
    tab.frame.columns[0]!.codes[1] = intern(tab.frame.columns[0]!, 'Bosse')
    const { andrade } = uppdateraRegler(tab, [tab.frame.columns[1]!])
    expect(andrade).toBe(1)
    expect(namn()).toEqual(["('Anna'),", "('Bosse'),"])
  })

  it('är ett enda ångra-steg även över flera kolumner', () => {
    const { tab } = medRegel()
    const andra = createColumn('SQL2', tab.frame.rowCount)
    andra.regel = regel({ mall: '{Namn};' })
    tab.frame.columns.push(andra)
    const fore = tab.history.length

    uppdateraRegler(tab, [tab.frame.columns[1]!, andra])
    expect(tab.history.length).toBe(fore + 1)

    undo(tab)
    expect(getCell(andra, 0)).toBe('')
  })

  it('tar tillbaka både värdena och avtrycket vid ångra', () => {
    const { tab, namn } = medRegel()
    const col = tab.frame.columns[1]!
    tab.frame.columns[0]!.codes[0] = intern(tab.frame.columns[0]!, 'Annika')
    uppdateraRegler(tab, [col])
    const efterAvtryck = col.regel!.avtryck

    undo(tab)
    expect(namn()[0]).toBe("('Anna'),")
    // Utan avtrycket i ögonblicksbilden hade kolumnen sett färsk ut fast den
    // stod på de gamla värdena igen.
    expect(col.regel!.avtryck).not.toBe(efterAvtryck)
  })

  it('vägrar köra när mallen pekar på en kolumn som inte finns', () => {
    const { tab, namn } = medRegel()
    tab.frame.columns[1]!.regel = regel({ mall: '{Saknas}', kallor: ['Saknas'] })
    const { andrade, korda, saknade } = uppdateraRegler(tab, [tab.frame.columns[1]!])
    expect(andrade).toBe(0)
    expect(korda).toEqual([])
    expect(saknade).toEqual([{ namn: 'SQL', kolumner: ['Saknas'] }])
    // Kolumnen står kvar som den var i stället för att fyllas med tomt.
    expect(namn()).toEqual(["('Anna'),", "('Bo'),"])
  })

  it('rensar märket för handredigerade celler', () => {
    const { tab } = medRegel()
    const col = tab.frame.columns[1]!
    redigeraCell(tab, 0, 1, 'något annat')
    expect(col.flags[0]! & Flag.UserEdited).not.toBe(0)

    uppdateraRegler(tab, [col])
    expect(col.flags[0]! & Flag.UserEdited).toBe(0)
  })

  it('följer undantaget för sista raden i vyn', () => {
    const { tab, namn } = medRegel()
    tab.frame.columns[1]!.regel = regel({ sista: "('{Namn}')" })
    uppdateraRegler(tab, [tab.frame.columns[1]!])
    expect(namn()).toEqual(["('Anna'),", "('Bo')"])
  })
})

describe('slappRegel', () => {
  it('tar bort regeln men lämnar värdena, och går att ångra', () => {
    const frame = frameOf(['Namn', 'SQL'], [['Anna', "('Anna'),"]])
    frame.columns[1]!.regel = {
      typ: 'mall',
      mall: "('{Namn}'),",
      stadaLuckor: true,
      kallor: ['Namn'],
      avtryck: 0,
    }
    const tab = nyTab(frame)
    slappRegel(tab, frame.columns[1]!)
    expect(frame.columns[1]!.regel).toBeUndefined()
    expect(getCell(frame.columns[1]!, 0)).toBe("('Anna'),")

    undo(tab)
    expect(frame.columns[1]!.regel?.mall).toBe("('{Namn}'),")
  })
})
