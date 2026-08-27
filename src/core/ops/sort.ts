import type { ColumnId, Frame } from '../types.js'
import { findColumn, identityView } from '../frame/frame.js'
import { kolumnrang, TOM_RANG } from '../frame/rank.js'

/**
 * Flernivåsortering.
 *
 * Sorteringen görs som en följd av stabila räknesorteringar, en per nivå,
 * körda från den *sista* nivån till den första. Det är samma idé som i en
 * radixsortering: när varje svep är stabilt bevarar det föregående svepets
 * ordning inom lika värden, och resultatet blir en korrekt flernivåsortering
 * utan en enda komparator-anrop per rad.
 *
 * Kostnaden är O(nivåer · (n + k)) heltalsoperationer. Det dyra — att
 * jämföra strängar med den svenska kollatorn — sker en gång per *unikt*
 * värde i `kolumnrang`, inte per rad.
 */

export type Riktning = 'stigande' | 'fallande'

export interface Sorteringsniva {
  colId: ColumnId
  riktning: Riktning
}

/**
 * Ett stabilt räknesorteringssvep.
 *
 * Stabiliteten är hela förutsättningen för flernivåsorteringen och den är
 * lätt att tappa: räkna hinkar, prefixsummera, och svep sedan **framåt** och
 * skriv på `pos[hink]++`. Den bakåtgående varianten ur läroböckerna är också
 * stabil, men blandar man de två går ordningen sönder tyst — felet syns bara
 * på lika värden i nivå två.
 */
export function sorteraNiva(
  rader: Uint32Array,
  hink: Uint32Array,
  antalHinkar: number,
): Uint32Array {
  const antal = new Uint32Array(antalHinkar + 1)
  for (let i = 0; i < rader.length; i++) antal[hink[rader[i]!]!]! += 1

  let summa = 0
  for (let h = 0; h <= antalHinkar; h++) {
    const n = antal[h]!
    antal[h] = summa
    summa += n
  }

  const ut = new Uint32Array(rader.length)
  for (let i = 0; i < rader.length; i++) {
    const r = rader[i]!
    ut[antal[hink[r]!]!] = r
    antal[hink[r]!]! += 1
  }
  return ut
}

/**
 * Hinknummer per fysisk rad för en nivå.
 *
 * Tomma celler får en egen hink efter alla andra och byter aldrig plats med
 * riktningen. En tom cell är inte "minst" — den är frånvarande, och att låta
 * den vandra till toppen vid fallande sortering skulle dölja precis det man
 * sorterade för att se.
 */
function hinkarFor(frame: Frame, niva: Sorteringsniva): { hink: Uint32Array; antal: number } | null {
  const col = findColumn(frame, niva.colId)
  if (!col) return null

  const { rang, hinkar } = kolumnrang(col)
  const hink = new Uint32Array(frame.rowCount)
  const sista = hinkar > 0 ? hinkar - 1 : 0

  for (let r = 0; r < frame.rowCount; r++) {
    const v = rang[col.codes[r]!]!
    hink[r] = v === TOM_RANG ? hinkar : niva.riktning === 'fallande' ? sista - v : v
  }
  return { hink, antal: hinkar }
}

/**
 * Sorterar samtliga rader och returnerar permutationen av fysiska radindex.
 *
 * Nivåer som pekar på en kolumn som inte finns hoppas över i stället för att
 * kasta: en sorteringsnivå kan överleva att kolumnen tas bort, och ångra
 * lägger tillbaka den.
 */
export function sorteraRader(
  frame: Frame,
  nivaer: readonly Sorteringsniva[],
  utgangslage?: Uint32Array,
): Uint32Array {
  let rader = utgangslage ? Uint32Array.from(utgangslage) : identityView(frame.rowCount)
  for (let i = nivaer.length - 1; i >= 0; i--) {
    const h = hinkarFor(frame, nivaer[i]!)
    if (!h) continue
    rader = sorteraNiva(rader, h.hink, h.antal)
  }
  return rader
}

const PIL: Record<Riktning, string> = { stigande: '↑', fallande: '↓' }

/** "Ort ↑, Belopp ↓" — för statusradens chip. */
export function beskrivSortering(frame: Frame, nivaer: readonly Sorteringsniva[]): string {
  return nivaer
    .map((n) => {
      const col = findColumn(frame, n.colId)
      if (!col) return null
      return `${col.name} ${PIL[n.riktning]}${col.hidden ? ' (dold)' : ''}`
    })
    .filter((t): t is string => t !== null)
    .join(', ')
}
