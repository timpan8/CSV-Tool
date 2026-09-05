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

/**
 * Vakten över guiden som sida.
 *
 * `docs/guide.html` visar samma guide som markdown-filerna, men ur
 * `guide-sv.js` och `guide-en.js`. Samma tre fel går att göra som i markdown,
 * plus ett fjärde som är värre: sidan är den enda dokumentationen som körs, och
 * ett skript som hämtar något från nätet skulle bryta samma löfte som appen
 * ger — utan att någon märkte det, eftersom guiden inte ingår i bygget.
 */

/** Innehållsfilen, läst som det skript den är. */
function innehall(fil: string, namn: string): Guide {
  const fonster: Record<string, Guide> = {}
  new Function('window', readFileSync(join(DOCS, fil), 'utf8'))(fonster)
  const laddad = fonster[namn]
  if (!laddad) throw new Error(`${fil} satte inte window.${namn}`)
  return laddad
}

interface Avsnitt {
  id: string
  t: string
  img?: string
  cap?: string
  imgWidth?: number
  lead?: string
  steps?: string[]
  notes?: string[]
  legend?: { t: string; d: string }[]
  kbd?: [string, string][]
  table?: { head: string[]; rows: string[][] }
  before?: { label: string; items: string[] }
  after?: { label: string; items: string[] }
  warn?: string
}

interface Guide {
  title: string
  tagline: string
  ui: Record<string, string>
  facts: { k: string; v: string }[]
  groups: { id: string; t: string; sections: Avsnitt[] }[]
}

const SIDAN = [
  { fil: 'guide-sv.js', namn: 'GUIDE_SV', bilder: 'sv' },
  { fil: 'guide-en.js', namn: 'GUIDE_EN', bilder: 'en' },
] as const

const avsnitten = (g: Guide): Avsnitt[] => g.groups.flatMap((omrade) => omrade.sections)

describe.each(SIDAN)('$fil', ({ fil, namn, bilder }) => {
  const g = innehall(fil, namn)

  it('har ett id och en rubrik i varje avsnitt', () => {
    // Id:t är ankaret menyn länkar till. Två avsnitt med samma id ger en meny
    // där den ena raden aldrig går att nå.
    const sedda = new Set<string>()
    for (const avsnitt of avsnitten(g)) {
      expect(avsnitt.t, `avsnittet ${avsnitt.id}`).toBeTruthy()
      expect(sedda, `id:t ${avsnitt.id}`).not.toContain(avsnitt.id)
      sedda.add(avsnitt.id)
    }
    expect(sedda.size).toBeGreaterThan(30)
  })

  it('pekar bara på bilder som finns, i rätt språkkatalog', () => {
    for (const { id, img } of avsnitten(g)) {
      if (!img) continue
      expect(img, `bilden i ${id}`).toMatch(/^[a-z0-9-]+\.png$/)
      expect(existsSync(join(DOCS, 'bilder', bilder, img)), `${bilder}/${img} saknas`).toBe(true)
    }
  })

  it('har en bildtext till varje bild', () => {
    // Bildtexten är både figcaption och alt-text. Utan den säger förstoringen
    // ingenting till den som inte kan se bilden.
    for (const { id, img, cap } of avsnitten(g)) {
      if (!img) continue
      expect((cap ?? '').length, `bilden i ${id} saknar bildtext`).toBeGreaterThan(5)
    }
  })

  it('använder alla bilder som genereras', () => {
    const anvanda = new Set(avsnitten(g).map((a) => a.img))
    for (const namn of readdirSync(join(DOCS, 'bilder', bilder))) {
      expect(anvanda, `${bilder}/${namn} används inte av sidan`).toContain(namn)
    }
  })

  it('har texterna som gränssnittet läser ur ui', () => {
    // Sidan hämtar varje etikett härifrån. En som saknas blir ett tomt
    // element i stället för ett fel, och syns först för en läsare.
    for (const nyckel of ['search', 'noHits', 'contents', 'steps', 'notes', 'top', 'zoom']) {
      expect(g.ui[nyckel], `ui.${nyckel}`).toBeTruthy()
    }
    expect(g.title).toBeTruthy()
    expect(g.tagline).toBeTruthy()
    expect(g.facts.length).toBeGreaterThan(0)
  })
})

