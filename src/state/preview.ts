import type { Column, ColumnId, ColumnType } from '../core/types.js'

/**
 * Förhandsvisning av en kolumnomskrivning.
 *
 * Alla städverktyg — datum, e-post→namn, sök & ersätt, talstädning — delar
 * det här läget. Poängen är att svaret på ”vad kommer det här att göra med
 * min fil?” ska stå i tabellen, på användarens eget data, innan något ändras.
 * En siffra i en dialogruta säger inte om just de tre raderna man oroar sig
 * för blev rätt.
 *
 * Precis som `mapColumnValues` räknas allt **en gång per unikt värde**, inte
 * per rad. Rutnätet slår upp `nya[kod]` när det ritar en cell och behöver
 * aldrig köra transformen under rullning.
 */

/** Bitar i `status`, per ordbokskod. */
export const ANDRAD = 1
export const PROBLEM = 2

export interface Forhandsvisning {
  /** Kolumnen värdena läses ur. */
  colId: ColumnId
  /**
   * Namnet på kolumnen som ska skapas, eller null när källkolumnen skrivs om
   * på plats.
   *
   * En ny kolumn ritas som en spökkolumn intill källan i stället för som
   * före → efter i cellen: det är två olika löften, och de ska inte se
   * likadana ut.
   */
  nyKolumn: string | null
  /** Etiketten som hamnar i historiken när den tillämpas. */
  etikett: string
  kind: string
  fn: (value: string) => string
  /**
   * Typ att sätta på kolumnen när omskrivningen tillämpas.
   *
   * En kolumn som just skrivits om till ÅÅÅÅ-MM-DD *är* en datumkolumn, och
   * det är den upplysningen som gör att Excel-exporten skriver riktiga
   * datumceller. Ångra tar tillbaka typen med resten av kolumnen.
   */
  nyTyp?: ColumnType
  /** Resultatvärde per ordbokskod. */
  nya: string[]
  /** `ANDRAD` och/eller `PROBLEM` per ordbokskod. */
  status: Uint8Array
  /** Antal celler, inte antal unika värden — det är det användaren räknar i. */
  andrade: number
  problem: number
  ifyllda: number
}

/**
 * Räknar ut en förhandsvisning.
 *
 * `arProblem` bedömer **originalvärdet**, inte resultatet. Ett datum som inte
 * går att tolka och som därför lämnas orört ger ingen skillnad mellan före och
 * efter — men det är fortfarande precis den rad användaren behöver se.
 *
 * Räkningen går över hela kolumnen och inte över den filtrerade vyn, eftersom
 * omskrivningen gör det: transformen träffar ordboken, så varje rad med samma
 * värde ändras oavsett vad som råkar visas just nu.
 */
export function beraknaForhandsvisning(
  col: Column,
  spec: {
    etikett: string
    kind: string
    fn: (value: string) => string
    arProblem?: (value: string) => boolean
    nyTyp?: ColumnType
    /** Namn på en ny kolumn i stället för omskrivning på plats. */
    nyKolumn?: string
  },
): Forhandsvisning {
  const antal = col.dict.length
  const nya: string[] = new Array<string>(antal)
  const status = new Uint8Array(antal)

  for (let kod = 0; kod < antal; kod++) {
    const fore = col.dict[kod]!
    if (fore === '') {
      nya[kod] = ''
      continue
    }
    const efter = spec.fn(fore)
    nya[kod] = efter
    // En ny kolumn jämförs mot tomt: allt som ger ett värde är en ändring.
    let bitar = efter === (spec.nyKolumn === undefined ? fore : '') ? 0 : ANDRAD
    if (spec.arProblem?.(fore) === true) bitar |= PROBLEM
    status[kod] = bitar
  }

  let andrade = 0
  let problem = 0
  let ifyllda = 0
  for (let r = 0; r < col.codes.length; r++) {
    const kod = col.codes[r]!
    if (kod === 0) continue
    ifyllda += 1
    const bitar = status[kod]!
    if ((bitar & ANDRAD) !== 0) andrade += 1
    if ((bitar & PROBLEM) !== 0) problem += 1
  }

  return {
    colId: col.id,
    nyKolumn: spec.nyKolumn ?? null,
    etikett: spec.etikett,
    kind: spec.kind,
    fn: spec.fn,
    nyTyp: spec.nyTyp,
    nya,
    status,
    andrade,
    problem,
    ifyllda,
  }
}

/** Vad en cell blir, för rutnätet. Returnerar null när kolumnen inte förhandsvisas. */
export function forCell(
  forh: Forhandsvisning | null,
  col: Column,
  row: number,
): { efter: string; andrad: boolean; problem: boolean } | null {
  // En ny kolumn ritas av spökkolumnen, inte av källans celler.
  if (!forh || forh.nyKolumn !== null || forh.colId !== col.id) return null
  const kod = col.codes[row]!
  const bitar = forh.status[kod] ?? 0
  return {
    efter: forh.nya[kod] ?? '',
    andrad: (bitar & ANDRAD) !== 0,
    problem: (bitar & PROBLEM) !== 0,
  }
}
