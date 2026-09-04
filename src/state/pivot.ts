import { signal } from '@preact/signals'

/**
 * Pivotvyns av och på.
 *
 * En signal och inget mer. Vyn räknar sin tabell ur filen i det ögonblick den
 * ritas och sparar varken radindex eller resultat, så det finns inget
 * sessionstillstånd att hålla reda på — stänger man vyn finns inget kvar som
 * kan bli inaktuellt. Samma skäl som `slaihop.ts` har.
 *
 * Att det är en signal och inte ett tillstånd i `App` är för att paletten och
 * verktygsfältet ska nå den utan en handtagskedja genom hela komponenten.
 */
export const pivotOppen = signal(false)

export function oppnaPivot(): void {
  pivotOppen.value = true
}

export function stangPivot(): void {
  pivotOppen.value = false
}
