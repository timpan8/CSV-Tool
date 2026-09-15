import { expect, test, type Page } from '@playwright/test'
import { vantaPaSparat } from './lagringshjalp.js'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

/** Öppnar undermenyn `rubrik` i den öppna menyn och väljer `val`. */
async function valjIUndermeny(page: Page, rubrik: string | RegExp, val: string) {
  const meny = page.locator('.meny').first()
  await meny.getByRole('menuitem', { name: rubrik, exact: typeof rubrik === 'string' }).hover()
  // Kolumnfärgens poster är radioknappar (de bär det nuvarande valet), de
  // andra vanliga poster — så texten, inte rollen, pekar ut valet.
  await page.locator('.meny--under .meny__post', { hasText: new RegExp(`^${val}$`) }).click()
}

test('cellmenyn färgar markeringen, och Ctrl+Z tar tillbaka det', async ({ page }) => {
  await oppnaExempel(page)
  const malmo = cell(page, 'Malmö').first()
  await malmo.click({ button: 'right' })
  await valjIUndermeny(page, 'Färg', 'Grön')

  await expect(malmo).toHaveClass(/rutnat__cell--farg-3/)
  await expect(page.locator('.toast').last()).toContainText('Färgade 1 cell')
  // Färgen är ett ångra-steg, och värdet är orört.
  await expect(page.getByText(/Ångra 1/)).toBeVisible()
  await expect(malmo).toHaveText('Malmö')

  await page.keyboard.press('Control+z')
  await expect(malmo).not.toHaveClass(/rutnat__cell--farg-/)
})

test('en flercellsmarkering färgas i ett steg', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Anna Karlsson').first().click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowRight')
  await cell(page, 'Anna Karlsson').first().click({ button: 'right' })
  await valjIUndermeny(page, 'Färg', 'Gul')
  await expect(page.locator('.rutnat__cell--farg-4')).toHaveCount(4)
  await expect(page.locator('.toast').last()).toContainText('Färgade 4 celler')
})

test('radmenyn färgar hela raden', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.rutnat__radnr--valjbar').first().click({ button: 'right' })
  await valjIUndermeny(page, 'Färga raden', 'Rosa')
  const rad = page.locator('.rutnat__rad').first()
  await expect(rad.locator('.rutnat__cell--farg-5')).toHaveCount(await rad.locator('.rutnat__cell').count())
})

test('kolumnmenyn sätter en kolumnfärg som en etikett på rubriken', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Ort' }).click()
  await valjIUndermeny(page, /^Kolumnfärg/, 'Blå')
  const rubrik = page.getByRole('columnheader', { name: /^Ort/ })
  await expect(rubrik).toHaveClass(/rubrik--farg/)
  // Etiketten är utseende, inte data: inget ångra-steg.
  await expect(page.getByRole('button', { name: /^Ångra/ })).toBeDisabled()
  // Menyn visar det nuvarande valet.
  await page.getByRole('button', { name: 'Meny för kolumnen Ort' }).click()
  await page.locator('.meny').first().getByRole('menuitem', { name: /^Kolumnfärg/ }).hover()
  await expect(page.locator('.meny--under').getByRole('menuitemradio', { name: 'Blå' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
})

test('färgerna finns kvar efter en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await cell(page, 'Malmö').first().click({ button: 'right' })
  await valjIUndermeny(page, 'Färg', 'Röd')
  // En kolumn till vänster i fönstret, så att undermenyn får plats åt höger.
  await page.getByRole('button', { name: 'Meny för kolumnen Namn' }).click()
  await valjIUndermeny(page, /^Kolumnfärg/, 'Lila')
  await vantaPaSparat(page, '"farg":6')

  await page.reload()
  await expect(cell(page, 'Malmö').first()).toHaveClass(/rutnat__cell--farg-7/)
  await expect(page.getByRole('columnheader', { name: /^Namn/ })).toHaveClass(/rubrik--farg/)
})

test('paletten färgar markeringen och CSV-exporten säger att färgen inte följer med', async ({
  page,
}) => {
  await oppnaExempel(page)
  await cell(page, 'Lund').first().click()
  await page.keyboard.press('Control+k')
  await page.getByLabel('Sök bland kommandon').fill('färga markeringen orange')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'Lund').first()).toHaveClass(/rutnat__cell--farg-2/)

  await page.getByRole('button', { name: 'Exportera' }).click()
  await expect(page.locator('.modal')).not.toContainText('Färgerna följer inte med')
  await page.getByRole('radio', { name: 'CSV, Excel-vänlig' }).click()
  await expect(page.locator('.modal')).toContainText('Färgerna följer inte med i en CSV')
})
