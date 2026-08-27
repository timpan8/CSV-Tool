import { Flag, type Column, type ColumnId, type Frame } from '../types.js'
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
 * **En kolumn som saknas i en fil kostar nästan ingenting.** Kod 0 är alltid
 * tomma strängen, så bara flaggorna behöver skrivas.
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
   *
   * `stapla` behandlar `null` som *inte med* — det är gränssnittet som spärrar
   * körningen tills allt är besluta, se `obeslutade`.
   */
  med: boolean | null
  /**
   * Ett exempelvärde ur mallfilen.
   *
   * Det är hela skälet att en mall får innehålla exempeldata: den visar vad
   * kolumnen ska innehålla, och det är precis vad man behöver se när man
   * väljer källkolumn. Värdet följer aldrig med i resultatet.
   */
  ledtrad?: string
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
  /** Målkolumner som blev tomma i hela resultatet. */
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
  // Hämtningarna är positionella. Vore listan kortare än källorna skulle
  // värden ur fil 3 hamna under fil 2:s rubrik, tyst.
  const med = plan.kolumner
    .filter((k) => k.med === true)
    .map((k) => normaliseraHamtning(k, kallor.length))
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
      // Kolumnen fanns inte i den här filen. Det är samma sak som en rad med
      // för få fält: värdet *saknades*, det var inte tomt — och den skillnaden
      // är hela poängen med att fråga per kolumn. Kod 0 är redan tomma
      // strängen, så bara flaggan behöver skrivas.
      col.flags.fill(Flag.Padded, ut, ut + kalla.rader.length)
      ut += kalla.rader.length
      continue
    }
    bidragande.push(kall)

    /*
     * Omskrivningstabellen byggs en gång per unikt värde, inte per rad.
     *
     * När hela kolumnen följer med är ordboken den billigaste vägen. Vid ett
     * urval — ett filter, en frusen vy, en förhandsvisning på tre rader — är
     * den däremot både dyrare *och fel*: `inferType` läser ordboken, så värden
     * som inte är med i resultatet skulle vara med och bestämma dess typ.
     */
    const remap = new Uint32Array(kall.dict.length)
    if (kalla.rader.length >= kall.codes.length) {
      for (let kod = 1; kod < kall.dict.length; kod++) remap[kod] = intern(col, kall.dict[kod]!)
    } else {
      for (let r = 0; r < kalla.rader.length; r++) {
        const kod = kall.codes[kalla.rader[r]!]!
        // `intern` ger aldrig 0 för ett icke-tomt värde, så 0 duger som "osedd".
        if (kod !== 0 && remap[kod] === 0) remap[kod] = intern(col, kall.dict[kod]!)
      }
    }

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

  // Ordboken har bara det som faktiskt hamnade i kolumnen, så den är det
  // sanna svaret på om någon fil fyllde den.
  return { col, fylld: col.dict.length > 1 }
}

/** Ser till att hämtningslistan har exakt en post per källa. */
function normaliseraHamtning(kol: Malkolumn, antal: number): Malkolumn {
  if (kol.hamtning.length === antal) return kol
  const hamtning = Array.from({ length: antal }, (_, i) => kol.hamtning[i] ?? TOMT)
  return { ...kol, hamtning }
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
  return laggTillObundna([], kallor, tagna, (hamtning) =>
    antalKallor(hamtning) === kallor.length ? true : null,
  )
}

/**
 * Lägger till en målkolumn för varje källkolumn som ingen ännu bundit.
 *
 * Girigheten går i filordning: den första filen som har kolumnen får ge den
 * dess namn, och de följande binder sina alias till den.
 */
function laggTillObundna(
  ut: Malkolumn[],
  kallor: readonly Frame[],
  tagna: Set<ColumnId>[],
  beslut: (hamtning: readonly Hamtning[]) => boolean | null,
): Malkolumn[] {
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

      ut.push({ namn: col.name, hamtning, med: beslut(hamtning) })
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

/**
 * Målform ur en mallfils rubriker, i mallens ordning.
 *
 * En mall är ett dokument som bara innehåller rubriker, eventuellt med några
 * exempelrader. Den bestämmer resultatets form: vilka kolumner det har, vad de
 * heter och i vilken ordning de kommer. Därför behöver ingen mallkolumn ett
 * beslut — mallen *är* beslutet.
 *
 * Mallens egna rader följer aldrig med. De är exempel, inte data, och det
 * första ifyllda värdet per kolumn blir i stället en ledtråd i kartan.
 *
 * Källkolumner som mallen *inte* har läggs till sist och obeslutade, så att
 * mallen aldrig blir ett tyst filter.
 *
 * En mallkolumn som ingen fil fyller tas med som tom kolumn och rapporteras i
 * `ofyllda`. Den ska vara med: en saknad kolumn i ett importformat är inte
 * samma sak som ingen kolumn. Men att den blir tom ska stå i klartext före
 * körningen, inte upptäckas i resultatet.
 */
export function malformAvMall(mall: Frame, kallor: readonly Frame[]): Malkolumn[] {
  const tagna = kallor.map(() => new Set<ColumnId>())
  const ut: Malkolumn[] = visibleColumns(mall).map((malkol) => {
    const hamtning: Hamtning[] = kallor.map((kalla, j) => {
      const traff = hittaAlias(kalla, malkol.name, tagna[j]!)
      if (traff === null) return TOMT
      tagna[j]!.add(traff)
      return { fran: 'kolumn', colId: traff }
    })
    return { namn: malkol.name, hamtning, med: true, ledtrad: forstaVardet(mall, malkol) }
  })

  // Källkolumner som mallen inte har läggs till sist, obeslutade. Att tyst
  // utelämna dem vore att kasta data — samma regel som för unionen, och skälet
  // att mallen inte får vara ett tyst filter.
  return laggTillObundna(ut, kallor, tagna, () => null)
}

/** Mallens första ifyllda värde i en kolumn, som ledtråd. */
function forstaVardet(mall: Frame, col: Column): string {
  for (let r = 0; r < mall.rowCount; r++) {
    const kod = col.codes[r]
    if (kod !== undefined && kod !== 0) return col.dict[kod] ?? ''
  }
  return ''
}
