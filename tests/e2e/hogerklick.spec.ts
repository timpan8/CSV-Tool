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

test('Escape stänger menyn även när effekterna släpar efter', async ({ page }) => {
  /*
   * Samma fälla som paletten gick i: menyn kan stå på skärmen innan de
   * effekter som skulle ta emot Escape hunnit köras. Appen läser därför
   * menyns läge ur en ref som skrivs under renderingen. Bromsen läggs på
   * efter importen, så att testet handlar om Escape och inget annat.
   */
  await oppnaExempel(page)
  await page.evaluate(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 2000)) as typeof requestAnimationFrame
  })

  await cell(page, 'Malmö').first().click({ button: 'right' })
  await expect(page.locator('.meny').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.meny')).toHaveCount(0)
})

test('en meny nära nederkanten hamnar innanför fönstret', async ({ page }) => {
  /*
   * Menyns höjd räknades tidigare som ”antal poster gånger 30 pixlar”. Den
   * siffran slutade stämma när posterna fick sitt skäl på andra raden, och en
   * meny som växte med en post kunde då lägga sina sista val nedanför
   * fönsterkanten — synliga i DOM:en, omöjliga att klicka på. Menyn mäts
   * numera i stället för att gissas.
   */
  await oppnaExempel(page)
  const rader = page.locator('.rutnat__rad')
  await rader.nth((await rader.count()) - 1).locator('.rutnat__cell').nth(5).click({ button: 'right' })

  const meny = page.locator('.meny').first()
  const lada = (await meny.boundingBox())!
  const hojd = page.viewportSize()!.height
  expect(lada.y).toBeGreaterThanOrEqual(0)
  expect(lada.y + lada.height).toBeLessThanOrEqual(hojd)

  // Och den sista posten ligger innanför kanten, inte bara menyns ram.
  const sista = meny.getByRole('menuitem').last()
  const sistaLada = (await sista.boundingBox())!
  expect(sistaLada.y + sistaLada.height).toBeLessThanOrEqual(hojd)
})

test('en undermeny som når nedanför fönsterkanten lyfts upp', async ({ page }) => {
  // Undermenyn börjar vid sin post, så ligger posten långt ned i en hög meny
  // hamnar undermenyns sista val utanför skärmen om ingen flyttar den.
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Belopp' }).click()
  await page.getByRole('menuitem', { name: 'Fler verktyg' }).hover()

  const under = page.locator('.meny--under')
  await expect(under).toBeVisible()
  const lada = (await under.boundingBox())!
  const hojd = page.viewportSize()!.height
  expect(lada.y).toBeGreaterThanOrEqual(0)
  expect(lada.y + lada.height).toBeLessThanOrEqual(hojd)

  await under.getByRole('menuitem', { name: 'Sök och ersätt…' }).click()
  await expect(page.locator('.verktyg')).toBeVisible()
})

test('en meny högre än fönstret går att rulla i i stället för att kapas', async ({ page }) => {
  // Taket sätts bara när menyn faktiskt inte får plats — annars skulle
  // undermenyerna klippas av rullningen utan att någon bett om det.
  await page.setViewportSize({ width: 1100, height: 420 })
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Ort' }).click()

  const meny = page.locator('.meny').first()
  await expect(meny).toHaveClass(/meny--rullar/)
  const lada = (await meny.boundingBox())!
  expect(lada.y).toBeGreaterThanOrEqual(0)
  expect(lada.y + lada.height).toBeLessThanOrEqual(420)

  const sista = meny.getByRole('menuitem', { name: 'Ta bort kolumnen' })
  await sista.scrollIntoViewIfNeeded()
  await sista.click()
  await expect(page.locator('.statusrad')).toContainText('7 kolumner')
})
