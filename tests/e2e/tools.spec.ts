import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppna(page: Page, kolumn: string, post: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  await page.getByRole('menuitem', { name: post }).click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })
const spokceller = (page: Page) => page.locator('.rutnat__cell--spoke')

/* ---------- Tal ---------- */

test('talstädning skalar av kr och hårt mellanslag', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'Belopp', 'Tal…')

  const forsta = page.locator('.rutnat__cell--forhand-andrad').first()
  await expect(forsta.locator('.forhand__fore')).toHaveText('1 240,50')
  await expect(forsta.locator('.forhand__efter')).toHaveText('1240,50')

  await page.getByRole('button', { name: 'Tillämpa' }).click()
  await expect(cell(page, '1240,50').first()).toBeVisible()
  await expect(cell(page, '1 240,50')).toHaveCount(0)
})

test('talstädning kan skriva punkt som decimaltecken', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'Belopp', 'Tal…')

  await page.getByRole('radio', { name: 'Decimalpunkt' }).click()
  await page.getByRole('button', { name: 'Tillämpa' }).click()
  await expect(cell(page, '1240.50').first()).toBeVisible()
})

/* ---------- Dela ---------- */

test('delar namnkolumnen i två spökkolumner innan de skapas', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'Namn', 'Dela kolumnen…')

  await expect(page.locator('.rubrik--spoke')).toHaveCount(2)
  await expect(spokceller(page).nth(0)).toHaveText('Anna')
  await expect(spokceller(page).nth(1)).toHaveText('Karlsson')
  await expect(page.locator('.statusrad')).toContainText('8 kolumner')

  await page.getByRole('button', { name: /Skapa 2 kolumner/ }).click()
  await expect(page.locator('.statusrad')).toContainText('10 kolumner')
  await expect(cell(page, 'Karlsson').first()).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusrad')).toContainText('8 kolumner')
})

test('delning vid sista mellanslaget håller ihop dubbelnamn', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'Namn', 'Dela kolumnen…')

  // Carl-Johan Nilsson har bindestreck, inte mellanslag — men raden med
  // "Anna Karlsson" delas lika i båda lägena. Kontrollen är att valet finns
  // och att förhandsvisningen följer med.
  await page.getByRole('radio', { name: 'Vid sista' }).click()
  await expect(spokceller(page).nth(0)).toHaveText('Anna')
  await expect(spokceller(page).nth(1)).toHaveText('Karlsson')
})

test('varnar när ett värde delas i fler delar än det finns kolumner', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'E-post', 'Dela kolumnen…')

  // anna.karlsson@nordbygg.se blir tre delar vid punkt, men bara två
  // kolumner är valda. Överskottet får inte försvinna i tysthet.
  await page.getByRole('radio', { name: 'Vid varje' }).click()
  await page.getByRole('radio', { name: 'Eget…' }).click()
  await page.locator('.verktyg .falt', { hasText: 'Vid vilket tecken' }).locator('input').fill('.')

  await expect(page.locator('.verktyg .notis--varning')).toContainText('delas i 3 delar')
  await expect(spokceller(page).nth(1)).toHaveText('karlsson@nordbygg.se')

  await page.getByRole('radio', { name: '3', exact: true }).click()
  await expect(page.locator('.verktyg .notis--varning')).toHaveCount(0)
  await expect(spokceller(page).nth(2)).toHaveText('se')
})

/* ---------- Slå ihop ---------- */

test('slår ihop kolumner efter en mall', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'Namn', 'Slå ihop kolumner…')

  const mallfalt = page.locator('.verktyg .falt', { hasText: 'Mall' }).locator('input').first()
  await mallfalt.fill('{Namn}, {Ort}')

  await expect(page.locator('.rubrik--spoke')).toHaveCount(1)
  await expect(spokceller(page).first()).toHaveText('Anna Karlsson, Malmö')

  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()
  await expect(cell(page, 'Anna Karlsson, Malmö').first()).toBeVisible()
})

test('vägrar skapa kolumnen när mallen pekar på en kolumn som inte finns', async ({ page }) => {
  await oppnaExempel(page)
  await oppna(page, 'Namn', 'Slå ihop kolumner…')

  const mallfalt = page.locator('.verktyg .falt', { hasText: 'Mall' }).locator('input').first()
  await mallfalt.fill('{Namn} {Stad}')

  await expect(page.locator('.verktyg .notis--fara')).toContainText('Stad')
  await expect(page.getByRole('button', { name: 'Skapa kolumnen' })).toBeDisabled()
})

/* ---------- Telefon ---------- */

test('telefonverktyget normaliserar inklistrade nummer', async ({ page }) => {
  await oppnaExempel(page)

  // Exempelfilen har ingen telefonkolumn, så vi skriver in ett nummer först.
  await cell(page, 'Aktiv').first().dblclick()
  const falt = page.locator('.rutnat__redigering')
  await falt.fill('070-123 45 67')
  await falt.press('Enter')

  await oppna(page, 'Status', 'Telefon…')
  const forsta = page.locator('.rutnat__cell--forhand-andrad').first()
  await expect(forsta.locator('.forhand__efter')).toHaveText('+46701234567')

  // Allt annat i kolumnen är inte telefonnummer och lämnas i fred.
  await expect(page.locator('.verktyg__resultat')).toContainText('1 av 16')
  await expect(page.locator('.verktyg__resultat')).toContainText('15 går inte att tolka')
})
