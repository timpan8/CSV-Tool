import type { ColumnId, Frame } from '../core/types.js'
import { getCell, matchDictionary } from '../core/frame/column.js'
import { findColumn, identityView } from '../core/frame/frame.js'
import { violatesType } from '../core/infer.js'
import { normalizeAlways, stripDiacritics } from '../core/locale/sv.js'

/**
 * Beskrivningen av vad som visas.
 *
 * Sökning, och senare filter och sortering, skriver alla till `Frame.view`.
 * Utan en gemensam beskrivning skulle de skriva över varandra i den ordning
 * användaren råkar klicka. Här räknas vyn om från specifikationen varje gång,
 * så resultatet beror på vad som är valt — inte på vad som klickades sist.
 */
export interface ViewSpec {
  /** Fritextsökning över alla kolumner. Accentokänslig. */
  search?: string
  /** Visa bara rader där den här kolumnen inte går att tolka som sin typ. */
  invalidIn?: ColumnId
}

export const TOM_VY: ViewSpec = {}

export function harBegransning(spec: ViewSpec): boolean {
  return (spec.search ?? '').trim() !== '' || spec.invalidIn !== undefined
}

/**
 * Nyckel för sökjämförelse: normaliserad, utan accenter, gemener.
 *
 * `oberg` ska hitta `Öberg`. Det är rätt för *sökning*, där användaren letar
 * och själv ser träffarna — till skillnad från matchning vid sammanslagning,
 * där samma normalisering tyst skulle kunna para ihop `För` med `For`.
 */
function sokNyckel(value: string): string {
  return stripDiacritics(normalizeAlways(value)).toLocaleLowerCase('sv')
}

export interface ViewResult {
  view: Uint32Array
  /** Antal kolumner som hade minst en träff. Visas i sökraden. */
  kolumnerMedTraff: number
}

/**
 * Räknar om vilka rader som ska visas.
 *
 * Sökningen körs på varje kolumns ordbok och inte på raderna: en kolumn med
 * hundratusen rader och tre unika värden kostar tre strängjämförelser. Först
 * därefter går vi ett heltalssvep över raderna.
 */
export function computeView(frame: Frame, spec: ViewSpec): ViewResult {
  const fraga = (spec.search ?? '').trim()

  if (spec.invalidIn !== undefined) {
    const col = findColumn(frame, spec.invalidIn)
    if (col) {
      const mask = matchDictionary(col, (v) => v !== '' && violatesType(v, col.type))
      const traffar: number[] = []
      for (let r = 0; r < frame.rowCount; r++) {
        if (mask[col.codes[r]!]! === 1) traffar.push(r)
      }
      return { view: Uint32Array.from(traffar), kolumnerMedTraff: traffar.length > 0 ? 1 : 0 }
    }
  }

  if (fraga === '') {
    return { view: identityView(frame.rowCount), kolumnerMedTraff: 0 }
  }

  const nyckel = sokNyckel(fraga)
  const masker: Uint8Array[] = []
  let kolumnerMedTraff = 0
  for (const col of frame.columns) {
    if (col.hidden) {
      masker.push(new Uint8Array(col.dict.length))
      continue
    }
    let nagon = false
    const mask = matchDictionary(col, (v) => {
      if (v === '') return false
      const traff = sokNyckel(v).includes(nyckel)
      if (traff) nagon = true
      return traff
    })
    if (nagon) kolumnerMedTraff += 1
    masker.push(mask)
  }

  const traffar: number[] = []
  rader: for (let r = 0; r < frame.rowCount; r++) {
    for (let c = 0; c < frame.columns.length; c++) {
      if (masker[c]![frame.columns[c]!.codes[r]!]! === 1) {
        traffar.push(r)
        continue rader
      }
    }
  }
  return { view: Uint32Array.from(traffar), kolumnerMedTraff }
}

/** Sant om raden innehåller sökträffen — används för att markera i cellen. */
export function cellenMatchar(value: string, spec: ViewSpec): boolean {
  const fraga = (spec.search ?? '').trim()
  if (fraga === '' || value === '') return false
  return sokNyckel(value).includes(sokNyckel(fraga))
}

/** Läser ut en cell via vyindex, för aggregat och urklipp. */
export function cellIVy(frame: Frame, viewRow: number, columnIndex: number): string {
  const col = frame.columns[columnIndex]
  const physical = frame.view[viewRow]
  if (!col || physical === undefined) return ''
  return getCell(col, physical)
}
