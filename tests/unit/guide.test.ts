import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Vakten över användarguiden.
 *
 * Guiden är två filer som ska säga samma sak på två språk, med bilder som
 * genereras av `npm run bilder`. Tre fel går att göra utan att märka det: att
 * döpa om en rubrik och lämna innehållsförteckningen pekande i tomma luften,
 * att skriva en bildsökväg som inte finns, och att lägga till ett avsnitt på
 * ett språk och glömma det andra. Alla tre är osynliga tills någon läser
 * filen — och den som läser den är den som ska lära sig verktyget.
 *
 * Testet ersätter inte att titta på bilderna. Att den engelska guiden visar
 * ett engelskt gränssnitt kan bara ett par ögon avgöra.
 */

const DOCS = new URL('../../docs/', import.meta.url).pathname

const GUIDER = [
  // `innehall` är rubriken över innehållsförteckningen. Den är den enda som
  // inte länkas till — den är listan, inte ett avsnitt i den.
  { fil: 'ANVANDARGUIDE.md', bilder: 'sv', innehall: 'Innehåll' },
  { fil: 'USER-GUIDE.md', bilder: 'en', innehall: 'Contents' },
] as const

const text = (fil: string) => readFileSync(join(DOCS, fil), 'utf8')

/**
 * Rubrikens ankare, som GitHub bildar det.
 *
 * GitHub gemenerar, stryker skiljetecken och byter blanksteg mot bindestreck.
 * Den fullständiga regeln har undantag för symboler som varken guiden eller
 * någon rimlig rubrik innehåller — och testet nedan kräver därför att
 * rubrikerna håller sig till bokstäver, siffror, blanksteg och bindestreck, så
 * att den här förenklingen stämmer.
 */
function ankare(rubrik: string): string {
  return rubrik
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

/** Rubrikerna i en fil, utan `#` och utan den inledande titeln. */
function rubriker(md: string): string[] {
  return [...md.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]!.trim())
}

/** Bildsökvägarna, i den ordning de står. */
function bildlankar(md: string): string[] {
  return [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!)
}

describe.each(GUIDER)('$fil', ({ fil, bilder, innehall }) => {
  const md = text(fil)

  it('har bara rubriker som ger förutsägbara ankare', () => {
    // Ett `…` eller ett `→` i en rubrik stryks av GitHub men inte av alla
    // andra markdown-renderare, och ankaret blir då olika på olika ställen.
    for (const rubrik of rubriker(md)) {
      expect(rubrik, `rubriken "${rubrik}"`).toMatch(/^[\p{L}\p{N}][\p{L}\p{N} ,-]*$/u)
    }
  })

  it('har en innehållsförteckning som pekar på rubriker som finns', () => {
    const finns = new Set(rubriker(md).map(ankare))
    const lankar = [...md.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]!)
    expect(lankar.length).toBeGreaterThan(30)
    for (const lank of lankar) {
      expect(finns, `länken #${lank}`).toContain(lank)
    }
  })

  it('har ett avsnitt för varje rubrik i innehållsförteckningen', () => {
    // Åt andra hållet: en rubrik som ingen länkar till går inte att nå från
    // toppen, och guidens hela poäng är att man klickar sig dit.
    const lankade = new Set([...md.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]!))
    for (const rubrik of rubriker(md)) {
      if (rubrik === innehall) continue
      expect(lankade, `rubriken "${rubrik}"`).toContain(ankare(rubrik))
    }
  })

  it('pekar bara på bilder som finns, i rätt språkkatalog', () => {
    const lankar = bildlankar(md)
    expect(lankar.length).toBeGreaterThan(20)
    for (const lank of lankar) {
      expect(lank, lank).toMatch(new RegExp(`^bilder/${bilder}/[a-z0-9-]+\\.png$`))
      expect(existsSync(join(DOCS, lank)), `${lank} saknas — kör npm run bilder`).toBe(true)
    }
  })

  it('har en bildtext till varje bild', () => {
    // Alt-texten är det enda den ser som inte kan se bilden får.
    for (const [, alt, lank] of md.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      expect(alt!.length, `${lank} saknar bildtext`).toBeGreaterThan(5)
    }
  })

  it('genererar inga bilder som ingen använder', () => {
    const anvanda = new Set(bildlankar(md).map((l) => l.split('/').pop()))
    for (const fil of readdirSync(join(DOCS, 'bilder', bilder))) {
      expect(anvanda, `${bilder}/${fil} används inte`).toContain(fil)
    }
  })
})

describe('de två språken', () => {
  const [sv, en] = GUIDER.map((g) => text(g.fil)) as [string, string]

  it('visar samma bilder', () => {
    const namn = (md: string) => bildlankar(md).map((l) => l.split('/').pop()!)
    expect(namn(en)).toEqual(namn(sv))
  })

  it('har lika många avsnitt', () => {
    // En rubrik som lagts till på ett språk och glömts på det andra ger en
    // guide som säger olika saker beroende på vem som läser den.
    expect(rubriker(en).length).toBe(rubriker(sv).length)
  })
})

describe('README', () => {
  it('länkar till båda guiderna', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url).pathname, 'utf8')
    for (const { fil } of GUIDER) {
      expect(readme, `länken till ${fil}`).toContain(`docs/${fil}`)
    }
  })
})
