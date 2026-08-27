import { Flag, type Frame } from '../types.js'
import { ColumnBuilder } from '../frame/builder.js'
import { createFrame, uniqueColumnName } from '../frame/frame.js'
import { isExcelError } from '../infer.js'

/**
 * Läsning av Excel-filer.
 *
 * En viktig skillnad mot CSV: **en Excel-fil har ingen råtext.** Där CSV har
 * tecken har xlsx ett typat värde plus ett visningsformat, och det format
 * användaren såg i Excel finns inte tillgängligt. Vi måste alltså skriva om
 * värdena — och då ska omskrivningen vara entydig, dokumenterad och synlig i
 * importdialogen i stället för att smyga förbi.
 */

export type Decimaltecken = ',' | '.'

export interface XlsxOptions {
  /** Bladets namn. Utelämnas det tas det första bladet. */
  sheet?: string
  /** Hur tal skrivs om. Komma som standard, eftersom exporten går tillbaka till svenskt Excel. */
  decimal: Decimaltecken
  /** 0-baserad rad med rubriker, eller null för inga rubriker. */
  headerRow: number | null
  trimFields: boolean
  skipEmptyRows: boolean
}

export const XLSX_STANDARD: XlsxOptions = {
  decimal: ',',
  headerRow: 0,
  trimFields: true,
  skipEmptyRows: true,
}

/** En cell som `read-excel-file` levererar den. */
export type XlsxCell = string | number | boolean | Date | null | undefined

function tvasiffror(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Skriver ett Excel-datum som `ÅÅÅÅ-MM-DD`, med klockslag bara när cellen
 * faktiskt har en tidsdel.
 *
 * Datumet måste läsas med UTC-metoderna. `read-excel-file` bygger sina
 * `Date`-objekt i UTC+0, så `getFullYear()` i en västlig tidszon ger dagen
 * före — precis den förskjutning som gör att en hel kolumn hamnar en dag fel
 * utan att någon märker det.
 */
export function formatExcelDate(d: Date): string {
  const datum = `${d.getUTCFullYear()}-${tvasiffror(d.getUTCMonth() + 1)}-${tvasiffror(d.getUTCDate())}`
  const t = d.getUTCHours()
  const m = d.getUTCMinutes()
  const s = d.getUTCSeconds()
  if (t === 0 && m === 0 && s === 0) return datum
  const klockslag = `${tvasiffror(t)}:${tvasiffror(m)}${s === 0 ? '' : `:${tvasiffror(s)}`}`
  return `${datum} ${klockslag}`
}

/**
 * Skriver ett tal utan tusentalsavgränsare.
 *
 * Avgränsare skulle göra värdet svårare att tolka tillbaka, och gruppering är
 * ett visningsval som hör hemma i Excel och inte i datat.
 */
export function formatExcelNumber(n: number, decimal: Decimaltecken): string {
  if (!Number.isFinite(n)) return ''
  const text = n.toLocaleString(decimal === ',' ? 'sv-SE' : 'en-US', {
    maximumFractionDigits: 20,
    useGrouping: false,
  })
  return text
}

export interface FormattedCell {
  value: string
  flags: number
}

export function formatCell(cell: XlsxCell, decimal: Decimaltecken): FormattedCell {
  if (cell === null || cell === undefined) return { value: '', flags: 0 }
  if (cell instanceof Date) return { value: formatExcelDate(cell), flags: 0 }
  if (typeof cell === 'number') return { value: formatExcelNumber(cell, decimal), flags: 0 }
  if (typeof cell === 'boolean') return { value: cell ? 'Ja' : 'Nej', flags: 0 }
  const text = String(cell)
  // Ett formelfel är inte data. Det behålls som text men flaggas, så att
  // kolumnstatistiken inte räknar #SAKNAS! som ett värde bland andra.
  return { value: text, flags: isExcelError(text) ? Flag.ExcelError : 0 }
}

/**
 * Bygger en ram av rader som lästs ur ett Excel-blad.
 *
 * Följer samma regler som CSV-importen: rubriker görs unika, tomma rubriker
 * numreras, och rader som är tomma i alla kolumner hoppas över.
 */
export function frameFromRows(
  rows: XlsxCell[][],
  options: XlsxOptions,
  filnamn: string,
): Frame {
  const builders: ColumnBuilder[] = []
  const sourceRows: number[] = []
  let rowCount = 0
  let tommaRader = 0

  const start = options.headerRow === null ? 0 : options.headerRow
  const raRader = rows.slice(start)

  if (options.headerRow !== null && raRader.length > 0) {
    const namn: string[] = []
    raRader[0]!.forEach((cell, i) => {
      const ra = formatCell(cell, options.decimal).value.trim()
      const valt = uniqueColumnName(namn, ra === '' ? `Kolumn ${i + 1}` : ra)
      namn.push(valt)
      builders.push(new ColumnBuilder(valt))
    })
    raRader.shift()
  }

  raRader.forEach((rad, i) => {
    const varden = rad.map((c) => formatCell(c, options.decimal))
    const allaTomma = varden.every((v) => v.value.trim() === '')
    if (allaTomma) {
      tommaRader += 1
      if (options.skipEmptyRows) return
    }
    while (builders.length < varden.length) {
      const namn = uniqueColumnName(
        builders.map((b) => b.name),
        `Kolumn ${builders.length + 1}`,
      )
      const extra = new ColumnBuilder(namn)
      extra.padTo(rowCount)
      builders.push(extra)
    }
    for (let c = 0; c < builders.length; c++) {
      const v = varden[c]
      if (!v) builders[c]!.push('', Flag.Padded)
      else builders[c]!.push(options.trimFields ? v.value.trim() : v.value, v.flags)
    }
    sourceRows.push(start + (options.headerRow === null ? 0 : 1) + i + 1)
    rowCount += 1
  })

  for (const b of builders) b.padTo(rowCount, Flag.Padded)
  const frame = createFrame(filnamn, builders.map((b) => b.finish(rowCount)), rowCount)
  frame.sourceRow = Uint32Array.from(sourceRows)
  frame.meta.fileName = filnamn
  frame.meta.warnings = []
  if (tommaRader > 0 && options.skipEmptyRows) {
    frame.meta.warnings.push({
      kind: 'ghost-rows',
      count: tommaRader,
      message: `${tommaRader} helt tom${tommaRader === 1 ? ' rad' : 'ma rader'} hoppades över.`,
    })
  }
  frame.meta.warnings.push({
    kind: 'encoding-uncertain',
    message:
      'Excel-filer innehåller typade värden, inte text. Datum skrevs om till ÅÅÅÅ-MM-DD och tal ' +
      `med ${options.decimal === ',' ? 'decimalkomma' : 'decimalpunkt'} utan tusentalsavgränsare.`,
  })
  return frame
}
