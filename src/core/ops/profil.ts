import type { ColumnType } from '../types.js'
import type { Delning } from './columns.js'
import type { Datuminstallning } from './dates.js'
import type { Epostfalt, Epostval } from './email.js'
import type { Talinstallning } from './numbers.js'
import type { Telefoninstallning } from './phone.js'
import type { Ersattning } from './replace.js'
import { stadningarEfterId } from './clean.js'
import type { Malformat } from './dates.js'

/**
 * Profiler: en arbetsgång att köra om på nästa fil.
 *
 * Samma exportfil kommer varje månad, och samma tio handgrepp behöver göras om
 * varje gång. En profil är listan över de handgreppen, sparad så att de går
 * att köra igen — inte en makroinspelning av tangenttryckningar utan en lista
 * över *vad* som gjordes.
 *
 * **Kolumner identifieras med namn, inte med id.** `ColumnId` är ett löpnummer
 * ur `newColumnId()` och betyder ingenting i en annan fil. Namnet är den enda
 * identitet som överlever, och även den kan svika — därför rapporterar en
 * körning steg för steg vilka kolumner den hittade och vilka den inte gjorde,
 * i stället för att tyst hoppa över hälften.
 *
 * **Bara det som går att köra om finns här.** En handredigerad cell, en
 * inklistring eller en borttagen rad hör till *den* filen och betyder
 * ingenting i nästa — de får ingen beskrivning och räknas som överhoppade när
 * profilen sparas. Att låtsas att de går att upprepa vore att lova något
 * verktyget inte kan hålla.
 */

export type Profilsteg =
  | { typ: 'stada'; kolumner: string[]; stadning: string }
  | { typ: 'datum'; kolumn: string; inst: Datuminstallning }
  | { typ: 'tal'; kolumn: string; inst: Talinstallning }
  | { typ: 'telefon'; kolumn: string; inst: Telefoninstallning }
  | { typ: 'epost'; kolumn: string; falt: Epostfalt; val: Epostval; namn: string }
  | { typ: 'ersatt'; kolumn: string; inst: Ersattning }
  | { typ: 'dela'; kolumn: string; delning: Delning; namn: string[] }
  | { typ: 'mall'; mall: string; namn: string; stadaLuckor: boolean }
  | { typ: 'dopOm'; kolumn: string; till: string }
  | { typ: 'taBortKolumn'; kolumn: string }
  | { typ: 'doljKolumn'; kolumn: string; dold: boolean }
  | { typ: 'sattTyp'; kolumn: string; kolumntyp: ColumnType }
  | { typ: 'tommaRader' }
  | { typ: 'tommaKolumner' }

export interface Profil {
  /** Stabilt id, så att en omdöpt profil inte blir en ny. */
  id: string
  namn: string
  steg: Profilsteg[]
  /** ISO-datum. Bara för att visa när profilen skapades. */
  skapad: string
}

/** Nuvarande filformat. Höjs när `Profilsteg` ändras på ett brytande sätt. */
export const PROFILVERSION = 1

export interface Profilfil {
  format: 'csv-verkstan-profil'
  version: number
  profiler: Profil[]
}

const MALFORMAT: Record<Malformat, string> = {
  datum: 'ÅÅÅÅ-MM-DD',
  'datum-tid': 'ÅÅÅÅ-MM-DD TT:MM',
  'ar-manad': 'ÅÅÅÅ-MM',
  ar: 'ÅÅÅÅ',
}

/** Kolumnerna ett steg behöver för att kunna köras. */
export function stegetsKolumner(steg: Profilsteg): string[] {
  switch (steg.typ) {
    case 'stada':
      return steg.kolumner
    case 'datum':
    case 'tal':
    case 'telefon':
    case 'epost':
    case 'ersatt':
    case 'dela':
    case 'dopOm':
    case 'taBortKolumn':
    case 'doljKolumn':
    case 'sattTyp':
      return [steg.kolumn]
    case 'mall':
    case 'tommaRader':
    case 'tommaKolumner':
      return []
  }
}

/**
 * Vad steget gör, i klartext.
 *
 * Etiketten byggs om ur beskrivningen i stället för att sparas med den. Ett
 * sparat `label` skulle vara den text som gällde när steget kördes, och den
 * kan mycket väl nämna en kolumn eller ett antal som inte stämmer i nästa fil.
 */
export function beskrivSteg(steg: Profilsteg): string {
  switch (steg.typ) {
    case 'stada': {
      const namn = stadningarEfterId(steg.stadning)?.etikett ?? steg.stadning
      return `${namn} i ${steg.kolumner.join(', ')}`
    }
    case 'datum':
      return `Skriv om ${steg.kolumn} till ${MALFORMAT[steg.inst.mal]}`
    case 'tal':
      return `Städa tal i ${steg.kolumn}`
    case 'telefon':
      return `Normalisera telefonnummer i ${steg.kolumn}`
    case 'epost':
      return `Läs ${steg.falt} ur ${steg.kolumn} till ”${steg.namn}”`
    case 'ersatt':
      return `Ersätt ”${steg.inst.sok}” i ${steg.kolumn}`
    case 'dela':
      return `Dela ${steg.kolumn} i ${steg.namn.join(', ')}`
    case 'mall':
      return `Slå ihop kolumner till ”${steg.namn}”`
    case 'dopOm':
      return `Döp om ${steg.kolumn} till ${steg.till}`
    case 'taBortKolumn':
      return `Ta bort kolumnen ${steg.kolumn}`
    case 'doljKolumn':
      return `${steg.dold ? 'Dölj' : 'Visa'} kolumnen ${steg.kolumn}`
    case 'sattTyp':
      return `Sätt typen på ${steg.kolumn} till ${steg.kolumntyp}`
    case 'tommaRader':
      return 'Ta bort helt tomma rader'
    case 'tommaKolumner':
      return 'Ta bort helt tomma kolumner'
  }
}
