import type { Column, ColumnId, Frame, FrameId } from '../types.js'
import { createColumn, getCell, intern } from './column.js'

let frameSeq = 0

export function newFrameId(): FrameId {
  frameSeq += 1
  return `f${frameSeq.toString(36)}`
}

/** Identitetsvyn: alla rader i ursprunglig ordning. */
export function identityView(rowCount: number): Uint32Array {
  const view = new Uint32Array(rowCount)
  for (let i = 0; i < rowCount; i++) view[i] = i
  return view
}

export function createFrame(name: string, columns: Column[], rowCount: number): Frame {
  const sourceRow = new Uint32Array(rowCount)
  for (let i = 0; i < rowCount; i++) sourceRow[i] = i + 1
  return {
    id: newFrameId(),
    name,
    columns,
    rowCount,
    view: identityView(rowCount),
    sourceRow,
    meta: { warnings: [] },
  }
}

export function findColumn(frame: Frame, id: ColumnId): Column | undefined {
  return frame.columns.find((c) => c.id === id)
}

export function columnIndex(frame: Frame, id: ColumnId): number {
  return frame.columns.findIndex((c) => c.id === id)
}

/** Kolumner i visningsordning, dolda bortsorterade. */
export function visibleColumns(frame: Frame): Column[] {
  return frame.columns.filter((c) => !c.hidden)
}

/**
 * Ger ett kolumnnamn som inte krockar med befintliga.
 * `Namn` → `Namn (2)` → `Namn (3)`. Samma regel används för dubbletta
 * rubriker vid import och för kolumnkrockar vid sammanslagning, så att
 * användaren bara behöver lära sig ett mönster.
 */
export function uniqueColumnName(existing: Iterable<string>, wanted: string): string {
  const taken = new Set<string>()
  for (const name of existing) taken.add(name.toLocaleLowerCase('sv'))
  const base = wanted.trim() === '' ? 'Kolumn' : wanted.trim()
  if (!taken.has(base.toLocaleLowerCase('sv'))) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`
    if (!taken.has(candidate.toLocaleLowerCase('sv'))) return candidate
  }
}

/** Flyttar en kolumn till ett nytt index i visningsordningen. */
export function moveColumn(frame: Frame, id: ColumnId, toIndex: number): void {
  const from = columnIndex(frame, id)
  if (from === -1) return
  const clamped = Math.max(0, Math.min(frame.columns.length - 1, toIndex))
  const [col] = frame.columns.splice(from, 1)
  frame.columns.splice(clamped, 0, col!)
}

/** Infogar en ny kolumn, valfritt förifylld med ett fast värde. */
export function insertColumn(
  frame: Frame,
  name: string,
  atIndex: number,
  fill = '',
): Column {
  const col = createColumn(
    uniqueColumnName(frame.columns.map((c) => c.name), name),
    frame.rowCount,
  )
  if (fill !== '') {
    const code = intern(col, fill)
    col.codes.fill(code)
  }
  const clamped = Math.max(0, Math.min(frame.columns.length, atIndex))
  frame.columns.splice(clamped, 0, col)
  return col
}

export function removeColumn(frame: Frame, id: ColumnId): Column | undefined {
  const at = columnIndex(frame, id)
  if (at === -1) return undefined
  return frame.columns.splice(at, 1)[0]
}

/** Kopierar en kolumn med allt innehåll, under ett nytt id och namn. */
export function duplicateColumn(frame: Frame, id: ColumnId): Column | undefined {
  const src = findColumn(frame, id)
  if (!src) return undefined
  const copy = createColumn(
    uniqueColumnName(frame.columns.map((c) => c.name), `${src.name} (kopia)`),
    frame.rowCount,
    src.type,
  )
  copy.dict = src.dict.slice()
  copy.dictIndex = new Map(src.dictIndex)
  copy.codes = src.codes.slice()
  copy.flags = src.flags.slice()
  copy.typeLocked = src.typeLocked
  frame.columns.splice(columnIndex(frame, id) + 1, 0, copy)
  return copy
}

/** Läser en hel rad som strängar, i visningsordning. */
export function readRow(frame: Frame, physicalRow: number, columns = frame.columns): string[] {
  return columns.map((c) => getCell(c, physicalRow))
}

/**
 * Fysiska rader som är helt tomma i samtliga kolumner.
 * Excel skriver ofta rader som bara är avgränsare (`;;;;;`), och de blir
 * annars lika många tomma personer i en utskickslista.
 */
export function findEmptyRows(frame: Frame): number[] {
  const rows: number[] = []
  outer: for (let r = 0; r < frame.rowCount; r++) {
    for (const col of frame.columns) {
      if (col.codes[r]! !== 0) continue outer
    }
    rows.push(r)
  }
  return rows
}

/** Kolumner där varje cell är tom. Föreslås för borttagning vid import. */
export function findEmptyColumns(frame: Frame): ColumnId[] {
  return frame.columns
    .filter((col) => {
      for (let r = 0; r < frame.rowCount; r++) if (col.codes[r]! !== 0) return false
      return true
    })
    .map((c) => c.id)
}

/**
 * Behåller endast de angivna fysiska raderna och packar om kolumnerna.
 *
 * Detta är den enda operation som faktiskt kastar rader. Filtrering gör det
 * aldrig — den skriver bara om `view`.
 */
export function keepRows(frame: Frame, keep: Uint32Array): void {
  const n = keep.length
  for (const col of frame.columns) {
    const codes = new Uint32Array(n)
    const flags = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const src = keep[i]!
      codes[i] = col.codes[src]!
      flags[i] = col.flags[src]!
    }
    col.codes = codes
    col.flags = flags
  }
  const sourceRow = new Uint32Array(n)
  for (let i = 0; i < n; i++) sourceRow[i] = frame.sourceRow[keep[i]!]!
  frame.sourceRow = sourceRow
  frame.rowCount = n
  frame.view = identityView(n)
}
