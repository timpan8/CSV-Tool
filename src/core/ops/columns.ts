import type { Frame } from '../types.js'
import { getCell } from '../frame/column.js'
import { normalizeAlways } from '../locale/sv.js'

/**
 * Dela en kolumn och slå ihop flera.
 *
 * De två hör ihop som fram- och baksida av samma operation, men de räknas
 * olika. En delning beror bara på det egna värdet och kan därför köras en
 * gång per unikt värde. En sammanslagning läser flera kolumner och måste
 * köras per rad — det går inte att komma runt, och därför står det i
 * förhandsvisningens `perRad`.
 */

/* ---------- Dela ---------- */

export type Delningssatt = 'avgransare' | 'forsta' | 'sista' | 'position' | 'monster'

export const DELNINGSSATT: { varde: Delningssatt; etikett: string; titel: string }[] = [
  {
    varde: 'avgransare',
    etikett: 'Vid varje',
    titel: 'Delar vid varje förekomst av tecknet. Anna;Karlsson;Lund blir tre kolumner.',
  },
  {
    varde: 'forsta',
    etikett: 'Vid första',
    titel: 'Delar bara vid den första förekomsten. Anna Maria Karlsson blir Anna + Maria Karlsson.',
  },
  {
    varde: 'sista',
    etikett: 'Vid sista',
    titel: 'Delar bara vid den sista förekomsten. Anna Maria Karlsson blir Anna Maria + Karlsson.',
  },
  {
    varde: 'position',
    etikett: 'Efter antal tecken',
    titel: 'Delar på en fast position. Användbart för koder med fast längd.',
  },
  {
    varde: 'monster',
    etikett: 'Efter ett mönster',
    titel:
      'Skriv värdet som det ser ut och sätt klammer runt det du vill plocka ut: {Namn} <{E-post}>. Texten emellan är avgränsarna, och varje klammer blir en kolumn med sitt namn.',
  },
]

export interface Delning {
  satt: Delningssatt
  /** Tecknet eller texten det delas vid. */
  avgransare: string
  /** Position för `position`-läget. */
  position: number
  /** Antal kolumner resultatet ska ha. Överskott hamnar i den sista. */
  antal: number
  /** Trimma blanksteg runt varje del. */
  trimma: boolean
  /**
   * Mönstret för `monster`-läget, med mallens egen syntax.
   *
   * Valfritt, så att `Delning` i sparade profiler läses oförändrat.
   */
  monster?: string
}

export const STANDARDDELNING: Delning = {
  satt: 'forsta',
  avgransare: ' ',
  position: 3,
  antal: 2,
  trimma: true,
}

/**
 * Delar ett värde.
 *
 * Överskjutande delar hamnar i den sista kolumnen i stället för att kastas.
 * Att tyst tappa `Karlsson` ur `Anna Maria Karlsson` för att man valt två
 * kolumner vore precis den sortens dataförlust som inte syns förrän långt
 * senare.
 */
export function delaVarde(rawValue: string, inst: Delning): string[] {
  const value = normalizeAlways(rawValue)
  const ut: string[] = new Array<string>(inst.antal).fill('')
  if (value.trim() === '') return ut

  let delar: string[]
  if (inst.satt === 'position') {
    const p = Math.max(0, inst.position)
    delar = [value.slice(0, p), value.slice(p)]
  } else if (inst.avgransare === '') {
    delar = [value]
  } else if (inst.satt === 'forsta') {
    const i = value.indexOf(inst.avgransare)
    delar = i === -1 ? [value] : [value.slice(0, i), value.slice(i + inst.avgransare.length)]
  } else if (inst.satt === 'sista') {
    const i = value.lastIndexOf(inst.avgransare)
    delar = i === -1 ? [value] : [value.slice(0, i), value.slice(i + inst.avgransare.length)]
  } else {
    delar = value.split(inst.avgransare)
  }

  for (let i = 0; i < inst.antal; i++) {
    const sista = i === inst.antal - 1
    const del = sista ? delar.slice(i).join(inst.satt === 'position' ? '' : inst.avgransare) : delar[i]
    ut[i] = inst.trimma ? (del ?? '').trim() : (del ?? '')
  }
  return ut
}

