import { signal } from '@preact/signals'

/**
 * Om vyn för att slå ihop två filer är öppen.
 *
 * Samma resonemang som för kombineringen (`src/state/kombinera.ts`): vyn
 * behöver inget sessionstillstånd. Den läser rader först i körningsögonblicket
 * och sparar inga radindex mellan renderingarna, så det finns inget som kan
 * bli inaktuellt. Matchningsverkstaden är den enda som håller *arbete* över
 * tid, och därför den enda som måste upptäcka att raderna numrerats om.
 *
 * Att den ligger i en signal och inte i `App`s eget tillstånd är för att
 * kommandopaletten och verktygsradens meny ska kunna öppna den utan att
 * appen behöver skicka ned en handtagskedja.
 */
export const slaIhopOppen = signal(false)

export function oppnaSlaIhop(): void {
  slaIhopOppen.value = true
}

export function stangSlaIhop(): void {
  slaIhopOppen.value = false
}
