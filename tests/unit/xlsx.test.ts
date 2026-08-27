import { describe, expect, it } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import readXlsxFile from 'read-excel-file/node'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { EXCEL_FRIENDLY } from '../../src/core/csv/stringify.js'
import { datumTillSerie, exportXlsx, kolumnBokstav, rensaBladnamn } from '../../src/core/xlsx/write.js'
import {
  formatCell,
  formatExcelDate,
  formatExcelNumber,
  frameFromRows,
  XLSX_STANDARD,
} from '../../src/core/xlsx/read.js'
import { Flag, type ColumnType, type Frame } from '../../src/core/types.js'

function frameOf(spec: { namn: string; typ: ColumnType; varden: string[] }[]): Frame {
  const rowCount = spec[0]!.varden.length
  const columns = spec.map((s) => {
    const col = createColumn(s.namn, rowCount)
    col.type = s.typ
    s.varden.forEach((v, i) => (col.codes[i] = intern(col, v)))
    return col
  })
  return createFrame('test', columns, rowCount)
}

describe('kolumnbokstäver', () => {
  it('räknar som Excel gör', () => {
    expect(kolumnBokstav(0)).toBe('A')
    expect(kolumnBokstav(25)).toBe('Z')
    expect(kolumnBokstav(26)).toBe('AA')
    expect(kolumnBokstav(51)).toBe('AZ')
    expect(kolumnBokstav(52)).toBe('BA')
    expect(kolumnBokstav(701)).toBe('ZZ')
    expect(kolumnBokstav(702)).toBe('AAA')
  })
})

describe('Excel-serienummer', () => {
  it('räknar från 1899-12-30, så att 1900 års påhittade skottdygn absorberas', () => {
    expect(datumTillSerie('1900-01-01')).toBe(2)
    expect(datumTillSerie('2026-08-27')).toBe(46261)
  })

  it('avvisar datum som inte finns', () => {
    expect(datumTillSerie('2026-02-31')).toBeNull()
    expect(datumTillSerie('2026-13-01')).toBeNull()
    expect(datumTillSerie('i går')).toBeNull()
  })
})

describe('bladnamn', () => {
  it('rensar tecken Excel inte tillåter och kortar av', () => {
    expect(rensaBladnamn('kunder/2026:q3')).toBe('kunder 2026 q3')
    expect(rensaBladnamn('')).toBe('Blad1')
    expect(rensaBladnamn('x'.repeat(40))).toHaveLength(31)
  })
})

describe('rundgång genom en riktig .xlsx', () => {
  const skriv = (frame: Frame): string => {
    const bytes = exportXlsx(frame, EXCEL_FRIENDLY)
    const dir = join(tmpdir(), 'csv-verkstan-test')
    mkdirSync(dir, { recursive: true })
    const sokvag = join(dir, `${Math.abs(hash(frame.columns.map((c) => c.name).join()))}.xlsx`)
    writeFileSync(sokvag, bytes)
    return sokvag
  }
  const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)

  it('behåller ledande nollor, räknar tal som tal och datum som datum', async () => {
    const frame = frameOf([
      { namn: 'Postnr', typ: 'text', varden: ['01234', '00700'] },
      { namn: 'Belopp', typ: 'number', varden: ['1 240,50', '980,00'] },
      { namn: 'Registrerad', typ: 'date', varden: ['2026-08-27', '2026-08-26'] },
      { namn: 'Ort', typ: 'text', varden: ['Malmö', 'Växjö'] },
    ])
    const rows = (await readXlsxFile(skriv(frame)))[0]!.data

    expect(rows[0]).toEqual(['Postnr', 'Belopp', 'Registrerad', 'Ort'])
    // Ledande nolla överlever, vilket är hela poängen med Excel-export.
    expect(rows[1]![0]).toBe('01234')
    expect(rows[2]![0]).toBe('00700')
    // Talet är ett tal, så SUMMA fungerar i Excel.
    expect(rows[1]![1]).toBe(1240.5)
    expect(rows[2]![1]).toBe(980)
    // Datumet är ett datum, och rätt dag oavsett var läsaren står.
    expect(formatExcelDate(rows[1]![2] as unknown as Date)).toBe('2026-08-27')
    expect(rows[1]![3]).toBe('Malmö')
  })

  it('skriver värden som inte går att tolka som text i stället för fel tal', async () => {
    const frame = frameOf([
      { namn: 'Belopp', typ: 'number', varden: ['1 240,50', 'saknas'] },
      { namn: 'Datum', typ: 'date', varden: ['2026-08-27', 'i går'] },
    ])
    const rows = (await readXlsxFile(skriv(frame)))[0]!.data
    expect(rows[1]).toEqual([1240.5, expect.any(Date)])
    expect(rows[2]).toEqual(['saknas', 'i går'])
  })

  it('överlever tecken som annars gör XML ogiltig', async () => {
    const frame = frameOf([
      { namn: 'Text & <taggar>', typ: 'text', varden: ['a & b', '"citat" <här>'] },
    ])
    const rows = (await readXlsxFile(skriv(frame)))[0]!.data
    expect(rows[0]![0]).toBe('Text & <taggar>')
    expect(rows[1]![0]).toBe('a & b')
    expect(rows[2]![0]).toBe('"citat" <här>')
  })
})

describe('läsning av Excel-värden', () => {
  it('läser datum i UTC, så att dagen inte förskjuts', () => {
    // read-excel-file bygger Date i UTC+0. Läser man med getFullYear i en
    // västlig tidszon blir det dagen före.
    const d = new Date(Date.UTC(2026, 7, 27, 0, 0, 0))
    expect(formatExcelDate(d)).toBe('2026-08-27')
    expect(formatExcelDate(new Date(Date.UTC(2026, 7, 27, 12, 55)))).toBe('2026-08-27 12:55')
  })

  it('skriver tal med decimalkomma som standard', () => {
    expect(formatExcelNumber(1240.5, ',')).toBe('1240,5')
    expect(formatExcelNumber(1240.5, '.')).toBe('1240.5')
    // Ingen tusentalsavgränsare — den skulle göra värdet svårare att tolka tillbaka.
    expect(formatExcelNumber(1234567, ',')).toBe('1234567')
  })

  it('flaggar formelfel utan att kasta dem', () => {
    const cell = formatCell('#SAKNAS!', ',')
    expect(cell.value).toBe('#SAKNAS!')
    expect(cell.flags & Flag.ExcelError).toBe(Flag.ExcelError)
  })

  it('bygger en ram med rubriker och hoppar över tomma rader', () => {
    const frame = frameFromRows(
      [
        ['Namn', 'Belopp', 'Datum'],
        ['Anna', 1240.5, new Date(Date.UTC(2026, 7, 27))],
        [null, null, null],
        ['Bo', 980, new Date(Date.UTC(2026, 7, 26))],
      ],
      XLSX_STANDARD,
      'test.xlsx',
    )
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Belopp', 'Datum'])
    expect(frame.rowCount).toBe(2)
    expect(getCell(frame.columns[1]!, 0)).toBe('1240,5')
    expect(getCell(frame.columns[2]!, 0)).toBe('2026-08-27')
    expect(frame.meta.warnings.some((w) => w.kind === 'ghost-rows')).toBe(true)
  })
})
