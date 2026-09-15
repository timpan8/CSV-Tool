import type { Column } from '../core/types.js'
import { cellfarg, medFarg } from '../core/frame/farg.js'
import { fargetikettGement } from '../ui/fargetikett.js'
import { celler, tf } from '../ui/sprak.js'
import { bumpaUtseende, runStep, type Tab } from './store.js'

/**
 * Färgning som ångra-steg.
 *
 * En färg på tusen celler är ett handgrepp, och ett handgrepp ska gå att
 * ta tillbaka med `Ctrl+Z`. Steget håller bara flaggorna — en byte per rad
 * och kolumn, före och efter — och aldrig ordboken eller koderna, som en
 * färgning inte rör. `vikt` sätts så att historikens minnestak kan väga det.
 */
function flaggsteg(
  tab: Tab,
  label: string,
  jobb: { col: Column; nya: Uint8Array }[],
  kind: string,
): void {
  const fore = jobb.map((j) => j.col.flags.slice())
  let vikt = 0
  for (const j of jobb) vikt += 2 * j.nya.length
  runStep(tab, {
    label,
    kind,
    vikt,
    apply: () => {
      jobb.forEach((j) => j.col.flags.set(j.nya))
    },
    revert: () => {
      jobb.forEach((j, i) => j.col.flags.set(fore[i]!))
    },
  })
}

/**
 * Färgar de angivna fysiska raderna i kolumnerna. 0 tar bort färgen.
 * Returnerar antalet celler som faktiskt bytte färg; noll ger inget steg.
 */
export function fargaCeller(
  tab: Tab,
  kolumner: readonly Column[],
  rader: readonly number[],
  farg: number,
): number {
  const jobb: { col: Column; nya: Uint8Array }[] = []
  let andrade = 0
  for (const col of kolumner) {
    const nya = col.flags.slice()
    let egna = 0
    for (const r of rader) {
      const f = nya[r]!
      const ny = medFarg(f, farg)
      if (ny !== f) {
        nya[r] = ny
        egna += 1
      }
    }
    if (egna > 0) {
      jobb.push({ col, nya })
      andrade += egna
    }
  }
  if (andrade === 0) return 0
  const label =
    farg === 0
      ? tf('Tog bort färgen från {0}', celler(andrade))
      : tf('Färgade {0} {1}', celler(andrade), fargetikettGement(farg))
  flaggsteg(tab, label, jobb, 'farg')
  return andrade
}

/**
 * Färgar rad för rad efter en funktion — jämförelsens väg in.
 *
 * `farg(rad)` ger 1–7, 0 för att ta bort, eller null för att lämna cellen
 * som den är. Allt i ett steg, så att en körning över två kolumner backas
 * med ett enda Ctrl+Z.
 */
export function fargaPerRad(
  tab: Tab,
  label: string,
  jobb: readonly { col: Column; farg: (rad: number) => number | null }[],
): number {
  const steg: { col: Column; nya: Uint8Array }[] = []
  let andrade = 0
  for (const j of jobb) {
    const nya = j.col.flags.slice()
    let egna = 0
    for (let r = 0; r < nya.length; r++) {
      const f = j.farg(r)
      if (f === null) continue
      const ny = medFarg(nya[r]!, f)
      if (ny !== nya[r]) {
        nya[r] = ny
        egna += 1
      }
    }
    if (egna > 0) {
      steg.push({ col: j.col, nya })
      andrade += egna
    }
  }
  if (andrade === 0) return 0
  flaggsteg(tab, label, steg, 'farg')
  return andrade
}

/** Kolumnens etikettfärg. Utseende, inte data: utanför historiken, men sparad. */
export function sattKolumnfarg(tab: Tab, col: Column, farg: number): void {
  if ((col.farg ?? 0) === farg) return
  if (farg === 0) delete col.farg
  else col.farg = farg
  bumpaUtseende(tab)
}

/** Antal celler i kolumnen med just den färgen, eller med någon färg för 0. */
export function raknaFarg(col: Column, farg: number): number {
  let n = 0
  for (let r = 0; r < col.flags.length; r++) {
    const f = cellfarg(col.flags[r]!)
    if (farg === 0 ? f !== 0 : f === farg) n += 1
  }
  return n
}
