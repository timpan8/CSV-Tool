import { signal } from '@preact/signals'

/**
 * Om jämförelsevyn är öppen.
 *
 * Samma resonemang som sammanslagningen (`slaihop.ts`): vyn håller inget
 * arbete över tid, den läser raderna i körningsögonblicket, så det finns
 * inget att spara och inget som kan bli inaktuellt.
 */
export const jamforOppen = signal(false)

export function oppnaJamfor(): void {
  jamforOppen.value = true
}

export function stangJamfor(): void {
  jamforOppen.value = false
}
