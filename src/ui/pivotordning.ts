import { sortCollator } from '../core/locale/sv.js'
import type { Pivotresultat } from '../core/ops/pivot.js'

export interface Sortering {
  /** Kolumnindex i matrisen; `bredd - 1` är Totalt. */
  kol: number
  /** Vilket mätvärde inom kolumnen, när de är flera. */
  m: number
  ned: boolean
}

/**
 * Radernas ordning i pivoten.
 *
 * Egen fil eftersom två vyer behöver samma svar. Tabellen ritar raderna i den
 * här ordningen, och diagrammet ritar staplarna i den — sorterar man en
 * kolumn fallande och byter till diagram ska den största stapeln stå först,
 * inte där kärnan råkade lägga den.
 *
 * **Sorteringen gäller syskon inom sin förälder, aldrig hela listan.** Att
 * sortera platt hade slitit isär trädet: en ort hade hamnat under en annan
 * orts rubrik, och delsumman hade stått över rader den inte gällde.
 *
 * Returnerar index in i `resultat.rader`, i visningsordning.
 */
export function ordnaRader(
  resultat: Pivotresultat,
  sortering: Sortering | null,
  steg: number,
): number[] {
  const barn = new Map<string, number[]>()
  resultat.rader.forEach((rad, i) => {
    const delar = rad.stig.split('/')
    const foralder = delar.slice(0, -1).join('/')
    const lista = barn.get(foralder)
    if (lista) lista.push(i)
    else barn.set(foralder, [i])
  })

  if (sortering) {
    const plats = (i: number) => (i * resultat.bredd + sortering.kol) * steg + sortering.m
    const tal = (i: number) => resultat.tal[plats(i)]!
    const text = (i: number) => resultat.text[plats(i)] ?? ''
    for (const lista of barn.values()) {
      lista.sort((a, b) => {
        const ta = tal(a)
        const tb = tal(b)
        const atom = Number.isNaN(ta)
        const btom = Number.isNaN(tb)
        // Tomma celler ligger sist åt båda hållen. En tom cell är okänd, och
        // det okända hör inte hemma i toppen bara för att man vände på pilen.
        if (atom && btom) return sortCollator.compare(text(a), text(b))
        if (atom) return 1
        if (btom) return -1
        return sortering.ned ? tb - ta : ta - tb
      })
    }
  }

  const ut: number[] = []
  const ga = (foralder: string) => {
    for (const i of barn.get(foralder) ?? []) {
      ut.push(i)
      ga(resultat.rader[i]!.stig)
    }
  }
  ga('')
  return ut
}

/**
 * Är raden dold av en hopfälld förfader?
 *
 * Bara äkta förfäder räknas — en hopfälld nod syns själv, det är barnen som
 * försvinner. Annars hade det inte funnits någon kvar att klicka på för att
 * fälla ut den igen.
 */
export function dold(stig: string, hopfallda: Set<string>): boolean {
  const delar = stig.split('/')
  for (let i = 1; i < delar.length; i++) {
    if (hopfallda.has(delar.slice(0, i).join('/'))) return true
  }
  return false
}
