import { expect, test, type Locator, type Page } from '@playwright/test'
import { EN } from '../../src/ui/sprak/en.js'

/**
 * Skärmbilderna till användarguiden.
 *
 * Det här är inte ett test — det är ett verktyg som råkar vara skrivet som
 * ett. Playwright ger webbläsare, webbserver och väntan gratis, och en bild
 * som inte gick att ta faller med samma tydliga felmeddelande som ett trasigt
 * test. Sviten körs med `npm run bilder` och ligger utanför den vanliga
 * konfigurationens `testDir`, så den kostar ingenting i CI.
 *
 * **Sviten klickar på svenska och slår upp engelskan i appens egen ordbok.**
 * `EN` har den svenska texten som nyckel, precis som `t()` i `sprak.ts`. En
 * etikettlista av egen tillverkning hade tyst glidit isär från gränssnittet;
 * med ordboken faller i stället bildtagningen den dag en text skrivs om, och
 * pekar ut vilken bild det gäller.
 *
 * **Varje panel ställs in innan den fotograferas.** En tom panel visar inte
 * vad verktyget gör — den visar bara att det finns.
 */

const SPRAK = ['sv', 'en'] as const
type Sprak = (typeof SPRAK)[number]

/** Ett litet underlag med telefonnummer; exempelfilen har ingen sådan kolumn. */
const TELEFONFIL = [
  'Namn;Telefon',
  'Anna Karlsson;070-123 45 67',
  'Erik Öberg;+46 (0)8 - 123 456',
  'Åsa Öhman;0046 73 987 65 43',
  'Björn Åkesson;08/123 456',
  'Carl-Johan Nilsson;saknas',
  '',
].join('\r\n')

