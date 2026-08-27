import { expect, test, type Page } from '@playwright/test'

/** Öppnar exempelfilen, som är medvetet stökig på svenskt vis. */
async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

test('redigerar en cell, ångrar och gör om', async ({ page }) => {
  await oppnaExempel(page)

  await cell(page, 'Anna Karlsson').first().dblclick()
  const falt = page.locator('.rutnat__redigering')
  await expect(falt).toBeVisible()
  await falt.fill('Anna Karlsson-Berg')
  await falt.press('Enter')

  await expect(cell(page, 'Anna Karlsson-Berg')).toBeVisible()
  await expect(page.getByText(/Ångra 1/)).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(cell(page, 'Anna Karlsson').first()).toBeVisible()

  await page.keyboard.press('Control+y')
  await expect(cell(page, 'Anna Karlsson-Berg')).toBeVisible()
})

test('Escape avbryter redigeringen i stället för att spara den', async ({ page }) => {
  await oppnaExempel(page)

  await cell(page, 'Zlatan Ek').dblclick()
  const falt = page.locator('.rutnat__redigering')
  await falt.fill('Ändrat av misstag')
  await falt.press('Escape')

  await expect(cell(page, 'Zlatan Ek')).toBeVisible()
  await expect(page.getByText('Ändrat av misstag')).toHaveCount(0)
  // Ingen ändring får ha hamnat i historiken.
  await expect(page.getByRole('button', { name: /Ångra/ })).toBeDisabled()
})

test('markerar ett område och visar snabbsumman', async ({ page }) => {
  await oppnaExempel(page)

  // Beloppkolumnen: klicka första värdet, skift-klicka ett längre ned.
  await cell(page, '1 240,50').first().click()
  await cell(page, '980,00').click({ modifiers: ['Shift'] })

  const status = page.locator('.statusrad')
  await expect(status).toContainText('markerade')
  await expect(status).toContainText('Σ')
})

test('tömmer markerade celler med Delete och ångrar', async ({ page }) => {
  await oppnaExempel(page)

  await cell(page, 'Malmö').first().click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.toast').last()).toContainText('Tömde 1 cell')

  await page.keyboard.press('Control+z')
  await expect(cell(page, 'Malmö').first()).toBeVisible()
})

test('söker accentokänsligt och rensar tillbaka', async ({ page }) => {
  await oppnaExempel(page)

  await page.keyboard.press('Control+f')
  const sok = page.getByRole('searchbox', { name: 'Sök i tabellen' })
  await sok.fill('oberg')

  // "oberg" ska hitta "Öberg" utan att man skriver Ö.
  await expect(page.locator('.sokrad__antal')).toContainText('1 av 16 rader')
  await expect(cell(page, 'Erik Öberg')).toBeVisible()
  await expect(cell(page, 'Anna Karlsson').first()).toHaveCount(0)

  await page.getByRole('button', { name: 'Stäng', exact: true }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})

test('städar en kolumn och räknar ändringarna', async ({ page }) => {
  await oppnaExempel(page)

  // Markera hela Status-kolumnen genom att klicka dess rubrik.
  await page.locator('.rubrik').filter({ hasText: 'Status' }).click()
  await page.getByRole('button', { name: 'Städa ▾' }).click()
  await page.getByRole('menuitem', { name: 'VERSALER' }).click()

  await expect(page.locator('.toast').last()).toContainText('ändrades')
  await expect(cell(page, 'AKTIV').first()).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(cell(page, 'Aktiv').first()).toBeVisible()
})

test('tar bort en rad och tar tillbaka den med sitt radnummer', async ({ page }) => {
  await oppnaExempel(page)

  await cell(page, 'Erik Öberg').click()
  await page.getByRole('button', { name: 'Rader ▾' }).click()
  await page.getByRole('menuitem', { name: 'Ta bort markerade rader' }).click()

  await expect(page.locator('.statusrad')).toContainText('15 rader')
  await expect(cell(page, 'Erik Öberg')).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(cell(page, 'Erik Öberg')).toBeVisible()
})

test('klistrar in TSV i markeringen', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Lund').first().click()

  // Simulera en inklistring från Excel: två rader, en kolumn.
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'Uppsala\nVisby')
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })

  await expect(page.locator('.toast').last()).toContainText('Klistrade in 2 celler')
  await expect(cell(page, 'Uppsala').first()).toBeVisible()
  await expect(cell(page, 'Visby')).toBeVisible()
})

test('frågar innan en inklistring som inte får plats', async ({ page }) => {
  await oppnaExempel(page)
  // Sista raden i Ort-kolumnen: bara en rad kvar nedanför.
  await cell(page, 'Skellefteå').click()

  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'a\nb\nc\nd')
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('4 rader')
  await page.getByRole('button', { name: 'Lägg till plats' }).click()

  await expect(page.locator('.statusrad')).toContainText('19 rader')
  await expect(cell(page, 'd')).toBeVisible()
})

test('klistrar in i tomma läget som en ny fil', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()

  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'Namn\tOrt\nÅsa\tMalmö\nBo\tLund')
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })

  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('2 rader')
  await expect(cell(page, 'Åsa')).toBeVisible()
})
