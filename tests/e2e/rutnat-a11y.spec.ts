import { expect, test, type Page } from '@playwright/test'

/**
 * Vakten över vad rutnätet påstår för en skärmläsare.
 *
 * Ett virtualiserat rutnät ljuger lätt utan att någon märker det: `role=grid`
 * med `aria-rowcount` säger att tabellen har en halv miljon rader, medan DOM
 * bär fyrtio. Utan `aria-rowindex` på varje rad läser uppläsningen ut radens
 * plats bland de fyrtio — alltså fel svar på den enda fråga attributet finns
 * för att besvara.
 *
 * Det går inte att se på skärmen, och därför står det här.
 */

/** En fil med fler rader än som får plats, så att virtualiseringen slår till. */
function storFil(rader: number): string {
  const ut = ['Nr;Namn;Ort']
  for (let i = 1; i <= rader; i++) ut.push(`${i};Person ${i};Ort ${i % 7}`)
  return ut.join('\r\n')
}

async function oppna(page: Page, innehall: string, namn = 'stor.csv') {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles({
    name: namn,
    mimeType: 'text/csv',
    buffer: Buffer.from(innehall, 'utf8'),
  })
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.rutnat')).toBeVisible()
}

const rutnat = (page: Page) => page.getByRole('grid')

test('räknar rader och kolumner efter filen, inte efter det som är ritat', async ({ page }) => {
  await oppna(page, storFil(500))

  // 500 rader plus rubrikraden, tre kolumner plus radnummerkolumnen.
  await expect(rutnat(page)).toHaveAttribute('aria-rowcount', '501')
  await expect(rutnat(page)).toHaveAttribute('aria-colcount', '4')

  // Men bara en bråkdel är ritad — det är hela poängen med kontraktet ovan.
  const ritade = await page.locator('.rutnat__rad').count()
  expect(ritade).toBeGreaterThan(0)
  expect(ritade).toBeLessThan(200)
})

test('varje rad bär sin verkliga plats i filen', async ({ page }) => {
  await oppna(page, storFil(500))

  // Rubrikraden är rad 1, så filens första datarad är rad 2.
  await expect(page.locator('.rutnat__rubrikrad')).toHaveAttribute('aria-rowindex', '1')
  const forsta = page.locator('.rutnat__rad').first()
  await expect(forsta).toHaveAttribute('aria-rowindex', '2')

  // Rulla till slutet. Raden längst ned är fortfarande bara en av fyrtio i
  // DOM, men den ska säga att den är nummer 501.
  await page.locator('.rutnat').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const sista = page.locator('.rutnat__rad').last()
  await expect(sista).toHaveAttribute('aria-rowindex', '501')
  await expect(sista.getByRole('gridcell').first()).toHaveText('500')
})

test('varje cell bär sitt kolumnnummer, radnummerrutan inräknad', async ({ page }) => {
  await oppna(page, storFil(20))

  const rubriker = page.locator('.rutnat__rubrikrad > *')
  // Radnummerrutan är kolumn 1 och är en rubrik som de andra — utan roll vore
  // den ett barn utan cellroll i en rad, vilket inte är ett giltigt rutnät.
  await expect(rubriker.nth(0)).toHaveAttribute('aria-colindex', '1')
  await expect(rubriker.nth(0)).toHaveAttribute('role', 'columnheader')
  await expect(rubriker.nth(1)).toHaveAttribute('aria-colindex', '2')
  await expect(rubriker.nth(3)).toHaveAttribute('aria-colindex', '4')

  const forstaRaden = page.locator('.rutnat__rad').first().locator('> *')
  await expect(forstaRaden.nth(0)).toHaveAttribute('role', 'rowheader')
  await expect(forstaRaden.nth(0)).toHaveAttribute('aria-colindex', '1')
  await expect(forstaRaden.nth(1)).toHaveAttribute('aria-colindex', '2')
  await expect(forstaRaden.nth(3)).toHaveAttribute('aria-colindex', '4')
})

test('rutnätet går att nå med tangentbordet och pekar ut den aktiva cellen', async ({ page }) => {
  await oppna(page, storFil(20))

  await expect(rutnat(page)).toHaveAttribute('tabindex', '0')
  await expect(rutnat(page)).toHaveAttribute('aria-label', /stor\.csv/)

  // Ett klick i en cell lämnar fokus på rutnätet självt. Markeringen flyttas
  // med `aria-activedescendant`, inte genom att flytta DOM-fokus — cellen
  // under markören kan när som helst virtualiseras bort.
  await page.getByRole('gridcell', { name: 'Person 3', exact: true }).click()
  await expect(rutnat(page)).toBeFocused()

  const id = await rutnat(page).getAttribute('aria-activedescendant')
  expect(id).toBeTruthy()
  await expect(page.locator(`#${id}`)).toHaveText('Person 3')

  // Och den följer med när markeringen flyttas med piltangenterna.
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(`#${id}`)).toHaveText('Person 4')
})

test('släpper pekaren på den aktiva cellen när den rullats ur bild', async ({ page }) => {
  await oppna(page, storFil(500))

  await page.getByRole('gridcell', { name: 'Person 1', exact: true }).click()
  await expect(rutnat(page)).toHaveAttribute('aria-activedescendant', /./)

  // Ett attribut som pekar på ett id som inte finns är sämre än inget
  // attribut: uppläsningen tystnar i stället för att säga vad som gäller.
  await page.locator('.rutnat').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(rutnat(page)).not.toHaveAttribute('aria-activedescendant', /./)
})
