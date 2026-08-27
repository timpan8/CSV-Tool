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

export type Delningssatt = 'avgransare' | 'forsta' | 'sista' | 'position'

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
 * Tolkar en mall som `{Förnamn} {Efternamn}`.
 *
 * Namn som inte finns i filen rapporteras i stället för att tyst bli tomma.
 * Ett stavfel i ett kolumnnamn ger annars en kolumn full av halva värden, och
 * det är svårt att upptäcka när man bara ser resultatet.
 */
export function tolkaMall(text: string, frame: Frame): Malltolkning {
  const delar: Malldel[] = []
  const okanda: string[] = []
  const anvanda: string[] = []
  let sist = 0

  PLATSHALLARE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLATSHALLARE.exec(text)) !== null) {
    if (m.index > sist) delar.push({ typ: 'text', varde: text.slice(sist, m.index) })
    const namn = m[1]!.trim()
    delar.push({ typ: 'kolumn', namn })
    const finns = frame.columns.some((c) => c.name === namn)
    if (finns) {
      if (!anvanda.includes(namn)) anvanda.push(namn)
    } else if (!okanda.includes(namn)) {
      okanda.push(namn)
    }
    sist = m.index + m[0].length
  }
  if (sist < text.length) delar.push({ typ: 'text', varde: text.slice(sist) })

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