/** Hur många delar värdena faktiskt ger, så panelen kan föreslå ett antal. */
export function inventeraDelning(
  varden: readonly string[],
  inst: Delning,
  vikter?: ArrayLike<number>,
): { flest: number; utanAvgransare: number; exempel: { fore: string; efter: string[] } | null } {
  let flest = 1
  let utanAvgransare = 0
  let exempel: { fore: string; efter: string[] } | null = null

  const rakna = { ...inst, antal: 50 }
  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!
    if (value.trim() === '') continue
    const vikt = vikter ? (vikter[i] ?? 0) : 1
    if (vikt === 0) continue

    const delar = delaVarde(value, rakna).filter((d) => d !== '')
    flest = Math.max(flest, delar.length)
    if (delar.length < 2) utanAvgransare += vikt
    else exempel ??= { fore: value, efter: delaVarde(value, inst) }
  }
  return { flest, utanAvgransare, exempel }
}

/* ---------- Slå ihop ---------- */

export type Malldel = { typ: 'text'; varde: string } | { typ: 'kolumn'; namn: string }

export interface Malltolkning {
  delar: Malldel[]
  /** Kolumnnamn i mallen som inte finns i filen. */
  okanda: string[]
  /** Kolumnnamn i mallen som finns. */
  anvanda: string[]
}

const PLATSHALLARE = /\{([^{}]*)\}/g

/**
 * Delar en malltext i text- och platshållardelar.
 *
 * Vet ingenting om filen, och det är hela poängen: mönsteruttaget i
 * `plockaUr` läser samma syntax, men där namnger platshållarna kolumner som
 * ännu inte finns. En tolkning som krävde att namnen redan fanns hade gjort
 * uttaget omöjligt att uttrycka med samma syntax som mallen.
 */
export function delaMall(text: string): Malldel[] {
  const delar: Malldel[] = []
  let sist = 0

  PLATSHALLARE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLATSHALLARE.exec(text)) !== null) {
    if (m.index > sist) delar.push({ typ: 'text', varde: text.slice(sist, m.index) })
    delar.push({ typ: 'kolumn', namn: m[1]!.trim() })
    sist = m.index + m[0].length
  }
  if (sist < text.length) delar.push({ typ: 'text', varde: text.slice(sist) })

  return delar
}

/**
 * Tolkar en mall som `{Förnamn} {Efternamn}`.
 *
 * Namn som inte finns i filen rapporteras i stället för att tyst bli tomma.
 * Ett stavfel i ett kolumnnamn ger annars en kolumn full av halva värden, och
 * det är svårt att upptäcka när man bara ser resultatet.
 */
export function tolkaMall(text: string, frame: Frame): Malltolkning {
  const delar = delaMall(text)
  const okanda: string[] = []
  const anvanda: string[] = []

  for (const del of delar) {
    if (del.typ !== 'kolumn') continue
    if (frame.columns.some((c) => c.name === del.namn)) {
      if (!anvanda.includes(del.namn)) anvanda.push(del.namn)
    } else if (!okanda.includes(del.namn)) {
      okanda.push(del.namn)
    }
  }

  return { delar, okanda, anvanda }
}

export interface Mallval {
  /** Ta bort dubbla mellanslag och trimma när en kolumn är tom. */
  stadaLuckor: boolean
}

/**
 * Kör mallen för en rad.
 *
 * `stadaLuckor` finns för att `{Förnamn} {Efternamn}` med tomt efternamn
 * annars ger `"Anna "` med ett efterhängande mellanslag — en osynlig skillnad
 * som förstör varje matchning värdet senare används i.
 */
export function korMall(
  frame: Frame,
  row: number,
  delar: readonly Malldel[],
  val: Mallval = { stadaLuckor: true },
): string {
  let ut = ''
  for (const del of delar) {
    if (del.typ === 'text') {
      ut += del.varde
    } else {
      const col = frame.columns.find((c) => c.name === del.namn)
      ut += col ? getCell(col, row) : ''
    }
  }
  return val.stadaLuckor ? ut.replace(/\s{2,}/g, ' ').trim() : ut
}

