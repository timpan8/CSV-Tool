import { expect, test, type Page } from '@playwright/test'

/** Öppnar exempelparet och går in i kombineringsvyn. */
async function oppnaKombinera(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Kombinera…' }).click()
  await expect(page.locator('.kombinera')).toBeVisible()
}

/** En rad i aliaskartan. `data-mal` är radens kontrakt mot testerna. */
const rad = (page: Page, namn: string) => page.locator(`.aliasrad[data-mal="${namn}"]`)

test('kolumner som betyder samma sak hamnar på samma rad', async ({ page }) => {
  await oppnaKombinera(page)

  // Namn ↔ Name och E-post ↔ mail är inte samma ord men samma sak.
  await expect(rad(page, 'Namn')).toContainText('finns i 2 av 2')
  await expect(rad(page, 'E-post')).toContainText('finns i 2 av 2')
  // Ort finns bara i kundfilen.
  await expect(rad(page, 'Ort')).toContainText('finns i 1 av 2')

  // Rutnätets egna rader hör till en tabell man inte längre tittar på.
  await expect(page.locator('.statusrad')).toHaveCount(0)
})

test('kolumner som bara finns i vissa filer spärrar körningen tills de beslutats', async ({
  page,
}) => {
  await oppnaKombinera(page)

  const kombinera = page.getByRole('button', { name: 'Kombinera', exact: true })
  await expect(kombinera).toBeDisabled()
  await expect(page.locator('.kombinera__fot')).toContainText('behöver ett beslut')
  await expect(page.locator('.aliasrad--obeslutad').first()).toBeVisible()

  // Ta med allt som är obeslutat.
  const taMed = page.getByRole('button', { name: 'Ta med' })
  while ((await taMed.count()) > 0) await taMed.first().click()

  await expect(page.locator('.aliasrad--obeslutad')).toHaveCount(0)
  await expect(kombinera).toBeEnabled()
})

test('staplar filerna och visar vilken fil varje rad kom från', async ({ page }) => {
  await oppnaKombinera(page)
  const taMed = page.getByRole('button', { name: 'Ta med' })
  while ((await taMed.count()) > 0) await taMed.first().click()

  // Förhandsvisningen bygger på riktigt, ur båda filerna.
  await expect(page.locator('.fortab')).toContainText('Anna Karlsson')

  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  // 16 kundrader + 14 orderrader.
  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(page.locator('.statusrad')).toContainText('30 rader')
  await expect(page.locator('.rubrik[title="Källa"]')).toBeVisible()
  await expect(
    page.getByRole('gridcell', { name: 'exempel-kunder.csv', exact: true }).first(),
  ).toBeVisible()
})

test('en kolumn som hoppas över finns inte i resultatet', async ({ page }) => {
  await oppnaKombinera(page)

  await rad(page, 'Summa').getByRole('button', { name: 'Hoppa över' }).click()
  await expect(rad(page, 'Summa')).toHaveClass(/aliasrad--av/)

  const taMed = page.getByRole('button', { name: 'Ta med' })
  while ((await taMed.count()) > 0) await taMed.first().click()
  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  // Rubrikens tillgängliga namn bär även sorterings- och menyknappen, så
  // titeln är den exakta kroken.
  await expect(page.locator('.rubrik[title="Summa"]')).toHaveCount(0)
  await expect(page.locator('.rubrik[title="Ort"]')).toBeVisible()
})

test('en ändrad koppling flyttar värdena till en annan spalt', async ({ page }) => {
  await oppnaKombinera(page)

  // Koppla loss orderfilens namnkolumn: då blir Namn tom för orderraderna.
  await rad(page, 'Namn')
    .getByLabel('Namn ur exempel-order.csv')
    .selectOption({ label: '— tomt —' })
  await expect(rad(page, 'Namn')).toContainText('finns i 1 av 2')

  const taMed = page.getByRole('button', { name: 'Ta med' })
  while ((await taMed.count()) > 0) await taMed.first().click()
  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  await expect(page.locator('.statusrad')).toContainText('30 rader')
  await expect(page.getByRole('gridcell', { name: 'Petra Sund', exact: true })).toHaveCount(0)
})

