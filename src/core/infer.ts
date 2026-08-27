import type { Column, ColumnType } from './types.js'
import { MONTH_NAMES, normalizeAlways } from './locale/sv.js'

/**
 * Typtolkning.
 *
 * Typen är en *tolkning* som styr sortering, filter och vilka verktyg som
 * erbjuds. Den skriver aldrig om ett värde. Det är skillnaden mellan det här
 * verktyget och de som tyst gör `007` till `7` och `0730-123456` till
 * `7.30123456e8`.
 */

/** Ledande nolla betyder identifierare, inte tal. Postnummer, artikelnummer. */
const LEADING_ZERO = /^0\d/
/** Långa siffersträngar är telefon- och organisationsnummer, inte tal. */
const MAX_NUMERIC_DIGITS = 15

// Hårt mellanslag är redan normaliserat till vanligt av normalizeAlways.
const NUMBER_SV = /^[+-]?\d{1,3}(?: \d{3})*(?:,\d+)?$/
const NUMBER_PLAIN = /^[+-]?\d+(?:[.,]\d+)?$/
const NUMBER_SCI = /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-zA-ZåäöÅÄÖ]{2,}$/

const BOOL_VALUES = new Set([
  'ja', 'nej', 'sant', 'falskt', 'true', 'false', 'yes', 'no', 'x', '1', '0',
])

const ISO_DATE = /^\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const SLASHED_DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?$/
const COMPACT_DATE = /^(19|20)\d{6}$/
const NAMED_DATE = /^(?:den\s+)?(\d{1,2})[.\s]+([a-zåäö]+)\.?[\s]+(\d{4})$/i
const NAMED_DATE_EN = /^([a-zåäö]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i

/** Svenska Excel-felsträngar. En cell med `#SAKNAS!` är inte data. */
export const EXCEL_ERRORS = new Set([
  '#SAKNAS!', '#N/A', '#VÄRDEFEL!', '#VALUE!', '#DIVISION/0!', '#DIV/0!',
  '#REFERENS!', '#REF!', '#NAMN?', '#NAME?', '#OGILTIGT!', '#NUM!', '#TOM!', '#NULL!',
])

export function isExcelError(value: string): boolean {
  return EXCEL_ERRORS.has(value.trim().toUpperCase())
}

/**
 * Sant för värden som rimligen är tal.
 *
 * Ledande nollor och långa siffersträngar räknas medvetet inte som tal.
 * De ser ut som tal men är identifierare, och att typa dem som tal är hur
 * postnummer och telefonnummer förstörs.
 */
export function looksNumeric(value: string): boolean {
  const v = normalizeAlways(value).trim()
  if (v === '') return false
  const digits = v.replace(/\D/g, '')
  if (digits.length > MAX_NUMERIC_DIGITS) return false
  const unsigned = v.replace(/^[+-]/, '')
  if (LEADING_ZERO.test(unsigned)) return false
  return NUMBER_SV.test(v) || NUMBER_PLAIN.test(v) || NUMBER_SCI.test(v)
}

/**
 * Tolkar ett tal med svenska konventioner: mellanslag eller hårt mellanslag
 * som tusentalsavgränsare, komma som decimaltecken.
 */
export function parseNumber(value: string): number | null {
  if (!looksNumeric(value)) return null
  const v = normalizeAlways(value).trim().replace(/ /g, '')
  const normalized = NUMBER_SCI.test(v) ? v : v.replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function looksLikeEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

/**
 * Grov datumigenkänning för typbrickan.
 *
 * Den fullständiga tolkningen — med formatinventering och hantering av
 * tvetydiga dag/månad-format — hör hemma i datumverktyget, inte här. Det här
 * svarar bara på frågan "ser kolumnen ut att innehålla datum".
 */
export function looksLikeDate(value: string): boolean {
  const v = value.trim()
  if (v === '') return false
  if (ISO_DATE.test(v) || SLASHED_DATE.test(v) || COMPACT_DATE.test(v)) return true
  const named = NAMED_DATE.exec(v)
  if (named && MONTH_NAMES.has(named[2]!.toLowerCase())) return true
  const namedEn = NAMED_DATE_EN.exec(v)
  if (namedEn && MONTH_NAMES.has(namedEn[1]!.toLowerCase())) return true
  return false
}

export function looksBoolean(value: string): boolean {
  return BOOL_VALUES.has(value.trim().toLowerCase())
}

export interface TypeGuess {
  type: ColumnType
  /** Andel av de ifyllda värdena som stämmer med typen. */
  confidence: number
  /** Antal ifyllda unika värden som gissningen bygger på. */
  sampled: number
}

/** Under den här andelen är kolumnen text — blandat innehåll är text. */
const TYPE_THRESHOLD = 0.85

/**
 * Gissar typ ur kolumnens ordbok i stället för ur raderna.
 *
 * Ordboken innehåller varje unikt värde exakt en gång, vilket både är
 * billigare och rättvisare: en kolumn med 100 000 rader och tre unika värden
 * ska inte kräva 100 000 kontroller.
 */
export function inferType(col: Column, sampleLimit = 2000): TypeGuess {
  const dict = col.dict
  const limit = Math.min(dict.length, sampleLimit + 1)
  let filled = 0
  let numeric = 0
  let dates = 0
  let emails = 0
  let bools = 0

  for (let i = 1; i < limit; i++) {
    const value = dict[i]!
    if (value.trim() === '') continue
    if (isExcelError(value)) continue
    filled += 1
    if (looksNumeric(value)) numeric += 1
    if (looksLikeDate(value)) dates += 1
    if (looksLikeEmail(value)) emails += 1
    if (looksBoolean(value)) bools += 1
  }

  if (filled === 0) return { type: 'empty', confidence: 1, sampled: 0 }

  const candidates: Array<[ColumnType, number]> = [
    ['email', emails / filled],
    ['date', dates / filled],
    ['number', numeric / filled],
    ['bool', bools / filled],
  ]
  candidates.sort((a, b) => b[1] - a[1])
  const [type, confidence] = candidates[0]!
  if (confidence < TYPE_THRESHOLD) return { type: 'text', confidence: 1 - confidence, sampled: filled }
  return { type, confidence, sampled: filled }
}

/** Sätter typ på alla kolumner som inte har en manuellt vald typ. */
export function inferAllTypes(columns: Column[]): void {
  for (const col of columns) {
    if (col.typeLocked) continue
    col.type = inferType(col).type
  }
}

/** Sant när värdet inte går att tolka som kolumnens typ. Styr `!`-markören. */
export function violatesType(value: string, type: ColumnType): boolean {
  if (value.trim() === '') return false
  switch (type) {
    case 'number':
      return !looksNumeric(value)
    case 'date':
      return !looksLikeDate(value)
    case 'email':
      return !looksLikeEmail(value)
    case 'bool':
      return !looksBoolean(value)
    default:
      return false
  }
}

export const TYPE_BADGES: Record<ColumnType, string> = {
  text: 'Tx',
  number: '123',
  date: 'Dat',
  email: '@',
  bool: 'J/N',
  empty: '–',
}

export const TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Tal',
  date: 'Datum',
  email: 'E-post',
  bool: 'Ja/Nej',
  empty: 'Tom',
}
