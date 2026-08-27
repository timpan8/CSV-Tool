import { signal } from '@preact/signals'

/**
 * Om kombineringsvyn är öppen.
 *
 * Till skillnad från matchningsverkstaden (`src/state/matchning.ts`) behöver
 * kombineringen inget sessionstillstånd. Verkstaden håller fysiska radindex
 * mellan renderingar och måste därför upptäcka när raderna numrerats om;
 * kombineringen läser rader först i körningsögonblicket och sparar inga index
 * alls. Det som ändå måste stämma — att en vald flik fortfarande finns — faller
 * ut av att kartan ritas ur `tabs.value`.
 */
export const kombineraOppen = signal(false)

export function oppnaKombinera(): void {
  kombineraOppen.value = true
}

export function stangKombinera(): void {
  kombineraOppen.value = false
}
