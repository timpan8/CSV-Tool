import { Flag, type Column, type ColumnId, type ColumnType } from '../types.js'

let columnSeq = 0

/** Genererar ett stabilt kolumn-id. Ids överlever namnbyten och flyttar. */
export function newColumnId(): ColumnId {
  columnSeq += 1
  return `c${columnSeq.toString(36)}`
}

/** Endast för tester: gör id-serien förutsägbar. */
export function resetColumnIds(): void {
  columnSeq = 0
}

export function createColumn(name: string, rowCount: number, type: ColumnType = 'text'): Column {
  return {
    id: newColumnId(),
    name,
    type,
    typeLocked: false,
    hidden: false,
    width: null,
    // Index 0 är alltid tomma strängen, så en oskriven cell är kod 0.
    dict: [''],
    codes: new Uint32Array(rowCount),
    flags: new Uint8Array(rowCount),
    dictIndex: new Map([['', 0]]),
  }
}

/**
 * Lägger till ett värde i ordboken och returnerar dess kod.
 *
 * Ordboken växer bara med unika värden, så en kolumn med 300 orter över
 * 100 000 rader har 300 poster. Det är det som gör filter, värdelistor och
 * sorteringsrang billiga: de räknas per unikt värde, inte per rad.
 */
export function intern(col: Column, value: string): number {
  const existing = col.dictIndex.get(value)
  if (existing !== undefined) return existing
  const code = col.dict.length
  col.dict.push(value)
  col.dictIndex.set(value, code)
  return code
}

/** Läser en cell. Enda vägen in i celldata — håll den så här. */
export function getCell(col: Column, row: number): string {
  return col.dict[col.codes[row]!]!
}

/**
 * Skriver en cell och returnerar den föregående koden, så att åtgärden går
 * att ångra utan att kopiera kolumnen.
 *
 * Redigeringar skrivs rakt in i ordboken i stället för i ett sidolager. Det
 * ger en enda läsväg, men betyder att sorteringsrangen måste ogiltigförklaras
 * när ordboken växer — se `invalidateRankCache`.
 */
export function setCell(col: Column, row: number, value: string): number {
  const prev = col.codes[row]!
  col.codes[row] = intern(col, value)
  col.flags[row]! |= Flag.UserEdited
  return prev
}

/** Återställer en cell till en tidigare kod (för ångra). */
export function restoreCell(col: Column, row: number, code: number, flags: number): void {
  col.codes[row] = code
  col.flags[row] = flags
}

export function hasFlag(col: Column, row: number, bit: number): boolean {
  return (col.flags[row]! & bit) !== 0
}

export function setFlag(col: Column, row: number, bit: number): void {
  col.flags[row]! |= bit
}

export function clearFlag(col: Column, row: number, bit: number): void {
  col.flags[row]! &= ~bit
}

/**
 * Antal förekomster per ordbokspost, över de rader som finns i `rows`.
 *
 * Detta är hela grunden för snabbfiltrets värdelista ("Malmö 412") och för
 * kolumnstatistiken. En enda räknarslinga, inga strängjämförelser.
 */
export function valueCounts(col: Column, rows: Uint32Array): Uint32Array {
  const counts = new Uint32Array(col.dict.length)
  for (let i = 0; i < rows.length; i++) counts[col.codes[rows[i]!]!]! += 1
  return counts
}

/** Antal icke-tomma celler över `rows`. */
export function filledCount(col: Column, rows: Uint32Array): number {
  let n = 0
  for (let i = 0; i < rows.length; i++) {
    if (col.codes[rows[i]!]! !== 0) n += 1
  }
  return n
}

/** Antal rader med en given flaggbit satt. */
export function flagCount(col: Column, rows: Uint32Array, bit: number): number {
  let n = 0
  for (let i = 0; i < rows.length; i++) {
    if ((col.flags[rows[i]!]! & bit) !== 0) n += 1
  }
  return n
}
