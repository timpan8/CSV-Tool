import type { Column, ColumnId, ColumnType, Frame } from '../core/types.js'
import type { Profilsteg } from '../core/ops/profil.js'
import { getCell } from '../core/frame/column.js'

/**
 * Förhandsvisning av en kolumnändring.
 *
 * Alla städverktyg — datum, e-post→namn, sök & ersätt, talstädning, dela och
 * slå ihop — delar det här läget. Poängen är att svaret på ”vad kommer det
 * här att göra med min fil?” ska stå i tabellen, på användarens eget data,
 * innan något ändras. En siffra i en dialogruta säger inte om just de tre
 * raderna man oroar sig för blev rätt.
 *
 * Det finns två räknesätt, och skillnaden är inte kosmetisk:
 *
 * **Per unikt värde** är standard. En transform som bara beror på en enda
 * kolumns värde körs en gång per ordbokspost, precis som `mapColumnValues`.
 * En kolumn med hundratusen rader och tre unika värden kostar tre anrop.
 *
 * **Per rad** krävs när resultatet beror på flera kolumner — en mall som
 * `{Förnamn} {Efternamn}` kan inte slås upp på ett enda värde. Då kostar det
 * ett anrop per rad, vilket är oundvikligt och därför inte döljs: `perRad`
 * står i strukturen.
 */

/** Bitar i `status`. */
export const ANDRAD = 1
export const PROBLEM = 2

export interface Forhandsvisning {
  /**
   * Kolumnen förhandsvisningen hänger på.
   *
   * Vid omskrivning på plats är det kolumnen som skrivs om. Vid nya kolumner
   * är det kolumnen spökkolumnerna ställer sig intill.
   */
  colId: ColumnId
  /**
   * Namn på de kolumner som ska skapas. Tom lista betyder omskrivning på
   * plats.
   *
   * Nya kolumner ritas som spökkolumner intill källan i stället för som
   * före → efter i cellen: det är två olika löften, och de ska inte se
   * likadana ut.
   */
  nyaKolumner: string[]
  /** Etiketten som hamnar i historiken när den tillämpas. */
  etikett: string
  kind: string
  /**
   * Steget beskrivet som data, för profiler.
   *
   * `fn` är en stängning och går inte att spara. Beskrivningen är samma
   * ändring uttryckt i inställningar, och det är den som kan köras om på en
   * annan fil. Saknas den räknas steget som ett handgrepp som inte går att
   * upprepa — se `src/core/ops/profil.ts`.
   */
  profil?: Profilsteg
  /** Transformen, för omskrivning på plats. Null när nya kolumner skapas. */
  fn: ((value: string) => string) | null
  /**
   * Typ att sätta på kolumnen när ändringen tillämpas.
   *
   * En kolumn som just skrivits om till ÅÅÅÅ-MM-DD *är* en datumkolumn, och
   * det är den upplysningen som gör att Excel-exporten skriver riktiga
   * datumceller. Ångra tar tillbaka typen med resten av kolumnen.
   */
  nyTyp?: ColumnType
  /** Sant när `nya` och `status` är indexerade per rad i stället för per kod. */
  perRad: boolean
  /** Antal värden per uppslag. Ett per ny kolumn, eller 1 vid omskrivning. */
  stride: number
  /** Resultatvärden: `nya[uppslag * stride + mål]`. */
  nya: string[]
  /** `ANDRAD` och/eller `PROBLEM`, ett per uppslag. */
  status: Uint8Array
  /** Antal celler, inte antal unika värden — det är det användaren räknar i. */
  andrade: number
  problem: number
  ifyllda: number
}

export interface Forhandsspec {
  etikett: string
  kind: string
  /** Ett resultatvärde per källvärde. Används vid omskrivning och en ny kolumn. */
  fn?: (value: string) => string
  /** Flera resultatvärden per källvärde, ett per ny kolumn. */
  delar?: (value: string) => string[]
  /** Resultat som beror på hela raden. Tvingar fram räkning per rad. */
  rad?: (frame: Frame, row: number) => string[]
  arProblem?: (value: string) => boolean
  nyTyp?: ColumnType
  /** Steget som data, för profiler. Se `Forhandsvisning.profil`. */
  profil?: Profilsteg
  /** Namn på de kolumner som ska skapas i stället för omskrivning på plats. */
  nyaKolumner?: string[]
}

