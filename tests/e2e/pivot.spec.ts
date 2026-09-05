import { expect, test, type Page } from '@playwright/test'
import { ruta, satt } from './pivothjalp.js'

/*
 * Pivotvyn.
 *
 * Två saker som testas hårdare än resten: att vyn **aldrig ändrar filen**, och
 * att Escape stänger den. Det senare är den kedja i `App.tsx` som en gång
 * gled isär och lät en osynlig vy äga tangentbordet, och en ny gren i den
 * kedjan är precis där felet kan komma tillbaka.
 */

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppnaPivot(page: Page) {
  await page.getByRole('button', { name: 'Pivot', exact: true }).click()
  await expect(page.locator('.pivot')).toBeVisible()
}

const falt = (page: Page) => page.locator('.palett__falt')

/** Cellen på raden som börjar med `radetikett`, i kolumn nummer `kol` (0-baserat). */
const cell = (page: Page, radetikett: string, kol: number) =>
  page
    .locator('.pivottab tbody tr')
    .filter({ has: page.locator('th', { hasText: radetikett }) })
    .locator('td')
    .nth(kol)

test('pivoten öppnas med en tabell som redan säger något', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)

  // Förvalet väljer en kategorikolumn åt en, utan att man fyllt i något.
  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(1)
  await expect(page.locator('.pivottab tbody tr')).not.toHaveCount(0)
  // Statusens tre värden, och Totalt-raden som säger sexton.
  await expect(page.locator('.pivottab tbody th').first()).toContainText('Aktiv')
  await expect(page.locator('.pivottab tfoot')).toContainText('16')
})

test('en korstabell räknar rätt i båda ledderna', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)

  await satt(page, 'Rader', 'Status')
  await satt(page, 'Kolumner', 'Ort')

  // Malmö är den enda ort som återkommer, och båda raderna är Aktiv.
  const rubriker = page.locator('.pivottab thead th')
  const malmo = await rubriker.allInnerTexts()
  const kol = malmo.findIndex((r) => r.startsWith('Malmö'))
  expect(kol).toBeGreaterThan(0)
  // Rubrikraden börjar med hörnrutan, cellerna gör det inte.
  await expect(cell(page, 'Aktiv', kol - 1)).toHaveText('2')
  // Boden är Vilande, så Aktiv har ingen cell där — tom, inte noll.
  const boden = malmo.findIndex((r) => r.startsWith('Boden'))
  await expect(cell(page, 'Aktiv', boden - 1)).toHaveText('')
  // Totalt-kolumnen längst till höger bär radens hela antal.
  await expect(page.locator('.pivottab tbody tr').first().locator('td').last()).toHaveText('10')
})

test('andel av rad ger hundra procent i Totalt', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)
  await satt(page, 'Kolumner', 'Ort')

  await page.getByRole('radio', { name: '% av rad' }).click()
  const sista = page.locator('.pivottab tbody tr').first().locator('td').last()
  await expect(sista).toHaveText(/100\s*%/)
})

test('klick på en kolumnrubrik sorterar raderna', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)

  const forsta = () => page.locator('.pivottab tbody tr').first().locator('th')
  await expect(forsta()).toContainText('Aktiv')

  // Totalt-kolumnen fallande: den största gruppen hamnar överst. Aktiv har
  // tio rader och ligger redan först, så stigande är det som flyttar något.
  await page.getByRole('button', { name: /Sortera raderna efter/ }).last().click()
  await page.getByRole('button', { name: /Sortera raderna efter/ }).last().click()
  await expect(forsta()).not.toContainText('Aktiv')
})

test('flera fält i Rader ger delsummor som går att fälla ihop', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)

  // En nivålista *är* flera fält i Rader utan fält i Kolumner. Ingen egen
  // lägesväxel behövs för att säga det.
  await satt(page, 'Kolumner')
  await satt(page, 'Rader', 'Status', 'Ort')

  const rader = page.locator('.pivottab tbody tr')
  const fore = await rader.count()
  expect(fore).toBeGreaterThan(3)

  // Fäll ihop den första gruppen: barnen försvinner, delsumman står kvar.
  await page.locator('.pivottab__falla').first().click()
  expect(await rader.count()).toBeLessThan(fore)
  await expect(rader.first()).toBeVisible()
})

test('gör till ny flik ger en vanlig flik, och källan är orörd', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')

  await page.getByRole('button', { name: 'Gör till ny flik' }).click()
  await expect(page.locator('.rutnat')).toBeVisible()
  // Tre statusvärden blir tre rader, och rubrikerna är kolumnens och Totalt.
  await expect(page.locator('.statusrad')).toContainText('3 rader')
  await expect(page.locator('.rubrik[title="Status"]')).toBeVisible()
  await expect(page.locator('.rubrik[title="Totalt"]')).toBeVisible()

  // Källfliken har lika många rader som innan — pivoten läser, den skriver inte.
  await page.getByRole('button', { name: 'exempel-kunder.csv', exact: true }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})

test('Escape stänger pivoten och rutnätet kommer tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)
  await expect(page.locator('.rutnat')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('.pivot')).toHaveCount(0)
  await expect(page.locator('.rutnat')).toBeVisible()
})

test('tangentbordet når inte fliken bakom en öppen pivot', async ({ page }) => {
  await oppnaExempel(page)
  // Markera en cell, så att det finns något Delete skulle kunna tömma.
  await page.locator('.rutnat__cell', { hasText: 'Anna Karlsson' }).first().click()
  await oppnaPivot(page)

  await page.keyboard.press('Delete')
  await page.keyboard.press('Control+z')

  await page.keyboard.press('Escape')
  await expect(page.locator('.rutnat__cell', { hasText: 'Anna Karlsson' }).first()).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})

test('paletten hittar också dit', async ({ page }) => {
  await oppnaExempel(page)

  await page.keyboard.press('Control+k')
  await falt(page).fill('pivot')
  // Sökordet pekar på pivoten och ingen annan — grupperingen har sina egna ord.
  await expect(page.locator('.palett__post')).toHaveCount(1)
  await page.locator('.palett__post').first().click()
  await expect(page.locator('.pivot')).toBeVisible()
})

test('byte av flik ger pivoten ett nytt förslag i stället för en tom tabell', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')

  // Fliken finns kvar ovanför vyn, så bytet går att göra mitt i en pivot.
  await page.getByRole('button', { name: 'Gör till ny flik' }).click()
  await oppnaPivot(page)
  await page.getByRole('button', { name: 'exempel-kunder.csv', exact: true }).click()

  // Kolumn-id från den andra filen betyder ingenting här; tabellen ska ändå
  // stå fylld, med ett förslag som gäller den fil man nu tittar på.
  await expect(page.locator('.pivottab tbody tr')).not.toHaveCount(0)
  await expect(page.locator('.pivottab tfoot')).toContainText('16')
})
