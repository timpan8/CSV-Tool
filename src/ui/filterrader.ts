import type { Frame } from '../core/types.js'
import { identityView } from '../core/frame/frame.js'
import { tillampaFilter, type Filter } from '../core/ops/filter.js'

/**
 * Raderna en regels värdelista ska räkna på: alla utom den egna regeln.
 *
 * Det är den enda regeln värd att komma ihåg om värdelistan — kryssar man i
 * *Malmö* får inte *Lund* försvinna ur listan i samma ögonblick. Både
 * filterbyggaren och pivotens filterruta behöver svaret, och de ska inte kunna
 * svara olika: samma lista, samma antal, samma ordning.
 *
 * `utgangslage` är vad regeln gallrar ur. Filterbyggaren räknar på hela filen;
 * pivoten på sitt eget underlag, som kan vara den synliga vyn.
 */
export function utanEgenRegel(
  frame: Frame,
  filter: Filter,
  regelId: string,
  utgangslage: Uint32Array = identityView(frame.rowCount),
): Uint32Array {
  const utan: Filter = { ...filter, regler: filter.regler.filter((r) => r.id !== regelId) }
  return tillampaFilter(frame, utan, utgangslage).rader
}
