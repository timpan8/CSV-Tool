import type { Frame } from '../types.js'
import { findColumn } from '../frame/frame.js'
import { arAdditiv, kolumnrubrik, type Pivotplan, type Pivotresultat } from './pivot.js'

/**
 * Diagrammets data.
 *
 * Ingen ny beräkning — en andra läsning av pivotens matris. Det är därför
 * tabellen och diagrammet aldrig kan säga olika saker: de delar `resultat`,
 * och den här filen väljer bara ut, kapar och vänder på det som redan står
 * där.
 *
 * Ingen DOM, inga mått, inga färger. Ritningen bor i `Diagram.tsx`; det som
 * går att pröva utan en webbläsare bor här.
 */

export type Diagramtyp = 'staplar' | 'liggande' | 'linje' | 'cirkel'
export type Stapellage = 'grupperade' | 'staplade'

/** Hur cellernas tal ska läsas — samma val som tabellen har. */
export type Diagramvisning = 'tal' | 'andelRad' | 'andelKolumn'

export interface Diagramplan {
  typ: Diagramtyp
  stapellage: Stapellage
  /** Vilket mätvärde som ritas. En skala per diagram — aldrig två. */
  matvarde: number
}

export interface Diagramserie {
  etikett: string
  /**
   * Palettplats 0–7.
   *
   * Följer serien, aldrig dess rang. Tas en serie bort ur urvalet behåller de
   * kvarvarande sina färger — annars hade en filtrering målat om hela bilden
   * och läsaren hade fått lära om vad blått betyder.
   */
  slot: number
  /** Ett per kategori. `null` är en tom cell, inte en nolla. */
  varden: (number | null)[]
}

export interface Diagramdata {
  kategorier: string[]
  serier: Diagramserie[]
  /** Skalans ändar över allt som ritas. Båda 0 när det inte finns något tal. */
  max: number
  min: number
  utelamnadeSerier: number
  utelamnadeKategorier: number
  /** Varför en typ inte går att välja just nu. Saknas nyckeln går den bra. */
  hinder: Partial<Record<Diagramtyp, string>>
}

/**
 * Hur många serier en bild rymmer.
 *
 * Åtta färger är vad ett öga håller isär, och en nionde nyans går inte att
 * skilja från någon av de åtta för den som är färgblind. Fler serier löses
 * aldrig med fler färger — de räknas och sägs.
 */
export const SERIETAK = 8

/**
 * Hur många kategorier en bild rymmer.
 *
 * Trettio staplar är redan tätt; tvåhundra är en gardin där ingen enskild
 * stapel går att peka på. Tabellen tar dem allihop.
 */
export const KATEGORITAK = 30

/** Så många tårtbitar en cirkel klarar innan den slutar gå att läsa. */
export const CIRKELTAK = 6

