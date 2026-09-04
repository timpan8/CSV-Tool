import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** En av de två knapparna i det segmenterade språkvalet i hörnet. */
const sprakval = (page: Page, kod: 'SV' | 'EN') =>
  page.getByRole('radio', { name: kod, exact: true })

test('växlar gränssnittet till engelska och tillbaka', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()
  // Väljaren visar båda språken och markerar det aktiva.
  await expect(sprakval(page, 'SV')).toHaveAttribute('aria-checked', 'true')
  await expect(sprakval(page, 'EN')).toHaveAttribute('aria-checked', 'false')

  await sprakval(page, 'EN').click()
  await expect(page.getByText('Drop your files here')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose file…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open example file' })).toBeVisible()
  await expect(sprakval(page, 'EN')).toHaveAttribute('aria-checked', 'true')
  // Och dokumentets språk följer med, för skärmläsare och stavningskontroll.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  // Klick på det redan valda gör ingenting.
  await sprakval(page, 'EN').click()
  await expect(page.getByText('Drop your files here')).toBeVisible()

  await sprakval(page, 'SV').click()
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv')
})

test('valet överlever en omladdning', async ({ page }) => {
  await page.goto('/')
  await sprakval(page, 'EN').click()
  await expect(page.getByText('Drop your files here')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Drop your files here')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('verktygsraden, statusraden och menyerna följer med', async ({ page }) => {
  await oppnaExempel(page)
  await sprakval(page, 'EN').click()

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
  await expect(page.getByLabel('Search commands')).toBeFocused()
  await expect(page.locator('.palett__post').first()).toContainText('Open file…')
})

test('en notis och en ångring talar engelska', async ({ page }) => {
  await oppnaExempel(page)
  await sprakval(page, 'EN').click()

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
  await sprakval(page, 'EN').click()

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

test('ett städverktyg talar engelska', async ({ page }) => {
  await oppnaExempel(page)
  await sprakval(page, 'EN').click()

  await page.getByRole('button', { name: 'Menu for the column Registrerad' }).click()
  const post = page.getByRole('menuitem', { name: 'Dates' })
  if ((await post.count()) === 0) {
    await page.getByRole('menuitem', { name: 'More tools' }).hover()
  }
  await page.getByRole('menuitem', { name: 'Dates' }).first().click()
  const panel = page.locator('.verktyg')
  await expect(panel).toBeVisible()

  // Panelens egen ram.
  // Panelens rubrik är `Datum` → `Date`; menyposten är `Datum…` → `Dates…`.
  await expect(panel.getByRole('heading', { name: 'Date', exact: true })).toBeVisible()
  await expect(panel).toContainText('What the column contains')
  await expect(panel).toContainText('Rewrite as')
  await expect(panel).toContainText('What happens')

  /*
   * Formatvalen kommer ur `core/ops/dates.ts` och ritas av den delade
   * `Val`-komponenten. Att de står på engelska är beviset för att hävstången
   * i Del 1 når hela vägen ut till kärnans tabeller.
   */
  await expect(panel.getByRole('radio', { name: 'YYYY-MM-DD', exact: true })).toBeVisible()
  await expect(panel.getByRole('radio', { name: 'All rows' })).toBeVisible()

  // Och filterknapparna, som `Resultat` äger.
  await expect(panel.getByRole('radio', { name: 'Only changed' })).toBeVisible()
})

test('slå ihop-vyns val kommer ur kärnans tabeller', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await sprakval(page, 'EN').click()

  await page.keyboard.press('Control+k')
  await page.getByLabel('Search commands').fill('Merge with another')
  await page.keyboard.press('Enter')
  const vy = page.locator('.slaihop')
  await expect(vy).toBeVisible()

  await expect(vy.getByRole('heading', { name: 'Merge files' })).toBeVisible()
  await expect(vy).toContainText('Which rows come along')
  // `OMFATTNING` ur `core/ops/match.ts`.
  await expect(vy.getByRole('radio', { name: 'Alla rader ur båda filerna' })).toHaveCount(0)
  await expect(vy.getByRole('radio', { name: 'All rows from both files' })).toBeVisible()
})

test('räkneorden i en notis följer språket', async ({ page }) => {
  /*
   * Etapp 23 översatte notisens mall men inte räkneordet i den, så en engelsk
   * notis sa ”Removed 3 rader.” Det här testet vaktar lagningen.
   */
  await oppnaExempel(page)
  await sprakval(page, 'EN').click()

  await page.locator('.rutnat__radnr--valjbar').first().click()
  await page.locator('.rutnat__radnr--valjbar').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete the selected rows' }).click()

  const notis = page.locator('.toast').last()
  await expect(notis).toContainText('Removed 1 row.')
  // Och inte ”Removed 1 rad.”, som var läget efter etapp 23.
  await expect(notis).not.toContainText('rad.')
})
