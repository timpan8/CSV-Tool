import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

async function oppnaDubbletter(page: Page) {
  await page.getByRole('button', { name: 'Dubbletter' }).click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

const nyckelkryss = (page: Page, namn: string) =>
  page.locator('.kollista--kryss').getByRole('checkbox', { name: namn })

test('hela raden hittar inget, men Namn och E-post gör det', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDubbletter(page)

  // Anna Karlsson finns två gånger, men med olika kundnummer — så en
  // jämförelse av hela raden hittar ingenting.
  await expect(page.locator('.verktyg')).toContainText('Inga dubbletter med den här nyckeln')

  // Kryssa ur allt utom Namn och E-post.
  for (const namn of ['Kundnr', 'Registrerad', 'Postnr', 'Ort', 'Belopp', 'Status']) {
    await nyckelkryss(page, namn).uncheck()
  }
  await expect(page.locator('.verktyg__underrubrik')).toHaveText('1 grupp · 2 rader')

  // Att beskriva vad som räknas som lika får inte dölja rader av sig självt.
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.getByRole('button', { name: 'Visa alla rader' })).toHaveCount(0)
})

test('visar dubbletterna med grupperna samlade', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDubbletter(page)
  for (const namn of ['Kundnr', 'Registrerad', 'Postnr', 'Ort', 'Belopp', 'Status']) {
    await nyckelkryss(page, namn).uncheck()
  }

  await page.getByRole('radio', { name: 'Bara dubbletterna' }).click()
  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
  await expect(page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true })).toHaveCount(2)
  await expect(page.locator('.rutnat__rad--gruppslut')).toHaveCount(1)
})

test('tar bort dubbletterna och går att ångra', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDubbletter(page)
  for (const namn of ['Kundnr', 'Registrerad', 'Postnr', 'Ort', 'Belopp', 'Status']) {
    await nyckelkryss(page, namn).uncheck()
  }

  await page.getByRole('button', { name: 'Behåll den första i filen' }).click()

  await expect(page.locator('.statusrad')).toContainText('15 rader')
  // Panelen stängs, eftersom en dubblettvy utan dubbletter ser trasig ut.
  await expect(page.locator('.verktyg')).toHaveCount(0)
  await expect(page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true })).toHaveCount(1)
  // Den som blev kvar är den första i filen: kundnummer 10021.
  await expect(page.getByRole('gridcell', { name: '10021', exact: true })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: '10035', exact: true })).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.getByRole('gridcell', { name: '10035', exact: true })).toBeVisible()
})

test('behåll den sista sparar den andra raden i stället', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDubbletter(page)
  for (const namn of ['Kundnr', 'Registrerad', 'Postnr', 'Ort', 'Belopp', 'Status']) {
    await nyckelkryss(page, namn).uncheck()
  }

  await page.getByRole('button', { name: 'Behåll den sista i filen' }).click()
  await expect(page.getByRole('gridcell', { name: '10035', exact: true })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: '10021', exact: true })).toHaveCount(0)
})

test('normaliseringen avgör vad som räknas som lika', async ({ page }) => {
  await oppnaExempel(page)

  // Skriv om en Malmö till MALMÖ.
  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().dblclick()
  const falt = page.locator('.rutnat__redigering')
  await falt.fill('MALMÖ')
  await falt.press('Enter')

  await oppnaDubbletter(page)
  for (const namn of ['Kundnr', 'Namn', 'E-post', 'Registrerad', 'Postnr', 'Belopp', 'Status']) {
    await nyckelkryss(page, namn).uncheck()
  }

  // Med skiftläge ignorerat hör MALMÖ ihop med Malmö.
  await expect(page.locator('.verktyg__underrubrik')).toHaveText('1 grupp · 2 rader')
  await page.getByRole('checkbox', { name: 'VERSALER' }).uncheck()
  await expect(page.locator('.verktyg')).toContainText('Inga dubbletter med den här nyckeln')
})
