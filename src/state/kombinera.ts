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

/**
 * Fliken som används som mall, eller null för filernas egna kolumner.
 *
 * Den ligger här och inte i komponenten, eftersom en nyöppnad mallfil landar
 * som en flik via den vanliga importen — och den vägen går genom `App`, inte
 * genom vyn.
 */
export const mallTabId = signal<string | null>(null)

/** Sant medan en fil öppnas som ska bli mall när den landat. */
export const vantarPaMall = signal(false)

/**
 * Sant när vyn öppnades via *Fyll en mall med data…*.
 *
 * Vyn kan nås två vägar med samma innehåll men olika ärende. Flaggan låter
 * målformsväljaren ta fokus när ärendet är mallen, så att man landar på den
 * fråga man kom för — i stället för att leta efter den.
 */
export const begarMall = signal(false)

export function oppnaKombinera(medMall = false): void {
  mallTabId.value = null
  vantarPaMall.value = false
  begarMall.value = medMall
  kombineraOppen.value = true
}

export function stangKombinera(): void {
  kombineraOppen.value = false
  vantarPaMall.value = false
  begarMall.value = false
}
