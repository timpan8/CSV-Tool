import type { Column, Delimiter, Encoding, Frame } from '../types.js'
import { getCell } from '../frame/column.js'
import { cp1252EncodeString, unencodableInCp1252 } from './cp1252.js'

export interface ExportOptions {
  delimiter: Delimiter
  encoding: Encoding
  /** Skriv byte order mark. Utan den visar Excel å ä ö som skräp. */
  bom: boolean
  newline: '\r\n' | '\n'
  quoting: 'minimal' | 'always'
  includeHeader: boolean
  /**
   * Prefixa celler som Excel annars tolkar som formler.
   * Riskbaserat: `-5` är ett negativt tal och rörs inte, `-cmd|' /c calc'`
   * är det inte och prefixas.
   */
  protectFormulas: boolean
  /** Vilka rader som ska med. Standard är den filtrerade vyn. */
  rows: 'view' | 'all'
  /** Vilka kolumner som ska med. */
  columns: 'visible' | 'all'
  /**
   * Radordningen att använda när `rows` är `'all'`.
   *
   * Utan den skulle "alla rader" betyda filens ordning, så den som sorterat
   * och sedan exporterar allt skulle få tillbaka osorterat utan att något
   * sagt till. Vyn bär sin egen ordning; det här är samma sak för de rader
   * ett filter döljer.
   */
  ordning?: Uint32Array
}

/**
 * Förvalet är det som gör att en svensk användare kan dubbelklicka på filen
 * och se rätt innehåll i Excel: semikolon, CRLF och UTF-8 med BOM.
 */
export const EXCEL_FRIENDLY: ExportOptions = {
  delimiter: ';',
  encoding: 'utf-8',
  bom: true,
  newline: '\r\n',
  quoting: 'minimal',
  includeHeader: true,
  protectFormulas: true,
  rows: 'view',
  columns: 'visible',
}

const NUMERIC = /^[+-]?(\d[\d  .]*)?(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/

/** Sant för det som rimligen är ett tal, inklusive svenska `1 234,50`. */
function looksNumeric(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '+' || trimmed === '-') return false
  return NUMERIC.test(trimmed) && /\d/.test(trimmed)
}

const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Excel kör en cell som börjar med `=`, `+`, `-` eller `@` som en formel när
 * filen öppnas. Vi prefixar med apostrof — men bara när värdet inte är ett
 * tal, eftersom apostrofen annars är precis den tysta dataändring vi säger
 * oss undvika.
 */
export function guardFormula(value: string): string {
  if (!FORMULA_START.test(value)) return value
  if (looksNumeric(value)) return value
  return `'${value}`
}

function quoteField(value: string, delimiter: string, quoting: 'minimal' | 'always'): string {
  const needs =
    quoting === 'always' ||
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value !== value.trim()
  if (!needs) return value
  return `"${value.replace(/"/g, '""')}"`
}

export interface ExportSelection {
  columns: Column[]
  rows: Uint32Array
}

export function selectForExport(frame: Frame, options: ExportOptions): ExportSelection {
  const columns =
    options.columns === 'all' ? frame.columns : frame.columns.filter((c) => !c.hidden)
  const rows =
    options.rows === 'all'
      ? (options.ordning?.length === frame.rowCount
          ? options.ordning
          : Uint32Array.from({ length: frame.rowCount }, (_, i) => i))
      : frame.view
  return { columns, rows }
}

export function stringifyCsv(frame: Frame, options: ExportOptions): string {
  const { columns, rows } = selectForExport(frame, options)
  const parts: string[] = []

  if (options.includeHeader) {
    parts.push(
      columns.map((c) => quoteField(c.name, options.delimiter, options.quoting)).join(options.delimiter),
    )
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const fields = new Array<string>(columns.length)
    for (let c = 0; c < columns.length; c++) {
      const raw = getCell(columns[c]!, row)
      const guarded = options.protectFormulas ? guardFormula(raw) : raw
      fields[c] = quoteField(guarded, options.delimiter, options.quoting)
    }
    parts.push(fields.join(options.delimiter))
  }
  return parts.join(options.newline) + options.newline
}

export interface EncodedExport {
  bytes: Uint8Array
  /** Tecken som inte fick plats i den valda kodningen och ersattes. */
  lostCharacters: string[]
}

const BOM_BYTES: Partial<Record<Encoding, number[]>> = {
  'utf-8': [0xef, 0xbb, 0xbf],
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
}

export function encodeExport(text: string, options: ExportOptions): EncodedExport {
  if (options.encoding === 'windows-1252') {
    const lost = unencodableInCp1252(text)
    // Ersätt det som inte går att koda med frågetecken i stället för att
    // vägra exporten — men rapportera exakt vad som förlorades.
    const safe = lost.length === 0 ? text : [...text].map((ch) => (cp1252EncodeString(ch) ? ch : '?')).join('')
    const body = cp1252EncodeString(safe)!
    return { bytes: body, lostCharacters: lost }
  }

  let body: Uint8Array
  if (options.encoding === 'utf-8') {
    body = new TextEncoder().encode(text)
  } else {
    const little = options.encoding === 'utf-16le'
    body = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      body[i * 2] = little ? code & 0xff : code >> 8
      body[i * 2 + 1] = little ? code >> 8 : code & 0xff
    }
  }

  const bom = options.bom ? BOM_BYTES[options.encoding] : undefined
  if (!bom) return { bytes: body, lostCharacters: [] }
  const out = new Uint8Array(bom.length + body.length)
  out.set(bom, 0)
  out.set(body, bom.length)
  return { bytes: out, lostCharacters: [] }
}

export function exportCsv(frame: Frame, options: ExportOptions): EncodedExport {
  return encodeExport(stringifyCsv(frame, options), options)
}

/**
 * Skriver ett godtyckligt urval av kolumner och rader som avgränsad text.
 *
 * Används för urklipp, där urvalet är en markering i rutnätet och inte hela
 * ramen. Formelskydd hör inte hemma här: apostrofen skulle följa med in i
 * Excel som ett tecken i värdet.
 */
export function toDelimited(
  columns: readonly Column[],
  rows: Uint32Array | readonly number[],
  delimiter: string,
  newline: '\r\n' | '\n' = '\n',
): string {
  const parts: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const fields = new Array<string>(columns.length)
    for (let c = 0; c < columns.length; c++) {
      fields[c] = quoteField(getCell(columns[c]!, row), delimiter, 'minimal')
    }
    parts.push(fields.join(delimiter))
  }
  return parts.join(newline)
}

/**
 * Ett godtyckligt radurval som CSV **med rubrikrad**.
 *
 * `stringifyCsv` skriver alltid hela ramen eller hela vyn. Restlistorna i
 * matchningsverkstaden är varken — de är en lista över just de rader som blev
 * över, och en delexport utan rubriker är svår att göra något med.
 */
export function urvalTillCsv(
  columns: readonly Column[],
  rows: Uint32Array | readonly number[],
  delimiter: string,
  newline: '\r\n' | '\n' = '\r\n',
): string {
  const rubriker = columns.map((c) => quoteField(c.name, delimiter, 'minimal')).join(delimiter)
  const kropp = toDelimited(columns, rows, delimiter, newline)
  return kropp === '' ? rubriker : `${rubriker}${newline}${kropp}`
}

/** TSV till urklipp — klistras rakt in i Excel med kolumnerna intakta. */
export function toTsv(frame: Frame, options: Partial<ExportOptions> = {}): string {
  return stringifyCsv(frame, {
    ...EXCEL_FRIENDLY,
    ...options,
    delimiter: '\t',
    newline: '\n',
    protectFormulas: false,
  })
}
