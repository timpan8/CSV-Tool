import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppnaSokOchErsatt(page: Page, kolumn: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  await page.getByRole('menuitem', { name: 'Sök och ersätt…' }).click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

const sokfalt = (page: Page) => page.locator('.verktyg .falt', { hasText: 'Sök efter' }).locator('input')
const ersattfalt = (page: Page) =>
  page.locator('.verktyg .falt', { hasText: 'Ersätt med' }).locator('input')

test('räknar träffar och visar dem i tabellen innan de görs', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSokOchErsatt(page, 'Status')

  await sokfalt(page).fill('Aktiv')
  await ersattfalt(page).fill('Ja')

  await expect(page.locator('.verktyg__resultat')).toContainText('10 av 16 celler ändras')

  const forsta = page.locator('.rutnat__cell--forhand-andrad').first()
  await expect(forsta.locator('.forhand__fore')).toHaveText('Aktiv')
  await expect(forsta.locator('.forhand__efter')).toHaveText('Ja')
  await expect(page.getByRole('button', { name: /Ångra/ })).toBeDisabled()

  await page.getByRole('button', { name: 'Ersätt', exact: true }).click()
  await expect(page.getByRole('gridcell', { name: 'Ja', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'Aktiv', exact: true })).toHaveCount(0)
})

test('bokstavlig sökning behandlar punkt som punkt', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSokOchErsatt(page, 'Belopp')

  // Utan escaping skulle "1.5" matcha "1 240,50" via jokertecknet.
  await sokfalt(page).fill('1.5')
  await expect(page.locator('.verktyg__resultat')).toContainText('0 av')
})

test('visar felet i ett trasigt reguljärt uttryck medan man skriver', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSokOchErsatt(page, 'Ort')

  await page.getByRole('checkbox', { name: 'Reguljärt uttryck' }).check()
  await sokfalt(page).fill('([a-z')

  await expect(page.locator('.verktyg .notis--fara')).toContainText('går inte att tolka')
  await expect(page.getByRole('button', { name: 'Ersätt', exact: true })).toBeDisabled()

  await sokfalt(page).fill('^[A-ZÅÄÖ]')
  await expect(page.locator('.verktyg .notis--fara')).toHaveCount(0)
})

test('hittar Öberg från oberg när å ä ö ignoreras', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSokOchErsatt(page, 'Namn')

  // Namnkolumnen stavar redan Öberg rätt. Poängen är att en sökning utan
  // prickar ändå hittar raden.
  await page.getByRole('checkbox', { name: /Strunta i/ }).check()
  await sokfalt(page).fill('erik oberg')
  await ersattfalt(page).fill('Erik Öberg (kontrollerad)')

  await expect(page.locator('.verktyg__resultat')).toContainText('1 av')
  await page.getByRole('button', { name: 'Ersätt', exact: true }).click()
  await expect(
    page.getByRole('gridcell', { name: 'Erik Öberg (kontrollerad)', exact: true }),
  ).toBeVisible()
})

test('bara träffar-filtret visar de rader som berörs', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSokOchErsatt(page, 'Ort')

  await sokfalt(page).fill('Malmö')
  await ersattfalt(page).fill('MALMÖ')
  await page.getByRole('radio', { name: 'Bara träffar' }).click()

  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
})
