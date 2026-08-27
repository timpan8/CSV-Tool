import type { ColumnId, Frame } from '../core/types.js'
import { findColumn, identityView } from '../core/frame/frame.js'
import { sorteraNiva, sorteraRader, type Sorteringsniva } from '../core/ops/sort.js'
import { hittaDubbletter, type Dubblettgrupper, type Dubblettnyckel } from '../core/ops/duplicates.js'

/**
 * Den frusna visningsordningen.
 *
 * Sorteringen räknas om när användaren ber om det — inte varje gång datat
 * ändras. Rättar man en cell i den kolumn man sorterat på ska raden ligga
 * kvar under markören; hoppar den iväg går det inte att arbeta sig nedåt
 * genom en sorterad lista, vilket är själva anledningen till att man
 * sorterade. Så fungerar också Excel.
 *
 * **Ordningen är alltid en ren funktion av (spec, data)** och lagras bara som
 * cache, aldrig som sanning. Det är den invarianten som gör att ångra av en
 * radborttagning ger tillbaka exakt samma ordning: `restoreRows` lägger varje
 * rad på sitt gamla index, `deleteRows` krymper aldrig en ordbok, så
 * `intern` ger samma koder och rang-cachen gäller fortfarande — omräkningen
 * ger då bit för bit samma permutation som före borttagningen. Därför sparas
 * aldrig en historik av ordningar; de räknas om.
 */
export interface Ordning {
  /** Fysiska radindex, en permutation av samtliga rader. */
  rader: Uint32Array
  nivaer: Sorteringsniva[]
  /**
   * Dubblettgrupperna, när dubblettvyn räknade ordningen.
   *
   * Dubbletter är en *ordning* och inte ett filter: medlemskapet och
   * gruppordningen faller ur samma beräkning, och räknar man om det ena men
   * inte det andra visas en ensam rad utan sin partner. Därför fryses de
   * tillsammans med sorteringen.
   */
  grupper: Dubblettgrupper | null
  dubbletter: Dubblettnyckel | null
  /**
   * Radantalet när ordningen räknades.
   *
   * All radmanipulation går genom `rebuildRows`, som renumrerar fysiska
   * index. En kvarliggande permutation pekar då både på fel rader och
   * utanför arrayen, så det här villkoret måste tvinga fram en omräkning —
   * det räcker inte att flagga den som inaktuell.
   */
  radantal: number
  /** `tab.dataRevision` vid beräkningen. Billig grind före signaturen. */
  dataRevision: number
  /** Hash över nyckelkolumnernas koder och typer. Det exakta svaret. */
  signatur: number
  /** Sant när signaturen inte längre stämmer. Ordningen ligger kvar ändå. */
  inaktuell: boolean
}

/**
 * Hash över de kolumner en sortering faktiskt beror på.
 *
 * Typen måste ingå: `sattTyp` rör inte en enda kod men byter rangens
 * innebörd helt. Utan den detaljen skulle en beloppskolumn tyst byta från
 * text- till talordning utan att någon fick veta det.
 */
export function nyckelsignatur(frame: Frame, kolumner: readonly ColumnId[]): number {
  // FNV-1a. Vi behöver inte kryptografisk styrka, bara att en ändring syns.
  let h = 0x811c9dc5
  for (const id of kolumner) {
    const col = findColumn(frame, id)
    if (!col) {
      h = Math.imul(h ^ 0xff, 0x01000193)
      continue
    }
    for (let i = 0; i < col.type.length; i++) {
      h = Math.imul(h ^ col.type.charCodeAt(i), 0x01000193)
    }
    const codes = col.codes
    for (let r = 0; r < codes.length; r++) {
      h = Math.imul(h ^ codes[r]!, 0x01000193)
    }
  }
  return h >>> 0
}

export interface Ordningslage {
  frame: Frame
  dataRevision: number
  ordning: Ordning | null
}

/**
 * Räknar om ordningen från grunden.
 *
 * Returnerar null när det inte finns någon sortering att frysa — då är
 * filens egen ordning svaret, och en sparad permutation vore bara en kopia
 * av `identityView`.
 */
