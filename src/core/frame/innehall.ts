import type { Column } from '../types.js'
import { codeCounts } from './column.js'
import { violatesType } from '../infer.js'
import { formatCount, normalizeAlways } from '../locale/sv.js'
import { STANDARDVAL as EPOSTVAL, inventeraEpost } from '../ops/email.js'
import { STANDARDVAL as TELEFONVAL, inventeraTelefon } from '../ops/phone.js'
import { STANDARDVAL as DATUMVAL, inventera as inventeraDatum } from '../ops/dates.js'
import { STANDARDVAL as TALVAL, tolkaTal } from '../ops/numbers.js'

/**
 * Vad en kolumn ser ut att innehålla.
 *
 * Frågan ”vilket verktyg passar här?” besvarades tidigare av `ColumnType`,
 * och det svaret var för trubbigt: `phone` finns inte som typ alls, och en
 * kolumn med adresser kan mycket väl stå som `text` för att importen inte
 * vågade gissa. Rätt signal är **innehållet**, och den signalen är redan
 * uträknad — varje verktyg har en inventeringsfunktion som läser ordboken
 * med `codeCounts` som vikter och svarar hur många celler den skulle träffa.
 *
 * Profilen räknas därför på **hela kolumnen, inte på vyn**. Det är samma val
 * som `codeCounts` gör och det är det riktiga: ett verktyg skriver om
 * ordboken och träffar därmed varje rad med samma värde, oavsett vilka rader
 * som råkar visas just nu. Det gör också cachen nedan möjlig.
 */

/**
 * Städverktygen vid namn.
 *
 * Unionen bor här och inte i gränssnittslagret, eftersom det är den här
 * filen som avgör vilket av dem som passar. `src/ui/verktyg.tsx` exporterar
 * den vidare tillsammans med etiketterna.
 */
export type Verktygsnamn = 'datum' | 'tal' | 'telefon' | 'epost' | 'dela' | 'slaihop' | 'ersatt'

export interface Verktygsforslag {
  verktyg: Verktygsnamn
  /** Andel av de ifyllda cellerna verktyget skulle träffa, 0–1. */
  andel: number
  /** Färdig mening att visa efter etiketten: ”14 av 16 ser ut som adresser”. */
  skal: string
}

export interface Innehallsprofil {
  /** Ett förslag per verktyg som skulle göra något, starkast först. */
  forslag: Verktygsforslag[]
  /** Antal ifyllda celler i hela kolumnen. */
  ifyllda: number
  /** Antal unika ifyllda värden. */
  unika: number
  /** Antal celler som inte går att tolka som kolumnens typ. */
  ogiltiga: number
}

/**
 * Ett verktyg föreslås först när det skulle träffa en majoritet av cellerna.
 *
 * Lägre än så är förslaget en gissning som kostar mer än den ger: den översta
 * posten i menyn ska vara den man faktiskt vill ha. Resten av verktygen
 * försvinner inte — de ligger under *Fler verktyg*.
 */
const TROSKEL = 0.5

/**
 * Ordningen vid lika andel: det mer specifika verktyget först.
 *
 * En kolumn med enbart siffror kan läsas både som tal och som telefonnummer.
 * Telefonverktyget ställer högre krav (landskod eller inledande nolla), så
 * när det ändå träffar allt är det det som vet mest om värdena.
 */
const SPECIFICITET: Verktygsnamn[] = ['epost', 'telefon', 'datum', 'tal', 'dela']

interface Profilpost extends Innehallsprofil {
  /** Ordboken profilen räknades på. Identitetsjämförelse, inte innehåll. */
  dict: string[]
  /** Ordbokens längd då. Är den kortare nu är arrayen utbytt trots samma längd. */
  langd: number
  /** Typen den räknades för — `ogiltiga` byter innebörd med den. */
  type: string
}

const cache = new WeakMap<Column, Profilpost>()

/** Endast för tester: gör kostnadsmätningar oberoende av tidigare anrop. */
export function nollstallProfilcache(col?: Column): void {
  if (col) cache.delete(col)
}

/**
 * Innehållsprofilen för en kolumn.
 *
 * Cachas på **samma nyckel som sorteringsrangen** i `rank.ts`: ordbokens
 * identitet, dess längd och kolumnens typ. Invarianten är verifierad där och
 * gäller lika här — `intern` växer samma array medan `restoreColumn` och
 * `mapColumnValues` byter ut den, alltså precis när befintliga koder kan ha
 * bytt betydelse.
 *
 * Till skillnad från rangen räknas profilen om helt när ordboken växer. Det
 * kostar ett svep per unikt värde, vilket är samma storleksordning som
 * rutnätet redan betalar per synlig kolumn och omritning i `measure`.
 */
export function innehallsprofil(col: Column): Innehallsprofil {
  const post = cache.get(col)
  if (post && post.dict === col.dict && post.langd === col.dict.length && post.type === col.type) {
    return post
  }
  const ny = bygg(col)
  cache.set(col, ny)
  return ny
}

