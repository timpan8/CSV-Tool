import { expect, test } from '@playwright/test'
import { antalRader, laggI, oppnaPivot, ruta, satt } from './pivothjalp.js'

/*
 * Pivotens fältpanel.
 *
 * Fyra rutor man drar fält mellan. Dragningarna provas här — från listan, mellan
 * rutor, inom en ruta och tillbaka till listan — och resten går via chipmenyn,
 * som är samma väg utan mus.
 */

const listchip = (page: Parameters<typeof ruta>[0], namn: string) =>
  page
    .locator('.pivotpanel__falt .pivotruta__chip')
    .filter({ has: page.locator('.pivotruta__namn', { hasText: new RegExp(`^${namn}$`) }) })
    .first()

test('pivoten öppnas med fyra tomma rutor och säger vad man ska göra', async ({ page }) => {
  await oppnaPivot(page)
  for (const namn of ['Filter', 'Kolumner', 'Rader', 'Värden']) {
    await expect(ruta(page, namn).locator('.pivotruta__chip')).toHaveCount(0)
  }
  await expect(page.locator('.pivot__tomt')).toContainText('Dra ett fält')
  await expect(page.locator('.pivottab')).toHaveCount(0)
})

test('ett fält dras från listan till Rader och tabellen ändras', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)

  await listchip(page, 'Status').dragTo(ruta(page, 'Rader'))

  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(1)
  // Statusens tre värden står som rader, och foten säger sexton.
  await expect(page.locator('.pivottab tbody tr')).toHaveCount(3)
  await expect(page.locator('.pivottab tfoot')).toContainText('16')
})

test('ett chip dras från Rader till Kolumner', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  await ruta(page, 'Rader')
    .locator('.pivotruta__chip')
    .first()
    .dragTo(ruta(page, 'Kolumner').getByRole('heading'))

  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(0)
  await expect(ruta(page, 'Kolumner').locator('.pivotruta__chip')).toHaveCount(1)
  // Statusen står nu i sidled: tre spalter plus Totalt.
  await expect(page.locator('.pivottab thead th')).toHaveCount(5)
})

test('ett chip dras nedåt inom sin ruta och ordningen byts', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status', 'Ort')

  const chips = ruta(page, 'Rader').locator('.pivotruta__chip')
  await expect(chips.nth(0)).toContainText('Status')
  // Släpp i den nedre halvan av det sista chipet: efter det.
  const mal = await chips.nth(1).boundingBox()
  await chips.nth(0).dragTo(chips.nth(1), {
    targetPosition: { x: 20, y: mal!.height - 3 },
  })

  await expect(chips.nth(0)).toContainText('Ort')
  await expect(chips.nth(1)).toContainText('Status')
  // Tabellens översta nivå är nu orten.
  await expect(page.locator('.pivottab tbody tr').first()).toContainText('Boden')
})

test('ett chip som dras tillbaka till listan lämnar pivoten', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  await ruta(page, 'Rader').locator('.pivotruta__chip').first().dragTo(page.locator('.pivotpanel__falt'))
  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(0)
})

test('chipmenyn flyttar ett fält mellan rutor utan mus, och säger var det redan ligger', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  const meny = ruta(page, 'Rader').locator('.pivotruta__chip').first().getByRole('button', { name: /Åtgärder för/ })
  await meny.click()
  // Den egna rutan är markerad och går inte att välja.
  const har = page.locator('.meny__post', { hasText: 'Flytta till Rader' })
  await expect(har).toHaveAttribute('aria-disabled', 'true')
  await expect(har).toHaveAttribute('title', 'Ligger redan här.')
  await page.locator('.meny__post', { hasText: 'Flytta till Kolumner' }).click()

  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(0)
  await expect(ruta(page, 'Kolumner').locator('.pivotruta__chip')).toHaveCount(1)
  await expect(page.locator('.pivottab thead th')).toHaveCount(5)
  // Fokus kom tillbaka till chipets meny-knapp när menyn stängdes.
  await expect(ruta(page, 'Kolumner').getByRole('button', { name: /Åtgärder för/ })).toBeFocused()
})

test('samma fält kan inte ligga i både Rader och Kolumner — det flyttar', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')
  await laggI(page, 'Kolumner', 'Status')
  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(0)
  await expect(ruta(page, 'Kolumner').locator('.pivotruta__chip')).toHaveCount(1)

  // Lägg i Kolumner igen: menyposten säger att det redan ligger där.
  await listchip(page, 'Status').getByRole('button', { name: 'Lägg till Status' }).click()
  const post = page.locator('.meny__post', { hasText: 'Lägg i Kolumner' })
  await expect(post).toHaveAttribute('aria-disabled', 'true')
  await expect(post).toHaveAttribute('title', 'Fältet ligger redan i Kolumner.')
  await page.keyboard.press('Escape')
})

