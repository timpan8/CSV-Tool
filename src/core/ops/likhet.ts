import type { Column } from '../types.js'
import { byggNormaliserare } from './duplicates.js'

/**
 * Luddig likhet — men bara i restlistan.
 *
 * `match.ts` säger varför de här jämförelserna aldrig får bli en
 * matchningstyp över hela filen: de kräver att varje rad ställs mot varje rad,
 * och två filer med 100 000 rader vardera blir tio miljarder jämförelser.
 * Restlistan är den enda plats där antalet är litet nog — och där varje
 * förslag ändå ska granskas för hand innan det blir ett par.
 *
 * **Trigram och Sørensen–Dice, och skälet är inte noggrannheten.** På korta
 * strängar är Jaro-Winkler ofta bättre på att poängsätta namn. Trigram vinner
 * på en enda egenskap: det inverterade indexet ger blockningen gratis. Ett
 * redigeringsavstånd ger ingen struktur för att slippa jämföra alla par, och
 * då är O(n·m) tillbaka hur bra poängfunktionen än är.
 *
 * **Två namngivna signaler, inte en poäng med påslag.** Stavningen är Dice
 * över teckentrigram; ordningen är Dice över ordmängderna, och det är den som
 * fångar `Ängström Ida` mot `Ida Ängström`. Båda visas i gränssnittet, så att
 * talet säger *varför* — en bonus som måste klampas vid 1,0 hade i stället
 * dolt det.
 *
 * **Taken är obligatoriska.** Ett felvalt kolumnpar gör varje rad till en
 * restrad, och då är restlistan lika stor som filen. Ett tak som slår till ska
 * dessutom vägra och ange ett tal, aldrig tyst korta av.
 */

export interface Likhetsinstallning {
  /** Under den här poängen är förslaget inte värt att titta på. */
  troskel: number
  /** Trigram i fler än så här stor andel av högervärdena hoppas över. */
  stoppandel: number
  /** Restrader per sida. Över det är kolumnparet fel, inte datat. */
  maxRestrader: number
  /** Steg i postningslistorna innan sökningen ger upp. */
  maxSteg: number
  /** Förslag per vänsterrad. Fler än ett, så att ett nej avslöjar tvåan. */
  maxForslagPerRad: number
  /** Totalt antal förslag. Ett gränssnitt kan ändå inte visa fler. */
  maxForslag: number
  /** Kortare värden än så här ger bara brus. */
  minLangd: number
}

export const STANDARDLIKHET: Likhetsinstallning = {
  troskel: 0.65,
  stoppandel: 0.1,
  maxRestrader: 5000,
  maxSteg: 2_000_000,
  maxForslagPerRad: 3,
  maxForslag: 2000,
  minLangd: 4,
}

export interface Likhetspoang {
  /** Dice över paddade teckentrigram, 0–1. */
  stavning: number
  /** Dice över ordmängderna. Fångar omkastad ordföljd. */
  orden: number
  /** Det sammanvägda måttet som tröskelfiltrerar och sorterar. */
  poang: number
}

export interface Forslag {
  v: number
  h: number
  poang: Likhetspoang
  /** Raderna är varandras bästa träff. Starkare än en ensidig topp. */
  omsesidigt: boolean
}

/** Varför inga förslag räknades fram. */
export type Hinder = 'talkolumn' | 'forStoraRestlistor' | 'ingaVarden' | null

export interface Forslagsresultat {
  /** Sorterade med de ömsesidiga och de högsta först. */
  forslag: Forslag[]
  hinder: Hinder
  /** Sant när ett tak slog till innan listan var genomgången. */
  avkortat: boolean
  steg: number
}

const TOMT: Forslagsresultat = { forslag: [], hinder: null, avkortat: false, steg: 0 }

/**
 * Ett unikt värde bland restraderna, med de rader som bär det.
 *
 * Ordboken gäller hela kolumnen. Har den 50 000 poster och restlistan 400
 * rader vore 99 % av trigramarbetet bortkastat, så bara de koder som faktiskt
 * förekommer bland raderna byggs ut.
 */
interface Varde {
  rader: number[]
  /** Distinkta trigramkoder, stigande. */
  trigram: Uint32Array
  /** Distinkta ordkoder, stigande. */
  ord: Uint32Array
}

