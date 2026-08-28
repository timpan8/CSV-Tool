import type { Column, ColumnId, ColumnType, Frame } from '../types.js'
import { findColumn } from '../frame/frame.js'
import { matchDictionary } from '../frame/column.js'
import { datumnycklar, talnycklar } from '../frame/rank.js'
import { violatesType } from '../infer.js'
import { normalizeAlways } from '../locale/sv.js'
import { tolkaDatum } from './dates.js'

/**
 * Filter.
 *
 * **Varje operator är en funktion av cellvärdet ensamt.** Det är inte en
 * begränsning utan hela poängen: en regel kan då räknas som en mask över
 * ordboken, så en kolumn med 300 orter kostar 300 jämförelser oavsett om
 * tabellen har tusen rader eller en miljon.
 *
 * Regler som inte går att köra — ett trasigt reguljärt uttryck, en kolumn som
 * tagits bort — rapporteras i stället för att tyst släppa igenom allt. En
 * användare som ser sitt filter i listan ska kunna lita på att det filtrerar.
 */

export type Operator =
  | 'ar'
  | 'arInte'
  | 'iLista'
  | 'innehaller'
  | 'innehallerInte'
  | 'borjarMed'
  | 'slutarMed'
  | 'regex'
  | 'tom'
  | 'ifylld'
  | 'ogiltig'
  | 'storreAn'
  | 'minstLika'
  | 'mindreAn'
  | 'hogstLika'
  | 'mellan'
  | 'langreAn'
  | 'kortareAn'

export interface Operatorpost {
  op: Operator
  etikett: string
  /** Kolumntyper där operatorn erbjuds. Tom lista = alla. */
  gallerFor: ColumnType[]
  /** Antal värdefält operatorn behöver. */
  falt: 0 | 1 | 2
}

export const OPERATORER: Operatorpost[] = [
  { op: 'ar', etikett: 'är', gallerFor: [], falt: 1 },
  { op: 'arInte', etikett: 'är inte', gallerFor: [], falt: 1 },
  { op: 'iLista', etikett: 'är något av', gallerFor: [], falt: 0 },
  { op: 'innehaller', etikett: 'innehåller', gallerFor: [], falt: 1 },
  { op: 'innehallerInte', etikett: 'innehåller inte', gallerFor: [], falt: 1 },
  { op: 'borjarMed', etikett: 'börjar med', gallerFor: [], falt: 1 },
  { op: 'slutarMed', etikett: 'slutar med', gallerFor: [], falt: 1 },
  { op: 'storreAn', etikett: 'större än', gallerFor: ['number', 'date'], falt: 1 },
  { op: 'minstLika', etikett: 'minst', gallerFor: ['number', 'date'], falt: 1 },
  { op: 'mindreAn', etikett: 'mindre än', gallerFor: ['number', 'date'], falt: 1 },
  { op: 'hogstLika', etikett: 'högst', gallerFor: ['number', 'date'], falt: 1 },
  { op: 'mellan', etikett: 'mellan', gallerFor: ['number', 'date'], falt: 2 },
  { op: 'langreAn', etikett: 'är längre än', gallerFor: [], falt: 1 },
  { op: 'kortareAn', etikett: 'är kortare än', gallerFor: [], falt: 1 },
  { op: 'tom', etikett: 'är tom', gallerFor: [], falt: 0 },
  { op: 'ifylld', etikett: 'är ifylld', gallerFor: [], falt: 0 },
  { op: 'ogiltig', etikett: 'går inte att tolka', gallerFor: [], falt: 0 },
  { op: 'regex', etikett: 'matchar uttrycket', gallerFor: [], falt: 1 },
]

export function operatorerFor(type: ColumnType): Operatorpost[] {
  return OPERATORER.filter((o) => o.gallerFor.length === 0 || o.gallerFor.includes(type))
}

export function operatorpost(op: Operator): Operatorpost {
  return OPERATORER.find((o) => o.op === op) ?? OPERATORER[0]!
}

export interface Filterregel {
  id: string
  colId: ColumnId
  operator: Operator
  varde: string
  /** Övre gräns för `mellan`. */
  varde2?: string
  /** Valda värden för `iLista`. */
  varden?: string[]
  versalkanslig?: boolean
  /** En avslagen regel ligger kvar i listan men räknas inte. */
  av?: boolean
}

export interface Filter {
  regler: Filterregel[]
  koppling: 'alla' | 'nagon'
  /**
   * Visa de rader filtret annars döljer.
   *
   * Vändningen sker på resultatet, inte på varje regel. ”Inte (Ort är Malmö
   * och Status är Aktiv)” är en annan mängd än ”Ort är inte Malmö och Status
   * är inte Aktiv”, och det är den första man menar när man vill se vad man
   * sorterat bort.
   */
  inverterat?: boolean
}

export const TOMT_FILTER: Filter = { regler: [], koppling: 'alla' }

