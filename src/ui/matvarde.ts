import type { Frame } from '../core/types.js'
import { findColumn } from '../core/frame/frame.js'
import { berakningspost, type Berakning } from '../core/ops/gruppera.js'
import { t, tf } from './sprak.js'

/**
 * Mätvärdets namn så som gränssnittet skriver det.
 *
 * Beräkningens ord översätts, kolumnnamnet aldrig — det är data ur filen och
 * ska stå som det står. Det här är den enda funktionen som får ge ett mätvärde
 * ett namn på skärmen; två namngivare i vyn gav samma mätvärde två namn i
 * samma fönster.
 *
 * Kärnans `berakningsnamn` finns kvar för det som inte har något språk — en
 * kolumnrubrik i en ny flik när ingen översättning skickats med — och skriver
 * kortare svenska ord än beräkningstabellen (*Ifyllda Belopp* mot *Antal
 * ifyllda Belopp*). Att ena dem är en ändring i grupperingens utdata, och hör
 * hemma där och inte här.
 */
export function matvardenamn(matvarde: Berakning, frame: Frame): string {
  if (matvarde.namn.trim() !== '') return matvarde.namn.trim()
  const ord = t(berakningspost(matvarde.typ).etikett)
  const col = matvarde.colId === null ? undefined : findColumn(frame, matvarde.colId)
  // Sammansättningen går genom ordboken: engelskan vill kunna säga
  // *Sum of Belopp* där svenskan säger *Summa Belopp*.
  return col ? tf('{0} {1}', ord, col.name) : ord
}
