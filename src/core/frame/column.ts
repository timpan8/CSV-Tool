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

/* ---------- Ögonblicksbilder och transformer ---------- */

/**
 * En kolumns fullständiga tillstånd, kopierat.
 *
 * Det här är strukturdelningen i praktiken: en åtgärd som rör en kolumn
 * kopierar bara den kolumnen, medan övriga delas vidare med referens. För
 * 200 000 rader är kostnaden fyra byte per rad för koderna och en för
 * flaggorna — inte en sträng per cell.
 */
export interface ColumnSnapshot {
  dict: string[]
  codes: Uint32Array
  flags: Uint8Array
  type: ColumnType
  typeLocked: boolean
}

export function snapshotColumn(col: Column): ColumnSnapshot {
  return {
    dict: col.dict.slice(),
    codes: col.codes.slice(),
    flags: col.flags.slice(),
    type: col.type,
    typeLocked: col.typeLocked,
  }
}

/**
 * Återställer en kolumn från en ögonblicksbild.
 *
 * Kopierar ur bilden i stället för att ta över den, så att samma bild kan
 * användas igen. Ångra → gör om → ångra måste fungera hur många gånger som
 * helst.
 */
export function restoreColumn(col: Column, snap: ColumnSnapshot): void {
  col.dict = snap.dict.slice()
  col.dictIndex = new Map()
  for (let i = 0; i < col.dict.length; i++) col.dictIndex.set(col.dict[i]!, i)
  col.codes = snap.codes.slice()
  col.flags = snap.flags.slice()
  col.type = snap.type
  col.typeLocked = snap.typeLocked
}

/**
 * Bygger om ordboken genom att mappa varje unikt värde, och räknar om
 * koderna.
 *
 * Transformen körs en gång per *unikt* värde, inte per rad. En kolumn med
 * 100 000 rader och 300 orter kostar 300 anrop. Två olika värden kan bli
 * lika efter transformen (`"Malmö "` och `"Malmö"` efter trimning), vilket
 * hanteras genom att den nya ordboken interneras på nytt.
 *
 * Tomma celler lämnas alltid orörda: en städning ska aldrig fylla i något
 * som var tomt.
 */
function buildMapping(col: Column, fn: (value: string) => string) {
  const dict: string[] = ['']
  const dictIndex = new Map<string, number>([['', 0]])
  const remap = new Uint32Array(col.dict.length)
  const changed = new Uint8Array(col.dict.length)

  for (let d = 1; d < col.dict.length; d++) {
    const before = col.dict[d]!
    const after = fn(before)
    if (after !== before) changed[d] = 1
    let code = dictIndex.get(after)
    if (code === undefined) {
      code = dict.length
      dict.push(after)
      dictIndex.set(after, code)
    }
    remap[d] = code
  }
  return { dict, dictIndex, remap, changed }
}

/** Antal celler som skulle ändras, utan att ändra något. */
export function countMappedChanges(col: Column, fn: (value: string) => string): number {
  const { changed } = buildMapping(col, fn)
  let n = 0
  for (let r = 0; r < col.codes.length; r++) {
    if (changed[col.codes[r]!]! === 1) n += 1
  }
  return n
}

/** Kör transformen och returnerar antal ändrade celler. */
export function mapColumnValues(col: Column, fn: (value: string) => string): number {
  const { dict, dictIndex, remap, changed } = buildMapping(col, fn)
  let n = 0
  const codes = col.codes
  for (let r = 0; r < codes.length; r++) {
    const old = codes[r]!
    if (changed[old]! === 1) n += 1
    codes[r] = remap[old]!
  }
  col.dict = dict
  col.dictIndex = dictIndex
  return n
}

/**
 * Matchar de unika värdena mot ett predikat och returnerar en mask per
 * ordbokspost.
 *
 * Grunden för sökning och filtrering: en jämförelse per unikt värde, sedan
 * ett heltalssvep över raderna.
 */
export function matchDictionary(col: Column, predicate: (value: string) => boolean): Uint8Array {
  const mask = new Uint8Array(col.dict.length)
  for (let d = 0; d < col.dict.length; d++) {
    mask[d] = predicate(col.dict[d]!) ? 1 : 0
  }
  return mask
}
