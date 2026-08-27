import type { Column, ColumnId, Frame } from '../types.js'
import { findColumn, visibleColumns } from '../frame/frame.js'
import { normalizeAlways, stripDiacritics } from '../locale/sv.js'
import { sorteraNiva } from './sort.js'

/**
 * Dubbletter.
 *
 * Ingen hashning och inga sammanslagna nyckelsträngar per rad. Varje
 * nyckelkolumns ordbok normaliseras till ett grupp-id, raderna räknesorteras
 * på dessa id:n med samma svep som flernivåsorteringen, och lika rader hamnar
 * då intill varandra. Ett linjärt svep hittar löporna.
 *
 * Grupperingen och den grupperade ordningen faller alltså ut ur samma
 * beräkning — vilket också är varför dubblettvyn fryses tillsammans med
 * sorteringen i stället för att räknas om löpande som ett filter. Räknar man
 * om medlemskapet men inte ordningen visas en ensam rad utan sin partner.
 */

/** Vilken rad i varje dubblettgrupp som stannar. */
export type Behall = 'forsta' | 'sista' | 'valda'

export interface Normalisering {
  skiftlage: boolean
  blanksteg: boolean
  diakriter: boolean
}

export interface Dubblettnyckel {
  /** Kolumner som utgör nyckeln. Tom lista betyder alla synliga kolumner. */
  kolumner: ColumnId[]
  strunta: Normalisering
  /** Räkna rader som är tomma i hela nyckeln som lika varandra. */
  tommaRaknas: boolean
}

export const TOM_DUBBLETTNYCKEL: Dubblettnyckel = {
  kolumner: [],
  strunta: { skiftlage: true, blanksteg: true, diakriter: false },
  tommaRaknas: false,
}

export interface Dubblettgrupper {
  /** Gruppnummer per fysisk rad. 0 = ingår inte i någon dubblettgrupp. */
  grupp: Uint32Array
  /**
   * 1 för de grupper vars rader är identiska i *varje* kolumn, indexerat på
   * gruppnummer. Index 0 används inte.
   *
   * Skillnaden är hela poängen: rader som är lika i allt kan tas bort utan
   * att man tittar, medan rader som bara är lika i nyckelkolumnerna kan bära
   * olika uppgifter — den ena har telefonnummer, den andra e-post. Att
   * behandla dem lika är hur man tappar data utan att märka det.
   */
  heltLika: Uint8Array
  /** Antal grupper där raderna är identiska i varje kolumn. */
  antalHeltLika: number
  antalGrupper: number
  /** Rader som ingår i en grupp. */
  antalRader: number
  /** Rader utöver den första i varje grupp — alltså vad en rensning tar bort. */
  antalOverflodiga: number
  /** Största gruppens storlek. */
  storsta: number
  /** Raderna i grupperna, med varje grupp samlad. Rader utan grupp utelämnas. */
  ordning: Uint32Array
}

export const TOMMA_GRUPPER: Dubblettgrupper = {
  grupp: new Uint32Array(0),
  heltLika: new Uint8Array(0),
  antalHeltLika: 0,
  antalGrupper: 0,
  antalRader: 0,
  antalOverflodiga: 0,
  storsta: 0,
  ordning: new Uint32Array(0),
}

/**
 * Normaliseringen som valen ger.
 *
 * `normalizeAlways` körs alltid: den kan bara laga osynliga formatskillnader
 * och aldrig göra två genuint olika värden lika. Resten är uttryckliga val,
 * eftersom de mycket väl kan slå ihop värden som skiljer sig på riktigt —
 * `För` och `For` är inte samma ord.
 */
export function byggNormaliserare(strunta: Normalisering): (v: string) => string {
  return (value: string) => {
    let v = normalizeAlways(value)
    if (strunta.blanksteg) v = v.replace(/\s+/g, ' ').trim()
    if (strunta.diakriter) v = stripDiacritics(v)
    if (strunta.skiftlage) v = v.toLocaleLowerCase('sv')
    return v
  }
}

function nyckelkolumner(frame: Frame, nyckel: Dubblettnyckel): Column[] {
  if (nyckel.kolumner.length === 0) return visibleColumns(frame)
  return nyckel.kolumner
    .map((id) => findColumn(frame, id))
    .filter((c): c is Column => c !== undefined)
}

/**
 * Grupp-id per ordbokskod för en kolumn.
 *
 * Normaliseringen körs en gång per unikt värde, precis som allt annat i
 * kodbasen. Id 0 betyder tom.
 */
function gruppIder(col: Column, normalisera: (v: string) => string): Uint32Array {
  const ut = new Uint32Array(col.dict.length)
  const sedda = new Map<string, number>()
  let nasta = 1
  for (let kod = 1; kod < col.dict.length; kod++) {
    const n = normalisera(col.dict[kod]!)
    if (n === '') continue // Normaliseringen kan tömma ett värde som bara var blanksteg.
    let id = sedda.get(n)
    if (id === undefined) {
      id = nasta
      nasta += 1
      sedda.set(n, id)
    }
    ut[kod] = id
  }
  return ut
}

