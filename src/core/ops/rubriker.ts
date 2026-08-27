import type { ColumnId, Frame } from '../types.js'
import { visibleColumns } from '../frame/frame.js'
import { normalizeAlways, stripDiacritics } from '../locale/sv.js'

/**
 * Att känna igen samma kolumn under olika rubrik.
 *
 * Samma fråga ställs på två ställen med olika ambition. Matchningsdialogen
 * gissar *ett* kolumnpar att matcha på, och är snål med flit: en gissad
 * nyckel som är för sträng ger noll träffar, och då ser det ut som att
 * filerna inte hör ihop. Aliaskartan vill tvärtom para varenda kolumn — där
 * kostar en felgissning ingenting, eftersom den syns i kartan och går att
 * ändra innan något körs.
 */

/** Namn utan skiftläge, prickar och skiljetecken — för att jämföra rubriker. */
export function rubriknyckel(namn: string): string {
  return stripDiacritics(normalizeAlways(namn))
    .toLocaleLowerCase('sv')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Ord som betyder samma sak i en svensk och en engelsk rubrikrad.
 *
 * Listan är kort med flit. Ett förslag som är fel kostar ingenting — det syns
 * i listan och går att ändra — men en lång gissningslista skulle få
 * användaren att sluta läsa den.
 */
export const SYNONYMER: string[][] = [
  ['namn', 'name', 'fullname', 'kund', 'customer', 'kundnamn', 'customername'],
  ['epost', 'email', 'mail', 'emailaddress', 'epostadress'],
  ['telefon', 'phone', 'tel', 'mobil', 'mobile'],
  ['ort', 'city', 'stad', 'postort'],
  ['postnr', 'postnummer', 'zip', 'zipcode', 'postalcode'],
  // Bara `id` står medvetet inte här. I matchningsdialogen kostar en
  // felgissning ingenting — den ger noll träffar, och nollan räknas fram och
  // visas innan något körs. I en aliaskarta kostar den allt: fil 1:s Kundnr
  // och fil 2:s ID, som är ett ordernummer, skulle hamna i samma spalt tyst.
  ['kundnr', 'kundnummer', 'customerid', 'customernumber'],
  ['land', 'country'],
  ['adress', 'address', 'gatuadress', 'street'],
  ['foretag', 'company', 'organisation', 'org'],
]

/** Vilken synonymgrupp en rubriknyckel hör till, eller -1. */
export function synonymgrupp(nyckel: string): number {
  return SYNONYMER.findIndex((grupp) => grupp.includes(nyckel))
}

/**
 * Letar upp den kolumn i en fil som svarar mot en rubrik.
 *
 * Exakt namn går före synonym, så att en fil med både `Namn` och `Kundnamn`
 * binder rätt när målkolumnen heter `Namn`. `tagna` är de kolumner som redan
 * bundits till någon annan målkolumn: samma källkolumn får aldrig hamna i två
 * målkolumner, för då står samma värden på två ställen utan att någon ser det.
 */
export function hittaAlias(
  frame: Frame,
  rubrik: string,
  tagna: ReadonlySet<ColumnId>,
): ColumnId | null {
  const kolumner = visibleColumns(frame).filter((c) => !tagna.has(c.id))
  const nyckel = rubriknyckel(rubrik)
  if (nyckel === '') return null

  const exakt = kolumner.find((c) => rubriknyckel(c.name) === nyckel)
  if (exakt) return exakt.id

  const grupp = synonymgrupp(nyckel)
  if (grupp === -1) return null
  const synonym = kolumner.find((c) => synonymgrupp(rubriknyckel(c.name)) === grupp)
  return synonym ? synonym.id : null
}
