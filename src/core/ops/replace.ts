import { normalizeAlways, stripDiacritics } from '../locale/sv.js'

/**
 * Sök och ersätt.
 *
 * Det farligaste verktyget i lådan: en tanklös ersättning kan skriva över en
 * hel kolumn på ett sätt som ingen upptäcker förrän filen är levererad.
 * Därför gäller två saker här.
 *
 * **Ett trasigt reguljärt uttryck är ett svar, inte ett undantag.** `bygg`
 * returnerar felet som text så att panelen kan visa det medan man skriver, i
 * stället för att kasta mitt i en transform.
 *
 * **Bokstavlig sökning är bokstavlig.** `1.5` med punkt matchar inte `125`.
 * Söksträngen escapas innan den blir ett uttryck, och `$` i ersättningen
 * betyder ett dollartecken och inte en grupphänvisning.
 */

export interface Ersattning {
  sok: string
  ersatt: string
  /** Tolka söksträngen som ett reguljärt uttryck. */
  regex: boolean
  /** Skilj på VERSALER och gemener. */
  versalkanslig: boolean
  /** Hela cellen måste matcha, inte bara en del av den. */
  helaCellen: boolean
  /** `oberg` hittar `Öberg`. Går inte att kombinera med ersättning i delsträng. */
  accentokanslig: boolean
}

export const TOM_ERSATTNING: Ersattning = {
  sok: '',
  ersatt: '',
  regex: false,
  versalkanslig: false,
  helaCellen: false,
  accentokanslig: false,
}

function escapaRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface Ersattare {
  /** Null när uttrycket inte går att använda. */
  fn: ((value: string) => string) | null
  /** Felmeddelande att visa, eller null. */
  fel: string | null
}

/**
 * Bygger ersättningsfunktionen.
 *
 * Accentokänslig sökning är medvetet begränsad till hela celler. Att ersätta
 * en delsträng som hittats i en accentstrippad kopia kräver att positionerna
 * mappas tillbaka till originalet, och en felmappning skriver sönder texten
 * tyst. Hela cellen har inget sådant problem: matchar den, ersätts allt.
 */
export function byggErsattare(inst: Ersattning): Ersattare {
  if (inst.sok === '') return { fn: null, fel: null }

  if (inst.accentokanslig && !inst.helaCellen) {
    return {
      fn: null,
      fel: 'Accentokänslig sökning fungerar bara tillsammans med ”hela cellen”.',
    }
  }

  if (inst.accentokanslig) {
    const nyckel = jamfornyckel(inst.sok, inst.versalkanslig)
    return {
      fn: (value) => (jamfornyckel(value, inst.versalkanslig) === nyckel ? inst.ersatt : value),
      fel: null,
    }
  }

  const kropp = inst.regex ? inst.sok : escapaRegex(inst.sok)
  const monster = inst.helaCellen ? `^(?:${kropp})$` : kropp
  const flaggor = `gu${inst.versalkanslig ? '' : 'i'}`

  let re: RegExp
  try {
    re = new RegExp(monster, flaggor)
  } catch (e) {
    return { fn: null, fel: `Uttrycket går inte att tolka: ${(e as Error).message}` }
  }

  // I bokstavligt läge ska $ vara ett dollartecken. I regexläge är $1 en
  // grupphänvisning, vilket är hela poängen med läget.
  const ersatt = inst.regex ? inst.ersatt : inst.ersatt.replace(/\$/g, '$$$$')

  return {
    fn: (value) => {
      // Regexet är globalt och delas mellan anrop; lastIndex måste nollas.
      re.lastIndex = 0
      return value.replace(re, ersatt)
    },
    fel: null,
  }
}

function jamfornyckel(value: string, versalkanslig: boolean): string {
  const bas = stripDiacritics(normalizeAlways(value))
  return versalkanslig ? bas : bas.toLocaleLowerCase('sv')
}

/** Räknar hur många av värdena uttrycket träffar. Används för siffran före körning. */
export function raknaTraffar(
  varden: readonly string[],
  fn: (value: string) => string,
  vikter?: ArrayLike<number>,
): number {
  let n = 0
  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!
    if (value === '') continue
    if (fn(value) !== value) n += vikter ? (vikter[i] ?? 0) : 1
  }
  return n
}
