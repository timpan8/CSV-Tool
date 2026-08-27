/**
 * Svenska språkregler samlade på ett ställe.
 *
 * Sorteringsordningen är den synligaste: `å ä ö` kommer efter `z`, inte före
 * som i en rå teckenkodsjämförelse. En lista där Åberg hamnar före Bengtsson
 * ser omedelbart trasig ut för en svensk användare.
 */

/**
 * Sorteringskollator.
 *
 * `sensitivity: 'variant'` gör att `a` och `A` skiljs åt — utan den blir
 * ordningen icke-deterministisk mellan värden som bara skiljer sig i
 * skiftläge. `numeric: true` ger "Kund 2" före "Kund 10" på köpet.
 */
export const sortCollator = new Intl.Collator('sv-SE', {
  numeric: true,
  sensitivity: 'variant',
  caseFirst: 'false',
})

/** Kollator för jämförelser där skiftläge och accenter ska ignoreras. */
export const looseCollator = new Intl.Collator('sv-SE', {
  numeric: true,
  sensitivity: 'base',
})

/*
 * Rangordningen av en ordbok bor i `src/core/frame/rank.ts`, eftersom den
 * behöver kolumnens typ för att veta om `1000` ska hamna före eller efter
 * `99`. Kollatorn ovan är den textordning den faller tillbaka på.
 */

/** Månadsnamn, fulla och förkortade, för datumtolkning. */
export const MONTH_NAMES: ReadonlyMap<string, number> = new Map([
  ['januari', 1], ['jan', 1],
  ['februari', 2], ['feb', 2], ['febr', 2],
  ['mars', 3], ['mar', 3],
  ['april', 4], ['apr', 4],
  ['maj', 5],
  ['juni', 6], ['jun', 6],
  ['juli', 7], ['jul', 7],
  ['augusti', 8], ['aug', 8],
  ['september', 9], ['sep', 9], ['sept', 9],
  ['oktober', 10], ['okt', 10],
  ['november', 11], ['nov', 11],
  ['december', 12], ['dec', 12],
  // Engelska förkortningar förekommer i systemexporter.
  ['january', 1], ['february', 2], ['march', 3], ['may', 5],
  ['june', 6], ['july', 7], ['august', 8], ['october', 10],
])

/** Tecken som är osynliga men bryter varje matchning de får finnas kvar i. */
const INVISIBLE = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g
const NBSP = /[\u00A0\u2007\u202F]/g

/**
 * Normalisering som alltid körs före jämförelser.
 *
 * De tre stegen här kan bara laga osynliga formatskillnader — de kan aldrig
 * göra två genuint olika värden lika. Därför är de alltid på, till skillnad
 * från t.ex. "ignorera å ä ö" som mycket väl kan slå ihop `För` och `For`.
 */
export function normalizeAlways(value: string): string {
  return value.normalize('NFC').replace(INVISIBLE, '').replace(NBSP, ' ')
}

/** Tar bort diakritiska tecken. Endast som uttryckligt tillval. */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036F]/g, '')
}

export const NUMBER_FORMAT = new Intl.NumberFormat('sv-SE')

export function formatCount(n: number): string {
  return NUMBER_FORMAT.format(n)
}

/**
 * Svensk pluralform.
 *
 * "1 celler" och "1 rader" läser fel och får verktyget att verka slarvigt
 * precis i de ögonblick det rapporterar vad det gjort med användarens data.
 */
export function plural(n: number, ental: string, flertal: string): string {
  return `${formatCount(n)} ${n === 1 ? ental : flertal}`
}

export const celler = (n: number) => plural(n, 'cell', 'celler')
export const rader = (n: number) => plural(n, 'rad', 'rader')
export const kolumner = (n: number) => plural(n, 'kolumn', 'kolumner')

/**
 * Tal i statusradens snabbsumma.
 *
 * Två decimaler när det finns en decimaldel, inga när summan är jämn. En
 * beloppssumma som visas som "24 092,5" ser ut som ett avrundningsfel.
 */
export function formatSum(n: number): string {
  const decimaler = Number.isInteger(n) ? 0 : 2
  return n.toLocaleString('sv-SE', {
    minimumFractionDigits: decimaler,
    maximumFractionDigits: decimaler,
  })
}
