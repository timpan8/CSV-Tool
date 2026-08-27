import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import {
  nyTab,
  redo,
  refreshView,
  rensaSortering,
  sattSortering,
  sorteraOm,
  sorteringenArInaktuell,
  undo,
  vaxlaSortering,
  type Tab,
} from '../../src/state/store.js'
import {
  dupliceraRader,
  infogaRader,
  redigeraCell,
  taBortRader,
} from '../../src/state/edits.js'
import { computeView } from '../../src/state/view.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const tabOf = (headers: string[], rows: string[][]): Tab => nyTab(frameOf(headers, rows))

const kolumn = (tab: Tab, kol: number) =>
  Array.from(tab.frame.view, (r) => getCell(tab.frame.columns[kol]!, r))

const ORTER = [['Malmö'], ['Boden'], ['Kiruna'], ['Lund'], ['Ystad']]

describe('sortering som vy', () => {
  it('ändrar ordningen utan att röra datat', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    expect(kolumn(tab, 0)).toEqual(['Boden', 'Kiruna', 'Lund', 'Malmö', 'Ystad'])
    // Datat ligger kvar i filens ordning; bara vyn är omsorterad.
    expect(getCell(tab.frame.columns[0]!, 0)).toBe('Malmö')
  })

  it('hamnar aldrig i ångra-historiken', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    expect(tab.history).toHaveLength(0)
    expect(tab.cursor).toBe(0)
    // Vy är inte data — samma regel som redan gäller kolumnbredd.
    expect(tab.smutsig).toBe(false)
  })

  it('vaxlaSortering vänder riktningen och ersätter nivåerna', () => {
    const tab = tabOf(['Ort', 'Namn'], [['B', 'x'], ['A', 'y']])
    const ort = tab.frame.columns[0]!.id
    vaxlaSortering(tab, ort)
    expect(kolumn(tab, 0)).toEqual(['A', 'B'])
    vaxlaSortering(tab, ort)
    expect(kolumn(tab, 0)).toEqual(['B', 'A'])
    // Utan lagg = ersätt: en ny kolumn tar över helt.
    vaxlaSortering(tab, tab.frame.columns[1]!.id)
    expect(tab.viewSpec.sortering).toHaveLength(1)
  })

  it('vaxlaSortering med lagg bygger flera nivåer', () => {
    const tab = tabOf(['Status', 'Ort'], [['B', 'z'], ['A', 'y'], ['A', 'x']])
    vaxlaSortering(tab, tab.frame.columns[0]!.id)
    vaxlaSortering(tab, tab.frame.columns[1]!.id, true)
    expect(tab.viewSpec.sortering).toHaveLength(2)
    expect(kolumn(tab, 1)).toEqual(['x', 'y', 'z'])
  })

  it('rensaSortering tar bort ordningen helt', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    rensaSortering(tab)
    expect(tab.ordning).toBeNull()
    expect(tab.viewSpec.sortering).toBeUndefined()
    expect(kolumn(tab, 0)).toEqual(['Malmö', 'Boden', 'Kiruna', 'Lund', 'Ystad'])
  })
})

describe('frysningen', () => {
  it('en redigering i nyckelkolumnen flyttar inte raden', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    expect(kolumn(tab, 0)).toEqual(['Boden', 'Kiruna', 'Lund', 'Malmö', 'Ystad'])

    // Boden ligger på vyrad 0. Döps den om till Ö-något ska den ligga kvar
    // där tills användaren själv ber om en ny sortering.
    redigeraCell(tab, 0, 0, 'Örebro')
    expect(kolumn(tab, 0)).toEqual(['Örebro', 'Kiruna', 'Lund', 'Malmö', 'Ystad'])
    expect(sorteringenArInaktuell(tab)).toBe(true)

    sorteraOm(tab)
    expect(kolumn(tab, 0)).toEqual(['Kiruna', 'Lund', 'Malmö', 'Ystad', 'Örebro'])
    expect(sorteringenArInaktuell(tab)).toBe(false)
  })

  it('en redigering i en annan kolumn gör inte ordningen inaktuell', () => {
    const tab = tabOf(['Ort', 'Belopp'], [['B', '1'], ['A', '2']])
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    redigeraCell(tab, 0, 1, '999')
    // Banderollen får inte ljuga: Belopp ingår inte i sorteringen.
    expect(sorteringenArInaktuell(tab)).toBe(false)
  })

  it('en typändring på nyckelkolumnen gör ordningen inaktuell', () => {
    const tab = tabOf(['Belopp'], [['1 240,50'], ['980,00']])
    const col = tab.frame.columns[0]!
    sattSortering(tab, [{ colId: col.id, riktning: 'stigande' }])
    expect(kolumn(tab, 0)).toEqual(['1 240,50', '980,00'])

    // sattTyp rör inte en enda kod, men byter rangens innebörd helt.
    col.type = 'number'
    tab.dataRevision += 1
    refreshView(tab)
    expect(sorteringenArInaktuell(tab)).toBe(true)

    sorteraOm(tab)
    expect(kolumn(tab, 0)).toEqual(['980,00', '1 240,50'])
  })
})