export function beraknaOrdning(
  frame: Frame,
  nivaer: readonly Sorteringsniva[],
  dubbletter: Dubblettnyckel | null,
  dataRevision: number,
): Ordning | null {
  if (nivaer.length === 0 && dubbletter === null) return null
  const kopia = nivaer.map((n) => ({ ...n }))
  let rader = sorteraRader(frame, kopia)
  let grupper: Dubblettgrupper | null = null

  if (dubbletter !== null) {
    grupper = hittaDubbletter(frame, dubbletter)
    // Gruppnumret läggs som det *sista* svepet, alltså det mest signifikanta.
    // Grupperna hamnar då intill varandra medan användarens egna nivåer
    // fortfarande ordnar raderna inom gruppen — gratis, i samma pass.
    const utan = grupper.antalGrupper + 1
    const hink = new Uint32Array(frame.rowCount)
    for (let r = 0; r < frame.rowCount; r++) {
      const g = grupper.grupp[r]!
      hink[r] = g === 0 ? utan : g - 1
    }
    rader = sorteraNiva(rader, hink, utan)
  }

  const kolumner = [
    ...kopia.map((n) => n.colId),
    ...(dubbletter ? nyckelkolumnerFor(frame, dubbletter) : []),
  ]

  return {
    rader,
    nivaer: kopia,
    grupper,
    dubbletter: dubbletter === null ? null : { ...dubbletter, strunta: { ...dubbletter.strunta } },
    radantal: frame.rowCount,
    dataRevision,
    signatur: nyckelsignatur(frame, kolumner),
    inaktuell: false,
  }
}

/** Kolumnerna en dubblettnyckel faktiskt beror på, för signaturen. */
function nyckelkolumnerFor(frame: Frame, nyckel: Dubblettnyckel): ColumnId[] {
  if (nyckel.kolumner.length > 0) return nyckel.kolumner
  return frame.columns.filter((c) => !c.hidden).map((c) => c.id)
}

function likaDubbletter(a: Dubblettnyckel | null, b: Dubblettnyckel | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.tommaRaknas === b.tommaRaknas &&
    a.strunta.skiftlage === b.strunta.skiftlage &&
    a.strunta.blanksteg === b.strunta.blanksteg &&
    a.strunta.diakriter === b.strunta.diakriter &&
    a.kolumner.length === b.kolumner.length &&
    a.kolumner.every((id, i) => id === b.kolumner[i])
  )
}

function likaNivaer(a: readonly Sorteringsniva[], b: readonly Sorteringsniva[]): boolean {
  if (a.length !== b.length) return false
  return a.every((n, i) => n.colId === b[i]!.colId && n.riktning === b[i]!.riktning)
}

/**
 * Ser till att ordningen stämmer med specen, och upptäcker när den blivit
 * inaktuell.
 *
 * Returnerar sant när ordningen faktiskt byttes, så att anroparen vet om
 * markeringen behöver följa med sin rad.
 */
export function synkaOrdning(
  lage: Ordningslage,
  nivaer: readonly Sorteringsniva[],
  dubbletter: Dubblettnyckel | null = null,
  tvinga = false,
): boolean {
  const { frame, ordning } = lage

  if (nivaer.length === 0 && dubbletter === null) {
    if (ordning === null) return false
    lage.ordning = null
    return true
  }

  const maste =
    tvinga ||
    ordning === null ||
    !likaNivaer(ordning.nivaer, nivaer) ||
    !likaDubbletter(ordning.dubbletter, dubbletter) ||
    ordning.radantal !== frame.rowCount

  if (maste) {
    lage.ordning = beraknaOrdning(frame, nivaer, dubbletter, lage.dataRevision)
    return true
  }

  // Grinden är inte en optimering utan en förutsättning: utan den skulle
  // varje tangenttryck i sökrutan kosta en hash över hela tabellen.
  if (ordning.dataRevision !== lage.dataRevision) {
    const signatur = nyckelsignatur(frame, [
      ...ordning.nivaer.map((n) => n.colId),
      ...(ordning.dubbletter ? nyckelkolumnerFor(frame, ordning.dubbletter) : []),
    ])
    ordning.dataRevision = lage.dataRevision
    // Ändrade användaren en helt annan kolumn är ordningen fortfarande giltig,
    // och då ska ingen banderoll dyka upp och påstå motsatsen.
    if (signatur !== ordning.signatur) ordning.inaktuell = true
  }
  return false
}

/** Utgångssekvensen ett urval ska svepa: den frusna ordningen, annars filens. */
export function utgangslage(frame: Frame, ordning: Ordning | null): Uint32Array {
  if (ordning && ordning.rader.length === frame.rowCount) return ordning.rader
  return identityView(frame.rowCount)
}
