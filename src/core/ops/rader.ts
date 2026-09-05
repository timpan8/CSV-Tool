import type { Column, ColumnId, Frame } from '../types.js'
import { createColumn, getCell, intern } from '../frame/column.js'
import { findColumn, identityView, newFrameId } from '../frame/frame.js'
import { inferAllTypes } from '../infer.js'
import { normalizeAlways } from '../locale/sv.js'

/**
 * Delar en kolumn på höjden i stället för på bredden.
 *
 * `Dela kolumnen` gör flera kolumner av ett värde. Det här gör flera *rader*.
 * Skillnaden är hela poängen med två verktyg: adresser klistrade ur Outlook
 * ligger som `a <x@y>; b <z@w>; c <q@r>` i en enda cell, och de är inte tre
 * fält på en person — de är tre personer.
 *
 * Radantalet ändras, och därför går resultatet inte att uttrycka som en
 * `Forhandsvisning`: det finns ingen spökkolumn att rita när det inte längre
 * går en utrad på varje inrad. Resultatet blir i stället en ny flik, som hos
 * `gruppera` och pivoten, och originalet rörs aldrig.
 */

export interface Radelning {
  colId: ColumnId
  /** Tecknet eller texten det delas vid. */
  avgransare: string
  /** Trimma blanksteg runt varje del. */
  trimma: boolean
  /**
   * Hoppa över tomma delar.
   *
   * `a; b;` slutar med en avgränsare och ger annars en tom tredje rad. En rad
   * utan innehåll är sällan vad någon menade med den semikolonen.
   */
  hoppaTomma: boolean
  /** Namn på den nya fliken. */
  namn: string
}

export interface Radelningsinventering {
  /** Rader in — vyns rader, inte filens. */
  kalla: number
  /** Rader ut. */
  resultat: number
  /** Rader vars värde saknar avgränsare. De följer med som de är. */
  odelade: number
  /** Flest delar något värde gav. */
  flest: number
  /** Upp till tre `före → efter` ur den egna filen. */
  exempel: { fore: string; efter: string[] }[]
}

/** Delarna ett värde ger. Ett värde utan avgränsare ger sig självt. */
function delaTillDelar(rawValue: string, inst: Radelning): string[] {
  const value = normalizeAlways(rawValue)
  if (inst.avgransare === '') return [value]
  const delar = value.split(inst.avgransare).map((d) => (inst.trimma ? d.trim() : d))
  if (!inst.hoppaTomma) return delar
  const kvar = delar.filter((d) => d !== '')
  // En cell som bara innehöll avgränsare ger ändå en rad. Att låta en rad
  // försvinna för att en cell var tom vore dataförlust utan att någon bad om
  // det — övriga kolumner på den raden kan mycket väl vara ifyllda.
  return kvar.length === 0 ? [''] : kvar
}

/**
 * Delarna per ordbokspost, räknade en gång.
 *
 * En kolumn med hundratusen rader och tre unika värden kostar tre delningar,
 * precis som `mapColumnValues`. Delningen beror bara på det egna värdet, så
 * genvägen är gratis.
 */
function delarPerKod(kall: Column, inst: Radelning): string[][] {
  const karta = new Array<string[]>(kall.dict.length)
  for (let kod = 0; kod < kall.dict.length; kod++) {
    karta[kod] = delaTillDelar(kall.dict[kod]!, inst)
  }
  return karta
}

/** Vad delningen skulle ge, så panelen kan säga det före körningen. */
export function inventeraRadelning(frame: Frame, inst: Radelning): Radelningsinventering {
  const kall = findColumn(frame, inst.colId)
  if (!kall) return { kalla: 0, resultat: 0, odelade: 0, flest: 0, exempel: [] }

  const karta = delarPerKod(kall, inst)
  const view = frame.view
  let resultat = 0
  let odelade = 0
  let flest = 0
  const exempel: { fore: string; efter: string[] }[] = []

  for (let i = 0; i < view.length; i++) {
    const delar = karta[kall.codes[view[i]!]!]!
    resultat += delar.length
    if (delar.length < 2) odelade += 1
    else if (exempel.length < 3) exempel.push({ fore: getCell(kall, view[i]!), efter: delar })
    if (delar.length > flest) flest = delar.length
  }

  return { kalla: view.length, resultat, odelade, flest, exempel }
}

/**
 * Bygger en ny ram där varje del blir en egen rad.
 *
 * Körningen går på **det du ser**, som grupperingen: har du filtrerat är det
 * de raderna som delas. En delning som tyst tog med bortfiltrerade rader vore
 * samma sorts fel som en summa som räknar dem.
 *
 * Övriga kolumners värden följer med ner på de nya raderna. De kopieras via en
 * kodkarta per kolumn — ett `intern` per ordbokspost och sedan ett heltalssvep
 * — i stället för cell för cell, som `skapaKolumnerFran` redan gör.
 */
export function delaTillRader(
  frame: Frame,
  inst: Radelning,
): { frame: Frame } & Radelningsinventering {
  const inventering = inventeraRadelning(frame, inst)
  const kall = findColumn(frame, inst.colId)
  if (!kall) return { frame, ...inventering }

  const karta = delarPerKod(kall, inst)
  const view = frame.view
  const antal = inventering.resultat

  const kolumner = frame.columns.map((c) => {
    const col = createColumn(c.name, antal)
    col.type = c.type
    col.typeLocked = c.typeLocked
    col.hidden = c.hidden
    col.width = c.width
    if (c.sortordning) col.sortordning = c.sortordning
    return col
  })

  /*
   * En kodkarta per kolumn: gamla ordbokskoder till nya.
   *
   * Kolumnen som delas får ingen karta — dess värden är nya och interneras
   * per del.
   */
  const kartor = frame.columns.map((c, i) =>
    c.id === kall.id ? null : new Uint32Array(c.dict.length).map((_, kod) => intern(kolumner[i]!, c.dict[kod]!)),
  )

  const sourceRow = new Uint32Array(antal)
  let ut = 0
  for (let i = 0; i < view.length; i++) {
    const fysisk = view[i]!
    const delar = karta[kall.codes[fysisk]!]!
    for (const del of delar) {
      for (let k = 0; k < frame.columns.length; k++) {
        const c = frame.columns[k]!
        const mal = kolumner[k]!
        mal.codes[ut] = c.id === kall.id ? intern(mal, del) : kartor[k]![c.codes[fysisk]!]!
        // Flaggorna följer med, så `Padded` och `ParseError` inte tappas.
        mal.flags[ut] = c.flags[fysisk]!
      }
      // Raden kom från den här filraden — alla delarna gjorde det. Radnumret
      // i kanten är då fortfarande en väg tillbaka till originalet.
      sourceRow[ut] = frame.sourceRow[fysisk] ?? 0
      ut += 1
    }
  }

  // Den delade kolumnen innehåller något annat än förut och ska läsas om.
  // `inferAllTypes` rör inte låsta kolumner, så användarens egna val står kvar.
  inferAllTypes(kolumner)

  const resultat: Frame = {
    id: newFrameId(),
    name: inst.namn.trim() === '' ? `${frame.name} delad` : inst.namn.trim(),
    columns: kolumner,
    rowCount: antal,
    view: identityView(antal),
    sourceRow,
    meta: { warnings: [] },
  }

  return { frame: resultat, ...inventering }
}