export interface Regelfel {
  regelId: string
  text: string
}

let raknare = 0
export function nyRegelId(): string {
  raknare += 1
  return `r${raknare.toString(36)}`
}

/** Regeln har allt den behöver för att kunna köras. */
function arKomplett(regel: Filterregel): boolean {
  const post = operatorpost(regel.operator)
  if (regel.operator === 'iLista') return (regel.varden?.length ?? 0) > 0
  if (post.falt === 0) return true
  if (regel.varde.trim() === '') return false
  return post.falt === 1 || (regel.varde2 ?? '').trim() !== ''
}

/**
 * Reglerna som faktiskt begränsar något.
 *
 * En avslagen, ofärdig eller kolumnlös regel ligger kvar i listan — den ska
 * kunna slås på igen, skrivas färdigt, eller vakna till liv när ett `Ctrl+Z`
 * lägger tillbaka kolumnen den pekar på.
 */
export function aktivaRegler(frame: Frame, filter: Filter): Filterregel[] {
  return filter.regler.filter(
    (r) => r.av !== true && arKomplett(r) && findColumn(frame, r.colId) !== undefined,
  )
}

function nyckel(value: string, versalkanslig: boolean): string {
  const v = normalizeAlways(value)
  return versalkanslig ? v : v.toLocaleLowerCase('sv')
}

