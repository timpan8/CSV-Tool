import type { Column, Frame } from '../core/types.js'
import { getCell } from '../core/frame/column.js'
import { parseNumber } from '../core/infer.js'

/**
 * En rektangulär markering, i vy-koordinater.
 *
 * Rad är index i `Frame.view` och kolumn är index bland de *synliga*
 * kolumnerna. Att lagra vy-koordinater i stället för fysiska betyder att
 * markeringen följer det man ser: sorterar man om ligger den kvar på samma
 * plats på skärmen, vilket är vad man förväntar sig av ett rutnät.
 */
export interface Selection {
  ankareRad: number
  ankareKol: number
  fokusRad: number
  fokusKol: number
}

export interface Rect {
  r1: number
  r2: number
  k1: number
  k2: number
}

export function rect(sel: Selection): Rect {
  return {
    r1: Math.min(sel.ankareRad, sel.fokusRad),
    r2: Math.max(sel.ankareRad, sel.fokusRad),
    k1: Math.min(sel.ankareKol, sel.fokusKol),
    k2: Math.max(sel.ankareKol, sel.fokusKol),
  }
}

export function cell(rad: number, kol: number): Selection {
  return { ankareRad: rad, ankareKol: kol, fokusRad: rad, fokusKol: kol }
}

export function innehaller(sel: Selection, rad: number, kol: number): boolean {
  const r = rect(sel)
  return rad >= r.r1 && rad <= r.r2 && kol >= r.k1 && kol <= r.k2
}

export function antalCeller(sel: Selection): number {
  const r = rect(sel)
  return (r.r2 - r.r1 + 1) * (r.k2 - r.k1 + 1)
}

export function klamp(sel: Selection, radAntal: number, kolAntal: number): Selection {
  const kr = (v: number) => Math.max(0, Math.min(radAntal - 1, v))
  const kk = (v: number) => Math.max(0, Math.min(kolAntal - 1, v))
  return {
    ankareRad: kr(sel.ankareRad),
    ankareKol: kk(sel.ankareKol),
    fokusRad: kr(sel.fokusRad),
    fokusKol: kk(sel.fokusKol),
  }
}

export interface Aggregat {
  celler: number
  ifyllda: number
  unika: number
  /** Antal värden som gick att tolka som tal. */
  tal: number
  summa: number
  medel: number
}

/**
 * Snabbsumman.
 *
 * Samma sak som Excel visar längst ned när man markerar ett område, och det
 * första man saknar i ett verktyg som det här. Talen tolkas med `parseNumber`,
 * som klarar `1 240,50` med både vanligt och hårt mellanslag.
 */
export function aggregera(frame: Frame, kolumner: Column[], sel: Selection): Aggregat {
  const r = rect(sel)
  const unika = new Set<string>()
  let celler = 0
  let ifyllda = 0
  let tal = 0
  let summa = 0

  for (let rad = r.r1; rad <= r.r2; rad++) {
    const fysisk = frame.view[rad]
    if (fysisk === undefined) continue
    for (let kol = r.k1; kol <= r.k2; kol++) {
      const col = kolumner[kol]
      if (!col) continue
      celler += 1
      const value = getCell(col, fysisk)
      if (value === '') continue
      ifyllda += 1
      unika.add(value)
      const n = parseNumber(value)
      if (n !== null) {
        tal += 1
        summa += n
      }
    }
  }
  return { celler, ifyllda, unika: unika.size, tal, summa, medel: tal === 0 ? 0 : summa / tal }
}
