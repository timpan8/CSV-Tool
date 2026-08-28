import type { Column, ColumnId, Frame, FrameId } from '../types.js'
import { createColumn, getCell, intern } from './column.js'

let frameSeq = 0

export function newFrameId(): FrameId {
  frameSeq += 1
  return `f${frameSeq.toString(36)}`
}

/**
 * Ser till att ett återläst id aldrig delas ut igen.
 *
 * Räknaren är modulnivå och börjar om vid varje sidladdning, medan ett sparat
 * id inte gör det. Utan det här kunde en fil som öppnades efter en
 * återställning få samma id som en återställd ram — och då pekar allt som
 * bär ett ram-id på fel ram, tyst.
 */
export function reserveraFrameId(id: FrameId): void {
  // Hela svansen måste vara ett tal i bas 36. `parseInt` läser annars så långt
  // den kommer och gör `finns-inte` till 30866 — ett tyst hopp framåt i
  // räknaren, precis den sortens gissning resten av filen undviker.
  if (!/^f[0-9a-z]+$/.test(id)) return
  const n = Number.parseInt(id.slice(1), 36)
  if (Number.isFinite(n) && n > frameSeq) frameSeq = n
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

/* ---------- Radoperationer ---------- */

/** En bortagen rad, sparad så att den kan komma tillbaka exakt som den var. */
export interface SavedRow {
  /** Radens position i tabellen när den togs bort. */
  index: number
  values: string[]
  flags: number[]
  /** Radens ursprungliga nummer i källfilen, eller 0 för en tillagd rad. */
  sourceRow: number
}

/**
 * Bygger om alla kolumner och radmetadata från en avbildning
 * ny position → hämta härifrån.
 *
 * `from[i] < 0` betyder "ny tom rad". All radmanipulation går genom den här,
 * så att kolumner, flaggor och radnummer aldrig kan hamna ur synk.
 */
function rebuildRows(frame: Frame, from: Int32Array, filler?: (outIndex: number) => SavedRow | null): void {
  const n = from.length
  const columnValues = frame.columns.map(() => new Uint32Array(n))
  const columnFlags = frame.columns.map(() => new Uint8Array(n))
  const sourceRow = new Uint32Array(n)

  for (let i = 0; i < n; i++) {
    const src = from[i]!
    if (src >= 0) {
      for (let c = 0; c < frame.columns.length; c++) {
        columnValues[c]![i] = frame.columns[c]!.codes[src]!
        columnFlags[c]![i] = frame.columns[c]!.flags[src]!
      }
      sourceRow[i] = frame.sourceRow[src]!
      continue
    }
    const saved = filler?.(i) ?? null
    if (!saved) continue
    for (let c = 0; c < frame.columns.length; c++) {
      const value = saved.values[c] ?? ''
      columnValues[c]![i] = intern(frame.columns[c]!, value)
      columnFlags[c]![i] = saved.flags[c] ?? 0
    }
    sourceRow[i] = saved.sourceRow
  }

  for (let c = 0; c < frame.columns.length; c++) {
    frame.columns[c]!.codes = columnValues[c]!
    frame.columns[c]!.flags = columnFlags[c]!
  }
  frame.sourceRow = sourceRow
  frame.rowCount = n
  frame.view = identityView(n)
}

/** Infogar tomma rader. De får radnummer 0, vilket visas som "tillagd". */
export function insertRows(frame: Frame, atIndex: number, count: number): void {
  if (count <= 0) return
  const at = Math.max(0, Math.min(frame.rowCount, atIndex))
  const from = new Int32Array(frame.rowCount + count)
  for (let i = 0; i < at; i++) from[i] = i
  for (let i = 0; i < count; i++) from[at + i] = -1
  for (let i = at; i < frame.rowCount; i++) from[i + count] = i
  rebuildRows(frame, from, () => ({ index: 0, values: [], flags: [], sourceRow: 0 }))
}

/**
 * Tar bort rader och returnerar dem, så att de kan sättas tillbaka.
 *
 * Det som sparas följer antalet borttagna rader, inte tabellens storlek. Att
 * kopiera hela tabellen för att kunna ångra tre borttagna rader vore fel
 * avvägning i en tabell med hundratusen rader.
 */
export function deleteRows(frame: Frame, rows: Iterable<number>): SavedRow[] {
  const doomed = new Set<number>()
  for (const r of rows) {
    if (r >= 0 && r < frame.rowCount) doomed.add(r)
  }
  if (doomed.size === 0) return []

  const saved: SavedRow[] = []
  for (const index of [...doomed].sort((a, b) => a - b)) {
    saved.push({
      index,
      values: frame.columns.map((c) => getCell(c, index)),
      flags: frame.columns.map((c) => c.flags[index]!),
      sourceRow: frame.sourceRow[index]!,
    })
  }

  const from = new Int32Array(frame.rowCount - doomed.size)
  let out = 0
  for (let i = 0; i < frame.rowCount; i++) {
    if (!doomed.has(i)) from[out++] = i
  }
  rebuildRows(frame, from)
  return saved
}

/**
 * Sätter tillbaka rader på sina ursprungliga positioner.
 *
 * Positionerna är de raderna hade *före* borttagningen, vilket gör att en
 * återställning av flera rader på en gång hamnar rätt utan omräkning.
 */
export function restoreRows(frame: Frame, saved: readonly SavedRow[]): void {
  if (saved.length === 0) return
  const ordered = [...saved].sort((a, b) => a.index - b.index)
  const n = frame.rowCount + ordered.length
  const from = new Int32Array(n)
  const insertAt = new Map<number, SavedRow>()

  let next = 0
  let src = 0
  for (let i = 0; i < n; i++) {
    if (next < ordered.length && ordered[next]!.index === i) {
      from[i] = -1
      insertAt.set(i, ordered[next]!)
      next += 1
      continue
    }
    from[i] = src++
  }
  rebuildRows(frame, from, (outIndex) => insertAt.get(outIndex) ?? null)
}

/** Dubblerar rader; kopian läggs direkt efter originalet. */
export function duplicateRows(frame: Frame, rows: Iterable<number>): void {
  const wanted = new Set<number>()
  for (const r of rows) {
    if (r >= 0 && r < frame.rowCount) wanted.add(r)
  }
  if (wanted.size === 0) return

  const from = new Int32Array(frame.rowCount + wanted.size)
  const isCopy = new Uint8Array(from.length)
  let out = 0
  for (let i = 0; i < frame.rowCount; i++) {
    from[out++] = i
    if (wanted.has(i)) {
      isCopy[out] = 1
      from[out++] = i
    }
  }
  rebuildRows(frame, from)
  // Kopian kommer inte från filen. Låter man båda behålla radnumret pekar två
  // rader på samma rad i källan, och "rad 47" slutar vara ett entydigt svar.
  for (let i = 0; i < frame.rowCount; i++) {
    if (isCopy[i] === 1) frame.sourceRow[i] = 0
  }
}

/**
 * Sant när två ramar bär exakt samma innehåll.
 *
 * Används för att upptäcka att samma fil öppnats två gånger — ett vanligt
 * misstag när man hämtar exporter ur flera system och de heter nästan samma
 * sak.
 *
 * Jämförelsen är exakt och inte en hash. Den avbryter vid första skillnaden,
 * så två olika filer kostar oftast en handfull jämförelser; hela svepet
 * betalas bara när filerna faktiskt är lika, och då är svaret värt det.
 * Ordböckerna får jämföras rakt av eftersom interneringen följer
 * radordningen: två identiska filer lästa på samma sätt ger identiska
 * ordböcker i identisk ordning.
 */
export function sammaInnehall(a: Frame, b: Frame): boolean {
  if (a === b) return true
  if (a.rowCount !== b.rowCount || a.columns.length !== b.columns.length) return false
  for (let c = 0; c < a.columns.length; c++) {
    const x = a.columns[c]!
    const y = b.columns[c]!
    if (x.name !== y.name || x.dict.length !== y.dict.length) return false
    for (let d = 0; d < x.dict.length; d++) {
      if (x.dict[d] !== y.dict[d]) return false
    }
    for (let r = 0; r < a.rowCount; r++) {
      if (x.codes[r] !== y.codes[r]) return false
    }
  }
  return true
}