/**
 * Huvudmallen och undantagen för första och sista raden.
 *
 * `null` betyder att raden följer huvudmallen. Undantagen finns för listor som
 * bär en struktur runt sig: `('anna'),` på varje rad utom den sista, som ska
 * sakna kommatecknet för att SQL-frågan ska gå att köra. Att sätta ihop den
 * listan för hand är precis det slit ett verktyg ska ta bort.
 */
export interface Mallar {
  delar: Malldel[]
  forsta: Malldel[] | null
  sista: Malldel[] | null
}

/**
 * Mallen som gäller för en rad.
 *
 * Första och sista raden räknas i **vyns** ordning, inte filens. Skälet är att
 * det är vyns sista rad som hamnar sist när markeringen kopieras med Ctrl+C —
 * en fysisk tolkning hade satt kommatecknet på den sista kopierade raden och
 * lämnat en kommalös rad mitt i listan, alltså precis det fel undantaget finns
 * för att undvika. Priset är att en omsortering gör kolumnen inaktuell, och
 * det är just vad regeln i statusraden säger till om.
 *
 * Är vyn en enda rad är den både första och sista. Då vinner `sista`: en lista
 * med ett element behöver ingen inledning, men den behöver sitt slut.
 *
 * En rad som filtrerats bort ligger inte i vyn alls och följer huvudmallen.
 */
export function valjMall(frame: Frame, row: number, mallar: Mallar): Malldel[] {
  const view = frame.view
  if (view.length > 0) {
    if (mallar.sista && view[view.length - 1] === row) return mallar.sista
    if (mallar.forsta && view[0] === row) return mallar.forsta
  }
  return mallar.delar
}

/** Kör den mall som gäller för raden. */
export function korMallar(
  frame: Frame,
  row: number,
  mallar: Mallar,
  val: Mallval = { stadaLuckor: true },
): string {
  return korMall(frame, row, valjMall(frame, row, mallar), val)
}

/* ---------- Plocka ut med mönster ---------- */

/**
 * Uttag är delning uttryckt med mallens syntax, och det är med flit.
 *
 * `{Namn} <{E-post}>` bygger en text i mallverktyget och plockar isär samma
 * text här. En egen syntax för uttaget hade varit ett andra språk att lära
 * sig för samma tanke — och ett reguljärt uttryck hade varit ett tredje.
 *
 * Texten mellan klamrarna är avgränsarna. Att den avslutande texten måste
 * sitta i slutet är det som gör att `<>` städas bort på köpet: `>` i
 * mönstret betyder *värdet slutar här*, inte *dela vid första bästa `>`*.
 */

/** Namnen på de kolumner ett mönster ger, i ordning. */
export function monsterkolumner(delar: readonly Malldel[]): string[] {
  return delar.filter((d): d is { typ: 'kolumn'; namn: string } => d.typ === 'kolumn').map((d) => d.namn)
}

/**
 * Varför mönstret inte går att köra, eller null när det gör det.
 *
 * Meningarna är konstanta och går därför att slå upp i ordboken, till
 * skillnad från formelmotorns fel som byggs kring ett tecken.
 */
export function monsterfel(delar: readonly Malldel[]): string | null {
  const kolumner = delar.filter((d) => d.typ === 'kolumn')
  if (kolumner.length === 0) {
    return 'Mönstret har ingen klammer att plocka ut. Skriv {Namn} där ett värde står.'
  }
  if (kolumner.some((d) => d.typ === 'kolumn' && d.namn === '')) {
    return 'En klammer saknar namn. Kolumnen skulle bli namnlös.'
  }
  for (let i = 0; i + 1 < delar.length; i++) {
    if (delar[i]!.typ === 'kolumn' && delar[i + 1]!.typ === 'kolumn') {
      return 'Två klamrar i rad går inte att skilja åt. Sätt tecknet som står emellan i mönstret.'
    }
  }
  return null
}

