import { normalizeAlways } from '../locale/sv.js'

/**
 * Enkla textstädningar.
 *
 * Alla är rena funktioner värde → värde och körs genom `mapColumnValues`,
 * alltså en gång per unikt värde. Datum, e-post och sök & ersätt bygger på
 * samma mekanism men får egna dialoger med förhandsvisning.
 */
export interface Stadning {
  id: string
  etikett: string
  beskrivning: string
  fn: (value: string) => string
}

/** Versalisering som klarar bindestreck och apostrof: Anna-Lena, O'Brien. */
function storForstaBokstav(value: string): string {
  return value.toLocaleLowerCase('sv').replace(/(^|[\s\-'’])(\p{L})/gu, (_, före: string, bokstav: string) =>
    före + bokstav.toLocaleUpperCase('sv'),
  )
}

export const STADNINGAR: Stadning[] = [
  {
    id: 'trim',
    etikett: 'Trimma blanksteg',
    beskrivning: 'Tar bort mellanslag i början och slutet av varje värde.',
    fn: (v) => v.trim(),
  },
  {
    id: 'collapse',
    etikett: 'Slå ihop dubbla mellanslag',
    beskrivning: 'Gör flera mellanslag i rad till ett enda.',
    fn: (v) => v.replace(/ {2,}/g, ' '),
  },
  {
    id: 'invisible',
    etikett: 'Ta bort osynliga tecken',
    beskrivning:
      'Nollbreddstecken, hårt mellanslag och dekomponerade bokstäver. Det är den vanligaste orsaken till att två värden ser lika ut men inte matchar.',
    fn: (v) => normalizeAlways(v).trim(),
  },
  {
    id: 'upper',
    etikett: 'VERSALER',
    beskrivning: 'Gör alla bokstäver stora.',
    fn: (v) => v.toLocaleUpperCase('sv'),
  },
  {
    id: 'lower',
    etikett: 'gemener',
    beskrivning: 'Gör alla bokstäver små.',
    fn: (v) => v.toLocaleLowerCase('sv'),
  },
  {
    id: 'title',
    etikett: 'Stor Första Bokstav',
    beskrivning: 'Stor bokstav först i varje ord. Klarar Anna-Lena och O’Brien.',
    fn: storForstaBokstav,
  },
]

export function stadningarEfterId(id: string): Stadning | undefined {
  return STADNINGAR.find((s) => s.id === id)
}
