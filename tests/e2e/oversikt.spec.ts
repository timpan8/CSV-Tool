import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

test('översikten visar en rad per kolumn med ifyllnad och unika', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Översikt' }).click()

  const rader = page.locator('.oversikt__tabell tbody tr')
  await expect(rader).toHaveCount(8)
  await expect(rader.first()).toContainText('Kundnr')

  // Belopp saknas på en rad av sexton.
  const belopp = rader.filter({ hasText: 'Belopp' })
  await expect(belopp).toContainText('94 %')
})

test('översikten pekar ut datumkolumnen med sina format', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Översikt' }).click()

  const rad = page.locator('.oversikt__tabell tbody tr').filter({ hasText: 'Registrerad' })
  await expect(rad.locator('.oversikt__verktyg').first()).toContainText('Datum')
  await expect(rad.locator('.oversikt__skal').first()).toContainText('format')
})

test('klick på ett förslag öppnar rätt verktyg på rätt kolumn', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Översikt' }).click()

  const rad = page
    .locator('.oversikt__tabell tbody tr')
    .filter({ has: page.getByRole('button', { name: 'E-post', exact: true }) })
  await rad.locator('.oversikt__verktyg').first().click()

  await expect(page.locator('.oversikt')).toHaveCount(0)
  await expect(page.locator('.verktyg')).toContainText('E-post')
})

test('klick på kolumnnamnet går till kolumnen', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Översikt' }).click()
  await page.getByRole('button', { name: 'Ort', exact: true }).click()

  await expect(page.locator('.oversikt')).toHaveCount(0)
  await expect(page.locator('.insp__namn')).toHaveText('Ort')
})

test('typen går att byta direkt i översikten', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Översikt' }).click()

  const rad = page.locator('.oversikt__tabell tbody tr').filter({ hasText: 'Registrerad' })
  await rad.getByLabel('Typ för Registrerad').selectOption({ label: 'Datum' })
  // Fyra av sexton värden går inte att läsa som datum i exempelfilen.
  await expect(rad.locator('.oversikt__problem')).toBeVisible()
})

test('paletten hittar översikten', async ({ page }) => {
  await oppnaExempel(page)
  await page.keyboard.press('Control+k')
  await page.getByLabel('Sök bland kommandon').fill('kolumnöversikt')
  await page.keyboard.press('Enter')
  await expect(page.locator('.oversikt')).toBeVisible()
})
