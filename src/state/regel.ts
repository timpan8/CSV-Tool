import type { Column } from '../core/types.js'
import { ordningsavtryck, regelavtryck, regelnsMallar } from '../core/ops/columns.js'
import type { Tab } from './store.js'

/**
 * Vilka mallkolumner som blivit äldre än sina källor.
 *
 * Samma uppgörelse som den frusna sorteringen: kolumnen räknas **aldrig** om
 * av sig själv. Den säger till, och du väljer. En kolumn som ändrade sig utan
 * ett steg i historiken vore precis den *ingen vet längre vad en cell
 * innehåller*-effekt som `Räkna` med flit undviker.
 */

export interface Regellage {
  col: Column
  /** Källor mallen pekar på som inte finns i filen. */
  saknade: string[]
  /** Sant när källorna ändrats sedan kolumnen senast fylldes. */
  inaktuell: boolean
}

/**
 * Cache per flik.
 *
 * Avtrycket går över hela ordboken och alla koder, och det är för dyrt att
 * räkna vid varje omritning: statusraden ritas om när markeringen flyttas.
 * `dataRevision` svarar på den snävare frågan — har *datat* ändrats? — och
 * ordningsavtrycket fångar en omsortering, som bara rör kolumner med
 * rad-undantag.
 */
const cache = new WeakMap<
  Tab,
  { dataRevision: number; ordning: number; kolumner: number; lage: Regellage[] }
>()

export function regellagen(tab: Tab): Regellage[] {
  const ordning = ordningsavtryck(tab.frame)
  const kolumner = tab.frame.columns.length
  const sparat = cache.get(tab)
  if (
    sparat &&
    sparat.dataRevision === tab.dataRevision &&
    sparat.ordning === ordning &&
    sparat.kolumner === kolumner
  ) {
    return sparat.lage
  }

  const lage: Regellage[] = []
  for (const col of tab.frame.columns) {
    // En avstängd mall räknas inte som inaktuell: den har inget löfte att
    // svika. Därmed faller den ur statusradens chip och ur `inaktuellaRegler`
    // utan att något av dem behöver veta om av-läget.
    if (!col.regel || col.regel.avstangd) continue
    const { okanda } = regelnsMallar(tab.frame, col.regel)
    lage.push({
      col,
      saknade: okanda,
      inaktuell: regelavtryck(tab.frame, col.regel) !== col.regel.avtryck,
    })
  }

  cache.set(tab, { dataRevision: tab.dataRevision, ordning, kolumner, lage })
  return lage
}

/** Mallkolumnerna som behöver köras om, i kolumnordning. */
export function inaktuellaRegler(tab: Tab): Regellage[] {
  return regellagen(tab).filter((r) => r.inaktuell || r.saknade.length > 0)
}

/** Läget för en enskild kolumn, eller null när den inte har någon regel. */
export function regellageFor(tab: Tab, col: Column): Regellage | null {
  return regellagen(tab).find((r) => r.col.id === col.id) ?? null
}
