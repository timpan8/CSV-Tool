import type { Column, Frame } from '../core/types.js'
import { getCell, matchDictionary } from '../core/frame/column.js'
import { findColumn } from '../core/frame/frame.js'
import { normalizeAlways, stripDiacritics } from '../core/locale/sv.js'
import { ANDRAD, PROBLEM, uppslag, type Forhandsvisning } from './preview.js'
import { utgangslage, type Ordning } from './ordning.js'
import type { Sorteringsniva } from '../core/ops/sort.js'
import { aktivaRegler, tillampaFilter, TOMT_FILTER, type Filter } from '../core/ops/filter.js'
import type { Dubblettnyckel } from '../core/ops/duplicates.js'

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
  /** Regellistan. Reglerna ligger kvar även avslagna eller ofärdiga. */
  filter?: Filter
  /**
   * Visa bara rader som ingår i en dubblettgrupp.
   *
   * Nyckeln bor här, men grupperna räknas i flikens `ordning` — medlemskapet
   * och gruppordningen faller ur samma beräkning och måste frysas ihop.
   */
  dubbletter?: Dubblettnyckel
}

export const TOM_VY: ViewSpec = {}

/**
 * Sant när något *döljer* rader.
 *
 * Sortering räknas inte hit. Den ändrar ordningen men gömmer ingenting, och
 * att låta den tända "X av Y rader" eller exportdialogens filtervarning vore
 * att varna för något som inte hänt.
 */
export function harBegransning(spec: ViewSpec, frame?: Frame): boolean {
  const harFilter =
    spec.filter !== undefined &&
    (frame ? aktivaRegler(frame, spec.filter).length > 0 : spec.filter.regler.length > 0)
  return (
    (spec.search ?? '').trim() !== '' ||
    spec.visaBara !== undefined ||
    spec.dubbletter !== undefined ||
    harFilter
  )
}

/** Vy-inställningar som döljer rader. Sorteringen är inte en av dem. */
export function utanBegransning(spec: ViewSpec): ViewSpec {
  const { sortering } = spec
  return sortering ? { sortering } : {}
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
  forh: readonly Forhandsvisning[] = [],
  ordning: Ordning | null = null,
): ViewResult {
  const grund = grundvy(frame, spec, ordning)
  const filtrerad = begransaTillFilter(frame, grund, spec)
  const dubbletter = begransaTillDubbletter(filtrerad, spec, ordning)
  return begransaTillForhandsvisning(frame, dubbletter, spec, forh)
}

/**
 * Filtrerar en färdig vy genom regellistan.
 *
 * Ett efterled, precis som förhandsvisningens: resultatet blir en delföljd av
 * det som kom in, så sortering och sökning överlever filtret.
 */
function begransaTillFilter(frame: Frame, grund: ViewResult, spec: ViewSpec): ViewResult {
  if (spec.filter === undefined || spec.filter.regler.length === 0) return grund
  const { rader } = tillampaFilter(frame, spec.filter, grund.view)
  return { ...grund, view: rader }
}

/** Begränsar till raderna som ingår i en dubblettgrupp. */
function begransaTillDubbletter(
  grund: ViewResult,
  spec: ViewSpec,
  ordning: Ordning | null,
): ViewResult {
  if (spec.dubbletter === undefined) return grund
  const grupper = ordning?.grupper
  if (!grupper) return { ...grund, view: new Uint32Array(0) }
  const kvar: number[] = []
  for (let i = 0; i < grund.view.length; i++) {
    const r = grund.view[i]!
    if (grupper.grupp[r]! !== 0) kvar.push(r)
  }
  return { ...grund, view: Uint32Array.from(kvar) }
}

/** Regelfel att visa i gränssnittet, räknade på hela ramen. */
export function filterfel(frame: Frame, spec: ViewSpec) {
  return tillampaFilter(frame, spec.filter ?? TOMT_FILTER, identityRader(frame)).fel
}

function identityRader(frame: Frame): Uint32Array {
  return Uint32Array.from({ length: frame.rowCount }, (_, i) => i)
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
  forh: readonly Forhandsvisning[],
): ViewResult {
  if (spec.visaBara === undefined || forh.length === 0) return grund
  // Körs verktyget över flera kolumner räcker det att raden är ändrad i en
  // av dem. Att kräva alla vore att gömma just den rad man letar efter.
  const par = forh
    .map((f) => ({ f, col: findColumn(frame, f.colId) }))
    .filter((p): p is { f: Forhandsvisning; col: Column } => p.col !== undefined)
  if (par.length === 0) return grund
  const bit = spec.visaBara === 'problem' ? PROBLEM : ANDRAD
  const kvar: number[] = []
  for (let i = 0; i < grund.view.length; i++) {
    const r = grund.view[i]!
    if (par.some(({ f, col }) => ((f.status[uppslag(f, col, r)] ?? 0) & bit) !== 0)) kvar.push(r)
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
