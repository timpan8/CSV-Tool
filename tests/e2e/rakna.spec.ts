import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppnaRakna(page: Page, kolumn: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  const direkt = page.getByRole('menuitem', { name: 'Räkna…' })
  if ((await direkt.count()) === 0) {
    await page.getByRole('menuitem', { name: 'Fler verktyg' }).hover()
  }
  await page.getByRole('menuitem', { name: 'Räkna…' }).first().click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

const formel = (page: Page) => page.getByLabel('Formel')

test('räknar moms på beloppet och visar det som en spökkolumn', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaRakna(page, 'Belopp')
  await formel(page).fill('RUNDA({Belopp} * 1,25; 2)')

  // Spökkolumnen finns innan något ändrats.
  await expect(page.locator('.rubrik--spoke')).toHaveCount(1)
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('1550,63')
  await expect(page.locator('.verktyg__resultat')).toContainText('15 av 15 celler')

  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()
  await expect(page.locator('.statusrad')).toContainText('9 kolumner')
  // Anna Karlsson finns två gånger med samma belopp, så värdet ska också det.
  await expect(page.getByRole('gridcell', { name: '1550,63', exact: true })).toHaveCount(2)

  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusrad')).toContainText('8 kolumner')
})

test('felet i formeln visas medan man skriver', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaRakna(page, 'Belopp')

  await formel(page).fill('{Belopp} * ')
  await expect(page.locator('.regel__fel')).toContainText('slutar mitt i')
  await expect(page.getByRole('button', { name: 'Skapa kolumnen' })).toBeDisabled()

  await formel(page).fill('{Summa} * 2')
  await expect(page.locator('.regel__fel')).toContainText('ingen kolumn som heter ”Summa”')

  await formel(page).fill('{Belopp} * 2')
  await expect(page.locator('.regel__fel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Skapa kolumnen' })).toBeEnabled()
})

test('klick på en kolumn skriver in den i formeln', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaRakna(page, 'Belopp')

  await page.locator('.falt', { hasText: 'Lägg till kolumn' }).getByRole('button', { name: 'Kundnr' }).click()
  await expect(formel(page)).toHaveValue('{Kundnr}')
})

test('tomma och otolkbara värden blir tomma i stället för noll', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaRakna(page, 'Belopp')
  await formel(page).fill('{Belopp} * 2')

  // Ida Ängström saknar belopp: en tom cell är okänd, inte noll.
  await expect(page.locator('.verktyg__resultat')).toContainText('15 av 15')
  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()
  // Den nya kolumnen läggs intill sin källa, alltså som spalt nummer åtta.
  // Rad sju är Ida Ängström, som saknar belopp.
  const nya = page.locator('.rutnat__rad').nth(6).locator('.rutnat__cell').nth(7)
  await expect(nya).toHaveText('')
})