describe('radoperationer renumrerar fysiska index', () => {
  it('en borttagning räknar om ordningen i stället för att peka fel', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    taBortRader(tab, [0]) // Malmö, fysisk rad 0
    expect(kolumn(tab, 0)).toEqual(['Boden', 'Kiruna', 'Lund', 'Ystad'])
    expect(tab.ordning!.radantal).toBe(4)
  })

  it('en infogning ger en ordning som fortfarande täcker alla rader', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    infogaRader(tab, 0, 2, false)
    expect(tab.ordning!.rader).toHaveLength(7)
    // De två nya raderna är tomma och hamnar sist.
    expect(kolumn(tab, 0).slice(-2)).toEqual(['', ''])
  })

  it('ångra av en borttagning ger tillbaka exakt samma vy', () => {
    const tab = tabOf(['Ort'], ORTER)
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    const fore = Array.from(tab.frame.view)

    taBortRader(tab, [1, 3])
    undo(tab)

    // Ordningen är en ren funktion av (spec, data): samma data in ger samma
    // permutation ut, element för element.
    expect(Array.from(tab.frame.view)).toEqual(fore)

    redo(tab)
    undo(tab)
    expect(Array.from(tab.frame.view)).toEqual(fore)
  })

  it('vyn är alltid giltig efter en slumpad följd av radoperationer', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('taBort', 'infoga', 'duplicera', 'angra'), {
          minLength: 1,
          maxLength: 12,
        }),
        (steg) => {
          const tab = tabOf(['Ort'], ORTER)
          sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])

          for (const s of steg) {
            const n = tab.frame.rowCount
            if (s === 'taBort' && n > 1) taBortRader(tab, [0])
            else if (s === 'infoga') infogaRader(tab, 0, 1, false)
            else if (s === 'duplicera' && n > 0) dupliceraRader(tab, [0])
            else if (s === 'angra') undo(tab)
          }

          const vy = Array.from(tab.frame.view)
          expect(new Set(vy).size).toBe(vy.length)
          for (const r of vy) expect(r).toBeLessThan(tab.frame.rowCount)
          expect(vy).toHaveLength(tab.frame.rowCount)
        },
      ),
      { numRuns: 150 },
    )
  })
})

describe('sortering och urval komponerar', () => {
  it('en sökning ger en delföljd av den sorterade ordningen', () => {
    const tab = tabOf(['Ort'], [['Malmö'], ['Boden'], ['Mora'], ['Lund']])
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    const sorterad = Array.from(tab.frame.view)

    tab.viewSpec = { ...tab.viewSpec, search: 'm' }
    refreshView(tab)
    const filtrerad = Array.from(tab.frame.view)

    // Resultatet ska vara en delföljd — inte en omsortering.
    expect(filtrerad).toEqual(sorterad.filter((r) => filtrerad.includes(r)))
    expect(kolumn(tab, 0)).toEqual(['Malmö', 'Mora'])
  })

  it('computeView utan ordning ger filens ordning', () => {
    const frame = frameOf(['Ort'], ORTER)
    expect(Array.from(computeView(frame, {}).view)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('markeringen följer sin rad', () => {
  it('flyttar med raden när ordningen byts', () => {
    const tab = tabOf(['Ort'], ORTER)
    // Markera Kiruna, som ligger på vyrad 2 i filens ordning.
    tab.markering = { ankareRad: 2, ankareKol: 0, fokusRad: 2, fokusKol: 0 }
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    // Kiruna ligger nu på vyrad 1 — markeringen ska ha följt med.
    expect(tab.frame.view[tab.markering!.fokusRad]).toBe(2)
    expect(getCell(tab.frame.columns[0]!, tab.frame.view[tab.markering!.fokusRad]!)).toBe('Kiruna')
  })

  it('kollapsar ett område till fokuscellen', () => {
    const tab = tabOf(['Ort'], ORTER)
    tab.markering = { ankareRad: 0, ankareKol: 0, fokusRad: 3, fokusKol: 0 }
    sattSortering(tab, [{ colId: tab.frame.columns[0]!.id, riktning: 'stigande' }])
    expect(tab.markering!.ankareRad).toBe(tab.markering!.fokusRad)
  })
})