/**
 * Internering, inte hashning.
 *
 * Frestelsen är FNV-1a till 32 bitar, men Dice räknas på de kodade mängderna:
 * en kollision *höjer* poängen med ungefär 1/|mängd|. Felet skulle alltså peka
 * åt det farliga hållet — ett förslag som ser starkare ut än det är. En karta
 * över de distinkta trigrammen är exakt och knappt långsammare.
 */
function internera(karta: Map<string, number>, text: string): number {
  const befintlig = karta.get(text)
  if (befintlig !== undefined) return befintlig
  const kod = karta.size
  karta.set(text, kod)
  return kod
}

/** Trigram med kantutfyllnad, så att början och slutet av ordet väger. */
function trigram(karta: Map<string, number>, text: string): Uint32Array {
  const vaddat = `  ${text} `
  const koder = new Set<number>()
  for (let i = 0; i + 3 <= vaddat.length; i++) {
    koder.add(internera(karta, vaddat.slice(i, i + 3)))
  }
  return Uint32Array.from(koder).sort()
}

function ordmangd(karta: Map<string, number>, text: string): Uint32Array {
  const koder = new Set<number>()
  for (const ord of text.split(' ')) {
    if (ord !== '') koder.add(internera(karta, ord))
  }
  return Uint32Array.from(koder).sort()
}

/** Antal gemensamma poster i två stigande mängder. */
function gemensamma(a: Uint32Array, b: Uint32Array): number {
  let i = 0
  let j = 0
  let n = 0
  while (i < a.length && j < b.length) {
    const x = a[i]!
    const y = b[j]!
    if (x === y) {
      n += 1
      i += 1
      j += 1
    } else if (x < y) i += 1
    else j += 1
  }
  return n
}

function dice(a: Uint32Array, b: Uint32Array): number {
  if (a.length === 0 || b.length === 0) return 0
  return (2 * gemensamma(a, b)) / (a.length + b.length)
}

function byggVarden(
  col: Column,
  rader: readonly number[],
  minLangd: number,
  trigramkarta: Map<string, number>,
  ordkarta: Map<string, number>,
): Varde[] {
  const normalisera = byggNormaliserare({ skiftlage: true, blanksteg: true, diakriter: true })
  const perKod = new Map<number, number[]>()
  for (const r of rader) {
    const kod = col.codes[r]
    if (kod === undefined) continue
    const lista = perKod.get(kod)
    if (lista) lista.push(r)
    else perKod.set(kod, [r])
  }

  const ut: Varde[] = []
  for (const [kod, egnaRader] of perKod) {
    const text = normalisera(col.dict[kod] ?? '')
    if (text.length < minLangd) continue
    ut.push({
      rader: egnaRader,
      trigram: trigram(trigramkarta, text),
      ord: ordmangd(ordkarta, text),
    })
  }
  return ut
}

/**
 * Föreslår par mellan två restlistor.
 *
 * Namnet skiljer sig från `foreslaPar` i `MergeDialog`, som gissar
 * *kolumnpar* utifrån rubrikerna. Det här gissar radpar utifrån innehållet.
 */
