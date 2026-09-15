import { expect, test, type Page } from '@playwright/test'

/** Öppnar båda exempelfilerna som två flikar och står i kundfilen. */
async function oppnaParet(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const vy = (page: Page) => page.locator('.jamfor')

async function oppnaVyn(page: Page) {
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: /^Jämför…/ }).click()
  await expect(vy(page)).toBeVisible()
}

const parrad = (page: Page) => page.locator('.jamfor__par').first()

const valjPar = async (page: Page, vanster: string, hoger: string) => {
  await parrad(page).locator('select').nth(0).selectOption({ label: vanster })
  await parrad(page).locator('select').nth(1).selectOption({ label: hoger })
}

const kor = (page: Page) => page.getByRole('button', { name: 'Jämför', exact: true })

test('finns någonstans: räknar, färgar båda flikarna och skriver en resultatkolumn', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjPar(page, 'Namn', 'Name')
  await page.getByRole('radio', { name: 'Finns någonstans' }).click()

  // Namnen i orderfilen är kundfilens namn, men två av kundfilens saknas där.
  await expect(vy(page).locator('.vytal')).toContainText('lika')
  await expect(vy(page).locator('.vytal')).toContainText('saknas')
  await page.getByRole('radio', { name: 'I båda' }).click()
  // Lika färgas inte som förval — det är skillnaderna man letar efter.
  await page.getByRole('checkbox', { name: 'lika — grön' }).check()
  await kor(page).click()

  // Tillbaka i kundfilen, med en ny kolumn direkt efter Namn.
  await expect(vy(page)).toHaveCount(0)
  await expect(page.locator('.toast').last()).toContainText('lika')
  const rubriker = page.getByRole('columnheader')
  await expect(rubriker.nth(3)).toContainText('Jämförelse Namn ↔ Name')
  await expect(page.getByRole('gridcell', { name: 'lika', exact: true }).first()).toBeVisible()
  // Lika är grönt, saknas orange.
  await expect(page.locator('.rutnat__cell--farg-3').first()).toBeVisible()
  await expect(page.locator('.rutnat__cell--farg-2').first()).toBeVisible()

  // Och orderfilen fick sin kolumn och sin färg.
  await page.locator('.flik__namn', { hasText: 'exempel-order.csv' }).click()
  await expect(page.getByRole('columnheader', { name: /Jämförelse Name ↔ Namn/ })).toBeVisible()
  await expect(page.locator('.rutnat__cell--farg-3').first()).toBeVisible()

  // Ctrl+Z i kundfilen tar tillbaka både färgen och kolumnen.
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('columnheader', { name: /Jämförelse/ })).toHaveCount(0)
  await expect(page.locator('.rutnat__cell--farg-3')).toHaveCount(0)
})

test('rad mot rad går på det man ser, och samma flik kan stå på båda sidor', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaVyn(page)
  // Förvalet med en fil: samma flik två gånger, två olika kolumner.
  await expect(vy(page)).toContainText('exempel-kunder.csv')
  await valjPar(page, 'Ort', 'Ort')
  await expect(vy(page).locator('.vytal')).toContainText('16 lika')

  await valjPar(page, 'Ort', 'Status')
  await expect(vy(page).locator('.vytal')).toContainText('16 skiljer sig')
  await expect(vy(page).locator('.ruta').last()).toContainText('skiljer sig')
  // Bara skillnader är förvalet; Alla rader visar även de lika.
  await page.getByRole('radio', { name: 'Alla rader' }).click()

  await page.getByRole('checkbox', { name: 'Resultatkolumn per par' }).uncheck()
  await kor(page).click()
  await expect(page.locator('.toast').last()).toContainText('16 skiljer sig')
  // Bara färg: röda celler, ingen ny kolumn.
  await expect(page.locator('.rutnat__cell--farg-7').first()).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /Jämförelse/ })).toHaveCount(0)
})

test('Escape stänger vyn utan att skriva något', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaVyn(page)
  await page.keyboard.press('Escape')
  await expect(vy(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Ångra/ })).toBeDisabled()
})
