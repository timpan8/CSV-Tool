import type { Column } from '../types.js'
import { parseNumber } from '../infer.js'
import { sortCollator } from '../locale/sv.js'
import { tolkaDatum } from '../ops/dates.js'

/**
 * Sorteringsnycklar per kolumn.
 *
 * Hela knepet bakom snabb sortering är att rangordna de unika värdena en
 * gång och sedan sortera heltal. En collator-jämförelse kostar ungefär en
 * mikrosekund, och 100 000 rader kräver runt 1,7 miljoner jämförelser —
 * medan ordboken ofta har några hundra poster. Skillnaden är sekunder mot
 * millisekunder.
 *
 * **Cachen invalideras av ordbokens identitet, inte av en räknare.** Det är
 * en verifierad invariant i `column.ts`: `intern` gör `dict.push(...)` på
 * samma array, medan `restoreColumn` och `mapColumnValues` båda byter ut den.
 * Identiteten ändras alltså precis när befintliga koder kan ha bytt
 * betydelse. Att i stället nyckla på en revisionsräknare vore dyrt på just
 * det arbetsflöde sorteringen ska tjäna: en ordbok med 100 000 unika värden
 * kostar ungefär en sekund att rangordna, och den kostnaden skulle betalas om
 * vid varje cellredigering.
 *
 * Växte ordboken bara med nya värden sorteras de in i den befintliga
 * ordningen — några jämförelser styck i stället för en ny rangordning.
 */

/** Tomma celler sorteras alltid sist, oavsett riktning. Rangen är därefter. */
export const TOM_RANG = 0xffffffff

export interface Rang {
  /** Rang per ordbokskod. Kod 0 (tom) har alltid `TOM_RANG`. */
  rang: Uint32Array
  /**
   * Antal hinkar en räknesortering behöver, alltså högsta rang + 1 bland de
   * ifyllda värdena. Tomma räknas separat av sorteringen.
   */
  hinkar: number
}

interface Rangpost extends Rang {
  /** Ordboken rangen räknades på. Identitetsjämförelse, inte innehåll. */
  dict: string[]
  /** Ordbokens längd då. Är den kortare nu är arrayen utbytt trots samma längd. */
  langd: number
  /**
   * Typen rangen räknades för.
   *
   * `sattTyp` rör inte en enda kod men byter rangens innebörd helt — en
   * beloppskolumn som blir textkolumn ska sortera 1000 före 99. Utan det här
   * fältet skulle bytet ske tyst.
   */
  type: string
  /** Den egna ordningen rangen räknades med. Identitetsjämförelse. */
  sortordning: readonly string[] | undefined
  /** Den sorterade ordningen av koder, för att kunna sortera in nya värden. */
  ordning: number[]
}

const cache = new WeakMap<Column, Rangpost>()

/** Endast för tester: gör kostnadsmätningar oberoende av tidigare anrop. */
export function nollstallRangcache(col?: Column): void {
  if (col) cache.delete(col)
}

/**
 * Sorteringsrang för en kolumn, enligt dess typ.
 *
 * Ordningen inom en typ är: tolkbara värden i sin naturliga ordning, sedan
 * otolkbara i bokstavsordning, sist tomma. Att lägga skräpet mellan de
 * tolkbara vore att gömma det; att lägga det först vore att låta det ta över
 * skärmen.
 */
export function kolumnrang(col: Column): Rang {
  const post = cache.get(col)
  if (
    post &&
    post.dict === col.dict &&
    post.type === col.type &&
    post.sortordning === col.sortordning
  ) {
    if (post.langd === col.dict.length) return post
    if (col.dict.length > post.langd) return utoka(col, post)
  }
  const ny = bygg(col)
  cache.set(col, ny)
  return ny
}

/**
 * Sorterar in ordbokens nya värden i den befintliga ordningen.
 *
 * En cellredigering lägger till högst ett värde. Att rangordna om hela
 * ordboken för det vore att betala hela sorteringskostnaden per tangenttryck.
 */
function utoka(col: Column, post: Rangpost): Rang {
  const jamfor = jamforare(col)
  const ordning = post.ordning
  for (let kod = post.langd; kod < col.dict.length; kod++) {
    // Binärsökning ger insättningspunkten; splice flyttar heltal, inte strängar.
    let lag = 0
    let hog = ordning.length
    while (lag < hog) {
      const mitt = (lag + hog) >>> 1
      if (jamfor(ordning[mitt]!, kod) <= 0) lag = mitt + 1
      else hog = mitt
    }
    ordning.splice(lag, 0, kod)
  }

  const rang = new Uint32Array(col.dict.length)
  rang[0] = TOM_RANG
  for (let i = 0; i < ordning.length; i++) rang[ordning[i]!] = i

  const ny: Rangpost = {
    rang,
    hinkar: ordning.length,
    dict: col.dict,
    langd: col.dict.length,
    type: col.type,
    sortordning: col.sortordning,
    ordning,
  }
  cache.set(col, ny)
  return ny
}

function bygg(col: Column): Rangpost {
  const jamfor = jamforare(col)
  // Kod 0 är alltid tomsträngen och deltar inte i ordningen.
  const ordning: number[] = []
  for (let kod = 1; kod < col.dict.length; kod++) ordning.push(kod)
  ordning.sort(jamfor)

  const rang = new Uint32Array(col.dict.length)
  rang[0] = TOM_RANG
  for (let i = 0; i < ordning.length; i++) rang[ordning[i]!] = i

  return {
    rang,
    hinkar: ordning.length,
    dict: col.dict,
    langd: col.dict.length,
    type: col.type,
    sortordning: col.sortordning,
    ordning,
  }
}