describe('sidans två språk', () => {
  const [sv, en] = SIDAN.map((s) => innehall(s.fil, s.namn)) as [Guide, Guide]

  it('har samma områden och avsnitt i samma ordning', () => {
    expect(en.groups.map((o) => o.id)).toEqual(sv.groups.map((o) => o.id))
    expect(avsnitten(en).map((a) => a.id)).toEqual(avsnitten(sv).map((a) => a.id))
  })

  it('visar samma bilder', () => {
    expect(avsnitten(en).map((a) => a.img)).toEqual(avsnitten(sv).map((a) => a.img))
  })

  it('har lika många steg, noteringar och rader i varje avsnitt', () => {
    // Ett steg som lagts till på ett språk och glömts på det andra ger två
    // guider som beskriver olika arbetsgångar för samma verktyg.
    const form = (a: Avsnitt) => ({
      steps: a.steps?.length ?? 0,
      notes: a.notes?.length ?? 0,
      legend: a.legend?.length ?? 0,
      kbd: a.kbd?.length ?? 0,
      rader: a.table?.rows.length ?? 0,
      fore: a.before?.items.length ?? 0,
      efter: a.after?.items.length ?? 0,
    })
    for (const [i, avsnitt] of avsnitten(sv).entries()) {
      expect(form(avsnitten(en)[i]!), `avsnittet ${avsnitt.id}`).toEqual(form(avsnitt))
    }
  })

  it('visar samma bilder som markdown-guiderna', () => {
    // Två beskrivningar av samma verktyg som visar olika skärmbilder är två
    // beskrivningar varav minst en är gammal.
    const ur = (fil: string) =>
      new Set([...text(fil).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!.split('/').pop()))
    expect(new Set(avsnitten(sv).map((a) => a.img).filter(Boolean))).toEqual(ur('ANVANDARGUIDE.md'))
  })
})

describe('guide.html', () => {
  const FILER = ['guide.html', 'guide.js', 'guide-sv.js', 'guide-en.js']

  it('rör inte nätet', () => {
    // Samma löfte som appens `connect-src 'none'`, kontrollerat på samma sätt:
    // maskinellt. En dokumentationssida som hämtar ett ramverk från ett CDN
    // gör löftet till en text man får tro på.
    for (const fil of FILER) {
      const kalla = readFileSync(join(DOCS, fil), 'utf8')
      const traffar = [...kalla.matchAll(/\b(?:https?:)?\/\/[\w.-]+\.\w{2,}/g)]
        .map((m) => m[0])
        // Namnrymden i en <svg> är en identifierare, inte en hämtning.
        .filter((u) => u !== 'http://www.w3.org')
      expect(traffar, `${fil} pekar utanför repot`).toEqual([])
      expect(kalla, `${fil} hämtar något`).not.toMatch(/\bfetch\(|XMLHttpRequest|import\(/)
    }
  })

  it('bär samma säkerhetspolicy som appen', () => {
    const html = readFileSync(join(DOCS, 'guide.html'), 'utf8')
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("connect-src 'none'")
  })

  it('laddar innehållet som vanliga skript', () => {
    // Som modul är filen korsursprung från file://, och sidan blir blank för
    // den som öppnar guiden genom att dubbelklicka på den.
    const html = readFileSync(join(DOCS, 'guide.html'), 'utf8')
    for (const fil of ['guide-sv.js', 'guide-en.js', 'guide.js']) {
      expect(html).toContain(`<script src="${fil}"></script>`)
    }
  })

  it('publiceras med bygget', () => {
    // Utan den här kopieringen finns sidan bara för den som klonat repot:
    // GitHub renderar inte HTML ur en katalog.
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url).pathname, 'utf8')
    for (const fil of FILER) expect(vite, `${fil} kopieras inte till bygget`).toContain(fil)
    expect(vite).toContain('docs/bilder')
  })
})
