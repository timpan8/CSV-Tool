import { expect, test, type Page } from '@playwright/test'

/**
 * Hela Outlook-historien, från inklistrat sjok till två rena kolumner.
 *
 * De två verktygen är byggda för varandra men testas var för sig i
 * `tools.spec.ts`. Här går kedjan hela vägen, eftersom det är den vägen en
 * användare faktiskt tar — och den är inte klar förrän båda stegen fungerar
 * efter varandra.
 */

const OUTLOOK =
  'Mottagare\n' +
  'last1 first1 <last1.first1@exempel.com>; last2 first2 <first2.last2@exempel.com>; last3 first3 <first3.last3@exempel.com>'

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

async function oppnaUrKolumnmenyn(page: Page, kolumn: string, post: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  const direkt = page.getByRole('menuitem', { name: post })
  if ((await direkt.count()) === 0) {
    await page.getByRole('menuitem', { name: 'Fler verktyg' }).hover()
  }
  await page.getByRole('menuitem', { name: post }).first().click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

/**
 * Klistrar in sjoket som en egen fil, med lodstreck som avgränsare.
 *
 * Importen gissar på semikolon — det är rätt gissning för en CSV och fel för
 * en adresslista, där semikolonen skiljer *personer* och inte *fält*. Att
 * välja en avgränsare som inte finns i texten håller ihop raden, och det är
 * den enda platsen valet går att göra: efteråt är den redan delad.
 */
async function klistraInSomFil(page: Page, text: string) {
  await page.goto('/')
  await page.evaluate((t) => {
    const data = new DataTransfer()
    data.setData('text/plain', t)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, text)
  await page.getByRole('radio', { name: 'Lodstreck |' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
}

test('gör en Outlook-lista till en rad per person med namn och adress för sig', async ({ page }) => {
  await klistraInSomFil(page, OUTLOOK)
  await expect(page.locator('.statusrad')).toContainText('1 rad')

  // Steg 1: en rad per person.
  await oppnaUrKolumnmenyn(page, 'Mottagare', 'Dela till rader…')
  await expect(page.locator('.verktyg')).toContainText('1 rad');
  await expect(page.getByRole('button', { name: 'Skapa ny flik med 3 rader' })).toBeEnabled()
  await page.getByRole('button', { name: 'Skapa ny flik med 3 rader' }).click()

  await expect(page.locator('.flik')).toHaveCount(2)
  await expect(page.locator('.statusrad')).toContainText('3 rader')
  await expect(cell(page, 'last2 first2 <first2.last2@exempel.com>')).toBeVisible()

  // Steg 2: namn och adress i var sin kolumn, utan klamrar.
  await oppnaUrKolumnmenyn(page, 'Mottagare', 'Dela kolumnen…')
  await page.getByRole('radio', { name: 'Efter ett mönster' }).click()
  const monsterfalt = page.locator('.verktyg .falt', { hasText: 'Mönster' }).locator('input').first()
  await monsterfalt.fill('{Namn} <{E-post}>')

  await expect(page.locator('.rubrik--spoke')).toHaveCount(2)
  await page.getByRole('button', { name: 'Skapa 2 kolumner' }).click()

  await expect(cell(page, 'last1 first1')).toBeVisible()
  await expect(cell(page, 'last1.first1@exempel.com')).toBeVisible()
  // Klamrarna är borta ur de nya kolumnerna.
  await expect(cell(page, '<last1.first1@exempel.com>')).toHaveCount(0)
})

test('delningen till rader lämnar den ursprungliga fliken orörd', async ({ page }) => {
  await klistraInSomFil(page, OUTLOOK)
  await oppnaUrKolumnmenyn(page, 'Mottagare', 'Dela till rader…')
  await page.getByRole('button', { name: 'Skapa ny flik med 3 rader' }).click()

  await page.locator('.flik').first().click()
  await expect(page.locator('.statusrad')).toContainText('1 rad')
})
