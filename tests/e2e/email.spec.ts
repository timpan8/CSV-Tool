import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/**
 * Öppnar ett verktyg ur kolumnmenyn.
 *
 * Verktygen sorteras efter vad kolumnen innehåller, och de som inte passar
 * ligger under *Fler verktyg*. Hjälparen tar båda vägarna, så att testet
 * handlar om verktyget och inte om var i menyn det råkar hamna.
 */
async function oppnaUrKolumnmenyn(page: Page, kolumn: string, post: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  // Ett föreslaget verktyg står med sitt skäl efter etiketten, så namnet
  // matchas som delsträng och inte exakt.
  const direkt = page.getByRole('menuitem', { name: post })
  if ((await direkt.count()) === 0) {
    await page.getByRole('menuitem', { name: 'Fler verktyg' }).hover()
  }
  await page.getByRole('menuitem', { name: post }).first().click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

async function oppnaEpostverktyget(page: Page) {
  await oppnaUrKolumnmenyn(page, 'E-post', 'E-post → namn…')
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

test('visar den nya kolumnen som en spökkolumn innan den finns', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaEpostverktyget(page)

  const spoke = page.locator('.rubrik--spoke')
  await expect(spoke).toBeVisible()
  await expect(spoke).toContainText('Förnamn')
  await expect(spoke).toContainText('ny kolumn')

  // Värdena syns i tabellen, men kolumnen finns inte i filen än.
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('Anna')
  await expect(page.locator('.statusrad')).toContainText('8 kolumner')
  await expect(page.getByRole('button', { name: /Ångra/ })).toBeDisabled()

  // Källkolumnen ritas inte som före → efter: den ändras ju inte.
  await expect(page.locator('.forhand__fore')).toHaveCount(0)
})

test('skapar kolumnen intill e-postkolumnen och går att ångra', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaEpostverktyget(page)

  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()

  await expect(page.locator('.verktyg')).toHaveCount(0)
  await expect(page.locator('.rubrik--spoke')).toHaveCount(0)
  await expect(page.locator('.statusrad')).toContainText('9 kolumner')
  await expect(cell(page, 'Anna').first()).toBeVisible()

  // Kolumnen hamnade direkt efter sin källa.
  const rubriker = page.getByRole('columnheader')
  await expect(rubriker.nth(2)).toContainText('E-post')
  await expect(rubriker.nth(3)).toContainText('Förnamn')

  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusrad')).toContainText('8 kolumner')
})

test('byter fält och namn på kolumnen', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaEpostverktyget(page)

  await page.getByRole('radio', { name: 'Domän', exact: true }).click()
  await expect(page.locator('.rubrik--spoke')).toContainText('Domän')
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('nordbygg.se')

  await page.getByRole('radio', { name: 'Förnamn Efternamn' }).click()
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('Anna Karlsson')

  const namnfalt = page.locator('.verktyg input[type="text"], .verktyg input:not([type])')
  await namnfalt.fill('Kontaktperson')
  await expect(page.locator('.rubrik--spoke')).toContainText('Kontaktperson')

  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()
  await expect(page.getByRole('columnheader').nth(3)).toContainText('Kontaktperson')
})

test('gör inte en funktionsadress till en person', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaEpostverktyget(page)

  // info@angstrom.se är ingen Anna. Cellen blir tom, inte "Info".
  const panel = page.locator('.verktyg')
  await expect(panel).toContainText('funktionsadresser')
  await expect(panel.locator('.verktyg__resultat')).toContainText('blir tomma')

  await page.getByRole('radio', { name: 'Bara tomma' }).click()
  await expect(cell(page, 'info@angstrom.se')).toBeVisible()
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('')
})

test('säger rakt ut att å ä ö inte går att få tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaEpostverktyget(page)

  const notis = page.locator('.verktyg .notis--varning')
  await expect(notis).toContainText('Å, ä och ö finns inte i adresser')
  await expect(notis).toContainText('Erik Öberg')
})

test('kan läsa efternamnet först när adresserna är skrivna så', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaEpostverktyget(page)

  await page.getByRole('radio', { name: 'Efternamnet' }).click()
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('Karlsson')
})

test('förnamn och efternamn i ett svep ger två kolumner', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.rubrik[title="E-post"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /E-post → namn/ }).click()

  await page.getByRole('radio', { name: 'Förnamn och Efternamn, var sin kolumn' }).click()
  await expect(page.getByLabel('Namn på förnamnskolumnen')).toHaveValue('Förnamn')
  await expect(page.getByLabel('Namn på efternamnskolumnen')).toHaveValue('Efternamn')
  // Två spökkolumner ritas intill källan.
  await expect(page.locator('.rubrik--spoke')).toHaveCount(2)

  await page.getByRole('button', { name: 'Skapa kolumnerna' }).click()
  await expect(page.locator('.statusrad')).toContainText('10 kolumner')
  await expect(page.getByRole('gridcell', { name: 'Anna', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'Karlsson', exact: true }).first()).toBeVisible()
})
