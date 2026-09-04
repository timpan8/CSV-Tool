import Papa from 'papaparse'
import { parseNumber } from '../infer.js'
import {
  Flag,
  type Delimiter,
  type Frame,
  type ParseSettings,
  type Warning,
} from '../types.js'
import { ColumnBuilder } from '../frame/builder.js'
import { createFrame, uniqueColumnName } from '../frame/frame.js'
import { decodeBytes, type DecodeResult } from './decode.js'
import { sniff } from './sniff.js'

export interface ParseResult {
  frame: Frame
  decode: DecodeResult
  settings: ParseSettings
}

export interface ParseOverrides {
  delimiter?: ParseSettings['delimiter']
  encoding?: ParseSettings['encoding']
  headerRow?: number | null
  skipRows?: number
  trimFields?: boolean
  skipEmptyRows?: boolean
}

/** Antal rader vi listar i en varning innan vi bara räknar dem. */
const WARNING_ROW_SAMPLE = 20

export function parseCsvText(
  text: string,
  decode: DecodeResult,
  overrides: ParseOverrides = {},
): ParseResult {
  const sniffed = sniff(text)
  const delimiter = overrides.delimiter ?? sniffed.delimiter
  const body = text.slice(sniffed.sepDirectiveLength)

  const settings: ParseSettings = {
    delimiter,
    encoding: decode.encoding,
    hadBom: decode.hadBom,
    newline: decode.newline,
    quote: '"',
    headerRow: overrides.headerRow !== undefined ? overrides.headerRow : sniffed.headerRow,
    skipRows: overrides.skipRows ?? 0,
    trimFields: overrides.trimFields ?? true,
    skipEmptyRows: overrides.skipEmptyRows ?? true,
    hadSepDirective: sniffed.fromSepDirective,
  }

  const warnings: Warning[] = []
  const builders: ColumnBuilder[] = []
  const sourceRows: number[] = []
  let rowCount = 0
  let physicalLine = 0
  let headerSeen = false
  let raggedShort = 0
  let raggedLong = 0
  const raggedSample: number[] = []
  let ghostRows = 0

  const startAt = settings.headerRow === null ? settings.skipRows : settings.headerRow

  const takeHeader = (fields: string[]): void => {
    const names: string[] = []
    for (let i = 0; i < fields.length; i++) {
      const raw = (fields[i] ?? '').trim()
      const wanted = raw === '' ? `Kolumn ${i + 1}` : raw
      const name = uniqueColumnName(names.map((n) => n), wanted)
      if (raw === '') {
        warnings.push({
          kind: 'empty-header',
          message: `Kolumn ${i + 1} saknade rubrik och fick namnet "${name}".`,
        })
      } else if (name !== wanted) {
        warnings.push({
          kind: 'duplicate-header',
          message: `Rubriken "${wanted}" fanns flera gånger. Den andra fick namnet "${name}".`,
        })
      }
      names.push(name)
      builders.push(new ColumnBuilder(name))
    }
  }

  const addRow = (fields: string[]): void => {
    // Fler fält än rubriker: hellre en extrakolumn än tappade värden.
    while (builders.length < fields.length) {
      const name = uniqueColumnName(
        builders.map((b) => b.name),
        `Extra ${builders.length + 1}`,
      )
      const extra = new ColumnBuilder(name)
      extra.padTo(rowCount)
      builders.push(extra)
    }

    const padded = fields.length < builders.length
    for (let i = 0; i < builders.length; i++) {
      const value = fields[i]
      if (value === undefined) builders[i]!.push('', Flag.Padded)
      else builders[i]!.push(settings.trimFields ? value.trim() : value)
    }
    if (padded) {
      raggedShort += 1
      if (raggedSample.length < WARNING_ROW_SAMPLE) raggedSample.push(physicalLine)
    }
    sourceRows.push(physicalLine)
    rowCount += 1
  }

  Papa.parse<string[]>(body, {
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    newline: undefined,
    skipEmptyLines: false,
    step: (results) => {
      physicalLine += 1
      const fields = results.data
      if (physicalLine - 1 < startAt) return

      if (!headerSeen && settings.headerRow !== null) {
        takeHeader(fields)
        headerSeen = true
        return
      }

      const allEmpty = fields.every((f) => (f ?? '').trim() === '')
      if (allEmpty) {
        // Excels spökrader är bara avgränsare (`;;;;;`) och blir annars lika
        // många tomma personer i en utskickslista — dem räknar vi och
        // rapporterar. En helt tom rad (inklusive radslutet i filens slut)
        // är däremot inget att larma om.
        if (fields.length > 1) ghostRows += 1
        if (settings.skipEmptyRows) return
      }

      if (builders.length === 0) {
        // Ingen rubrikrad: numrera kolumnerna efter första datarad.
        for (let i = 0; i < fields.length; i++) builders.push(new ColumnBuilder(`Kolumn ${i + 1}`))
      }
      if (fields.length > builders.length) raggedLong += 1
      addRow(fields)
    },
  })

  if (raggedShort > 0) {
    warnings.push({
      kind: 'ragged-row',
      count: raggedShort,
      rows: raggedSample,
      message:
        raggedShort === 1
          ? '1 rad hade färre fält än rubriken. De saknade cellerna lämnades tomma och är markerade.'
          : `${raggedShort} rader hade färre fält än rubriken. De saknade cellerna lämnades tomma och är markerade.`,
    })
  }
  if (raggedLong > 0) {
    warnings.push({
      kind: 'ragged-row',
      count: raggedLong,
      message:
        `${raggedLong} rad${raggedLong === 1 ? '' : 'er'} hade fler fält än rubriken. ` +
        'De extra värdena lades i nya kolumner i stället för att kastas.',
    })
  }
  if (ghostRows > 0 && settings.skipEmptyRows) {
    warnings.push({
      kind: 'ghost-rows',
      count: ghostRows,
      message: `${ghostRows} helt tom${ghostRows === 1 ? ' rad' : 'ma rader'} hoppades över.`,
    })
  }
  if (decode.check.state === 'mojibake') {
    warnings.push({
      kind: 'mojibake',
      message:
        'Filen innehåller tecken som ser ut som trasig teckenkodning (Ã¥ Ã¤ Ã¶). ' +
        'Den kan förmodligen lagas.',
    })
  } else if (decode.check.state === 'unknown') {
    warnings.push({
      kind: 'encoding-uncertain',
      message:
        'Filen innehåller bara ASCII-tecken, så det går inte att avgöra om teckenkodningen är rätt vald. ' +
        'Har den svenska tecken någon annanstans kan de behöva en annan kodning.',
    })
  }
  if (decode.invalidSequences > 0) {
    warnings.push({
      kind: 'encoding-uncertain',
      count: decode.invalidSequences,
      message:
        `${decode.invalidSequences} byte-sekvens${decode.invalidSequences === 1 ? '' : 'er'} gick inte att tolka ` +
        'och visas som ersättningstecken. Resten av filen lästes som UTF-8.',
    })
  }

  for (const b of builders) b.padTo(rowCount, Flag.Padded)
  const columns = builders.map((b) => b.finish(rowCount))
  const frame = createFrame('', columns, rowCount)
  frame.sourceRow = Uint32Array.from(sourceRows)
  frame.meta.parse = settings
  frame.meta.warnings = warnings
  return { frame, decode, settings }
}

