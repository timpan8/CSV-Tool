import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, intern, setCell } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { kolumnrang, nollstallRangcache, TOM_RANG } from '../../src/core/frame/rank.js'
import { beskrivSortering, sorteraRader, type Sorteringsniva } from '../../src/core/ops/sort.js'
import type { ColumnType, Frame } from '../../src/core/types.js'

function frameOf(headers: string[], rows: string[][], typer: ColumnType[] = []): Frame {
  const columns = headers.map((name, i) => createColumn(name, rows.length, typer[i] ?? 'text'))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const varden = (frame: Frame, kol: number, ordning: Uint32Array) =>
  Array.from(ordning, (r) => frame.columns[kol]!.dict[frame.columns[kol]!.codes[r]!]!)

/**
 * Den naiva jämförelsesorteringen som räknesorteringen ska vara identisk med.
 *
 * Samma regler: tomma alltid sist oavsett riktning, radindex som sista
 * skiljedomare så att resultatet är entydigt.
 */
function naivt(frame: Frame, nivaer: Sorteringsniva[]): number[] {
  const rader = Array.from({ length: frame.rowCount }, (_, i) => i)
  return rader.sort((a, b) => {
    for (const niva of nivaer) {
      const col = frame.columns.find((c) => c.id === niva.colId)!
      const { rang } = kolumnrang(col)
      const ra = rang[col.codes[a]!]!
      const rb = rang[col.codes[b]!]!
      if (ra === rb) continue
      if (ra === TOM_RANG) return 1
      if (rb === TOM_RANG) return -1
      return niva.riktning === 'fallande' ? rb - ra : ra - rb
    }
    return a - b
  })
}

describe('sorteraRader mot en naiv jämförelsesortering', () => {
  it('ger samma ordning för slumpade tabeller, nivåer och riktningar', () => {
    fc.assert(
      fc.property(
        // Små ordböcker med tomma värden och upprepningar: det är där lika
        // värden uppstår, och det är lika värden som avslöjar instabilitet.
        fc.array(fc.array(fc.constantFrom('', 'a', 'B', 'å', '2', '10'), { minLength: 3, maxLength: 3 }), {
          minLength: 0,
          maxLength: 40,
        }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 2 }), fc.boolean()), {
          minLength: 1,
          maxLength: 3,
        }),
        (rader, nivaspec) => {
          const frame = frameOf(['a', 'b', 'c'], rader)
          const nivaer: Sorteringsniva[] = nivaspec.map(([kol, fallande]) => ({
            colId: frame.columns[kol]!.id,
            riktning: fallande ? 'fallande' : 'stigande',
          }))
          expect(Array.from(sorteraRader(frame, nivaer))).toEqual(naivt(frame, nivaer))
        },
      ),
      { numRuns: 300 },
    )
  })

  it('resultatet är alltid en permutation av alla rader', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.constantFrom('', 'x', 'y'), { minLength: 2, maxLength: 2 }), {
          minLength: 0,
          maxLength: 30,
        }),
        (rader) => {
          const frame = frameOf(['a', 'b'], rader)
          const ut = sorteraRader(frame, [
            { colId: frame.columns[0]!.id, riktning: 'stigande' },
            { colId: frame.columns[1]!.id, riktning: 'fallande' },
          ])
          expect(Array.from(ut).sort((x, y) => x - y)).toEqual(
            Array.from({ length: rader.length }, (_, i) => i),
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  it('är stabil: en nivå med enbart lika värden lämnar ordningen orörd', () => {
    const frame = frameOf(['a'], [['x'], ['x'], ['x'], ['x'], ['x']])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'fallande' }])
    expect(Array.from(ut)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('svensk ordning', () => {
  it('sorterar å ä ö efter z', () => {
    const frame = frameOf(
      ['namn'],
      [['Öberg'], ['Åkesson'], ['Zetterberg'], ['Ängström'], ['Bengtsson']],
    )
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual([
      'Bengtsson',
      'Zetterberg',
      'Åkesson',
      'Ängström',
      'Öberg',
    ])
  })

  it('sorterar tal i text naturligt', () => {
    const frame = frameOf(['namn'], [['Kund 10'], ['Kund 2'], ['Kund 1']])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual(['Kund 1', 'Kund 2', 'Kund 10'])
  })

  it('Västerås före Växjö', () => {
    const frame = frameOf(['ort'], [['Växjö'], ['Västerås']])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual(['Västerås', 'Växjö'])
  })
})

describe('tomma celler', () => {
  it('hamnar sist i båda riktningarna', () => {
    const frame = frameOf(['a'], [['b'], [''], ['a'], ['']])
    const id = frame.columns[0]!.id
    expect(varden(frame, 0, sorteraRader(frame, [{ colId: id, riktning: 'stigande' }]))).toEqual([
      'a',
      'b',
      '',
      '',
    ])
    expect(varden(frame, 0, sorteraRader(frame, [{ colId: id, riktning: 'fallande' }]))).toEqual([
      'b',
      'a',
      '',
      '',
    ])
  })

  it('bara blanksteg är inte tomt', () => {
    // '   ' har en egen ordbokskod och räknas som ifylld i hela kodbasen.
    const frame = frameOf(['a'], [['   '], [''], ['a']])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual(['   ', 'a', ''])
  })
})

describe('typade kolumner', () => {
  it('talkolumn sorterar numeriskt, inte som text', () => {
    const frame = frameOf(['belopp'], [['1 240,50'], ['980,00'], ['12 000,00'], ['98,00']], ['number'])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual(['98,00', '980,00', '1 240,50', '12 000,00'])
  })

  it('otolkbara tal hamnar efter de tolkbara men före tomma', () => {
    const frame = frameOf(['belopp'], [['okänt'], [''], ['5'], ['10']], ['number'])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual(['5', '10', 'okänt', ''])
  })

  it('datumkolumn sorterar blandade format som samma dag', () => {
    const frame = frameOf(
      ['datum'],
      [['2026-08-28'], ['27/08/2026'], ['2026-08-27'], ['i går']],
      ['date'],
    )
    const ut = varden(frame, 0, sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }]))
    // De två skrivsätten för 27 augusti hamnar intill varandra, skräpet sist.
    expect(new Set(ut.slice(0, 2))).toEqual(new Set(['27/08/2026', '2026-08-27']))
    expect(ut[2]).toBe('2026-08-28')
    expect(ut[3]).toBe('i går')
  })

  it('Ja/Nej-kolumn sorterar falskt före sant, inte i bokstavsordning', () => {
    const frame = frameOf(['aktiv'], [['Ja'], ['Nej'], ['sant'], ['falskt']], ['bool'])
    const ut = sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])
    // Bokstavsordning skulle ge Ja, Nej, falskt, sant. Här kommer båda de
    // falska först, med kollatorn som skiljedomare inom gruppen.
    expect(varden(frame, 0, ut)).toEqual(['falskt', 'Nej', 'Ja', 'sant'])
  })
})

