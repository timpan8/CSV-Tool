import { describe, expect, it } from 'vitest'
import {
  getCell,
  intern,
  mapColumnValues,
  matchDictionary,
  restoreColumn,
  setCell,
  snapshotColumn,
} from '../../src/core/frame/column.js'
import {
  deleteRows,
  duplicateRows,
  insertRows,
  newFrameId,
  reserveraFrameId,
  restoreRows,
  createFrame,
  sammaInnehall,
} from '../../src/core/frame/frame.js'
import { createColumn, resetColumnIds } from '../../src/core/frame/column.js'
import { Flag, type Frame } from '../../src/core/types.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const dump = (frame: Frame): string[][] =>
  Array.from({ length: frame.rowCount }, (_, r) => frame.columns.map((c) => getCell(c, r)))

describe('mapColumnValues', () => {
  it('kör transformen en gång per unikt värde, inte per rad', () => {
    const col = createColumn('Ort', 6)
    const värden = ['Malmö ', 'Malmö ', 'Malmö ', ' Lund', ' Lund', 'Boden']
    värden.forEach((v, i) => (col.codes[i] = intern(col, v)))

    let anrop = 0
    const ändrade = mapColumnValues(col, (v) => {
      anrop += 1
      return v.trim()
    })

    // Tre unika värden plus den tomma posten som aldrig transformeras.
    expect(anrop).toBe(3)
    // Men fem celler ändrades.
    expect(ändrade).toBe(5)
    expect(Array.from({ length: 6 }, (_, i) => getCell(col, i))).toEqual([
      'Malmö', 'Malmö', 'Malmö', 'Lund', 'Lund', 'Boden',
    ])
  })

  it('slår ihop värden som blir lika efter transformen', () => {
    const col = createColumn('Ort', 3)
    ;['Malmö', 'malmö', 'MALMÖ'].forEach((v, i) => (col.codes[i] = intern(col, v)))
    mapColumnValues(col, (v) => v.toLocaleLowerCase('sv'))
    // Tre olika värden blev ett. Ordboken ska ha tomma posten plus ett värde.
    expect(col.dict).toEqual(['', 'malmö'])
    expect(col.dictIndex.get('malmö')).toBe(1)
  })

  it('rör aldrig tomma celler', () => {
    const col = createColumn('Ort', 3)
    ;['', 'Lund', ''].forEach((v, i) => (col.codes[i] = intern(col, v)))
    const ändrade = mapColumnValues(col, (v) => `${v}!`)
    expect(ändrade).toBe(1)
    expect([getCell(col, 0), getCell(col, 1), getCell(col, 2)]).toEqual(['', 'Lund!', ''])
  })

})

describe('ögonblicksbilder av kolumner', () => {
  it('är exakt inversa, inklusive flaggor och typ', () => {
    const col = createColumn('Belopp', 3)
    ;['1', '2', '3'].forEach((v, i) => (col.codes[i] = intern(col, v)))
    col.flags[1] = Flag.Padded
    col.type = 'number'

    const snap = snapshotColumn(col)
    setCell(col, 0, 'ändrat')
    mapColumnValues(col, (v) => `${v}x`)
    col.type = 'text'

    restoreColumn(col, snap)
    expect([getCell(col, 0), getCell(col, 1), getCell(col, 2)]).toEqual(['1', '2', '3'])
    expect(col.flags[1]).toBe(Flag.Padded)
    expect(col.type).toBe('number')
  })

  it('går att återställa flera gånger — ångra, gör om, ångra igen', () => {
    const col = createColumn('Ort', 2)
    ;['Lund', 'Boden'].forEach((v, i) => (col.codes[i] = intern(col, v)))
    const snap = snapshotColumn(col)

    for (let varv = 0; varv < 3; varv++) {
      mapColumnValues(col, (v) => v.toUpperCase())
      expect(getCell(col, 0)).toBe('LUND')
      restoreColumn(col, snap)
      expect(getCell(col, 0)).toBe('Lund')
    }
  })

  it('håller ordboksuppslagningen synkad efter återställning', () => {
    const col = createColumn('Ort', 2)
    ;['Lund', 'Boden'].forEach((v, i) => (col.codes[i] = intern(col, v)))
    const snap = snapshotColumn(col)
    mapColumnValues(col, (v) => v.toUpperCase())
    restoreColumn(col, snap)
    // Efter återställning måste en ny skrivning återanvända befintlig kod.
    const före = col.dict.length
    setCell(col, 1, 'Lund')
    expect(col.dict.length).toBe(före)
    expect(getCell(col, 1)).toBe('Lund')
  })
})

describe('matchDictionary', () => {
  it('markerar de unika värden som matchar', () => {
    const col = createColumn('Ort', 4)
    ;['Malmö', 'Lund', 'Malmö', 'Boden'].forEach((v, i) => (col.codes[i] = intern(col, v)))
    const mask = matchDictionary(col, (v) => v.startsWith('M'))
    const träffar = Array.from({ length: 4 }, (_, r) => mask[col.codes[r]!] === 1)
    expect(träffar).toEqual([true, false, true, false])
  })
})

