import type { Column, ColumnId, Frame } from '../types.js'
import { createColumn, intern } from '../frame/column.js'
import { findColumn, identityView, newFrameId, uniqueColumnName, visibleColumns } from '../frame/frame.js'
import { inferAllTypes } from '../infer.js'
import { hittaAlias } from './rubriker.js'

/**
 * Stapla flera filer på varandra.
 *
 * Etapp 5 löste sidled: två filer som hör ihop rad för rad. Det här är den
 * andra halvan — tolv månadsfiler ur samma system, tre säljares kundlistor,
 * fyra kommuners deltagarlistor. Samma sorts data, men rubrikerna heter
 * olika, och det är hela problemet: `Namn` i den ena, `Name` i den andra,
 * `kundnamn` i den tredje.
 *
 * **Varje målkolumn räknas en gång per unikt värde, inte per rad.** Den
 * uppenbara implementationen — slå upp varje cellvärde i målordboken medan man
 * kopierar — kostar en hashuppslagning per cell, alltså tio miljoner för fem
 * filer med 100 000 rader och tjugo kolumner. I stället interneras varje
 * källkolumns *ordbok* en gång till en omskrivningstabell, och sedan är
 * kopieringen ett heltalssvep. Det är samma princip som `mapColumnValues`,
 * `byggNycklar` och `hittaDubbletter` redan följer.
 *
 * **En kolumn som saknas i en fil kostar ingenting.** Kod 0 är alltid tomma
 * strängen, så blocket lämnas orört i stället för att fyllas.
 */

/** Var en målkolumns värden hämtas i en källfil. */
export type Hamtning = { fran: 'kolumn'; colId: ColumnId } | { fran: 'tomt' }

export const TOMT: Hamtning = { fran: 'tomt' }

export interface Malkolumn {
  /** Namnet i resultatet. */
  namn: string
  /** En hämtning per källa, i samma ordning som `kallor`. */
  hamtning: Hamtning[]
  /**
   * Med i resultatet. `null` betyder obeslutad och spärrar körningen.
   *
   * En kolumn som finns i alla filer behöver inget beslut. En som finns i
   * vissa gör det: tas den med blir den tom för de andra filerna, och tas den
   * inte med försvinner data. Båda kan vara rätt, och att gissa är inte
   * verktygets sak.
   */
  med: boolean | null
}

export interface Kalla {
  frame: Frame
  /** Rader att ta med, i den ordning de ska hamna. */
  rader: ArrayLike<number>
}

export interface Staplingsplan {
  kolumner: readonly Malkolumn[]
  /** Namn på en kolumn med källfilens namn, eller null för ingen. */
  kallkolumn: string | null
  /** Namn på resultatfliken. */
  namn: string
}

export interface Staplingsresultat {
  frame: Frame
  /** Antal rader varje källa bidrog med, i samma ordning. */
  perKalla: number[]
  /** Målkolumner som ingen fil fyller — tomma i hela resultatet. */
  ofyllda: string[]
}

/**
 * Filnamn som går att skilja åt.
 *
 * Samma fil kan vara öppnad två gånger, och då säger en källkolumn med två
 * likadana namn ingenting. `uniqueColumnName` gör samma sak för kolumner vid
 * import och sammanslagning, så mönstret är redan inlärt.
 */
export function kallnamn(kallor: readonly { frame: Frame }[]): string[] {
  const tagna: string[] = []
  return kallor.map((k) => {
    const namn = uniqueColumnName(tagna, k.frame.name)
    tagna.push(namn)
    return namn
  })
}

export function stapla(kallor: readonly Kalla[], plan: Staplingsplan): Staplingsresultat {
  const med = plan.kolumner.filter((k) => k.med === true)
  let totalRader = 0
  for (const k of kallor) totalRader += k.rader.length

  const tagna: string[] = []
  const kolumner: Column[] = []
  const ofyllda: string[] = []

  for (const mal of med) {
    const namn = uniqueColumnName(tagna, mal.namn)
    tagna.push(namn)
    const { col, fylld } = byggKolumn(namn, mal, kallor, totalRader)
    if (!fylld) ofyllda.push(namn)
    kolumner.push(col)
  }

  if (plan.kallkolumn !== null) {
    const namn = uniqueColumnName(tagna, plan.kallkolumn)
    tagna.push(namn)
    kolumner.push(byggKallkolumn(namn, kallor, totalRader))
  }

  // Radnumret är sant inom sin källa, och källkolumnen är det som gör paret
  // entydigt. Rad 12 ur två filer är två olika rader.
  const sourceRow = new Uint32Array(totalRader)
  let ut = 0
  for (const kalla of kallor) {
    for (let i = 0; i < kalla.rader.length; i++) {
      sourceRow[ut++] = kalla.frame.sourceRow[kalla.rader[i]!] ?? 0
    }
  }

  // Typen är en tolkning av datat, och det staplade datat är inte något av
  // källornas. Låsningar som alla källor är eniga om har redan satts i
  // `byggKolumn`, och `inferAllTypes` rör inte dem.
  inferAllTypes(kolumner)

  const frame: Frame = {
    id: newFrameId(),
    name: plan.namn,
    columns: kolumner,
    rowCount: totalRader,
    view: identityView(totalRader),
    sourceRow,
    meta: { warnings: [] },
  }

  return { frame, perKalla: kallor.map((k) => k.rader.length), ofyllda }
}

