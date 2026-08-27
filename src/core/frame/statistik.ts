import type { Column, Frame } from '../types.js'
import { filledCount, valueCounts } from './column.js'
import { violatesType } from '../infer.js'

/**
 * Kolumnstatistik för den vy man har framme.
 *
 * Allt räknas ur ordboken: antal unika värden, vanligaste värden och andelen
 * ogiltiga är en enda räknarslinga över raderna plus ett svep över de unika
 * värdena — inte en strängjämförelse per cell.
 *
 * Till skillnad från `innehallsprofil`, som beskriver hela kolumnen och
 * därför går att cacha, räknas den här mot `frame.view` och följer alltså
 * filter och sökning. Det är rätt skala för de tal man läser på skärmen:
 * ”94 % ifyllt” ska handla om de rader man ser.
 */
export interface Kolumnstatistik {
  totalt: number
  ifyllda: number
  tomma: number
  ogiltiga: number
  unika: number
  /** De vanligaste värdena, störst först. */
  topp: { varde: string; antal: number }[]
}

export function kolumnstatistik(col: Column, frame: Frame, toppAntal = 8): Kolumnstatistik {
  const counts = valueCounts(col, frame.view)
  const totalt = frame.view.length
  const ifyllda = filledCount(col, frame.view)

  let unika = 0
  let ogiltiga = 0
  const poster: { varde: string; antal: number }[] = []
  for (let d = 1; d < col.dict.length; d++) {
    const antal = counts[d]!
    if (antal === 0) continue
    unika += 1
    const varde = col.dict[d]!
    if (violatesType(varde, col.type)) ogiltiga += antal
    poster.push({ varde, antal })
  }
  poster.sort((a, b) => b.antal - a.antal)

  return {
    totalt,
    ifyllda,
    tomma: totalt - ifyllda,
    ogiltiga,
    unika,
    topp: toppAntal === 0 ? [] : poster.slice(0, toppAntal),
  }
}
