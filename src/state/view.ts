import type { ColumnId, Frame } from '../core/types.js'
import { getCell, matchDictionary } from '../core/frame/column.js'
import { findColumn } from '../core/frame/frame.js'
import { violatesType } from '../core/infer.js'
import { normalizeAlways, stripDiacritics } from '../core/locale/sv.js'
import { ANDRAD, PROBLEM, uppslag, type Forhandsvisning } from './preview.js'
import { utgangslage, type Ordning } from './ordning.js'
import type { Sorteringsniva } from '../core/ops/sort.js'

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
  /**
   * Begränsa till raderna en pågående förhandsvisning ändrar, eller till dem
   * den har problem med. Gäller bara medan en förhandsvisning är öppen.
   */
  visaBara?: 'andrade' | 'problem'
  /**
   * Sorteringens *spec*. Den beräknade ordningen ligger på fliken, eftersom
   * den är en cache och inte en beskrivning.
   */
  sortering?: Sorteringsniva[]
}

export const TOM_VY: ViewSpec = {}

/**
 * Sant när något *döljer* rader.
 *
 * Sortering räknas inte hit. Den ändrar ordningen men gömmer ingenting, och
 * att låta den tända "X av Y rader" eller exportdialogens filtervarning vore
 * att varna för något som inte hänt.
 */
export function harBegransning(spec: ViewSpec): boolean {
  return (
    (spec.search ?? '').trim() !== '' ||
    spec.invalidIn !== undefined ||
    spec.visaBara !== undefined
  )
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
export function computeView(
  frame: Frame,
  spec: ViewSpec,
  forh: Forhandsvisning | null = null,
  ordning: Ordning | null = null,
): ViewResult {
  return begransaTillForhandsvisning(frame, grundvy(frame, spec, ordning), spec, forh)
}

/**
 * Filtrerar en färdig vy till de rader en förhandsvisning ändrar.
 *
 * Att lägga det som ett efterled i stället för en egen gren gör att det
 * komponerar: man kan söka efter ett namn och samtidigt se bara de av
 * träffarna som datumomskrivningen inte klarar.
 */
function begransaTillForhandsvisning(
  frame: Frame,
  grund: ViewResult,
  spec: ViewSpec,
  forh: Forhandsvisning | null,
): ViewResult {
  if (spec.visaBara === undefined || forh === null) return grund
  const col = findColumn(frame, forh.colId)
  if (!col) return grund
  const bit = spec.visaBara === 'problem' ? PROBLEM : ANDRAD
  const kvar: number[] = []
  for (let i = 0; i < grund.view.length; i++) {
    const r = grund.view[i]!
    if (((forh.status[uppslag(forh, col, r)] ?? 0) & bit) !== 0) kvar.push(r)
  }
  return { ...grund, view: Uint32Array.from(kvar) }
}

/**
 * Vilka rader som visas, i vilken ordning.
 *
 * Sveper alltid **utgångsordningen** och aldrig `0..rowCount`. Det är den
 * detaljen som gör att sorteringen överlever filtreringen: resultatet blir en
 * delföljd av ordningen, aldrig en omsortering av den.
 */
function grundvy(frame: Frame, spec: ViewSpec, ordning: Ordning | null): ViewResult {
  const fraga = (spec.search ?? '').trim()
  const utgang = utgangslage(frame, ordning)

  if (spec.invalidIn !== undefined) {
    const col = findColumn(frame, spec.invalidIn)
    if (col) {
      const mask = matchDictionary(col, (v) => v !== '' && violatesType(v, col.type))
      const traffar: number[] = []
      for (let i = 0; i < utgang.length; i++) {
        const r = utgang[i]!
        if (mask[col.codes[r]!]! === 1) traffar.push(r)
      }
      return { view: Uint32Array.from(traffar), kolumnerMedTraff: traffar.length > 0 ? 1 : 0 }
    }
  }

  if (fraga === '') {
    // Utan filter *är* vyn ordningen, och de får dela array. Det bygger på
    // att `frame.view` aldrig ändras på plats någonstans i kodbasen — den
    // tilldelas alltid en ny array — så en delad referens kan inte förstöra
    // den frusna ordningen.
    return { view: utgang, kolumnerMedTraff: 0 }
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
  rader: for (let i = 0; i < utgang.length; i++) {
    const r = utgang[i]!
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