export function diagramdata(
  resultat: Pivotresultat,
  plan: Pivotplan,
  d: Diagramplan,
  /** Radernas ordning i tabellen, som index in i `resultat.rader`. */
  ordning: readonly number[],
  visning: Diagramvisning = 'tal',
  /**
   * Vad tomt och Övriga heter.
   *
   * De två orden är de enda i den här filen som är text för en läsare och inte
   * data ur filen, och därför de enda som kommer utifrån. Resten av
   * serienamnen står i kolumnen.
   */
  texter: { tomt: string; ovriga: string } = { tomt: '', ovriga: '' },
): Diagramdata {
  const steg = Math.max(1, plan.matvarden.length)
  const m = Math.min(Math.max(0, d.matvarde), steg - 1)
  const totalkol = resultat.bredd - 1
  const totalrad = resultat.rader.length

  /*
   * Bara lövrader ritas.
   *
   * En delsummerad nivå är summan av sina barn. Att rita båda vore att räkna
   * varje källrad två gånger — i tabellen syns skillnaden som indrag, i ett
   * stapeldiagram som en stapel dubbelt så hög bredvid sina egna delar.
   */
  /*
   * Bara kolumnfält, inga radfält: tabellen visar en Totalt-rad med tal, och
   * det är de talen som ska ritas. Kolumnlöven blir kategorier och Totalt-raden
   * den enda serien — samma bild som om fälten legat i Rader, vilket är precis
   * vad man menar när man lägger dem i Kolumner och ändå vill se staplar.
   */
  if (resultat.rader.length === 0 && resultat.kolumner.length > 0) {
    return kolumnlovSomKategorier(resultat, plan, m, visning, texter)
  }

  // Lövnivån läses ur resultatet, inte ur planen: ett radfält vars kolumn
  // tagits bort finns i planen men inte i tabellen, och då är sista nivån en
  // mindre än planen säger.
  const sistaNiva = resultat.rader.reduce((hogst, r) => Math.max(hogst, r.niva), 0)
  const lov = ordning.filter((i) => resultat.rader[i]?.niva === sistaNiva)

  /*
   * Kategorierna tas i tabellens ordning, inte i storleksordning.
   *
   * Hade taket plockat de största hade en klicksortering i tabellen bytt
   * vilka rader som ens fanns i bilden. Sorterar man fallande är de trettio
   * första också de största, vilket är precis vad man då bad om.
   */
  const valda = lov.slice(0, KATEGORITAK)
  const utelamnadeKategorier = lov.length - valda.length

  const kategorier = valda.map((i) => {
    const rad = resultat.rader[i]!
    return rad.etiketter[rad.niva] ?? ''
  })

  const cell = cellavlasare(resultat, steg, m, visning)

  /*
   * Serierna är kolumndimensionens värden. Utan kolumndimension finns en
   * enda serie — Totalt-kolumnen — och den är då inte en "total" utan hela
   * svaret.
   */
  const kandidater =
    resultat.kolumner.length === 0
      ? [{ kol: totalkol, etikett: '' }]
      : resultat.kolumner.map((lov, kol) => ({
          kol,
          // Hela vägen genom kolumnfälten. Med ett fält är det värdet som
          // förut; med flera är `Sverige` ensamt tvetydigt så fort samma land
          // står under både Aktiv och Vilande.
          etikett: kolumnrubrik(lov, texter.tomt, texter.ovriga),
        }))

  /*
   * Vilka serier som får plats avgörs av storleken, mätt på Totalt-raden —
   * det är det enda måttet som gäller hela bilden och inte en enskild
   * kategori. Ordningen de sedan står i är kolumndimensionens egen, som
   * kärnan redan lagt i läsordning.
   */
  const efterStorlek = [...kandidater].sort((a, b) => {
    const va = Math.abs(cell(totalrad, a.kol))
    const vb = Math.abs(cell(totalrad, b.kol))
    if (Number.isNaN(va) && Number.isNaN(vb)) return a.kol - b.kol
    if (Number.isNaN(va)) return 1
    if (Number.isNaN(vb)) return -1
    return vb - va || a.kol - b.kol
  })
  const behallna = new Set(efterStorlek.slice(0, SERIETAK).map((k) => k.kol))
  const utelamnadeSerier = kandidater.length - behallna.size

  const serier: Diagramserie[] = kandidater
    .filter((k) => behallna.has(k.kol))
    .map((k, slot) => ({
      etikett: k.etikett,
      slot,
      varden: valda.map((rad) => {
        const v = cell(rad, k.kol)
        return Number.isNaN(v) ? null : v
      }),
    }))

  let max = 0
  let min = 0
  let harTal = false
  for (const serie of serier) {
    for (const v of serie.varden) {
      if (v === null) continue
      if (!harTal) {
        max = v
        min = v
        harTal = true
        continue
      }
      if (v > max) max = v
      if (v < min) min = v
    }
  }
  // Staplade staplar mäts på summan per kategori, inte på den största delen.
  if (d.typ !== 'linje' && d.stapellage === 'staplade' && serier.length > 1) {
    for (let i = 0; i < kategorier.length; i++) {
      let summa = 0
      for (const serie of serier) summa += serie.varden[i] ?? 0
      if (summa > max) max = summa
      if (summa < min) min = summa
    }
  }

  return {
    kategorier,
    serier,
    max,
    min,
    utelamnadeSerier,
    utelamnadeKategorier,
    hinder: byggHinder(plan, m, serier, kategorier.length),
  }
}

/**
 * En cells tal, med andelen räknad mot rätt helhet.
 *
 * En enda formel för hela filen, och samma som `Pivottabell.cell` skriver i
 * tabellen. Två uträkningar av samma andel var det som en gång fick
 * diagrammet och tabellen att svara olika på *% av kolumn* — och den här
 * filens hela poäng är att de aldrig kan göra det.
 */