export function hittaDubbletter(frame: Frame, nyckel: Dubblettnyckel): Dubblettgrupper {
  const kolumner = nyckelkolumner(frame, nyckel)
  if (kolumner.length === 0 || frame.rowCount === 0) return TOMMA_GRUPPER

  const normalisera = byggNormaliserare(nyckel.strunta)

  // Ett grupp-id per rad och nyckelkolumn.
  const nycklar: Uint32Array[] = []
  const hinkar: number[] = []
  for (const col of kolumner) {
    const ider = gruppIder(col, normalisera)
    const perRad = new Uint32Array(frame.rowCount)
    let max = 0
    for (let r = 0; r < frame.rowCount; r++) {
      const id = ider[col.codes[r]!]!
      perRad[r] = id
      if (id > max) max = id
    }
    nycklar.push(perRad)
    hinkar.push(max + 1)
  }

  // Samma räknesortering som flernivåsorteringen: lika rader hamnar intill
  // varandra, och då räcker ett linjärt svep för att hitta löporna.
  let rader: Uint32Array = Uint32Array.from({ length: frame.rowCount }, (_, i) => i)
  for (let i = nycklar.length - 1; i >= 0; i--) {
    rader = sorteraNiva(rader, nycklar[i]!, hinkar[i]!)
  }

  const lika = (a: number, b: number): boolean =>
    nycklar.every((nyckelrad) => nyckelrad[a] === nyckelrad[b])

  const heltTom = (r: number): boolean => nycklar.every((nyckelrad) => nyckelrad[r] === 0)

  // Identitet i alla kolumner jämförs på ordbokskoder, inte på strängar: två
  // koder i samma kolumn är lika precis när värdena är det, eftersom ordboken
  // internerar.
  const identiska = (a: number, b: number): boolean =>
    frame.columns.every((c) => c.codes[a] === c.codes[b])

  const grupp = new Uint32Array(frame.rowCount)
  const heltLikaLista: number[] = [0]
  const ordning: number[] = []
  let antalGrupper = 0
  let antalHeltLika = 0
  let antalRader = 0
  let storsta = 0

  let i = 0
  while (i < rader.length) {
    let j = i + 1
    while (j < rader.length && lika(rader[i]!, rader[j]!)) j += 1
    const storlek = j - i
    const hoppaOver = !nyckel.tommaRaknas && heltTom(rader[i]!)
    if (storlek > 1 && !hoppaOver) {
      antalGrupper += 1
      antalRader += storlek
      if (storlek > storsta) storsta = storlek
      let helt = true
      for (let k = i; k < j; k++) {
        grupp[rader[k]!] = antalGrupper
        ordning.push(rader[k]!)
        if (helt && k > i && !identiska(rader[i]!, rader[k]!)) helt = false
      }
      heltLikaLista.push(helt ? 1 : 0)
      if (helt) antalHeltLika += 1
    }
    i = j
  }

  return {
    grupp,
    heltLika: Uint8Array.from(heltLikaLista),
    antalHeltLika,
    antalGrupper,
    antalRader,
    antalOverflodiga: antalRader - antalGrupper,
    storsta,
    ordning: Uint32Array.from(ordning),
  }
}

/**
 * Fysiska rader att ta bort.
 *
 * *Första* och *sista* räknas i filens ordning, inte i den du råkar titta på.
 * Annars skulle valet betyda olika saker beroende på hur du sorterat, och det
 * syns inte förrän raderna är borta.
 *
 * `valda` pekar ut en rad per grupp som ska stanna, och tar över för just den
 * gruppen. Det är vad som behövs när dubbletterna skiljer sig åt: den ena
 * raden har telefonnummer, den andra e-post, och då finns inget generellt
 * svar på vilken som är den rätta.
 */
export function overflodigaRader(
  grupper: Dubblettgrupper,
  behall: Behall,
  valda?: ReadonlyMap<number, number>,
): number[] {
  const behallen = new Map<number, number>()
  for (let r = 0; r < grupper.grupp.length; r++) {
    const g = grupper.grupp[r]!
    if (g === 0) continue
    const nuvarande = behallen.get(g)
    if (nuvarande === undefined) behallen.set(g, r)
    else if (behall === 'sista') behallen.set(g, r)
  }
  // Ett eget val gäller bara om raden fortfarande ligger i sin grupp.
  if (valda) {
    for (const [g, rad] of valda) {
      if (grupper.grupp[rad] === g) behallen.set(g, rad)
    }
  }

  const spara = new Set(behallen.values())
  const bort: number[] = []
  for (let r = 0; r < grupper.grupp.length; r++) {
    if (grupper.grupp[r]! !== 0 && !spara.has(r)) bort.push(r)
  }
  return bort
}