describe('rangens cache', () => {
  it('en ny cell utlöser inte en full omrangordning', () => {
    const frame = frameOf(['a'], [['b'], ['a'], ['c']])
    const col = frame.columns[0]!
    nollstallRangcache(col)

    // Första anropet bygger cachen.
    const forst = kolumnrang(col)
    expect(forst.hinkar).toBe(3)

    // Samma ordbok, samma typ → exakt samma objekt tillbaka.
    expect(kolumnrang(col)).toBe(forst)

    // Ett nytt värde växer samma array; ordningen ska uppdateras.
    setCell(col, 0, 'aa')
    const efter = kolumnrang(col)
    expect(efter).not.toBe(forst)
    expect(efter.hinkar).toBe(4)
    expect(efter.rang[col.dictIndex.get('aa')!]).toBe(1)
    expect(efter.rang[0]).toBe(TOM_RANG)
  })

  it('en typändring räknar om rangen', () => {
    // Kollatorn har numeric: true, så rena siffersträngar sorteras redan
    // numeriskt som text. Skillnaden mellan text och tal syns först på
    // svenska belopp, där texten börjar med "1 " och talet är 1240,5.
    const frame = frameOf(['a'], [['1 240,50'], ['980,00']])
    const col = frame.columns[0]!
    const somText = sorteraRader(frame, [{ colId: col.id, riktning: 'stigande' }])
    expect(varden(frame, 0, somText)).toEqual(['1 240,50', '980,00'])

    // sattTyp rör inte en enda kod, men byter rangens innebörd helt.
    col.type = 'number'
    const somTal = sorteraRader(frame, [{ colId: col.id, riktning: 'stigande' }])
    expect(varden(frame, 0, somTal)).toEqual(['980,00', '1 240,50'])
  })

  it('en ombyggd ordbok räknar om rangen', () => {
    const frame = frameOf(['a'], [['B'], ['a']])
    const col = frame.columns[0]!
    kolumnrang(col)
    // mapColumnValues byter ut col.dict — cachen måste märka det.
    col.dict = ['', 'a', 'B']
    col.dictIndex = new Map([['', 0], ['a', 1], ['B', 2]])
    col.codes[0] = 2
    col.codes[1] = 1
    const ut = sorteraRader(frame, [{ colId: col.id, riktning: 'stigande' }])
    expect(varden(frame, 0, ut)).toEqual(['a', 'B'])
  })
})