/** Tolkar regelns värde som tal eller datum, beroende på kolumnens typ. */
function granstal(col: Column, text: string): number {
  if (col.type === 'date') {
    const d = tolkaDatum(text).datum
    if (!d) return Number.NaN
    return (
      d.ar * 10_000_000_000 +
      d.manad * 100_000_000 +
      d.dag * 1_000_000 +
      d.timme * 10_000 +
      d.minut * 100 +
      d.sekund
    )
  }
  const n = Number(normalizeAlways(text).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

/**
 * Mask per ordbokskod för en regel.
 *
 * Ett trasigt reguljärt uttryck är ett svar, inte ett undantag — samma
 * hållning som `byggErsattare` i `replace.ts`. Masken blir tom och felet
 * följer med tillbaka, så gränssnittet kan visa det medan man skriver.
 */
export function regelmask(col: Column, regel: Filterregel): { mask: Uint8Array; fel: string | null } {
  const { mask, fel } = raknaMask(col, regel)
  // En tom cell matchar bara den regel som uttryckligen frågar efter tomhet.
  // Den är inte "inte Malmö" — den är okänd, precis som ett otolkbart tal
  // varken är större eller mindre än något. Vill man åt dem finns `tom`, och
  // i en värdelista går de att kryssa i för hand.
  const tomFarMatcha =
    regel.operator === 'tom' ||
    (regel.operator === 'iLista' && (regel.varden ?? []).some((v) => v.trim() === ''))
  if (!tomFarMatcha) mask[0] = 0
  return { mask, fel }
}

function raknaMask(col: Column, regel: Filterregel): { mask: Uint8Array; fel: string | null } {
  const tom = () => ({ mask: new Uint8Array(col.dict.length), fel: null })
  const kansligt = regel.versalkanslig === true

  switch (regel.operator) {
    case 'tom': {
      const mask = new Uint8Array(col.dict.length)
      mask[0] = 1
      return { mask, fel: null }
    }
    case 'ifylld': {
      const mask = new Uint8Array(col.dict.length).fill(1)
      mask[0] = 0
      return { mask, fel: null }
    }
    case 'ogiltig':
      return { mask: matchDictionary(col, (v) => v !== '' && violatesType(v, col.type)), fel: null }

    case 'langreAn':
    case 'kortareAn': {
      // Tecken räknas på det normaliserade och trimmade värdet, alltså på det
      // som faktiskt står i cellen — inte på osynliga blanksteg runt om.
      const gräns = Number(regel.varde.trim())
      if (!Number.isFinite(gräns)) {
        return { mask: tom().mask, fel: 'Skriv ett antal tecken.' }
      }
      const langre = regel.operator === 'langreAn'
      return {
        mask: matchDictionary(col, (v) => {
          const n = [...normalizeAlways(v).trim()].length
          return langre ? n > gräns : n < gräns
        }),
        fel: null,
      }
    }

    case 'iLista': {
      const valda = new Set((regel.varden ?? []).map((v) => nyckel(v, kansligt)))
      return { mask: matchDictionary(col, (v) => valda.has(nyckel(v, kansligt))), fel: null }
    }

    case 'regex': {
      let re: RegExp
      try {
        re = new RegExp(regel.varde, kansligt ? 'u' : 'iu')
      } catch (e) {
        return { mask: tom().mask, fel: `Uttrycket går inte att tolka: ${(e as Error).message}` }
      }
      // Uttrycket saknar g-flaggan med flit: ett globalt regex bär tillstånd i
      // lastIndex och skulle missa varannan ordbokspost.
      return { mask: matchDictionary(col, (v) => re.test(v)), fel: null }
    }

    case 'storreAn':
    case 'minstLika':
    case 'mindreAn':
    case 'hogstLika':
    case 'mellan': {
      const varden = col.type === 'date' ? datumnycklar(col) : talnycklar(col)
      const a = granstal(col, regel.varde)
      const b = granstal(col, regel.varde2 ?? '')
      if (Number.isNaN(a) || (regel.operator === 'mellan' && Number.isNaN(b))) {
        return {
          mask: tom().mask,
          fel: col.type === 'date' ? 'Skriv ett datum att jämföra med.' : 'Skriv ett tal att jämföra med.',
        }
      }
      const mask = new Uint8Array(col.dict.length)
      // Otolkbara värden matchar aldrig en storleksjämförelse. De är inte
      // "mindre än" något — de går inte att jämföra alls.
      for (let kod = 1; kod < col.dict.length; kod++) {
        const x = varden[kod]!
        if (Number.isNaN(x)) continue
        const traff =
          regel.operator === 'storreAn'
            ? x > a
            : regel.operator === 'minstLika'
              ? x >= a
              : regel.operator === 'mindreAn'
                ? x < a
                : regel.operator === 'hogstLika'
                  ? x <= a
                  : x >= Math.min(a, b) && x <= Math.max(a, b)
        if (traff) mask[kod] = 1
      }
      return { mask, fel: null }
    }

    default: {
      const sokt = nyckel(regel.varde, kansligt)
      const test = (v: string): boolean => {
        const k = nyckel(v, kansligt)
        switch (regel.operator) {
          case 'ar':
            return k === sokt
          case 'arInte':
            return k !== sokt
          case 'innehaller':
            return k.includes(sokt)
          case 'innehallerInte':
            return !k.includes(sokt)
          case 'borjarMed':
            return k.startsWith(sokt)
          case 'slutarMed':
            return k.endsWith(sokt)
          default:
            return false
        }
      }
      return { mask: matchDictionary(col, test), fel: null }
    }
  }
}

/**
 * Raderna ur `utgangslage` som filtret släpper igenom, i samma ordning.
 *
 * Resultatet är alltid en **delföljd** av utgångsordningen, aldrig en
 * omsortering av den. Det är det som gör att en sortering överlever ett
 * filter.
 */
export function tillampaFilter(
  frame: Frame,
  filter: Filter,
  utgangslage: Uint32Array,
): { rader: Uint32Array; fel: Regelfel[] } {
  const regler = aktivaRegler(frame, filter)
  const fel: Regelfel[] = []
  // Utan aktiva regler döljs ingenting, och då finns det inget att vända på
  // heller. Ett tänt `inverterat` med tom regellista visar alltså allt, inte
  // ingenting — annars skulle en tom skärm mötas av den som slår på växeln
  // innan hen skrivit sin regel.
  if (regler.length === 0) return { rader: utgangslage, fel }

  const masker: { col: Column; mask: Uint8Array }[] = []
  for (const regel of regler) {
    const col = findColumn(frame, regel.colId)!
    const { mask, fel: regelfel } = regelmask(col, regel)
    if (regelfel !== null) {
      fel.push({ regelId: regel.id, text: regelfel })
      continue
    }
    masker.push({ col, mask })
  }
  if (masker.length === 0) return { rader: utgangslage, fel }

  const alla = filter.koppling === 'alla'
  const vand = filter.inverterat === true
  const traffar: number[] = []
  for (let i = 0; i < utgangslage.length; i++) {
    const r = utgangslage[i]!
    let slapp = alla
    for (const { col, mask } of masker) {
      const traff = mask[col.codes[r]!] === 1
      if (alla && !traff) {
        slapp = false
        break
      }
      if (!alla && traff) {
        slapp = true
        break
      }
    }
    if (slapp !== vand) traffar.push(r)
  }
  return { rader: Uint32Array.from(traffar), fel }
}

/** "Ort är Malmö" — chippets text. */
export function beskrivRegel(frame: Frame, regel: Filterregel): string {
  const col = findColumn(frame, regel.colId)
  const namn = col?.name ?? 'Borttagen kolumn'
  const post = operatorpost(regel.operator)

  if (regel.operator === 'iLista') {
    const n = regel.varden?.length ?? 0
    if (n <= 2) return `${namn} är ${(regel.varden ?? []).join(' eller ')}`
    return `${namn} är något av ${n}`
  }
  if (post.falt === 0) return `${namn} ${post.etikett}`
  if (post.falt === 2) return `${namn} ${post.etikett} ${regel.varde}–${regel.varde2 ?? ''}`
  if (regel.operator === 'langreAn' || regel.operator === 'kortareAn') {
    return `${namn} ${post.etikett} ${regel.varde} tecken`
  }
  return `${namn} ${post.etikett} ${regel.varde}`
}