/** Öppnar exempelmallen inifrån kombineringsvyn och väljer den som målform. */
async function valjExempelmall(page: Page) {
  await page.getByRole('button', { name: 'Exempelmall' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.getByLabel('Målform')).toHaveValue(/.+/)
}

test('en mallfil bestämmer resultatets form', async ({ page }) => {
  await oppnaKombinera(page)
  await valjExempelmall(page)

  // Mallens rubriker, i mallens ordning, före de kolumner mallen inte har.
  const rader = page.locator('.aliasrad')
  await expect(rader.nth(0)).toHaveAttribute('data-mal', 'Namn')
  await expect(rader.nth(1)).toHaveAttribute('data-mal', 'E-post')
  await expect(rader.nth(2)).toHaveAttribute('data-mal', 'Ort')
  await expect(rader.nth(3)).toHaveAttribute('data-mal', 'Land')

  // Exempelraden är en ledtråd om vad kolumnen ska innehålla — inte data.
  await expect(rad(page, 'Namn')).toContainText('t.ex. Anna Karlsson')
  await expect(page.locator('.kombinera__kropp')).toContainText(
    'är exempel och tas inte med i resultatet',
  )

  // Land finns i mallen men i ingen fil, och det ska sägas före körningen.
  await expect(page.locator('.inventering')).toContainText('fylls inte av någon fil')
})

test('mallen får inte bli ett tyst filter', async ({ page }) => {
  await oppnaKombinera(page)
  await valjExempelmall(page)

  // Mallens egna kolumner behöver inga beslut — mallen är beslutet.
  await expect(rad(page, 'Ort')).not.toHaveClass(/aliasrad--obeslutad/)
  // Men kolumner som finns i filerna och inte i mallen kastas inte tyst.
  await expect(rad(page, 'Belopp')).toHaveClass(/aliasrad--obeslutad/)
  await expect(rad(page, 'Summa')).toHaveClass(/aliasrad--obeslutad/)
  await expect(page.getByRole('button', { name: 'Kombinera', exact: true })).toBeDisabled()
})

test('mallens form fylls med data ur båda filerna', async ({ page }) => {
  await oppnaKombinera(page)
  await valjExempelmall(page)

  const hoppaOver = page.getByRole('button', { name: 'Hoppa över' })
  while ((await hoppaOver.count()) > 0) await hoppaOver.first().click()
  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  // 16 kundrader + 14 orderrader. Mallens exempelrad är inte med.
  await expect(page.locator('.statusrad')).toContainText('30 rader')
  await expect(page.locator('.rubrik[title="Land"]')).toBeVisible()
  await expect(page.locator('.rubrik[title="Belopp"]')).toHaveCount(0)
  await expect(page.getByRole('gridcell', { name: 'Petra Sund', exact: true })).toBeVisible()
})

async function oppnaTvaFiler(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
}

test('mallvägen har en egen ingång i verktygsraden', async ({ page }) => {
  await oppnaTvaFiler(page)
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()

  // De tre sätten står under varandra med en rad som säger vad som händer.
  const meny = page.locator('.meny').first()
  await expect(meny).toContainText('sida vid sida')
  await expect(meny).toContainText('på varandra')
  await expect(meny).toContainText('bara rubriker')

  await meny.getByRole('menuitem', { name: 'Fyll en mall med data…' }).click()
  await expect(page.locator('.kombinera')).toBeVisible()
  // Målformen är det man kom för, så den tar fokus.
  await expect(page.getByLabel('Målform')).toBeFocused()
})

test('målformen står överst, före listan med filer', async ({ page }) => {
  await oppnaKombinera(page)

  const panel = page.locator('.kombinera .panel').first()
  const malform = await panel.getByLabel('Målform').boundingBox()
  const forstaFilen = await panel.locator('.kollista .kryss').first().boundingBox()
  expect(malform!.y).toBeLessThan(forstaFilen!.y)
})