/**
 * Plockar ut ett värde per klammer, eller null när värdet inte matchar.
 *
 * Aldrig ett halvt uttag: matchar inte mönstret får raden tomma celler och
 * räknas som ett problem, medan källkolumnen står kvar orörd. Att skriva
 * `last1 first1` i en kolumn som heter *E-post* vore ett påstående som inte
 * stämmer, och det är värre än en tom cell.
 *
 * Avgränsaren söks från vänster, precis som *Vid första* redan gör. Ett
 * mönster som `{Förnamn} {Efternamn} <{E-post}>` delar därför `Anna Maria
 * Karlsson` som *Anna* + *Maria Karlsson*, inte tvärtom.
 */
export function plockaUr(
  rawValue: string,
  delar: readonly Malldel[],
  trimma: boolean,
): string[] | null {
  const value = normalizeAlways(rawValue)
  const ut: string[] = []
  let pos = 0

  for (let i = 0; i < delar.length; i++) {
    const del = delar[i]!
    if (del.typ === 'text') {
      // En textdel efter en klammer konsumeras av klammerns egen gren, så den
      // här kan bara vara den inledande. Den måste sitta först.
      if (!value.startsWith(del.varde, pos)) return null
      pos += del.varde.length
      continue
    }

    const nasta = delar[i + 1]
    if (nasta === undefined) {
      // Sista klammern utan text efter sig tar resten.
      ut.push(value.slice(pos))
      pos = value.length
      continue
    }
    if (nasta.typ === 'kolumn') return null

    if (i + 2 === delar.length) {
      // Den avslutande texten måste sitta i slutet. Annars hade `>` mitt i en
      // adress kapat värdet på fel ställe.
      const slut = value.length - nasta.varde.length
      if (slut < pos || !value.endsWith(nasta.varde)) return null
      ut.push(value.slice(pos, slut))
      pos = value.length
      i += 1
      continue
    }

    const traff = value.indexOf(nasta.varde, pos)
    if (traff === -1) return null
    ut.push(value.slice(pos, traff))
    pos = traff + nasta.varde.length
    i += 1
  }

  if (pos !== value.length) return null
  return trimma ? ut.map((d) => d.trim()) : ut
}

/**
 * Delaren för en inställning, byggd en gång.
 *
 * Mönstret tolkas här och inte per värde: en kolumn med hundratusen unika
 * adresser hade annars kostat hundratusen tolkningar av samma sträng. Samma
 * grepp som `byggErsattare` i `replace.ts`, och av samma skäl.
 *
 * Null ur delaren betyder *matchade inte*; de tre gamla lägena kan inte
 * misslyckas och returnerar aldrig null.
 */
export function byggDelare(inst: Delning): (varde: string) => string[] | null {
  if (inst.satt === 'monster') {
    const delar = delaMall(inst.monster ?? '')
    return (varde) => plockaUr(varde, delar, inst.trimma)
  }
  return (varde) => delaVarde(varde, inst)
}

/**
 * Hur många värden mönstret träffar, så panelen kan säga det före körningen.
 *
 * Egen funktion i stället för `inventeraDelning`, eftersom `flest` och
 * `utanAvgransare` inte betyder någonting för ett mönster. En panel som
 * återanvänt dem hade sagt något som inte stämde.
 */
export function inventeraMonster(
  varden: readonly string[],
  inst: Delning,
  vikter?: ArrayLike<number>,
): { traffar: number; omatchade: number; exempel: { fore: string; efter: string[] } | null } {
  const plocka = byggDelare(inst)
  let traffar = 0
  let omatchade = 0
  let exempel: { fore: string; efter: string[] } | null = null

  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!
    if (value.trim() === '') continue
    const vikt = vikter ? (vikter[i] ?? 0) : 1
    if (vikt === 0) continue

    const delar = plocka(value)
    if (delar === null) {
      omatchade += vikt
    } else {
      traffar += vikt
      exempel ??= { fore: value, efter: delar }
    }
  }
  return { traffar, omatchade, exempel }
}
