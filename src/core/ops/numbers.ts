import { normalizeAlways } from '../locale/sv.js'

/**
 * Talstädning.
 *
 * Ett belopp som kommer ur ett affärssystem ser sällan ut som ett tal:
 * `1 240,50 kr`, `(1 240,50)`, `12 %`, `1,240.50`, `1234-`. Verktyget skalar
 * av det som inte är siffror och skriver om resten till ett format som går
 * att räkna med.
 *
 * Precis som i datumverktyget finns här en tvetydighet som inte gissas bort.
 * `1.234` kan vara ettusen tvåhundratrettiofyra eller talet 1,234. Vilket det
 * är avgörs av kolumnen som helhet — finns någonstans ett värde med både
 * punkt och komma, eller en punkt som inte följs av exakt tre siffror, så vet
 * vi. Annars frågar vi.
 */

export interface Talval {
  /** Punkt är tusentalsavgränsare (`1.234` = 1234), inte decimaltecken. */
  punktArTusental: boolean
}

export const STANDARDVAL: Talval = { punktArTusental: false }

export interface Taltolkning {
  /** Talet, eller null när värdet inte innehåller något tal. */
  tal: number | null
  /** Det som stod runt talet: `kr`, `%`, `SEK`, `€`. Tomt när inget fanns. */
  enhet: string
  /** Värdet var negativt genom parentes eller efterställt minus. */
  negativFormat: boolean
}

