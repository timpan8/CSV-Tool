import { MONTH_NAMES, normalizeAlways } from '../locale/sv.js'

/**
 * Datumtolkning.
 *
 * Två regler bär hela modulen.
 *
 * **Ett datum passerar aldrig ett `Date`-objekt.** `new Date('2026-08-27')`
 * tolkas som midnatt UTC, och `.getFullYear()` i en västlig tidszon ger då
 * 2026-08-26. En hel kolumn hamnar en dag fel utan att någon märker det.
 * Här räknas allt på heltal `{ ar, manad, dag }` och formateras för hand.
 *
 * **Tvetydiga format gissas inte.** `03/04/2026` kan vara 3 april eller
 * 4 mars. Vilket det är avgörs av kolumnen som helhet, inte av raden — och
 * finns inget stöd i datat frågar vi i stället för att välja åt användaren.
 */

export interface Datumdel {
  ar: number
  manad: number
  dag: number
  /** Timme, minut, sekund. Saknas tid är alla noll och `harTid` falsk. */
  timme: number
  minut: number
  sekund: number
  harTid: boolean
}

/** Vilket mönster ett värde kändes igen som. Visas i formatinventeringen. */
export type Formatnyckel =
  | 'iso'
  | 'iso-tid'
  | 'kompakt'
  | 'punkt-eller-snedstreck'
  | 'manadsnamn'
  | 'manadsnamn-forst'
  | 'excel-serie'
  | 'okant'

