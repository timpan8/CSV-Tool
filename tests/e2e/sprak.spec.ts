import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const vaxla = (page: Page) => page.locator('.sprakval')

test('växlar gränssnittet till engelska och tillbaka', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()
  await expect(vaxla(page)).toHaveText('EN')

  await vaxla(page).click()
  await expect(page.getByText('Drop your files here')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose file…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open example file' })).toBeVisible()
  // Knappen säger vad nästa klick gör, inte var man är.
  await expect(vaxla(page)).toHaveText('SV')
  // Och dokumentets språk följer med, för skärmläsare och stavningskontroll.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await vaxla(page).click()
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv')
})

test('valet överlever en omladdning', async ({ page }) => {
  await page.goto('/')
  await vaxla(page).click()
  await expect(page.getByText('Drop your files here')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Drop your files here')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('verktygsraden, statusraden och menyerna följer med', async ({ page }) => {
  await oppnaExempel(page)
  await vaxla(page).click()

  // Verktygsraden.
  await expect(page.getByRole('button', { name: 'Sort', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Duplicates', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible()

  // Statusraden.
  await expect(page.locator('.statusrad')).toContainText('16 rows')
  await expect(page.locator('.statusrad')).toContainText('8 columns')
  await expect(page.locator('.statusrad')).toContainText('● All local')

  // Kolumnmenyn.
  await page.getByRole('button', { name: 'Menu for the column Ort' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rename…' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Move first' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Paletten.
  await page.keyboard.press('Control+k')
  await expect(page.getByLabel('Sök bland kommandon')).toBeFocused()
  await expect(page.locator('.palett__post').first()).toContainText('Open file…')
})

test('en notis och en ångring talar engelska', async ({ page }) => {
  await oppnaExempel(page)
  await vaxla(page).click()

  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().click()
  await page.keyboard.press('Delete')
  const notis = page.locator('.toast').last()
  await expect(notis).toContainText('Emptied')
  await expect(notis.getByRole('button', { name: 'Undo' })).toBeVisible()
})

test('svenska regler gäller för datat även på engelska', async ({ page }) => {
  /*
   * Språkvalet byter etiketter, aldrig beteende. Att sortera på engelska ska
   * ge exakt samma ordning som på svenska — å ä ö efter z — och talen ska
   * fortsätta stå med mellanslag och decimalkomma.
   */
  await oppnaExempel(page)
  await vaxla(page).click()

  await page.getByRole('button', { name: 'Sort by Ort' }).click()
  const orter = await page.evaluate(() =>
    [...document.querySelectorAll('.rutnat__rad')].map((r) =>
      (r.querySelectorAll('.rutnat__cell')[5]?.textContent ?? '').trim(),
    ),
  )
  expect(orter[0]).toBe('Boden')
  expect(orter.indexOf('Umeå')).toBeLessThan(orter.indexOf('Örebro'))
  // Och talen står kvar i svensk form: mellanslag som tusentalsavgränsare
  // och decimalkomma, oavsett vad etiketterna säger.
  const belopp = await page.evaluate(() =>
    [...document.querySelectorAll('.rutnat__rad')]
      .map((r) => (r.querySelectorAll('.rutnat__cell')[6]?.textContent ?? '').trim())
      .filter((v) => v !== ''),
  )
  expect(belopp.some((v) => /^\d[\d\u00a0 ]*,\d\d$/.test(v))).toBe(true)
})
