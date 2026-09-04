import type { ColumnType } from '../types.js'
import type { Delning } from './columns.js'
import type { Datuminstallning } from './dates.js'
import type { Epostfalt, Epostval } from './email.js'
import type { Talformat, Talinstallning } from './numbers.js'
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
  /**
   * De fyra omskrivande verktygen bär en lista kolumner, eftersom samma
   * inställning ofta ska köras på tolv månadskolumner. Äldre profiler bar en
   * enkel sträng och läses fortfarande.
   */
  | {
      typ: 'datum'
      kolumn: string | string[]
      inst: Datuminstallning
      /**
       * Namn på kolumnen resultatet läggs i, i stället för att skriva över.
       *
       * Valfritt med flit: `undefined` betyder omskrivning på plats, som
       * alla profiler sparade före det här fältet fanns. Därför behövde
       * PROFILVERSION inte höjas.
       */
      nyKolumn?: string
    }
  | { typ: 'tal'; kolumn: string | string[]; inst: Talinstallning }
  | { typ: 'telefon'; kolumn: string | string[]; inst: Telefoninstallning }
  /**
   * `namn` är en lista, eftersom `bada-namnen` skapar två kolumner. Äldre
   * profiler bar en enkel sträng och läses fortfarande.
   */
  | { typ: 'epost'; kolumn: string; falt: Epostfalt; val: Epostval; namn: string | string[] }
  | { typ: 'ersatt'; kolumn: string | string[]; inst: Ersattning }
  | { typ: 'dela'; kolumn: string; delning: Delning; namn: string[] }
  | { typ: 'mall'; mall: string; namn: string; stadaLuckor: boolean }
  /**
   * Beräknad kolumn. Formeln nämner sina kolumner vid namn, precis som
   * mallen, och är därför lika körbar på nästa fil.
   */
  | {
      typ: 'formel'
      uttryck: string
      namn: string
      format: Talformat
      decimaler: number | null
    }
  | { typ: 'dopOm'; kolumn: string; till: string }
  | { typ: 'taBortKolumn'; kolumn: string }
  | { typ: 'doljKolumn'; kolumn: string; dold: boolean }
  | { typ: 'sattTyp'; kolumn: string; kolumntyp: ColumnType }
  | { typ: 'tommaRader' }
  | { typ: 'tommaKolumner' }
  /**
   * Löpnummerkolumnen. Bär bara sitt namn — värdena är radernas ordning i den
   * fil steget körs på, och det är hela poängen: nästa månadsfil får sina egna
   * nummer, inte förra månadens.
   */
  | { typ: 'lopnummer'; namn: string }

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

/** Ett kolumnfält som kan vara ett namn eller flera. */
export function kolumnlista(kolumn: string | string[]): string[] {
  return Array.isArray(kolumn) ? kolumn : [kolumn]
}

/** Kolumnerna ett steg behöver för att kunna köras. */
export function stegetsKolumner(steg: Profilsteg): string[] {
  switch (steg.typ) {
    case 'stada':
      return steg.kolumner
    case 'datum':
    case 'tal':
    case 'telefon':
    case 'ersatt':
      return kolumnlista(steg.kolumn)
    case 'epost':
    case 'dela':
    case 'dopOm':
    case 'taBortKolumn':
    case 'doljKolumn':
    case 'sattTyp':
      return [steg.kolumn]
    case 'mall':
    case 'formel':
    case 'tommaRader':
    case 'tommaKolumner':
    case 'lopnummer':
      // Skapar sin kolumn, kräver ingen.
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
/**
 * Steget i klartext, delat i mall och delar.
 *
 * Samma uppdelning som `beskrivRegelDelar` i `filter.ts`, och av samma skäl:
 * mallen är den enda konstanta biten och därmed den enda som går att slå upp
 * i en ordbok. `etiketter` pekar ut vilka delar som är husets egna ord;
 * kolumnnamn och värden står inte med, eftersom en kolumn som råkar heta
 * ”Tal” annars skulle döpas om mitt i en mening om användarens eget data.
 */
export function beskrivStegDelar(steg: Profilsteg): {
  mall: string
  delar: string[]
  etiketter: number[]
} {
  const utan = (mall: string, ...delar: string[]) => ({ mall, delar, etiketter: [] })
  switch (steg.typ) {
    case 'stada': {
      const namn = stadningarEfterId(steg.stadning)?.etikett ?? steg.stadning
      return { mall: '{0} i {1}', delar: [namn, steg.kolumner.join(', ')], etiketter: [0] }
    }
    case 'datum':
      return steg.nyKolumn !== undefined
        ? {
            mall: 'Läs {0} som {1} i {2}',
            delar: [kolumnlista(steg.kolumn).join(', '), MALFORMAT[steg.inst.mal], steg.nyKolumn],
            etiketter: [1],
          }
        : {
            mall: 'Skriv om {0} till {1}',
            delar: [kolumnlista(steg.kolumn).join(', '), MALFORMAT[steg.inst.mal]],
            etiketter: [1],
          }
    case 'tal':
      return utan('Städa tal i {0}', kolumnlista(steg.kolumn).join(', '))
    case 'telefon':
      return utan('Normalisera telefonnummer i {0}', kolumnlista(steg.kolumn).join(', '))
    case 'epost': {
      const namn = Array.isArray(steg.namn) ? steg.namn : [steg.namn]
      return utan('Läs {0} ur {1} till ”{2}”', steg.falt, steg.kolumn, namn.join('” och ”'))
    }
    case 'ersatt':
      return utan('Ersätt ”{0}” i {1}', steg.inst.sok, kolumnlista(steg.kolumn).join(', '))
    case 'dela':
      return utan('Dela {0} i {1}', steg.kolumn, steg.namn.join(', '))
    case 'mall':
      return utan('Slå ihop kolumner till ”{0}”', steg.namn)
    case 'formel':
      return utan('Räkna ut ”{0}” som {1}', steg.namn, steg.uttryck)
    case 'dopOm':
      return utan('Döp om {0} till {1}', steg.kolumn, steg.till)
    case 'taBortKolumn':
      return utan('Ta bort kolumnen {0}', steg.kolumn)
    case 'doljKolumn':
      return {
        mall: '{0} kolumnen {1}',
        delar: [steg.dold ? 'Dölj' : 'Visa', steg.kolumn],
        etiketter: [0],
      }
    case 'sattTyp':
      return utan('Sätt typen på {0} till {1}', steg.kolumn, steg.kolumntyp)
    case 'tommaRader':
      return utan('Ta bort helt tomma rader')
    case 'tommaKolumner':
      return utan('Ta bort helt tomma kolumner')
    case 'lopnummer':
      return utan('Lägg till {0} med löpnummer', steg.namn)
  }
}

export function beskrivSteg(steg: Profilsteg): string {
  const { mall, delar } = beskrivStegDelar(steg)
  return mall.replace(/\{(\d+)\}/g, (traff, i: string) => delar[Number(i)] ?? traff)
}
