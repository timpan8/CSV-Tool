import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

test('högerklick i en cell öppnar menyn vid pekaren', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Malmö').first().click({ button: 'right' })

  const meny = page.locator('.meny').first()
  await expect(meny).toBeVisible()
  await expect(meny).toContainText('Kopiera')
  await expect(meny).toContainText('Filtrera på ”Malmö”')

  await page.keyboard.press('Escape')
  await expect(page.locator('.meny')).toHaveCount(0)
})

test('menyn föreslår verktygen som passar kolumnens innehåll', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'anna.karlsson@nordbygg.se').first().click({ button: 'right' })

  const meny = page.locator('.meny').first()
  // Förslaget står med sitt skäl, räknat i celler.
  await expect(meny.getByRole('menuitem', { name: /E-post → namn/ })).toBeVisible()
  await expect(meny).toContainText('ser ut som adresser')
  await page.keyboard.press('Escape')

  // På en beloppskolumn kan e-postverktyget inte göra någonting, och ligger
  // därför under Fler verktyg i stället för bland förslagen.
  await cell(page, '1 240,50').first().click({ button: 'right' })
  const belopp = page.locator('.meny').first()
  await expect(belopp.getByRole('menuitem', { name: /^E-post → namn/ })).toHaveCount(0)
  await belopp.getByRole('menuitem', { name: 'Fler verktyg' }).hover()
  await expect(
    page.locator('.meny--under').getByRole('menuitem', { name: /E-post → namn/ }),
  ).toBeVisible()
})

test('en flercellsmarkering överlever högerklicket', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Malmö').first().click()
  await cell(page, 'Kiruna').first().click({ modifiers: ['Shift'] })
  await expect(page.locator('.statusrad')).toContainText('3 markerade')

  await cell(page, 'Lund').first().click({ button: 'right' })
  await expect(page.locator('.meny').first()).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('3 markerade')
})

test('högerklick utanför markeringen flyttar den dit', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Malmö').first().click()
  await cell(page, 'Kiruna').first().click({ button: 'right' })
  await expect(page.locator('.meny').first()).toContainText('Filtrera på ”Kiruna”')
})

test('filtrera på det här värdet filtrerar', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Malmö').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Filtrera på ”Malmö”' }).click()
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
})

test('högerklick på rubriken ger kolumnmenyn', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.rubrik[title="Ort"]').click({ button: 'right' })
  const meny = page.locator('.meny').first()
  await expect(meny).toContainText('Byt namn…')
  await expect(meny).toContainText('Flytta först')
})

test('klick på radnumret markerar hela raden, högerklick ger radmenyn', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.rutnat__radnr--valjbar').first().click()
  await expect(page.locator('.statusrad')).toContainText('8 markerade')

  await page.locator('.rutnat__radnr--valjbar').first().click({ button: 'right' })
  await expect(page.locator('.meny').first()).toContainText('Infoga rad ovanför')
})

test('menyn går att styra med piltangenterna', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Malmö').first().click({ button: 'right' })
  // Menyn tar fokus när den öppnas, annars skulle piltangenterna flytta
  // markeringen i rutnätet bakom.
  await expect(page.getByRole('menuitem', { name: 'Klipp ut' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Kopiera' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: 'Klipp ut' })).toBeFocused()
})

test('dubbelklick på kolumngreppet anpassar bredden', async ({ page }) => {
  await oppnaExempel(page)
  const rubrik = page.locator('.rubrik[title="Ort"]')
  const fore = (await rubrik.boundingBox())!.width
  await rubrik.locator('.rubrik__greppa').dblclick()
  const efter = (await rubrik.boundingBox())!.width
  expect(efter).toBeLessThan(fore)
})
