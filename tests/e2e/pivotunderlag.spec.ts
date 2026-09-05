import { expect, test } from '@playwright/test'
import { antalRader, laggI, oppnaPivot, ruta, satt } from './pivothjalp.js'

/*
 * Raderna bakom en cell.
 *
 * Det bärande påståendet i varje test är detsamma som i enhetstesterna, fast
 * genom gränssnittet: **antalet rader i rutan är talet som står i cellen.**
 * Ett drillverktyg som visade ett annat antal än det man klickade på vore
 * värre än inget alls.
 */

const underlag = (page: Parameters<typeof ruta>[0]) => page.locator('.pivotunderlag')
const radrader = (page: Parameters<typeof ruta>[0]) =>
  page.locator('.pivotunderlag .rutnat__rad')

test('klick på en radrubrik visar radens rader', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  await expect(underlag(page)).toHaveCount(0)

  const aktiv = page.locator('.pivottab tbody tr').filter({ hasText: 'Aktiv' }).first()
  await aktiv.getByRole('button', { name: /Visa de/ }).click()

  await expect(underlag(page)).toBeVisible()
  await expect(underlag(page).locator('.pivotunderlag__rubrik')).toContainText('Aktiv')
  // Tio aktiva i exempelfilen — samma tal som cellen visar.
  await expect(underlag(page).locator('.pivotunderlag__antal')).toContainText('10')
  await expect(radrader(page)).toHaveCount(10)
})

test('klick på en cell visar korsningen rad × kolumn', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Ort')
  await satt(page, 'Kolumner', 'Status')

  const malmo = page.locator('.pivottab tbody tr').filter({ hasText: 'Malmö' }).first()
  const cell = malmo.locator('td').first()
  await expect(cell).toHaveText('2')
  await cell.click()

  await expect(underlag(page).locator('.pivotunderlag__rubrik')).toContainText('Malmö × Aktiv')
  await expect(radrader(page)).toHaveCount(2)
  // Cellen man borrat i är markerad, så man ser var man är.
  await expect(cell).toHaveClass(/pivottab__tal--vald/)

  // Ett andra klick på samma cell stänger rutan igen.
  await cell.click()
  await expect(underlag(page)).toHaveCount(0)
})

test('Totalt-raden ger hela underlaget', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Ort')

  await page.locator('.pivottab tfoot').getByRole('button', { name: /Visa de/ }).click()
  await expect(radrader(page)).toHaveCount(16)
})

test('en delsummerad rad räknar rätt fast raderna inte ligger i följd', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status', 'Ort')
  await satt(page, 'Kolumner', 'Namn')

  // Delsummeraden Aktiv: dess rader ligger utspridda i bandet, en klunga per
  // ort. En funktion som skivade i stället för att filtrera hade svarat fel.
  const aktiv = page.locator('.pivottab tbody tr').filter({ hasText: 'Aktiv' }).first()
  await aktiv.getByRole('button', { name: /Visa de/ }).click()
  await expect(radrader(page)).toHaveCount(10)
})

test('ett filter i pivoten gäller också för raderna bakom', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Ort')

  await laggI(page, 'Filter', 'Status')
  await ruta(page, 'Filter').locator('.pivotruta__namn').first().click()
  await page.locator('.vardelista__post', { hasText: 'Aktiv' }).first().click()
  await expect(page.locator('.pivottab tfoot')).toContainText('10')

  await page.locator('.pivottab tfoot').getByRole('button', { name: /Visa de/ }).click()
  await expect(radrader(page)).toHaveCount(10)
})

test('gör flik av urvalet ger en flik med just de raderna, och källan är orörd', async ({
  page,
}) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  const aktiv = page.locator('.pivottab tbody tr').filter({ hasText: 'Aktiv' }).first()
  await aktiv.getByRole('button', { name: /Visa de/ }).click()
  await page.getByRole('button', { name: 'Gör flik av urvalet' }).click()

  // Fliken har radernas antal och filens kolumner — inte pivotens.
  await expect(page.locator('.rutnat')).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('10 rader')
  await expect(page.locator('.rubrik[title="Ort"]')).toBeVisible()
  await expect(page.locator('.rubrik[title="Belopp"]')).toBeVisible()

  // Källfliken är orörd.
  await page.getByRole('button', { name: 'exempel-kunder.csv', exact: true }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})

test('rutan följer med när man klickar vidare, och stängs med krysset', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  const rad = (namn: string) =>
    page.locator('.pivottab tbody tr').filter({ hasText: namn }).first()

  await rad('Aktiv').getByRole('button', { name: /Visa de/ }).click()
  await expect(radrader(page)).toHaveCount(10)
  await rad('Avslutad').getByRole('button', { name: /Visa de/ }).click()
  await expect(radrader(page)).toHaveCount(3)

  await underlag(page).getByRole('button', { name: 'Dölj raderna bakom' }).click()
  await expect(underlag(page)).toHaveCount(0)
})

test('ett byte av fält stänger rutan i stället för att peka på fel rader', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')
  await page.locator('.pivottab tbody tr').first().getByRole('button', { name: /Visa de/ }).click()
  await expect(underlag(page)).toBeVisible()

  // Radindex betyder något annat i en ny tabell.
  await satt(page, 'Rader', 'Ort')
  await expect(underlag(page)).toHaveCount(0)
})

test('rutan ändrar aldrig filen', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')
  await page.locator('.pivottab tbody tr').first().getByRole('button', { name: /Visa de/ }).click()

  // Dubbelklick i rutnätet startar redigering i rutnätet på fliken — här ska
  // det inte göra något alls.
  await radrader(page).first().locator('.rutnat__cell').nth(1).dblclick()
  await expect(page.locator('.pivotunderlag .rutnat__redigering')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('.rutnat')).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})