/**
 * Jämförelsen mellan två ordbokskoder, enligt kolumnens typ.
 *
 * Textjämförelsen går alltid via den svenska kollatorn, även som sista utväg
 * för otolkbara tal och datum: `Öberg` ska hamna efter `Zetterlund`, och det
 * gäller lika mycket för skräpvärden som för riktiga.
 */
function jamforare(col: Column): (a: number, b: number) => number {
  const text = (a: number, b: number) => sortCollator.compare(col.dict[a]!, col.dict[b]!)

  /*
   * En egen ordning går före allt annat, typen inräknad.
   *
   * Kolumnen har fått den för att bokstavsordningen inte betyder någonting
   * för just de här värdena. Värden utanför listan hamnar efter dem — de
   * hör inte till berättelsen kolumnen är gjord för, och att sortera in dem
   * mitt i vore att låtsas att de gör det.
   */
  if (col.sortordning !== undefined) {
    const plats = new Map(col.sortordning.map((v, i) => [v, i]))
    const efter = col.sortordning.length
    const nyckel = (k: number) => plats.get(col.dict[k]!) ?? efter
    return (a, b) => {
      const x = nyckel(a)
      const y = nyckel(b)
      return x === y ? text(a, b) : x - y
    }
  }

  if (col.type === 'number') {
    const tal = talnycklar(col)
    return (a, b) => {
      const x = tal[a]!
      const y = tal[b]!
      const xNaN = Number.isNaN(x)
      const yNaN = Number.isNaN(y)
      if (xNaN && yNaN) return text(a, b)
      if (xNaN) return 1
      if (yNaN) return -1
      return x === y ? text(a, b) : x - y
    }
  }

  if (col.type === 'date') {
    const datum = datumnycklar(col)
    return (a, b) => {
      const x = datum[a]!
      const y = datum[b]!
      const xNaN = Number.isNaN(x)
      const yNaN = Number.isNaN(y)
      if (xNaN && yNaN) return text(a, b)
      if (xNaN) return 1
      if (yNaN) return -1
      return x === y ? text(a, b) : x - y
    }
  }

  if (col.type === 'bool') {
    // Utan det här ger kollatorn ordningen Ja < Nej < falskt < sant, vilket
    // gör att kolumntypen inte betyder någonting alls när man sorterar.
    const bool = boolnycklar(col)
    return (a, b) => (bool[a]! === bool[b]! ? text(a, b) : bool[a]! - bool[b]!)
  }

  return text
}

/* ---------- Tolkningar, delade med filtret ---------- */

interface Nyckelpost {
  dict: string[]
  langd: number
  varden: Float64Array
}

const talcache = new WeakMap<Column, Nyckelpost>()
const datumcache = new WeakMap<Column, Nyckelpost>()

function nycklar(
  col: Column,
  butik: WeakMap<Column, Nyckelpost>,
  tolka: (value: string) => number,
): Float64Array {
  const post = butik.get(col)
  if (post && post.dict === col.dict && post.langd === col.dict.length) return post.varden

  const varden = new Float64Array(col.dict.length)
  varden[0] = Number.NaN
  const fran = post && post.dict === col.dict && col.dict.length > post.langd ? post.langd : 1
  if (fran > 1) varden.set(post!.varden, 0)
  for (let kod = fran; kod < col.dict.length; kod++) varden[kod] = tolka(col.dict[kod]!)

  butik.set(col, { dict: col.dict, langd: col.dict.length, varden })
  return varden
}

/**
 * Talvärde per ordbokskod, `NaN` för det som inte går att läsa som tal.
 *
 * Delas med filtret så att `Belopp > 1000` och *sortera på Belopp* gör
 * tolkningen en gång tillsammans — samma resonemang som bär `valueCounts`.
 */
export function talnycklar(col: Column): Float64Array {
  return nycklar(col, talcache, (v) => parseNumber(v) ?? Number.NaN)
}

/** Datum som jämförbart heltal ÅÅÅÅMMDDttmmss, `NaN` för otolkbara. */
export function datumnycklar(col: Column): Float64Array {
  return nycklar(col, datumcache, (v) => {
    const d = tolkaDatum(v).datum
    if (!d) return Number.NaN
    return (
      d.ar * 10_000_000_000 +
      d.manad * 100_000_000 +
      d.dag * 1_000_000 +
      d.timme * 10_000 +
      d.minut * 100 +
      d.sekund
    )
  })
}

const SANT = new Set(['ja', 'sant', 'true', 'yes', 'y', '1', 'x'])
const FALSKT = new Set(['nej', 'falskt', 'false', 'no', 'n', '0'])

/** 0 = falskt, 1 = sant, 2 = varken. */
function boolnycklar(col: Column): Uint8Array {
  const ut = new Uint8Array(col.dict.length)
  for (let kod = 1; kod < col.dict.length; kod++) {
    const v = col.dict[kod]!.trim().toLowerCase()
    ut[kod] = FALSKT.has(v) ? 0 : SANT.has(v) ? 1 : 2
  }
  return ut
}