export const FORMATNAMN: Record<Formatnyckel, string> = {
  iso: 'ÅÅÅÅ-MM-DD',
  'iso-tid': 'ÅÅÅÅ-MM-DD med klockslag',
  kompakt: 'ÅÅÅÅMMDD',
  'punkt-eller-snedstreck': 'DD/MM/ÅÅÅÅ eller MM/DD/ÅÅÅÅ',
  manadsnamn: '27 augusti 2026',
  'manadsnamn-forst': 'augusti 27, 2026',
  'excel-serie': 'Exceldatum (serienummer)',
  okant: 'Går inte att tolka',
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const ISO_TID =
  /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/
const KOMPAKT = /^((?:19|20)\d{2})(\d{2})(\d{2})$/
const TVA_SNEDSTRECK =
  /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
const MANADSNAMN = /^(?:den\s+)?(\d{1,2})[.\s]+([a-zåäö]+)\.?[\s,]+(\d{4})$/i
const MANADSNAMN_FORST = /^([a-zåäö]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i
const BARA_SIFFROR = /^\d+(?:[.,]\d+)?$/

/** Excels nollpunkt. 1899-12-30 absorberar det påhittade skottdygnet 1900-02-29. */
const EXCEL_EPOK = Date.UTC(1899, 11, 30)
/** Rimlighetsfönster för serienummer: ungefär 1954 till 2119. */
const EXCEL_MIN = 20_000
const EXCEL_MAX = 80_000

function giltigtDatum(ar: number, manad: number, dag: number): boolean {
  if (manad < 1 || manad > 12 || dag < 1 || dag > 31) return false
  const kontroll = new Date(Date.UTC(ar, manad - 1, dag))
  // Date.UTC rullar vidare orimliga datum: 2026-02-31 blir 3 mars. Här
  // används Date bara för kalenderaritmetik, aldrig för att bära värdet.
  return kontroll.getUTCMonth() === manad - 1 && kontroll.getUTCDate() === dag
}

/** Tvåsiffrigt årtal: 00–69 blir 2000-talet, 70–99 blir 1900-talet. */
function tolkaAr(text: string): number {
  const n = Number(text)
  if (text.length > 2) return n
  return n <= 69 ? 2000 + n : 1900 + n
}

function del(
  ar: number,
  manad: number,
  dag: number,
  timme = 0,
  minut = 0,
  sekund = 0,
  harTid = false,
): Datumdel {
  return { ar, manad, dag, timme, minut, sekund, harTid }
}

export interface Tolkning {
  format: Formatnyckel
  datum: Datumdel | null
  /**
   * Sant när värdet matchar ett dag/månad-mönster där båda tolkningarna är
   * möjliga — alltså när första talet är högst 12.
   */
  tvetydig: boolean
}

export interface Tolkningsval {
  /** Dag först (svenskt) eller månad först (amerikanskt) vid tvetydighet. */
  dagForst: boolean
  /** Tolka rena tal i rimligt intervall som Excel-serienummer. */
  excelSerie: boolean
}

export const STANDARDVAL: Tolkningsval = { dagForst: true, excelSerie: false }

/**
 * Tolkar ett värde.
 *
 * Tidszonssuffix i ISO-värden ignoreras medvetet: `2026-08-27T23:30:00Z` är
 * det datum som står skrivet, inte det datum det motsvarar i användarens
 * tidszon. Att räkna om skulle flytta värdet en dag för halva dygnet, och en
 * användare som ser 27 i sin fil förväntar sig 27 i resultatet.
 */
export function tolkaDatum(rawValue: string, val: Tolkningsval = STANDARDVAL): Tolkning {
  const value = normalizeAlways(rawValue).trim()
  if (value === '') return { format: 'okant', datum: null, tvetydig: false }

  const isoTid = ISO_TID.exec(value)
  if (isoTid) {
    const [ar, manad, dag] = [Number(isoTid[1]), Number(isoTid[2]), Number(isoTid[3])]
    if (!giltigtDatum(ar, manad, dag)) return { format: 'okant', datum: null, tvetydig: false }
    return {
      format: 'iso-tid',
      datum: del(ar, manad, dag, Number(isoTid[4]), Number(isoTid[5]), Number(isoTid[6] ?? 0), true),
      tvetydig: false,
    }
  }

  const iso = ISO.exec(value)
  if (iso) {
    const [ar, manad, dag] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    if (!giltigtDatum(ar, manad, dag)) return { format: 'okant', datum: null, tvetydig: false }
    return { format: 'iso', datum: del(ar, manad, dag), tvetydig: false }
  }

  const kompakt = KOMPAKT.exec(value)
  if (kompakt) {
    const [ar, manad, dag] = [Number(kompakt[1]), Number(kompakt[2]), Number(kompakt[3])]
    if (giltigtDatum(ar, manad, dag)) {
      return { format: 'kompakt', datum: del(ar, manad, dag), tvetydig: false }
    }
  }

  const tva = TVA_SNEDSTRECK.exec(value)
  if (tva) {
    const forsta = Number(tva[1])
    const andra = Number(tva[2])
    const ar = tolkaAr(tva[3]!)
    const harTid = tva[4] !== undefined
    const timme = Number(tva[4] ?? 0)
    const minut = Number(tva[5] ?? 0)
    const sekund = Number(tva[6] ?? 0)

    // Är ett av talen större än 12 är ordningen given oavsett vad man valt.
    const tvetydig = forsta <= 12 && andra <= 12
    const dagForst = forsta > 12 ? true : andra > 12 ? false : val.dagForst
    const dag = dagForst ? forsta : andra
    const manad = dagForst ? andra : forsta
    if (giltigtDatum(ar, manad, dag)) {
      return {
        format: 'punkt-eller-snedstreck',
        datum: del(ar, manad, dag, timme, minut, sekund, harTid),
        tvetydig,
      }
    }
  }

  const namn = MANADSNAMN.exec(value)
  if (namn) {
    const manad = MONTH_NAMES.get(namn[2]!.toLowerCase())
    const dag = Number(namn[1])
    const ar = Number(namn[3])
    if (manad !== undefined && giltigtDatum(ar, manad, dag)) {
      return { format: 'manadsnamn', datum: del(ar, manad, dag), tvetydig: false }
    }
  }

  const namnForst = MANADSNAMN_FORST.exec(value)
  if (namnForst) {
    const manad = MONTH_NAMES.get(namnForst[1]!.toLowerCase())
    const dag = Number(namnForst[2])
    const ar = Number(namnForst[3])
    if (manad !== undefined && giltigtDatum(ar, manad, dag)) {
      return { format: 'manadsnamn-forst', datum: del(ar, manad, dag), tvetydig: false }
    }
  }

  if (val.excelSerie && BARA_SIFFROR.test(value)) {
    const n = Number(value.replace(',', '.'))
    if (n >= EXCEL_MIN && n <= EXCEL_MAX) {
      const dagar = Math.floor(n)
      const rest = n - dagar
      const d = new Date(EXCEL_EPOK + dagar * 86_400_000)
      const sekunderTotalt = Math.round(rest * 86_400)
      return {
        format: 'excel-serie',
        datum: del(
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
          Math.floor(sekunderTotalt / 3600),
          Math.floor((sekunderTotalt % 3600) / 60),
          sekunderTotalt % 60,
          rest > 0,
        ),
        tvetydig: false,
      }
    }
  }

  return { format: 'okant', datum: null, tvetydig: false }
}

/* ---------- Utskrift ---------- */

export type Malformat = 'datum' | 'datum-tid' | 'ar-manad' | 'ar'

export const MALFORMAT: { varde: Malformat; etikett: string; exempel: string }[] = [
  { varde: 'datum', etikett: 'ÅÅÅÅ-MM-DD', exempel: '2026-08-27' },
  { varde: 'datum-tid', etikett: 'ÅÅÅÅ-MM-DD TT:MM', exempel: '2026-08-27 12:55' },
  { varde: 'ar-manad', etikett: 'ÅÅÅÅ-MM', exempel: '2026-08' },
  { varde: 'ar', etikett: 'ÅÅÅÅ', exempel: '2026' },
]

const tva = (n: number) => (n < 10 ? `0${n}` : String(n))

export function skrivDatum(d: Datumdel, format: Malformat): string {
  const ar = String(d.ar).padStart(4, '0')
  switch (format) {
    case 'ar':
      return ar
    case 'ar-manad':
      return `${ar}-${tva(d.manad)}`
    case 'datum-tid':
      return `${ar}-${tva(d.manad)}-${tva(d.dag)} ${tva(d.timme)}:${tva(d.minut)}`
    case 'datum':
      return `${ar}-${tva(d.manad)}-${tva(d.dag)}`
  }
}

/* ---------- Formatinventering ---------- */

export interface Formatpost {
  format: Formatnyckel
  antal: number
  /** Exempelvärden ur den egna filen. */
  exempel: string[]
}

export interface Inventering {
  poster: Formatpost[]
  /** Antal ifyllda värden som gick att tolka. */
  tolkade: number
  /** Antal ifyllda värden som inte gick att tolka. */
  otolkade: number
  /**
   * Sant när kolumnen innehåller dag/månad-värden som skulle kunna vara
   * bådadera, och inget värde i kolumnen avgör saken.
   */
  tvetydig: boolean
  /**
   * Ett värde ur kolumnen som avgör ordningen, t.ex. 14/03/2026 där 14 inte
   * kan vara en månad. Bevis är bättre än en gissning.
   */
  bevis: string | null
  bevisSagerDagForst: boolean
  /** Antal rena tal i Excel-intervallet, oavsett om tolkning är påslagen. */
  mojligaExcelSerier: number
}

/**
 * Inventerar vilka format en samling värden innehåller.
 *
 * Poängen är att användaren inte ska behöva beskriva sitt format. Verktyget
 * listar vad det hittade, med antal och exempel, och behöver bara ett svar på
 * den enda fråga som datat inte kan besvara själv.
 *
 * `vikter` låter anroparen skicka in en ordbok i stället för en kolumn med
 * rader: varje värde tolkas en gång men räknas som så många celler det
 * representerar. Antalen som visas är då celler, vilket är vad användaren
 * räknar i — inte unika värden.
 */
export function inventera(
  varden: readonly string[],
  val: Tolkningsval = STANDARDVAL,
  vikter?: ArrayLike<number>,
): Inventering {
  const rakning = new Map<Formatnyckel, { antal: number; exempel: string[] }>()
  let tolkade = 0
  let otolkade = 0
  let tvetydigaFinns = false
  let bevis: string | null = null
  let bevisSagerDagForst = true
  let mojligaExcelSerier = 0

  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!.trim()
    if (value === '') continue
    const vikt = vikter ? (vikter[i] ?? 0) : 1
    if (vikt === 0) continue

    const t = tolkaDatum(value, val)
    const post = rakning.get(t.format) ?? { antal: 0, exempel: [] }
    post.antal += vikt
    if (post.exempel.length < 3 && !post.exempel.includes(value)) post.exempel.push(value)
    rakning.set(t.format, post)

    if (t.datum) tolkade += vikt
    else otolkade += vikt
    if (t.tvetydig) tvetydigaFinns = true

    // Leta bevis: ett dag/månad-värde där ett av talen är större än 12.
    if (bevis === null) {
      const m = TVA_SNEDSTRECK.exec(normalizeAlways(value).trim())
      if (m) {
        const forsta = Number(m[1])
        const andra = Number(m[2])
        if (forsta > 12 && andra <= 12) {
          bevis = value
          bevisSagerDagForst = true
        } else if (andra > 12 && forsta <= 12) {
          bevis = value
          bevisSagerDagForst = false
        }
      }
    }

    if (BARA_SIFFROR.test(value)) {
      const n = Number(value.replace(',', '.'))
      if (n >= EXCEL_MIN && n <= EXCEL_MAX) mojligaExcelSerier += vikt
    }
  }

  const poster = [...rakning.entries()]
    .map(([format, v]) => ({ format, antal: v.antal, exempel: v.exempel }))
    .sort((a, b) => b.antal - a.antal)

  return {
    poster,
    tolkade,
    otolkade,
    // Finns bevis i kolumnen är den inte tvetydig — datat har svarat åt oss.
    tvetydig: tvetydigaFinns && bevis === null,
    bevis,
    bevisSagerDagForst,
    mojligaExcelSerier,
  }
}

/* ---------- Omskrivning ---------- */

export type Feltillstand = 'behall' | 'tom' | 'markera'

export interface Datuminstallning extends Tolkningsval {
  mal: Malformat
  onError: Feltillstand
}

export const OGILTIGT = 'OGILTIGT'

/**
 * Bygger transformen som körs genom `mapColumnValues`.
 *
 * Standardvalet vid otolkbara värden är att lämna dem orörda. Att tömma dem
 * vore att kasta det enda som återstår av informationen, och att man ser
 * "i går" kvar i kolumnen är i sig upplysningen om att raden behöver ses över.
 */
export function datumTransform(inst: Datuminstallning): (value: string) => string {
  return (value: string) => {
    if (value.trim() === '') return value
    const t = tolkaDatum(value, inst)
    if (!t.datum) {
      if (inst.onError === 'tom') return ''
      if (inst.onError === 'markera') return OGILTIGT
      return value
    }
    return skrivDatum(t.datum, inst.mal)
  }
}