export function parseCsvBytes(
  bytes: Uint8Array,
  overrides: ParseOverrides = {},
): ParseResult {
  const decode = decodeBytes(bytes, overrides.encoding)
  return parseCsvText(decode.text, decode, overrides)
}

/**
 * Tolkar text från urklipp som en rutnätsyta.
 *
 * Excel och Kalkylark lägger TSV på urklipp, men användare klistrar också in
 * komma- och semikolonseparerad text direkt ur ett mejl. Samma
 * avgränsargissning som filimporten används, så beteendet är ett och samma
 * på båda ställena.
 *
 * Ingen rubrikrad antas: det som klistras in i ett rutnät är celler.
 */
/**
 * Sant när det inklistrades första rad ser ut som en rubrikrad.
 *
 * Skillnaden mellan *celler ur Excel* och *ett helt dokument* går inte att
 * avgöra säkert, men rubrikraden är det starkaste tecknet som finns: den som
 * kopierat ett par celler har sällan med sig kolumnnamnen. Regeln är därför
 * medvetet snäv — varje kolumn ifylld, alla namn olika, och inget av dem ett
 * tal. En rad med mätvärden i är data, hur den än ser ut i övrigt.
 *
 * Svaret styr bara vilken knapp som är förvald i inklistringsdialogen.
 * Ingenting sker automatiskt på den här gissningen; den flyttar bara det
 * troligaste valet dit fingret redan är.
 */
export function serUtSomRubrikrad(rader: readonly string[][]): boolean {
  const forsta = rader[0]
  // En ensam rad är ingen tabell, och en ensam kolumn har ingen rubrikrad
  // att skilja från sitt innehåll.
  if (!forsta || forsta.length < 2 || rader.length < 2) return false
  const varden = forsta.map((v) => v.trim())
  if (varden.some((v) => v === '')) return false
  if (new Set(varden.map((v) => v.toLocaleLowerCase('sv'))).size !== varden.length) return false
  return varden.every((v) => parseNumber(v) === null)
}

export function parseDelimitedText(text: string): { rows: string[][]; delimiter: Delimiter } {
  const trimmed = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (trimmed === '') return { rows: [], delimiter: '\t' }

  const sniffed = sniff(trimmed)
  const rows: string[][] = []
  Papa.parse<string[]>(trimmed, {
    delimiter: sniffed.delimiter,
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: false,
    step: (results) => {
      rows.push(results.data.map((f) => f ?? ''))
    },
  })
  return { rows, delimiter: sniffed.delimiter }
}
