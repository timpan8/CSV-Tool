import { expect, test, type Page } from '@playwright/test'
import { laggI, ruta, satt } from './pivothjalp.js'

/*
 * Pivotens fältpanel.
 *
 * Fyra rutor man drar fält mellan. Dragningen provas en gång här — resten av
 * testerna går via chipmenyn, som är samma väg utan mus och den enda som går
 * att skriva ned utan att hävda pixlar.
 */

async function oppnaPivot(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await page.getByRole('button', { name: 'Pivot', exact: true }).click()
  await expect(page.locator('.pivot')).toBeVisible()
}

test('ett fält dras från listan till Rader och tabellen ändras', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader')
  await satt(page, 'Kolumner')
  await expect(page.locator('.pivot__tomt')).toBeVisible()

  const kalla = page
    .locator('.pivotpanel__falt .pivotruta__chip')
    .filter({ hasText: 'Status' })
    .first()
  await kalla.dragTo(ruta(page, 'Rader').locator('.pivotruta__botten'))

  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(1)
  // Statusens tre värden står som rader, och foten säger sexton.
  await expect(page.locator('.pivottab tbody tr')).toHaveCount(3)
  await expect(page.locator('.pivottab tfoot')).toContainText('16')
})

test('chipmenyn flyttar ett fält mellan rutor utan mus', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')
  await satt(page, 'Kolumner')

  await ruta(page, 'Rader')
    .locator('.pivotruta__chip')
    .first()
    .getByRole('button', { name: /Åtgärder för/ })
    .click()
  await page.locator('.meny__post', { hasText: 'Flytta till Kolumner' }).click()

  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(0)
  await expect(ruta(page, 'Kolumner').locator('.pivotruta__chip')).toHaveCount(1)
  // Statusen står nu i sidled: tre spalter plus Totalt.
  await expect(page.locator('.pivottab thead th')).toHaveCount(5)
})

test('två fält i Kolumner ger en rubrik i två våningar', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Namn')
  await satt(page, 'Kolumner', 'Status', 'Ort')

  const vaningar = page.locator('.pivottab thead tr')
  await expect(vaningar).toHaveCount(2)
  // Yttersta våningen slår ihop de löv som delar status: färre celler där än
  // i den innersta, som har en cell per kombination.
  const yttre = await vaningar.nth(0).locator('.pivottab__kolrubrik').count()
  const inre = await vaningar.nth(1).locator('.pivottab__kolrubrik').count()
  expect(yttre).toBeLessThan(inre)
  await expect(vaningar.nth(0)).toContainText('Aktiv')
})

test('ett filterfält med ett värde ikryssat minskar underlaget', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Ort')
  await satt(page, 'Kolumner')
  await expect(page.locator('.pivottab tfoot')).toContainText('16')

  await laggI(page, 'Filter', 'Status')
  const chip = ruta(page, 'Filter').locator('.pivotruta__chip').first()
  // Utan valda värden gäller alla — filtret ligger där utan att göra något.
  await expect(chip).toContainText('alla')
  await expect(page.locator('.pivottab tfoot')).toContainText('16')

  await chip.locator('.pivotruta__namn').click()
  await page.locator('.vardelista__post', { hasText: 'Aktiv' }).first().click()
  await expect(page.locator('.pivottab tfoot')).toContainText('10')
})

test('de tre radlayouterna ritar samma tal på tre sätt', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status', 'Ort')
  await satt(page, 'Kolumner')

  // Indragen: ett radrubrikfält per rad.
  await expect(page.locator('.pivottab tbody tr').first().locator('th')).toHaveCount(1)

  await page.getByRole('radio', { name: 'Egna spalter', exact: true }).click()
  await expect(page.locator('.pivottab tbody tr').first().locator('th')).toHaveCount(2)

  await page.getByRole('radio', { name: 'Block', exact: true }).click()
  // Ett block per statusvärde, sida vid sida.
  await expect(page.locator('.pivottab__block')).toHaveCount(3)
  await expect(page.locator('.pivottab__blockrubrik').first()).toContainText('Aktiv')
})

test('Block går inte att välja med ett enda fält i Rader', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')

  const block = page.getByRole('radio', { name: 'Block', exact: true })
  await expect(block).toBeDisabled()
  await expect(block).toHaveAttribute('title', /minst två fält/)
})

test('panelen går att fälla in och tabellen får hela fönstret', async ({ page }) => {
  await oppnaPivot(page)
  await expect(page.locator('.pivotpanel')).toBeVisible()

  await page.locator('.pivotpanel').getByRole('button', { name: 'Dölj fältpanelen' }).click()
  await expect(page.locator('.pivotpanel')).toHaveCount(0)

  await page.locator('.pivot__vaxlar').getByRole('button', { name: 'Fält' }).click()
  await expect(page.locator('.pivotpanel')).toBeVisible()
})

test('panelen ändrar aldrig filen', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status', 'Ort')
  await laggI(page, 'Filter', 'Status')

  await page.keyboard.press('Escape')
  await expect(page.locator('.rutnat')).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})