function bygg(col: Column): Profilpost {
  const vikter = codeCounts(col)
  let ifyllda = 0
  let unika = 0
  let ogiltiga = 0
  for (let d = 1; d < col.dict.length; d++) {
    const antal = vikter[d]!
    if (antal === 0) continue
    unika += 1
    ifyllda += antal
    if (violatesType(col.dict[d]!, col.type)) ogiltiga += antal
  }

  const forslag = ifyllda === 0 ? [] : rakna(col, vikter, ifyllda)
  forslag.sort(
    (a, b) =>
      b.andel - a.andel ||
      SPECIFICITET.indexOf(a.verktyg) - SPECIFICITET.indexOf(b.verktyg),
  )

  return {
    forslag,
    ifyllda,
    unika,
    ogiltiga,
    dict: col.dict,
    langd: col.dict.length,
    type: col.type,
  }
}

function rakna(col: Column, vikter: Uint32Array, ifyllda: number): Verktygsforslag[] {
  const ut: Verktygsforslag[] = []
  const av = (n: number) => `${formatCount(n)} av ${formatCount(ifyllda)}`
  const lagg = (verktyg: Verktygsnamn, traffar: number, skal: string) => {
    const andel = traffar / ifyllda
    if (andel >= TROSKEL) ut.push({ verktyg, andel, skal })
  }

  const epost = inventeraEpost(col.dict, EPOSTVAL, vikter)
  lagg('epost', epost.adresser, `${av(epost.adresser)} ser ut som adresser`)

  const telefon = inventeraTelefon(col.dict, { ...TELEFONVAL, format: 'e164', onError: 'behall' }, vikter)
  lagg('telefon', telefon.nummer, `${av(telefon.nummer)} ser ut som telefonnummer`)

  const datum = inventeraDatum(col.dict, DATUMVAL, vikter)
  const format = datum.poster.filter((p) => p.antal > 0 && p.format !== 'okant').length
  lagg(
    'datum',
    datum.tolkade,
    format > 1
      ? `${av(datum.tolkade)} går att läsa som datum, i ${format} format`
      : `${av(datum.tolkade)} går att läsa som datum`,
  )

  const { traffar: taltraffar, enheter } = raknaTal(col, vikter)
  lagg(
    'tal',
    taltraffar,
    enheter.length > 0
      ? `${av(taltraffar)} går att läsa som tal, med ${enheter.join(', ')}`
      : `${av(taltraffar)} går att läsa som tal`,
  )

  const delbara = raknaDelbara(col, vikter)
  lagg('dela', delbara, `${av(delbara)} går att dela i två ord`)

  return ut
}

/**
 * Ett värde räknas som tal bara när det innehåller **ett** tal.
 *
 * `tolkaTal` är med flit tillåtande: den skalar bort allt som inte är siffror
 * så att `1 240,50 kr` och `(1 234)` blir tal. Det är rätt inne i verktyget,
 * där man har valt det, men som signal duger det inte — `2026-08-27 12:55`
 * blir då talet 202608271255 med enheten `--:`, och datumkolumnen skulle få
 * talverktyget som sitt bästa förslag.
 *
 * Regeln är därför: siffrorna ska ligga i en enda grupp. Tecken som inte kan
 * ingå i ett tal delar upp värdet, och två grupper betyder att värdet är
 * sammansatt av något annat än ett tal.
 */
function raknaTal(col: Column, vikter: Uint32Array): { traffar: number; enheter: string[] } {
  let traffar = 0
  const enheter = new Map<string, number>()
  for (let d = 1; d < col.dict.length; d++) {
    const vikt = vikter[d]!
    if (vikt === 0) continue
    const varde = normalizeAlways(col.dict[d]!)
    let grupper = 0
    for (const del of varde.split(/[^\d.,' ]+/)) {
      if (/\d/.test(del)) grupper += 1
    }
    if (grupper !== 1) continue
    const t = tolkaTal(varde, TALVAL)
    if (t.tal === null) continue
    traffar += vikt
    if (t.enhet !== '') enheter.set(t.enhet, (enheter.get(t.enhet) ?? 0) + vikt)
  }
  const lista = [...enheter.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e)
  return { traffar, enheter: lista.slice(0, 3) }
}

/**
 * Ett värde räknas som delbart bara när **båda delarna innehåller bokstäver**.
 *
 * Delning är en textoperation. Utan bokstavskravet skulle `1 240,50` se
 * delbart ut vid tusentalsmellanslaget, och hela beloppskolumnen få *Dela
 * kolumnen* som förslag — ett förslag som bara kan förstöra värdena.
 */
const BOKSTAV = /\p{L}/u

function raknaDelbara(col: Column, vikter: Uint32Array): number {
  let traffar = 0
  for (let d = 1; d < col.dict.length; d++) {
    const vikt = vikter[d]!
    if (vikt === 0) continue
    const varde = normalizeAlways(col.dict[d]!).trim()
    const i = varde.indexOf(' ')
    if (i <= 0 || i === varde.length - 1) continue
    if (!BOKSTAV.test(varde.slice(0, i)) || !BOKSTAV.test(varde.slice(i + 1))) continue
    traffar += vikt
  }
  return traffar
}