test('det sista mätvärdet går att ta bort utan att vyn går sönder — och att få tillbaka', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')
  await antalRader(page)
  await expect(page.locator('.pivottab tfoot')).toContainText('16')

  await satt(page, 'Värden')
  await expect(page.locator('.pivot')).toBeVisible()
  // Raderna står kvar med sina antal, cellerna är tomma, och foten säger varför.
  await expect(page.locator('.pivottab tbody tr')).toHaveCount(3)
  await expect(page.locator('.pivot__notiser')).toContainText('Inget mätvärde än')

  await antalRader(page)
  await expect(page.locator('.pivottab tfoot')).toContainText('16')
})

test('två fält i Kolumner ger en rubrik i två våningar', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Namn')
  await satt(page, 'Kolumner', 'Status', 'Ort')

  const vaningar = page.locator('.pivottab thead tr')
  await expect(vaningar).toHaveCount(2)
  const yttre = await vaningar.nth(0).locator('.pivottab__kolrubrik').count()
  const inre = await vaningar.nth(1).locator('.pivottab__kolrubrik').count()
  expect(yttre).toBeLessThan(inre)
  await expect(vaningar.nth(0)).toContainText('Aktiv')
})

test('ett filterfält med ett värde ikryssat minskar underlaget', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Ort')
  await expect(page.locator('.pivottab tfoot')).toContainText('16')

  await laggI(page, 'Filter', 'Status')
  const chip = ruta(page, 'Filter').locator('.pivotruta__chip').first()
  await expect(chip).toContainText('alla')
  await expect(page.locator('.pivottab tfoot')).toContainText('16')

  await chip.locator('.pivotruta__namn').click()
  await page.locator('.vardelista__post', { hasText: 'Aktiv' }).first().click()
  await expect(page.locator('.pivottab tfoot')).toContainText('10')
})

test('de tre radlayouterna ritar samma tal på tre sätt', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status', 'Ort')

  await expect(page.locator('.pivottab tbody tr').first().locator('th')).toHaveCount(1)

  await page.getByRole('radio', { name: 'Egna spalter', exact: true }).click()
  await expect(page.locator('.pivottab tbody tr').first().locator('th')).toHaveCount(2)

  await page.getByRole('radio', { name: 'Block', exact: true }).click()
  await expect(page.locator('.pivottab__block')).toHaveCount(3)
  await expect(page.locator('.pivottab__blockrubrik').first()).toContainText('Aktiv')

  // Tar man bort ett radfält faller valet tillbaka: tabellen och valet är ense.
  await satt(page, 'Rader', 'Status')
  await expect(page.getByRole('radio', { name: 'Indragen', exact: true })).toHaveAttribute('aria-checked', 'true')
})

test('Block går inte att välja med ett enda fält i Rader, och skälet går att läsa', async ({ page }) => {
  await oppnaPivot(page)
  await satt(page, 'Rader', 'Status')

  const block = page.getByRole('radio', { name: /Block/ })
  await expect(block).toHaveAttribute('aria-disabled', 'true')
  await expect(block).toHaveAttribute('title', /minst två fält/)
})

test('panelen går att fälla in, och det tomma läget visar vägen tillbaka', async ({ page }) => {
  await oppnaPivot(page)
  await expect(page.locator('.pivotpanel')).toBeVisible()

  await page.locator('.pivotpanel').getByRole('button', { name: 'Dölj fältpanelen' }).click()
  await expect(page.locator('.pivotpanel')).toHaveCount(0)
  await page.locator('.pivot__tomt').getByRole('button', { name: 'Visa fältpanelen' }).click()
  await expect(page.locator('.pivotpanel')).toBeVisible()
})

test('planen finns kvar när vyn stängts och öppnats igen', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status')

  await page.keyboard.press('Escape')
  await expect(page.locator('.rutnat')).toBeVisible()
  await page.getByRole('button', { name: 'Pivot', exact: true }).click()
  await expect(ruta(page, 'Rader').locator('.pivotruta__chip')).toHaveCount(1)
  await expect(page.locator('.pivottab tfoot')).toContainText('16')
})

test('panelen ändrar aldrig filen', async ({ page }) => {
  await oppnaPivot(page)
  await antalRader(page)
  await satt(page, 'Rader', 'Status', 'Ort')
  await laggI(page, 'Filter', 'Status')

  await page.keyboard.press('Escape')
  await expect(page.locator('.rutnat')).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})