export function foreslaLuddigaPar(
  vanster: Column,
  vRader: readonly number[],
  hoger: Column,
  hRader: readonly number[],
  installning: Likhetsinstallning = STANDARDLIKHET,
): Forslagsresultat {
  // Talkolumner är det värsta felläget och kostar tre rader att stänga:
  // 10021 och 10024 liknar varandra som text, men är olika kunder.
  if (vanster.type === 'number' || hoger.type === 'number') {
    return { ...TOMT, hinder: 'talkolumn' }
  }
  if (
    vRader.length > installning.maxRestrader ||
    hRader.length > installning.maxRestrader
  ) {
    return { ...TOMT, hinder: 'forStoraRestlistor' }
  }

  const trigramkarta = new Map<string, number>()
  const ordkarta = new Map<string, number>()
  const vVarden = byggVarden(vanster, vRader, installning.minLangd, trigramkarta, ordkarta)
  const hVarden = byggVarden(hoger, hRader, installning.minLangd, trigramkarta, ordkarta)
  if (vVarden.length === 0 || hVarden.length === 0) return { ...TOMT, hinder: 'ingaVarden' }

  // Inverterat index över högersidan.
  const index = new Map<number, number[]>()
  for (let j = 0; j < hVarden.length; j++) {
    for (const t of hVarden[j]!.trigram) {
      const lista = index.get(t)
      if (lista) lista.push(j)
      else index.set(t, [j])
    }
  }

  /*
   * Stoppgram: trigram som finns i nästan varje värde bär ingen information,
   * och det är just de som får ett felvalt kolumnpar att degenerera — ett
   * enda trigrams postningslista *är* hela högersidan. De tas inte bort ur
   * indexet, bara ur sökningen: nämnaren i Dice är mängdstorlekar, och ett
   * värde som bara består av stoppgram måste ändå få falla tillbaka på sitt
   * ovanligaste trigram i stället för att visas som "inga förslag".
   */
  const tak = Math.max(2, Math.floor(hVarden.length * installning.stoppandel))
  const stoppgram = new Set<number>()
  if (hVarden.length >= 20) {
    for (const [t, lista] of index) {
      if (lista.length > tak) stoppgram.add(t)
    }
  }

  const delade = new Int32Array(hVarden.length)
  const rorda: number[] = []
  let steg = 0
  let avkortat = false

  interface Kandidat {
    j: number
    poang: Likhetspoang
  }
  const perVanster: Kandidat[][] = []
  // Högersidans bästa vänstervärde, för ömsesidigheten.
  const bastaHoger = new Float64Array(hVarden.length)
  const bastaHogersVanster = new Int32Array(hVarden.length).fill(-1)

  for (let i = 0; i < vVarden.length && !avkortat; i++) {
    const v = vVarden[i]!
    rorda.length = 0

    for (const t of v.trigram) {
      if (stoppgram.has(t)) continue
      const lista = index.get(t)
      if (!lista) continue
      steg += lista.length
      for (const j of lista) {
        if (delade[j]! === 0) rorda.push(j)
        delade[j]! += 1
      }
      if (steg > installning.maxSteg) {
        avkortat = true
        break
      }
    }

    // Bestod värdet bara av stoppgram: fall tillbaka på det ovanligaste.
    if (rorda.length === 0 && v.trigram.length > 0) {
      let ovanligast = -1
      let minst = Infinity
      for (const t of v.trigram) {
        const n = index.get(t)?.length ?? Infinity
        if (n < minst) {
          minst = n
          ovanligast = t
        }
      }
      for (const j of index.get(ovanligast) ?? []) {
        if (delade[j]! === 0) rorda.push(j)
        delade[j]! += 1
        steg += 1
      }
    }

    const kandidater: Kandidat[] = []
    for (const j of rorda) {
      const h = hVarden[j]!
      const stavning = (2 * delade[j]!) / (v.trigram.length + h.trigram.length)
      const orden = dice(v.ord, h.ord)
      // Ordmängden väger något lägre än en ren stavningsträff: samma ord i
      // annan ordning är starkt, men inte starkare än samma sträng.
      const poang = Math.max(stavning, 0.95 * orden)
      if (poang >= installning.troskel) kandidater.push({ j, poang: { stavning, orden, poang } })
      delade[j] = 0
    }
    rorda.length = 0

    kandidater.sort((a, b) => b.poang.poang - a.poang.poang || a.j - b.j)
    const behallna = kandidater.slice(0, installning.maxForslagPerRad)
    perVanster.push(behallna)

    for (const k of behallna) {
      if (k.poang.poang > bastaHoger[k.j]!) {
        bastaHoger[k.j] = k.poang.poang
        bastaHogersVanster[k.j] = i
      }
    }
  }

  const forslag: Forslag[] = []
  for (let i = 0; i < perVanster.length; i++) {
    const behallna = perVanster[i]!
    for (let n = 0; n < behallna.length; n++) {
      const k = behallna[n]!
      const omsesidigt = n === 0 && bastaHogersVanster[k.j] === i
      for (const v of vVarden[i]!.rader) {
        for (const h of hVarden[k.j]!.rader) {
          if (forslag.length >= installning.maxForslag) {
            return { forslag: sortera(forslag), hinder: null, avkortat: true, steg }
          }
          forslag.push({ v, h, poang: k.poang, omsesidigt })
        }
      }
    }
  }

  return { forslag: sortera(forslag), hinder: null, avkortat, steg }
}

/** Ömsesidiga först, sedan de högsta. Ordningen är deterministisk. */
function sortera(forslag: Forslag[]): Forslag[] {
  return forslag.sort(
    (a, b) =>
      Number(b.omsesidigt) - Number(a.omsesidigt) ||
      b.poang.poang - a.poang.poang ||
      a.v - b.v ||
      a.h - b.h,
  )
}