/** Tecken som förekommer som tusentalsavgränsare. Hårt mellanslag är redan normaliserat. */
const TUSENTAL = /[  ']/g
const PUNKT_TUSENTAL = /^\d{1,3}(\.\d{3})+$/
const PUNKT_TUSENTAL_MED_KOMMA = /^\d{1,3}(\.\d{3})+,\d+$/
const KOMMA_TUSENTAL_MED_PUNKT = /^\d{1,3}(,\d{3})+\.\d+$/
const KOMMA_TUSENTAL = /^\d{1,3}(,\d{3})+$/
const SIFFROR = /\d/

/**
 * Tolkar ett värde som ett tal.
 *
 * Ordningen är medveten: negativa former läses av först, sedan skalas enheten
 * bort, och först på det som återstår avgörs vilket tecken som är decimal.
 * Att blanda ihop stegen är hur `(1 234,50) kr` blir 123450.
 */
export function tolkaTal(rawValue: string, val: Talval = STANDARDVAL): Taltolkning {
  let v = normalizeAlways(rawValue).trim()
  if (v === '') return { tal: null, enhet: '', negativFormat: false }

  let negativ = false
  let negativFormat = false

  // (1 234,50) är bokföringens negativa tal.
  if (v.startsWith('(') && v.endsWith(')')) {
    negativ = true
    negativFormat = true
    v = v.slice(1, -1).trim()
  }
  // 1234- är SAP:s och en del ekonomisystems efterställda minustecken.
  if (/-$/.test(v) && SIFFROR.test(v)) {
    negativ = true
    negativFormat = true
    v = v.slice(0, -1).trim()
  }
  if (v.startsWith('-')) {
    negativ = !negativ
    v = v.slice(1).trim()
  } else if (v.startsWith('+')) {
    v = v.slice(1).trim()
  }

  // Allt som inte är siffra, komma eller punkt räknas som enhet. Den plockas
  // ut i stället för att bara kastas, så att panelen kan visa vad som fanns.
  const enhet = v.replace(/[\d.,\s ']/g, '').trim()
  let kropp = v.replace(/[^\d.,\s ']/g, '').replace(TUSENTAL, '').trim()
  if (kropp === '' || !SIFFROR.test(kropp)) {
    return { tal: null, enhet, negativFormat }
  }

  // Vilket tecken som är decimal.
  if (KOMMA_TUSENTAL_MED_PUNKT.test(kropp)) {
    // 1,234.50 — engelsk form, entydig.
    kropp = kropp.replace(/,/g, '')
  } else if (PUNKT_TUSENTAL_MED_KOMMA.test(kropp)) {
    // 1.234,50 — kontinental form, entydig.
    kropp = kropp.replace(/\./g, '').replace(',', '.')
  } else if (KOMMA_TUSENTAL.test(kropp) && !kropp.includes('.')) {
    // 1,234 utan decimaler: samma tvetydighet som punkten, men komma som
    // tusental förekommer bara i engelsk form, där punkten är decimal.
    kropp = val.punktArTusental ? kropp.replace(',', '.') : kropp.replace(/,/g, '')
  } else if (PUNKT_TUSENTAL.test(kropp) && !kropp.includes(',')) {
    kropp = val.punktArTusental ? kropp.replace(/\./g, '') : kropp
  } else {
    kropp = kropp.replace(',', '.')
  }

  // Fler än ett decimaltecken kvar betyder att värdet inte är ett tal.
  if ((kropp.match(/\./g)?.length ?? 0) > 1 || kropp.includes(',')) {
    return { tal: null, enhet, negativFormat }
  }

  const n = Number(kropp)
  if (!Number.isFinite(n)) return { tal: null, enhet, negativFormat }
  return { tal: negativ ? -n : n, enhet, negativFormat }
}

export type Talformat = 'komma' | 'punkt'

export const TALFORMAT: { varde: Talformat; etikett: string; exempel: string }[] = [
  { varde: 'komma', etikett: 'Decimalkomma', exempel: '1240,5' },
  { varde: 'punkt', etikett: 'Decimalpunkt', exempel: '1240.5' },
]

/**
 * Skriver ett tal.
 *
 * Utan tusentalsavgränsare, alltid. Avgränsaren är till för att läsas av
 * människor; ett tal i en fil ska kunna läsas av nästa program.
 */
export function skrivTal(n: number, format: Talformat, decimaler: number | null): string {
  const text = decimaler === null ? String(n) : n.toFixed(decimaler)
  return format === 'komma' ? text.replace('.', ',') : text
}

export interface Talinstallning extends Talval {
  format: Talformat
  /** Fast antal decimaler, eller null för "så många som värdet har". */
  decimaler: number | null
  onError: 'behall' | 'tom' | 'markera'
}

export const OGILTIGT = 'OGILTIGT'

export function talTransform(inst: Talinstallning): (value: string) => string {
  return (value: string) => {
    if (value.trim() === '') return value
    const t = tolkaTal(value, inst)
    if (t.tal === null) {
      if (inst.onError === 'tom') return ''
      if (inst.onError === 'markera') return OGILTIGT
      return value
    }
    return skrivTal(t.tal, inst.format, inst.decimaler)
  }
}

export interface Talinventering {
  /** Antal celler som innehåller ett tolkningsbart tal. */
  tal: number
  ejTal: number
  /** Enheter som skalas bort, med antal. */
  enheter: { enhet: string; antal: number }[]
  negativaFormat: number
  /**
   * Sant när kolumnen innehåller värden som `1.234` och inget annat värde
   * avgör om punkten är tusental eller decimal.
   */
  tvetydig: boolean
  /** Värdet som avgör saken, om det finns. */
  bevis: string | null
  bevisSagerTusental: boolean
  storstaAntalDecimaler: number
}

export function inventeraTal(
  varden: readonly string[],
  val: Talval = STANDARDVAL,
  vikter?: readonly number[],
): Talinventering {
  let tal = 0
  let ejTal = 0
  let negativaFormat = 0
  let tvetydigaFinns = false
  let bevis: string | null = null
  let bevisSagerTusental = false
  let storstaAntalDecimaler = 0
  const enheter = new Map<string, number>()

  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!.trim()
    if (value === '') continue
    const vikt = vikter ? (vikter[i] ?? 0) : 1
    if (vikt === 0) continue

    const t = tolkaTal(value, val)
    if (t.tal === null) ejTal += vikt
    else tal += vikt
    if (t.enhet !== '') enheter.set(t.enhet, (enheter.get(t.enhet) ?? 0) + vikt)
    if (t.negativFormat) negativaFormat += vikt

    const kropp = normalizeAlways(value).replace(/[^\d.,]/g, '')
    if (PUNKT_TUSENTAL.test(kropp)) tvetydigaFinns = true
    if (bevis === null) {
      if (PUNKT_TUSENTAL_MED_KOMMA.test(kropp)) {
        bevis = value
        bevisSagerTusental = true
      } else if (KOMMA_TUSENTAL_MED_PUNKT.test(kropp)) {
        bevis = value
        bevisSagerTusental = false
      } else if (/^\d+\.\d{1,2}$/.test(kropp) || /^\d+\.\d{4,}$/.test(kropp)) {
        // En punkt som inte följs av exakt tre siffror kan inte vara tusental.
        bevis = value
        bevisSagerTusental = false
      }
    }

    if (t.tal !== null) {
      const efter = String(t.tal).split('.')[1]
      if (efter) storstaAntalDecimaler = Math.max(storstaAntalDecimaler, efter.length)
    }
  }

  return {
    tal,
    ejTal,
    enheter: [...enheter.entries()]
      .map(([enhet, antal]) => ({ enhet, antal }))
      .sort((a, b) => b.antal - a.antal),
    negativaFormat,
    tvetydig: tvetydigaFinns && bevis === null,
    bevis,
    bevisSagerTusental,
    storstaAntalDecimaler,
  }
}