for (const sprak of SPRAK) {
  /** Etiketten på gränssnittets språk. */
  const L = (svenska: string): string => (sprak === 'en' ? (EN[svenska] ?? svenska) : svenska)

  /** Samma sak för en text med `{0}`-platshållare, som `tf()`. */
  const Lf = (svenska: string, ...delar: string[]): string =>
    L(svenska).replace(/\{(\d)\}/g, (_, i: string) => delar[Number(i)] ?? '')

  test.describe(`bilder ${sprak}`, () => {
    // Fönstret är högt nog att rymma den längsta verktygspanelen — datum, med
    // sin formatinventering — utan att panelen behöver rullas. En bild av en
    // panel vars nedre tredjedel är avklippt svarar inte på frågan man ställde.
    //
    // `deviceScaleFactor: 1` ger bilder i samma storlek som skärmen visar dem
    // vid 100 %. Dubbel upplösning gjorde katalogen tre gånger så tung — och
    // en panelbild som är 1 800 punkter hög tar över sidan i stället för att
    // illustrera ett avsnitt som ska gå att skumma.
    test.use({ viewport: { width: 1400, height: 1080 }, deviceScaleFactor: 1 })

    test.beforeEach(async ({ context }) => {
      await context.addInitScript((valt: Sprak) => {
        try {
          localStorage.setItem('csv-verkstan.sprak', valt)
        } catch {
          // Blockerad lagring — appen faller tillbaka på svenska, och
          // bildtagningen upptäcker det på nästa svenska etikett den letar
          // efter i ett gränssnitt som skulle varit engelskt.
        }
      }, sprak)
    })

    /* ---------- Bildtagning ---------- */

    /** Tar bilden av hela sidan eller av ett element. */
    async function bild(page: Page, mal: Page | Locator, namn: string) {
      // Notiserna försvinner av sig själva efter några sekunder. Att vänta ut
      // dem är billigare än att förklara i guiden varför en ruta ligger över
      // tabellen i var tredje bild.
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: 12_000 })
      await mal.screenshot({
        path: `docs/bilder/${sprak}/${namn}.png`,
        animations: 'disabled',
        caret: 'hide',
      })
    }

    /* ---------- Hjälpare ---------- */

    /** Öppnar den inbyggda exempelfilen: 16 rader stökig svensk data. */
    async function oppnaExempel(page: Page) {
      await page.goto('/')
      await page.getByRole('button', { name: L('Öppna exempelfil') }).click()
      await page.getByRole('button', { name: L('Öppna filen') }).click()
      await expect(page.locator('.statusrad')).toContainText('16')
    }

    /** Öppnar de två exempelfilerna som var sin flik, med kundfilen aktiv. */
    async function oppnaParet(page: Page) {
      await page.goto('/')
      await page.getByRole('button', { name: L('Öppna två filer att slå ihop') }).click()
      await page.getByRole('button', { name: L('Öppna filen') }).click()
      await page.getByRole('button', { name: L('Öppna filen') }).click()
      await expect(page.locator('.flik')).toHaveCount(2)
      await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
      await expect(page.locator('.statusrad')).toContainText('16')
    }

    /**
     * Öppnar ett städverktyg ur kolumnmenyn, med *Fler verktyg* som andra väg.
     *
     * Etiketten matchas från början av posten och inte som delsträng. Ett
     * föreslaget verktyg står med sitt skäl efter namnet och måste alltså få
     * matcha ett prefix — men en kolumn som *heter* Telefon ger en post
     * "Gruppera på Telefon…" som annars hade vunnit på att stå först.
     */
    async function oppnaVerktyg(page: Page, kolumn: string, verktyg: string) {
      await page.getByRole('button', { name: Lf('Meny för kolumnen {0}', kolumn) }).click()
      const namn = new RegExp(`^${L(verktyg).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      if ((await page.getByRole('menuitem', { name: namn }).count()) === 0) {
        await page.getByRole('menuitem', { name: L('Fler verktyg') }).hover()
      }
      await page.getByRole('menuitem', { name: namn }).first().click()
      await expect(page.locator('.verktyg')).toBeVisible()
    }

    /** Posten i verktygsradens meny *Flera filer*. */
    async function oppnaFlerfil(page: Page, post: string) {
      await page.getByRole('button', { name: `${L('Flera filer')} ▾` }).click()
      await page.getByRole('menuitem', { name: L(post) }).click()
    }

    /** Fältet med en viss etikett inne i verktygspanelen. */
    const falt = (page: Page, etikett: string) =>
      page.locator('.verktyg .falt', { hasText: L(etikett) }).first()

    const panel = (page: Page) => page.locator('.verktyg')
    const modal = (page: Page) => page.locator('.modal')
    const meny = (page: Page) => page.locator('.meny').first()
    const arbetsyta = (page: Page) => page.locator('.arbetsyta')

    /* ================= 1. Kom igång ================= */

    test('tomma läget', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: L('Öppna exempelfil') })).toBeVisible()
      await bild(page, page, 'tomt-lage')
    })

    test('hela fönstret', async ({ page }) => {
      await oppnaExempel(page)
      await bild(page, page, 'oversikt-app')
    })

    /* ================= 2. Öppna och exportera ================= */

    test('importdialogen', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: L('Öppna exempelfil') }).click()
      await expect(modal(page)).toBeVisible()
      await bild(page, modal(page), 'import')
    })

    test('exportdialogen', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Exportera') }).click()
      await expect(modal(page)).toBeVisible()
      await bild(page, modal(page), 'export')
    })

    /* ================= 3. Tabellen ================= */

    test('sortering', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Sortera'), exact: true }).click()
      await expect(panel(page)).toBeVisible()
      await page.getByRole('button', { name: L('＋ Lägg till nivå') }).click()
      await panel(page).locator('select').first().selectOption({ label: 'Ort' })
      await bild(page, panel(page), 'sortera')
    })

    test('filter', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: new RegExp(`^${L('Filter')}`) }).click()
      await expect(panel(page)).toBeVisible()
      await page.getByRole('button', { name: L('＋ Lägg till regel') }).click()
      const regel = page.locator('.regel').first()
      await regel.locator('select').first().selectOption({ label: 'Ort' })
      await regel.locator('select').nth(1).selectOption({ label: L('är') })
      await regel.locator('.regel__varde').first().fill('Malmö')
      await expect(page.locator('.filterrad .chip')).toBeVisible()
      await bild(page, panel(page), 'filter')
    })

    test('dubbletter', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Dubbletter'), exact: true }).click()
      await expect(panel(page)).toBeVisible()
      // Hela raden hittar ingenting — det är Namn och E-post som gör det.
      for (const namn of ['Kundnr', 'Registrerad', 'Postnr', 'Ort', 'Belopp', 'Status']) {
        await page.locator('.kollista--kryss').getByRole('checkbox', { name: namn }).uncheck()
      }
      await expect(page.locator('.verktyg__underrubrik')).toContainText('2')
      await bild(page, panel(page), 'dubbletter')
    })

    test('sökraden', async ({ page }) => {
      await oppnaExempel(page)
      await page.keyboard.press('Control+f')
      await expect(page.locator('.sokrad')).toBeVisible()
      await page.locator('.sokrad input').first().fill('oberg')
      await bild(page, page.locator('.sokrad'), 'sok')
    })

    /* ================= 4. Städa och skriva om ================= */

    test('datum', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'Registrerad', 'Datum…')
      await bild(page, panel(page), 'datum')
    })

    test('tal', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'Belopp', 'Tal…')
      await bild(page, panel(page), 'tal')
    })

    test('telefon', async ({ page }) => {
      await page.goto('/')
      await page.locator('input[type=file]').first().setInputFiles({
        name: 'telefoner.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(TELEFONFIL, 'utf-8'),
      })
      await page.getByRole('button', { name: L('Öppna filen') }).click()
      await expect(page.locator('.statusrad')).toContainText('5')
      await oppnaVerktyg(page, 'Telefon', 'Telefon…')
      await bild(page, panel(page), 'telefon')
    })

    test('e-post till namn', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'E-post', 'E-post → namn…')
      await bild(page, panel(page), 'epost')
    })

    test('dela kolumnen', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'Namn', 'Dela kolumnen…')
      // Spökkolumnerna i rutnätet är hela poängen, så den här bilden tar med
      // tabellen bredvid panelen.
      await expect(page.locator('.rubrik--spoke')).toHaveCount(2)
      await bild(page, arbetsyta(page), 'dela')
    })

    test('slå ihop kolumner', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'Namn', 'Bygg kolumn ur mall…')
      await falt(page, 'Mall').locator('input').first().fill('{Namn}, {Ort}')
      await expect(page.locator('.rubrik--spoke')).toHaveCount(1)
      await bild(page, panel(page), 'slaihop-kolumner')
    })

    test('räkna', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'Belopp', 'Räkna…')
      await page.getByLabel(L('Formel'), { exact: true }).fill('{Belopp} * 1,25')
      await bild(page, panel(page), 'rakna')
    })

    test('sök och ersätt', async ({ page }) => {
      await oppnaExempel(page)
      await oppnaVerktyg(page, 'Status', 'Sök och ersätt…')
      await falt(page, 'Sök efter').locator('input').first().fill('Vilande')
      await falt(page, 'Ersätt med').locator('input').first().fill('Pausad')
      await bild(page, panel(page), 'ersatt')
    })

    test('städmenyn', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().click()
      await page.getByRole('button', { name: `${L('Städa')} ▾` }).click()
      await expect(meny(page)).toBeVisible()
      await bild(page, meny(page), 'stada-meny')
    })

    /* ================= 5. Sammanfatta och analysera ================= */

    test('gruppera och summera', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Sammanfatta…') }).click()
      await expect(modal(page)).toBeVisible()
      await bild(page, modal(page), 'gruppera')
    })

    test('pivot', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Pivot'), exact: true }).click()
      await expect(page.locator('.pivot')).toBeVisible()
      await bild(page, page, 'pivot')
    })

    test('kolumnöversikt', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Översikt'), exact: true }).click()
      await expect(page.locator('.oversikt')).toBeVisible()
      await bild(page, page, 'kolumnoversikt')
    })

    test('kolumninspektören', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().click()
      await expect(page.locator('.panel--hoger')).toBeVisible()
      await bild(page, page.locator('.panel--hoger'), 'inspektor')
    })

    /* ================= 6. Flera filer ================= */

    test('slå ihop två filer', async ({ page }) => {
      await oppnaParet(page)
      await oppnaFlerfil(page, 'Slå ihop…')
      await expect(page.locator('.slaihop')).toBeVisible()
      await bild(page, page, 'slaihop')
    })

    test('matchningsverkstaden', async ({ page }) => {
      await oppnaParet(page)
      await oppnaFlerfil(page, 'Slå ihop…')
      const par = page.locator('.slaihop__par').first()
      // Namn ↔ Name lämnar rader över — och det är dem verkstaden handlar om.
      await par.locator('select').nth(0).selectOption({ label: 'Namn' })
      await par.locator('select').nth(1).selectOption({ label: 'Name' })
      await page.getByRole('button', { name: L('Beta av resten…') }).click()
      await expect(page.locator('.verkstad')).toBeVisible()
      await bild(page, page, 'verkstad')
    })

    test('kombinera filer', async ({ page }) => {
      await oppnaParet(page)
      await oppnaFlerfil(page, 'Kombinera…')
      await expect(page.locator('.kombinera')).toBeVisible()
      await bild(page, page, 'kombinera')
    })

    /* ================= 7. Spara arbetet ================= */

    test('profiler', async ({ page }) => {
      await oppnaExempel(page)
      // En profil utan steg är en tom lista. Ett datumsteg räcker för att
      // dialogen ska visa vad den faktiskt sparar.
      await oppnaVerktyg(page, 'Registrerad', 'Datum…')
      await page.getByRole('button', { name: L('Tillämpa'), exact: true }).click()
      await expect(panel(page)).toHaveCount(0)
      await page.getByRole('button', { name: L('Profiler…') }).click()
      await expect(modal(page)).toBeVisible()
      await bild(page, modal(page), 'profiler')
    })

    test('börja om', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('● Allt lokalt') }).click()
      await expect(modal(page)).toBeVisible()
      await bild(page, modal(page), 'borja-om')
    })

    /* ================= 8. Genvägar och inställningar ================= */

    test('kommandopaletten', async ({ page }) => {
      await oppnaExempel(page)
      await page.keyboard.press('Control+k')
      await expect(page.locator('.palett')).toBeVisible()
      await bild(page, page.locator('.palett'), 'palett')
    })

    test('inställningar', async ({ page }) => {
      await oppnaExempel(page)
      await page.getByRole('button', { name: L('Inställningar'), exact: true }).click()
      await expect(meny(page)).toBeVisible()
      await bild(page, meny(page), 'installningar')
    })
  })
}
