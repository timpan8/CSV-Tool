import { expect, test, type Page } from '@playwright/test'

/** Öppnar båda exempelfilerna som två flikar. */
async function oppnaParet(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  // Orderfliken blir aktiv sist; gå tillbaka till kundfilen.
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const oppnaDialogen = async (page: Page) => {
  await page.getByRole('button', { name: 'Slå ihop…' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('säger till när det bara finns en fil öppen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await oppnaDialogen(page)

  await expect(page.getByRole('dialog')).toContainText('bara en fil öppen')
  await expect(page.getByRole('button', { name: 'Slå ihop', exact: true })).toHaveCount(0)
})

test('föreslår kolumnpar utifrån rubrikerna och räknar träffarna', async ({ page }) => {
  await oppnaParet(page)
  await oppnaDialogen(page)

  // Namn ↔ Name är inte samma ord, men samma sak — förslaget ska hitta det.
  const par = page.locator('.regel').first()
  await expect(par.locator('select').first()).toHaveValue(
    await par.locator('select').first().inputValue(),
  )
  await expect(page.getByRole('dialog')).toContainText('Föreslaget utifrån kolumnernas namn')

  // Sju kundrader har en order; två order tillhör okända personer.
  const siffror = page.locator('.inventering')
  await expect(siffror).toContainText('hittar en träff')
  await expect(siffror).toContainText('blir över')
})

test('räknar kardinalitet och tomma nycklar före körningen', async ({ page }) => {
  await oppnaParet(page)
  await oppnaDialogen(page)

  const dialog = page.getByRole('dialog')
  // Anna Karlsson finns två gånger i kundfilen och Erik har två order.
  await expect(dialog).toContainText('används av flera')
  await expect(dialog).toContainText('matchar mer än en rad')
  // ORD-1011 saknar namn och kan aldrig matcha.
  await expect(dialog).toContainText('har tom nyckel och kan aldrig matcha')

  // Valet för flerträff dyker upp bara när det faktiskt finns flerträffar.
  await expect(page.getByRole('radio', { name: 'En rad per träff' })).toBeVisible()
})

test('slår ihop till en ny flik där omatchade rader finns kvar tomma', async ({ page }) => {
  await oppnaParet(page)
  await oppnaDialogen(page)
  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()

  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  // Kundfilens kolumner först, orderkolumnerna efter.
  // Radnummerrutan är ingen kolumnrubrik, så den första är Kundnr.
  const rubriker = page.getByRole('columnheader')
  await expect(rubriker.nth(0)).toContainText('Kundnr')
  await expect(page.getByRole('columnheader', { name: /Summa/ })).toBeVisible()

  // Anna fick sin ordersumma. Hon står två gånger i kundfilen, så samma
  // order hamnar på båda raderna — det är just det "används av flera" räknar.
  await expect(page.getByRole('gridcell', { name: '2 400,00', exact: true })).toHaveCount(2)
  await expect(page.getByRole('gridcell', { name: 'ORD-1001', exact: true })).toHaveCount(2)

  // Carl-Johan har ingen order och står kvar med tomma orderceller.
  await expect(page.getByRole('gridcell', { name: 'Carl-Johan Nilsson', exact: true })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'ORD-1008', exact: true })).toHaveCount(0)
})

test('en rad per träff gör filen längre i stället för att tappa order', async ({ page }) => {
  await oppnaParet(page)
  await oppnaDialogen(page)
  await page.getByRole('radio', { name: 'En rad per träff' }).click()
  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()

  // Erik Öberg har två order, så resultatet får en rad mer än kundfilen.
  await expect(page.locator('.statusrad')).toContainText('17 rader')
  await expect(page.getByRole('gridcell', { name: 'Erik Öberg', exact: true })).toHaveCount(2)
})

test('matchning på e-post ger fler träffar än på namn', async ({ page }) => {
  await oppnaParet(page)
  await oppnaDialogen(page)

  const par = page.locator('.regel').first()
  await par.locator('select').nth(0).selectOption({ label: 'E-post' })
  await par.locator('select').nth(1).selectOption({ label: 'mail' })

  // E-postadresserna är skrivna likadant i båda filerna, så alla tio order
  // med adress hittar sin kund.
  await expect(page.locator('.inventering')).toContainText('hittar en träff')
  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()
  await expect(page.locator('.flik')).toHaveCount(3)
})

test('varnar när nästan inget matchar', async ({ page }) => {
  await oppnaParet(page)
  await oppnaDialogen(page)

  // Kundnummer mot ordernummer hör inte ihop alls.
  const par = page.locator('.regel').first()
  await par.locator('select').nth(0).selectOption({ label: 'Kundnr' })
  await par.locator('select').nth(1).selectOption({ label: 'Order' })

  await expect(page.getByRole('button', { name: 'Slå ihop', exact: true })).toBeDisabled()
})