/**
 * Räknar ut en förhandsvisning.
 *
 * `arProblem` bedömer **originalvärdet**, inte resultatet. Ett datum som inte
 * går att tolka och som därför lämnas orört ger ingen skillnad mellan före och
 * efter — men det är fortfarande precis den rad användaren behöver se.
 *
 * Räkningen går över hela kolumnen och inte över den filtrerade vyn, eftersom
 * ändringen gör det: en transform träffar ordboken, så varje rad med samma
 * värde ändras oavsett vad som råkar visas just nu.
 */
export function beraknaForhandsvisning(
  col: Column,
  spec: Forhandsspec,
  frame?: Frame,
): Forhandsvisning {
  const nyaKolumner = spec.nyaKolumner ?? []
  const perRad = spec.rad !== undefined
  const stride = Math.max(1, nyaKolumner.length)
  const uppslag = perRad ? col.codes.length : col.dict.length

  const nya: string[] = new Array<string>(uppslag * stride)
  const status = new Uint8Array(uppslag)

  const las = (i: number): string =>
    perRad ? getCell(col, i) : col.dict[i]!

  for (let i = 0; i < uppslag; i++) {
    const fore = las(i)
    let resultat: string[]
    if (spec.rad) resultat = spec.rad(frame!, i)
    else if (spec.delar) resultat = fore === '' ? tomma(stride) : spec.delar(fore)
    else resultat = fore === '' ? tomma(stride) : [spec.fn!(fore)]

    let nagot = false
    for (let m = 0; m < stride; m++) {
      const v = resultat[m] ?? ''
      nya[i * stride + m] = v
      if (v !== '') nagot = true
    }

    if (fore === '' && !perRad) continue

    // Nya kolumner jämförs mot tomt: allt som ger ett värde är en ändring.
    // En omskrivning jämförs mot vad som stod där.
    const andrad = nyaKolumner.length > 0 ? nagot : nya[i * stride] !== fore
    let bitar = andrad ? ANDRAD : 0
    if (spec.arProblem?.(fore) === true) bitar |= PROBLEM
    status[i] = bitar
  }

  let andrade = 0
  let problem = 0
  let ifyllda = 0
  for (let r = 0; r < col.codes.length; r++) {
    const kod = col.codes[r]!
    if (kod === 0) continue
    ifyllda += 1
    const bitar = status[perRad ? r : kod]!
    if ((bitar & ANDRAD) !== 0) andrade += 1
    if ((bitar & PROBLEM) !== 0) problem += 1
  }

  return {
    colId: col.id,
    nyaKolumner,
    etikett: spec.etikett,
    kind: spec.kind,
    profil: spec.profil,
    fn: nyaKolumner.length > 0 ? null : (spec.fn ?? null),
    nyTyp: spec.nyTyp,
    perRad,
    stride,
    nya,
    status,
    andrade,
    problem,
    ifyllda,
  }
}

function tomma(n: number): string[] {
  return new Array<string>(n).fill('')
}

/** Index i `nya`/`status` för en rad. */
export function uppslag(forh: Forhandsvisning, kall: Column, row: number): number {
  return forh.perRad ? row : kall.codes[row]!
}

/** Värdet i spökkolumn `mal` för en rad. */
export function spokvarde(forh: Forhandsvisning, kall: Column, row: number, mal: number): string {
  return forh.nya[uppslag(forh, kall, row) * forh.stride + mal] ?? ''
}

/** Vad en cell blir, för rutnätet. Returnerar null när kolumnen inte skrivs om. */
export function forCell(
  forh: Forhandsvisning | null,
  col: Column,
  row: number,
): { efter: string; andrad: boolean; problem: boolean } | null {
  // Nya kolumner ritas av spökkolumnerna, inte av källans celler.
  if (!forh || forh.nyaKolumner.length > 0 || forh.colId !== col.id) return null
  const i = uppslag(forh, col, row)
  const bitar = forh.status[i] ?? 0
  return {
    efter: forh.nya[i * forh.stride] ?? '',
    andrad: (bitar & ANDRAD) !== 0,
    problem: (bitar & PROBLEM) !== 0,
  }
}
