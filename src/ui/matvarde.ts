import type { Frame } from '../core/types.js'
import { findColumn } from '../core/frame/frame.js'
import { berakningspost, type Berakning } from '../core/ops/gruppera.js'
import { t } from './sprak.js'

/**
 * Mätvärdets namn så som gränssnittet skriver det.
 *
 * Beräkningens ord översätts, kolumnnamnet aldrig — det är data ur filen och
 * ska stå som det står. Det här är den enda funktionen som får ge ett
 * mätvärde ett namn på skärmen: kärnans `berakningsnamn` skriver svenska och
 * finns för det som inte har något språk, som kolumnrubriker i en ny flik
 * när ingen översättning skickats med. Två namngivare i vyn gav samma
 * mätvärde två namn i samma fönster, och det är därför det bara finns en.
 */
export function matvardenamn(matvarde: Berakning, frame: Frame): string {
  if (matvarde.namn.trim() !== '') return matvarde.namn.trim()
  const ord = t(berakningspost(matvarde.typ).etikett)
  const col = matvarde.colId === null ? undefined : findColumn(frame, matvarde.colId)
  return col ? `${ord} ${col.name}` : ord
}
