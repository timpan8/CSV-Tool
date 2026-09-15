import { FARGMASK, FARGSKIFT } from '../types.js'

/**
 * Paletten för cell- och kolumnfärg.
 *
 * Sju av diagrammens åtta serier, i samma ordning. De är redan kontrollerade
 * mot verktygets egna ytor i båda teman för färgblindhetsseparation och
 * kontrast (se `tokens.css`), så det finns ingen anledning att välja nya.
 * Den mörkgröna serien utelämnas: bredvid den ljusgröna ser de ut som samma
 * färg när de ligger som svaga fyllningar bakom text.
 *
 * `token` är numret i `--serie-N`; `excel` är samma nyans blandad till den
 * svaga fyllning rutnätet visar, som en färdig ARGB-sträng för `.xlsx`.
 */
export interface Fargpost {
  /** 1–7, det som skrivs i flaggbyten. */
  farg: number
  /** Svenskt namn, gement — sätts in i meningar. */
  namn: string
  token: number
  excel: string
}

export const FARGER: readonly Fargpost[] = [
  { farg: 1, namn: 'blå', token: 1, excel: 'FFD1E1F6' },
  { farg: 2, namn: 'orange', token: 2, excel: 'FFFBDCD2' },
  { farg: 3, namn: 'grön', token: 3, excel: 'FFCEEEE2' },
  { farg: 4, namn: 'gul', token: 4, excel: 'FFFBEBC6' },
  { farg: 5, namn: 'rosa', token: 5, excel: 'FFF9DEE8' },
  { farg: 6, namn: 'lila', token: 7, excel: 'FFD5D2EA' },
  { farg: 7, namn: 'röd', token: 8, excel: 'FFF8D3D3' },
]

export const ANTAL_FARGER = FARGER.length

/** Cellens färg ur flaggbyten: 0 för ofärgad. */
export function cellfarg(flags: number): number {
  return (flags & FARGMASK) >>> FARGSKIFT
}

/** Flaggbyten med färgen utbytt och allt annat kvar. 0 tar bort färgen. */
export function medFarg(flags: number, farg: number): number {
  return (flags & ~FARGMASK & 0xff) | ((farg & 0b111) << FARGSKIFT)
}

/** Palettposten, eller null för 0 och allt utanför paletten. */
export function fargpost(farg: number): Fargpost | null {
  return FARGER[farg - 1] ?? null
}

/** `'grön'` — eller tom sträng för ofärgad. */
export function fargnamn(farg: number): string {
  return fargpost(farg)?.namn ?? ''
}

/** CSS-uttrycket för färgen, så att alla ytor läser samma token. */
export function fargToken(farg: number): string {
  const post = fargpost(farg)
  return post ? `var(--serie-${post.token})` : 'transparent'
}

/** Sant om någon cell i kolumnen bär en färg. */
export function harCellfarg(flags: Uint8Array): boolean {
  for (let r = 0; r < flags.length; r++) if ((flags[r]! & FARGMASK) !== 0) return true
  return false
}