describe('nivåer som pekar fel', () => {
  it('en borttagen kolumn hoppas över i stället för att kasta', () => {
    const frame = frameOf(['a'], [['b'], ['a']])
    const ut = sorteraRader(frame, [
      { colId: 'finns-inte', riktning: 'stigande' },
      { colId: frame.columns[0]!.id, riktning: 'stigande' },
    ])
    expect(varden(frame, 0, ut)).toEqual(['a', 'b'])
  })

  it('en tom nivålista lämnar filens ordning orörd', () => {
    const frame = frameOf(['a'], [['b'], ['a'], ['c']])
    expect(Array.from(sorteraRader(frame, []))).toEqual([0, 1, 2])
  })
})

describe('beskrivSortering', () => {
  it('skriver ut kolumnnamn och riktning', () => {
    const frame = frameOf(['Ort', 'Belopp'], [['Lund', '5']])
    expect(
      beskrivSortering(frame, [
        { colId: frame.columns[0]!.id, riktning: 'stigande' },
        { colId: frame.columns[1]!.id, riktning: 'fallande' },
      ]),
    ).toBe('Ort ↑, Belopp ↓')
  })

  it('säger till när en nivå ligger på en dold kolumn', () => {
    const frame = frameOf(['Ort'], [['Lund']])
    frame.columns[0]!.hidden = true
    expect(beskrivSortering(frame, [{ colId: frame.columns[0]!.id, riktning: 'stigande' }])).toBe(
      'Ort ↑ (dold)',
    )
  })
})

describe('kolumnens egen ordning', () => {
  const traff = ['träff', 'flera träffar', 'ingen träff', 'bara i den andra filen']

  const medOrdning = (rader: string[]) => {
    const frame = frameOf(['Träff'], rader.map((v) => [v]))
    frame.columns[0]!.sortordning = traff
    return frame
  }

  it('sorterar i den ordningen i stället för i bokstavsordning', () => {
    const frame = medOrdning([
      'ingen träff',
      'bara i den andra filen',
      'träff',
      'flera träffar',
    ])
    const niva: Sorteringsniva[] = [{ colId: frame.columns[0]!.id, riktning: 'stigande' }]
    expect(varden(frame, 0, sorteraRader(frame, niva))).toEqual(traff)
    // Bokstavsordningen hade gett den omvända listan — det är hela poängen.
    expect([...traff].sort((a, b) => a.localeCompare(b, 'sv'))).not.toEqual(traff)
  })

  it('vänder med riktningen', () => {
    const frame = medOrdning(['träff', 'bara i den andra filen', 'ingen träff'])
    const niva: Sorteringsniva[] = [{ colId: frame.columns[0]!.id, riktning: 'fallande' }]
    expect(varden(frame, 0, sorteraRader(frame, niva))).toEqual([
      'bara i den andra filen',
      'ingen träff',
      'träff',
    ])
  })

  it('lägger värden utanför listan efter dem, i bokstavsordning', () => {
    // En städning kan skriva om värdena. Då hör de inte längre till
    // berättelsen kolumnen är gjord för, och ska inte sorteras in mitt i.
    const frame = medOrdning(['Ö-värde', 'ingen träff', 'A-värde', 'träff'])
    const niva: Sorteringsniva[] = [{ colId: frame.columns[0]!.id, riktning: 'stigande' }]
    expect(varden(frame, 0, sorteraRader(frame, niva))).toEqual([
      'träff',
      'ingen träff',
      'A-värde',
      'Ö-värde',
    ])
  })

  it('tomma celler hamnar sist ändå', () => {
    const frame = medOrdning(['ingen träff', '', 'träff'])
    for (const riktning of ['stigande', 'fallande'] as const) {
      const ut = varden(frame, 0, sorteraRader(frame, [{ colId: frame.columns[0]!.id, riktning }]))
      expect(ut[ut.length - 1]).toBe('')
    }
  })

  it('rangcachen märker att ordningen bytts', () => {
    const frame = frameOf(['Träff'], [['träff'], ['ingen träff']])
    const col = frame.columns[0]!
    const utan = kolumnrang(col).rang.slice()
    col.sortordning = traff
    const med = kolumnrang(col).rang
    // Utan kontrollen i cachen hade den gamla rangen kommit tillbaka.
    expect(Array.from(med)).not.toEqual(Array.from(utan))
  })
})