function cellavlasare(
  resultat: Pivotresultat,
  steg: number,
  m: number,
  visning: Diagramvisning,
): (rad: number, kol: number) => number {
  const totalkol = resultat.bredd - 1
  const totalrad = resultat.rader.length
  return (rad, kol) => {
    const tal = resultat.tal[(rad * resultat.bredd + kol) * steg + m]
    if (tal === undefined || Number.isNaN(tal)) return Number.NaN
    if (visning === 'tal') return tal
    const helhet =
      visning === 'andelRad'
        ? resultat.tal[(rad * resultat.bredd + totalkol) * steg + m]
        : resultat.tal[(totalrad * resultat.bredd + kol) * steg + m]
    if (helhet === undefined || Number.isNaN(helhet) || helhet === 0) return Number.NaN
    return tal / helhet
  }
}

/**
 * Diagrammet när kolumnlöven är kategorierna och Totalt-raden är serien.
 *
 * Utan radfält finns bara Totalt-raden, och det är den som ritas — en stapel
 * per kolumnlöv. Vyn stänger av *% av kolumn* i det här läget, eftersom varje
 * kolumn då är sin egen helhet, men formeln är ändå den gemensamma: kärnan
 * ska svara rätt oavsett vem som frågar.
 */
function kolumnlovSomKategorier(
  resultat: Pivotresultat,
  plan: Pivotplan,
  m: number,
  visning: Diagramvisning,
  texter: { tomt: string; ovriga: string },
): Diagramdata {
  const steg = Math.max(1, plan.matvarden.length)
  const cell = cellavlasare(resultat, steg, m, visning)
  const totalrad = resultat.rader.length
  const valda = resultat.kolumner.slice(0, KATEGORITAK)
  const kategorier = valda.map((lov) => kolumnrubrik(lov, texter.tomt, texter.ovriga))
  const varden = valda.map((_, kol) => {
    const v = cell(totalrad, kol)
    return Number.isNaN(v) ? null : v
  })
  const serie: Diagramserie = { etikett: '', slot: 0, varden }
  const tal = varden.filter((v): v is number => v !== null)
  return {
    kategorier,
    serier: [serie],
    max: tal.reduce((hogst, v) => Math.max(hogst, v), 0),
    min: tal.reduce((minsta, v) => Math.min(minsta, v), 0),
    utelamnadeSerier: 0,
    /** Här är kategorierna spalter, inte rader. Vyn väljer text på det. */
    utelamnadeKategorier: resultat.kolumner.length - valda.length,
    hinder: byggHinder(plan, m, [serie], kategorier.length),
  }
}

/**
 * Varför en diagramtyp inte går att välja.
 *
 * Hellre ett skäl i klartext än en bild som ser rimlig ut och betyder fel.
 * Samma val som procentväljaren i pivoten gör.
 */
function byggHinder(
  plan: Pivotplan,
  m: number,
  serier: readonly Diagramserie[],
  antalKategorier: number,
): Partial<Record<Diagramtyp, string>> {
  const hinder: Partial<Record<Diagramtyp, string>> = {}
  const matvarde = plan.matvarden[m]

  if (matvarde !== undefined && !arAdditiv(matvarde)) {
    // En tårtbit är en del av en helhet. Ett snitt är ingen del av ett annat
    // snitt, och antalet unika i en kategori är ingen del av det i en annan.
    hinder.cirkel = 'Cirkel visar delar av en helhet, och det här mätvärdet går inte att lägga ihop.'
  } else if (serier.length > 1) {
    hinder.cirkel = 'Cirkel visar en serie i taget. Ta bort kolumndimensionen, eller välj staplar.'
  } else if (antalKategorier > CIRKELTAK) {
    hinder.cirkel = 'Fler än sex tårtbitar går inte att skilja åt. Staplar klarar fler.'
  } else if (antalKategorier < 2) {
    hinder.cirkel = 'En enda del är ingen helhet att dela upp.'
  }

  return hinder
}

/**
 * Är raddimensionen något man kan dra en linje genom?
 *
 * En linje mellan Malmö och Lund antyder ett värde däremellan, och något
 * sådant finns inte. Diagrammet ritas ändå — att jämföra former är ibland
 * precis vad man vill — men foten säger det.
 */
export function linjeArTveksam(frame: Frame, plan: Pivotplan): boolean {
  const forsta = plan.rader[0]
  if (forsta === undefined) return false
  const col = findColumn(frame, forsta)
  if (!col) return false
  return col.type !== 'number' && col.type !== 'date'
}
