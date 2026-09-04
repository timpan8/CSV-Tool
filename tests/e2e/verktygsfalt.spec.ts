import { expect, test, type Page } from '@playwright/test'
import { vantaPaSparat } from './lagringshjalp.js'

/*
 * Stort fönster med flit: testerna högerklickar i tomrummet till höger om
 * sista kolumnen och under sista raden, och i ett smalt fönster finns inget
 * sådant tomrum — rutnätet rullar i stället. Åtta kolumner plus panelerna
 * på båda sidor behöver drygt 1 800 px för att lämna något över.
 */
test.use({ viewport: { width: 2000, height: 900 } })

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const installningar = (page: Page) => page.getByRole('button', { name: 'Inställningar' })

test('högerklick i tomrummet ger en meny för att lägga till, inte webbläsarens', async ({ page }) => {
  await oppnaExempel(page)

  // Till höger om sista rubriken, i rubrikraden. Kontrollen först: hamnar
  // punkten utanför rutnätet är det fönstret som är för smalt, och det ska
  // sägas rakt ut i stället för att synas som en meny som aldrig kom.
  const sista = (await page.locator('.rubrik').last().boundingBox())!
  const rutnat = (await page.locator('.rutnat').boundingBox())!
  const x = rutnat.x + rutnat.width - 12
  expect(x, 'inget tomrum till höger om sista kolumnen').toBeGreaterThan(sista.x + sista.width + 4)
  await page.mouse.click(x, sista.y + sista.height / 2, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Infoga en ny kolumn' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Under sista raden.
  const rad = (await page.locator('.rutnat__rad').last().boundingBox())!
  await page.mouse.click(rad.x + 200, rad.y + rad.height + 40, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Lägg till en rad sist' }).click()
  await expect(page.locator('.statusrad')).toContainText('17 rader')

  await page.mouse.click(rad.x + 200, rad.y + rad.height + 80, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Infoga en ny kolumn' }).click()
  await expect(page.locator('.statusrad')).toContainText('9 kolumner')
  await expect(page.getByRole('columnheader', { name: 'Ny kolumn' })).toBeVisible()

  // En cell ger fortfarande cellmenyn, inte tomrummets.
  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Klipp ut' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Infoga en ny kolumn' })).toHaveCount(0)
})

test('redigeringsfältet kan läggas lodrätt, och valet överlever en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await expect(page.locator('.redigeringsfalt--rad')).toBeVisible()

  await installningar(page).click()
  await expect(
    page.getByRole('menuitemradio', { name: 'Verktygsfält: som rad' }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'Verktygsfält: lodrätt' }).click()

  const lodrat = page.locator('.redigeringsfalt--lodrat')
  await expect(lodrat).toBeVisible()
  await expect(page.locator('.redigeringsfalt--rad')).toHaveCount(0)
  // Knapparna behåller sina namn — det är samma knappar, bara en annan riktning.
  await expect(lodrat.getByRole('button', { name: 'Sortera' })).toBeVisible()
  await expect(lodrat.getByRole('button', { name: 'Flera filer' })).toBeVisible()

  // Menyerna fälls ut från knappen även lodrätt.
  await lodrat.getByRole('button', { name: 'Städa' }).click()
  await expect(page.getByRole('menuitem', { name: 'Trimma blanksteg' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Sparningen till IndexedDB är fördröjd; utan att vänta in den kommer
  // filen inte tillbaka, och då finns inget fält att titta på.
  await vantaPaSparat(page, 'Anna Karlsson')
  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.locator('.redigeringsfalt--lodrat')).toBeVisible()

  await installningar(page).click()
  await page.getByRole('menuitemradio', { name: 'Verktygsfält: som rad' }).click()
  await expect(page.locator('.redigeringsfalt--rad')).toBeVisible()
})

test('temat går att sätta tillbaka till att följa systemet', async ({ page }) => {
  await page.goto('/')
  await installningar(page).click()
  await page.getByRole('menuitemradio', { name: 'Tema: mörkt' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // Sol/måne-knappen kan bara växla mellan ljust och mörkt; menyn kan mer.
  await installningar(page).click()
  await page.getByRole('menuitemradio', { name: 'Tema: följer systemet' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./)
})
