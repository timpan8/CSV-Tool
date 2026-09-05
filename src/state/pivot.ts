import { signal } from '@preact/signals'
import { tomPlan, type Pivotplan } from '../core/ops/pivot.js'

/**
 * Pivotvyns av och på, och planerna den byggt.
 *
 * Vyn räknar sin tabell ur filen i det ögonblick den ritas och sparar varken
 * radindex eller resultat — inget av det kan bli inaktuellt. Men **planen**,
 * fälten man dragit till rutorna, är arbete. Att stänga vyn med Escape, göra
 * en flik av svaret eller titta till en annan fil ska inte kasta bort den.
 * Planerna ligger därför här, en per flik, och vyn hämtar sin när den öppnas.
 *
 * Nyckeln är flikens id, inte filens: filen byts ut vid varje redigering,
 * fliken består. Ett fält vars kolumn tagits bort står kvar i planen och
 * hoppas över av kärnan, precis som en sorteringsnivå på en borttagen kolumn.
 *
 * Att det är signaler och inte ett tillstånd i `App` är för att paletten och
 * verktygsfältet ska nå dem utan en handtagskedja genom hela komponenten.
 */
export const pivotOppen = signal(false)

const planer = new Map<string, Pivotplan>()

export function oppnaPivot(): void {
  pivotOppen.value = true
}

export function stangPivot(): void {
  pivotOppen.value = false
}

/** Flikens sparade plan, eller fyra tomma rutor om det är första gången. */
export function hamtaPlan(tabId: string): Pivotplan {
  return planer.get(tabId) ?? tomPlan()
}

export function sparaPlan(tabId: string, plan: Pivotplan): void {
  planer.set(tabId, plan)
}

/** När en flik stängs ska dess plan inte ligga kvar och vänta på ett id som aldrig återkommer. */
export function glomPlan(tabId: string): void {
  planer.delete(tabId)
}