function byggKolumn(
  namn: string,
  mal: Malkolumn,
  kallor: readonly Kalla[],
  totalRader: number,
): { col: Column; fylld: boolean } {
  const col = createColumn(namn, totalRader)
  const bidragande: Column[] = []
  let ut = 0

  for (let i = 0; i < kallor.length; i++) {
    const kalla = kallor[i]!
    const hamtning = mal.hamtning[i]
    const kall =
      hamtning && hamtning.fran === 'kolumn' ? findColumn(kalla.frame, hamtning.colId) : undefined
    if (!kall) {
      // Kod 0 är tomma strängen och arrayen är redan nollställd.
      ut += kalla.rader.length
      continue
    }
    bidragande.push(kall)

    // En internering per unikt värde, sedan ett heltalssvep över raderna.
    const remap = new Uint32Array(kall.dict.length)
    for (let kod = 1; kod < kall.dict.length; kod++) remap[kod] = intern(col, kall.dict[kod]!)

    for (let r = 0; r < kalla.rader.length; r++) {
      const rad = kalla.rader[r]!
      col.codes[ut] = remap[kall.codes[rad]!]!
      // Flaggorna hör till cellen — det är samma cell, i en ny fil.
      col.flags[ut] = kall.flags[rad]!
      ut += 1
    }
  }

  // En låsning som alla bidragande källor är eniga om ärvs: har man låst
  // Postnr till text för att 01234 inte ska bli ett tal ska det inte tappas
  // här. Motstridiga låsningar är ingen låsning.
  const forsta = bidragande[0]
  if (forsta && bidragande.every((c) => c.typeLocked && c.type === forsta.type)) {
    col.type = forsta.type
    col.typeLocked = true
  }

  return { col, fylld: bidragande.length > 0 }
}

function byggKallkolumn(namn: string, kallor: readonly Kalla[], totalRader: number): Column {
  const col = createColumn(namn, totalRader)
  col.typeLocked = true
  const namnen = kallnamn(kallor)
  let ut = 0
  for (let i = 0; i < kallor.length; i++) {
    const kod = intern(col, namnen[i]!)
    const antal = kallor[i]!.rader.length
    for (let r = 0; r < antal; r++) col.codes[ut++] = kod
  }
  return col
}

/**
 * Målform ur källornas egna kolumner, med alias hopslagna.
 *
 * Girigheten går i filordning, och en källkolumn kan bara bindas en gång. Utan
 * den regeln kan `E-post` och `epost2` i samma fil hamna i två målkolumner med
 * identiskt innehåll, och det syns inte förrän långt senare.
 */
export function malformAvKallor(kallor: readonly Frame[]): Malkolumn[] {
  const tagna = kallor.map(() => new Set<ColumnId>())
  const ut: Malkolumn[] = []

  for (let i = 0; i < kallor.length; i++) {
    for (const col of visibleColumns(kallor[i]!)) {
      if (tagna[i]!.has(col.id)) continue
      const hamtning: Hamtning[] = kallor.map(() => TOMT)
      hamtning[i] = { fran: 'kolumn', colId: col.id }
      tagna[i]!.add(col.id)

      for (let j = i + 1; j < kallor.length; j++) {
        const traff = hittaAlias(kallor[j]!, col.name, tagna[j]!)
        if (traff !== null) {
          hamtning[j] = { fran: 'kolumn', colId: traff }
          tagna[j]!.add(traff)
        }
      }

      ut.push({ namn: col.name, hamtning, med: antalKallor(hamtning) === kallor.length ? true : null })
    }
  }
  return ut
}

/** Hur många källor som faktiskt fyller en målkolumn. */
export function antalKallor(hamtning: readonly Hamtning[]): number {
  let n = 0
  for (const h of hamtning) if (h.fran === 'kolumn') n += 1
  return n
}

/** Målkolumner som ännu inte fått ett beslut. */
export function obeslutade(kolumner: readonly Malkolumn[]): Malkolumn[] {
  return kolumner.filter((k) => k.med === null)
}
