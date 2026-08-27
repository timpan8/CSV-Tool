import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppnaFilter(page: Page) {
  await page.getByRole('button', { name: /^Filter/ }).click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

/** Fyller i regel nr `i`: kolumn, operator och värde. */
async function sattRegel(page: Page, i: number, kolumn: string, operator: string, varde?: string) {
  const regel = page.locator('.regel').nth(i)
  await regel.locator('select').first().selectOption({ label: kolumn })
  await regel.locator('select').nth(1).selectOption({ label: operator })
  if (varde !== undefined) await regel.locator('.regel__varde').first().fill(varde)
}

test('en regel filtrerar och visas som ett chip', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaFilter(page)
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 0, 'Ort', 'är', 'Malmö')

  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
  await expect(page.locator('.filterrad .chip')).toContainText('Ort är Malmö')
  await expect(page.getByRole('gridcell', { name: 'Kiruna', exact: true })).toHaveCount(0)
})

test('alla eller någon avgör hur reglerna kombineras', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaFilter(page)
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 0, 'Ort', 'är', 'Malmö')
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 1, 'Status', 'är', 'Avslutad')

  await expect(page.locator('.statusrad')).toContainText('0 av 16 rader')
  await page.getByRole('radio', { name: 'Någon regel stämmer' }).click()
  await expect(page.locator('.statusrad')).toContainText('5 av 16 rader')
})

test('en avslagen regel ligger kvar i listan', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaFilter(page)
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 0, 'Ort', 'är', 'Malmö')
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')

  // Klick på chippet slår av regeln utan att ta bort den.
  await page.locator('.filterrad .chip__text').click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.locator('.filterrad .chip--av')).toBeVisible()

  await page.locator('.filterrad .chip__text').click()
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
})

test('en regel på en borttagen kolumn ritas trasig och vaknar med ångra', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaFilter(page)
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 0, 'Ort', 'är', 'Malmö')
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')

  await page.getByRole('button', { name: 'Meny för kolumnen Ort' }).click()
  await page.getByRole('menuitem', { name: 'Ta bort kolumnen' }).click()

  await expect(page.locator('.filterrad .chip--trasig')).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  await page.keyboard.press('Control+z')
  await expect(page.locator('.filterrad .chip--trasig')).toHaveCount(0)
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
})

test('talgränser jämför numeriskt', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaFilter(page)
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 0, 'Belopp', 'större än', '5000')

  // 12 000,00 och 7 450,00 och 5 120,25 — textjämförelse hade gett fel svar.
  await expect(page.locator('.statusrad')).toContainText('3 av 16 rader')
})

test('visa alla rader tömmer filtret men behåller sorteringen', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: /Sortera (på )?Ort/ }).click()
  await oppnaFilter(page)
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  await sattRegel(page, 0, 'Status', 'är', 'Aktiv')
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')

  await page.getByRole('button', { name: 'Visa alla rader' }).click()

  await expect(page.locator('.filterrad')).toHaveCount(0)
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  // Sorteringen döljer inga rader och ska därför inte kastas av knappen.
  await expect(page.locator('.statusrad')).toContainText('Sorterat: Ort ↑')
})

test('kolumnmenyns "visa rader som inte går att tolka" blir en regel', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Registrerad' }).click()
  await page.getByRole('menuitem', { name: 'Visa rader som inte går att tolka' }).click()

  await expect(page.locator('.filterrad .chip')).toContainText('går inte att tolka')
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
})

test('kolumnmenyn kan starta ett filter på kolumnen', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Ort' }).click()
  await page.getByRole('menuitem', { name: 'Filtrera på kolumnen…' }).click()

  await expect(page.locator('.verktyg')).toBeVisible()
  await expect(page.locator('.regel')).toHaveCount(1)
  // Regeln är ofärdig och döljer därför ingenting än.
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  await page.locator('.regel .regel__varde').first().fill('Lund')
  await expect(page.locator('.statusrad')).toContainText('1 av 16 rader')
})

test('inspektörens vanligaste värden filtrerar fram sitt värde', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Status' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('columnheader', { name: /Status/ }).click()

  await page.locator('.insp__toppost').first().click()
  await expect(page.locator('.filterrad .chip')).toContainText('Status är Aktiv')
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')
})