describe('radoperationer', () => {
  const bas = () =>
    frameOf(['Namn', 'Ort'], [
      ['Anna', 'Lund'],
      ['Bo', 'Boden'],
      ['Cia', 'Kiruna'],
      ['Dan', 'Malmö'],
    ])

  it('infogar tomma rader som markeras som tillagda', () => {
    const frame = bas()
    insertRows(frame, 2, 2)
    expect(frame.rowCount).toBe(6)
    expect(dump(frame)[2]).toEqual(['', ''])
    expect(dump(frame)[4]).toEqual(['Cia', 'Kiruna'])
    // Radnummer 0 betyder "fanns inte i filen".
    expect(Array.from(frame.sourceRow)).toEqual([1, 2, 0, 0, 3, 4])
  })

  it('tar bort rader och behåller radnumren för resten', () => {
    const frame = bas()
    deleteRows(frame, [1, 3])
    expect(dump(frame)).toEqual([['Anna', 'Lund'], ['Cia', 'Kiruna']])
    expect(Array.from(frame.sourceRow)).toEqual([1, 3])
  })

  it('sätter tillbaka borttagna rader med värden, flaggor och radnummer', () => {
    const frame = bas()
    frame.columns[1]!.flags[3] = Flag.Padded

    const sparade = deleteRows(frame, [1, 3])
    expect(frame.rowCount).toBe(2)

    restoreRows(frame, sparade)
    expect(dump(frame)).toEqual([
      ['Anna', 'Lund'],
      ['Bo', 'Boden'],
      ['Cia', 'Kiruna'],
      ['Dan', 'Malmö'],
    ])
    expect(Array.from(frame.sourceRow)).toEqual([1, 2, 3, 4])
    expect(frame.columns[1]!.flags[3]).toBe(Flag.Padded)
  })

  it('klarar att ta bort och återställa upprepade gånger', () => {
    const frame = bas()
    const förut = dump(frame)
    for (let varv = 0; varv < 3; varv++) {
      const sparade = deleteRows(frame, [0, 2])
      expect(frame.rowCount).toBe(2)
      restoreRows(frame, sparade)
      expect(dump(frame)).toEqual(förut)
    }
  })

  it('tar bort första och sista raden korrekt', () => {
    const frame = bas()
    const sparade = deleteRows(frame, [0, 3])
    expect(dump(frame)).toEqual([['Bo', 'Boden'], ['Cia', 'Kiruna']])
    restoreRows(frame, sparade)
    expect(dump(frame)[0]).toEqual(['Anna', 'Lund'])
    expect(dump(frame)[3]).toEqual(['Dan', 'Malmö'])
  })

  it('dubblerar rader och låter bara originalet behålla sitt radnummer', () => {
    const frame = bas()
    duplicateRows(frame, [1])
    expect(dump(frame)).toEqual([
      ['Anna', 'Lund'],
      ['Bo', 'Boden'],
      ['Bo', 'Boden'],
      ['Cia', 'Kiruna'],
      ['Dan', 'Malmö'],
    ])
    expect(Array.from(frame.sourceRow)).toEqual([1, 2, 0, 3, 4])
  })

  it('nollställer vyn så att den täcker alla rader efter en radändring', () => {
    const frame = bas()
    frame.view = Uint32Array.from([0])
    insertRows(frame, 0, 1)
    expect(frame.view.length).toBe(frame.rowCount)
  })
})

describe('sammaInnehall', () => {
  const bygg = () => {
    resetColumnIds()
    const a = createColumn('Ort', 3)
    const b = createColumn('Antal', 3)
    ;['Malmö', 'Lund', 'Malmö'].forEach((v, r) => {
      a.codes[r] = intern(a, v)
    })
    ;['1', '2', '3'].forEach((v, r) => {
      b.codes[r] = intern(b, v)
    })
    return createFrame('fil.csv', [a, b], 3)
  }

  it('är sant för två likadana ramar', () => {
    expect(sammaInnehall(bygg(), bygg())).toBe(true)
  })

  it('är sant för samma ram', () => {
    const f = bygg()
    expect(sammaInnehall(f, f)).toBe(true)
  })

  it('är falskt när en cell skiljer sig', () => {
    const a = bygg()
    const b = bygg()
    b.columns[0]!.codes[1] = intern(b.columns[0]!, 'Kiruna')
    expect(sammaInnehall(a, b)).toBe(false)
  })

  it('är falskt när en rubrik skiljer sig', () => {
    const a = bygg()
    const b = bygg()
    b.columns[1]!.name = 'Summa'
    expect(sammaInnehall(a, b)).toBe(false)
  })

  it('är falskt när radantalet skiljer sig', () => {
    const a = bygg()
    const b = createFrame('fil.csv', [createColumn('Ort', 2), createColumn('Antal', 2)], 2)
    expect(sammaInnehall(a, b)).toBe(false)
  })

  it('bryr sig inte om filnamnet — innehållet är frågan', () => {
    const a = bygg()
    const b = bygg()
    b.name = 'annat namn.csv'
    expect(sammaInnehall(a, b)).toBe(true)
  })
})

describe('reserveraFrameId', () => {
  it('delar aldrig ut ett id som redan finns', () => {
    // Räknaren är modulnivå och börjar om vid varje sidladdning, medan ett
    // sparat id inte gör det. Utan reservationen fick en fil som öppnades
    // efter en återställning förr eller senare samma id som en återställd ram,
    // och då pekade allt som bär ett ram-id på fel ram.
    const hogt = `f${(5000).toString(36)}`
    reserveraFrameId(hogt)
    const nasta = newFrameId()
    expect(nasta).not.toBe(hogt)
    expect(Number.parseInt(nasta.slice(1), 36)).toBeGreaterThan(5000)
  })

  it('backar aldrig räknaren', () => {
    const fore = newFrameId()
    reserveraFrameId('f1')
    expect(Number.parseInt(newFrameId().slice(1), 36)).toBeGreaterThan(
      Number.parseInt(fore.slice(1), 36),
    )
  })

  it('struntar i ett id som inte går att tolka', () => {
    const fore = newFrameId()
    reserveraFrameId('inte-ett-id')
    const efter = newFrameId()
    expect(Number.parseInt(efter.slice(1), 36)).toBe(Number.parseInt(fore.slice(1), 36) + 1)
  })
})
