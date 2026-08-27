import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Skrivningen är fördröjd, så vänta tills den hunnit ske. */
async function invanta(page: Page) {
  await page.waitForTimeout(1600)
}

test('flikarna finns kvar efter en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await invanta(page)

  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.locator('.flik')).toHaveCount(1)
  await expect(page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true }).first()).toBeVisible()
  // Att historiken börjar om sägs rakt ut, i stället för att upptäckas när
  // Ctrl+Z inte gör något.
  await expect(page.locator('.toast').last()).toContainText('Ångra-historiken börjar om')
})

test('en redigering och ett filter följer med tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().dblclick()
  await page.locator('.rutnat__redigering').fill('Malmö stad')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: /^Filter/ }).click()
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  const regel = page.locator('.regel').first()
  await regel.locator('select').first().selectOption({ label: 'Status' })
  await regel.locator('.regel__varde').first().fill('Aktiv')
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')
  await invanta(page)

  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')
  await expect(page.locator('.filterrad .chip')).toContainText('Status är Aktiv')
  await expect(page.getByRole('gridcell', { name: 'Malmö stad', exact: true })).toBeVisible()
})

test('en stängd flik kommer inte tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await invanta(page)
  await page.locator('.flik__stang').first().click()
  await expect(page.locator('.tomt')).toBeVisible()
  await invanta(page)

  await page.reload()
  await expect(page.locator('.tomt')).toBeVisible()
  await expect(page.locator('.flik')).toHaveCount(0)
})

test('glöm sparade filer tömmer lagringen men rör inte flikarna', async ({ page }) => {
  await oppnaExempel(page)
  await invanta(page)

  await page.keyboard.press('Control+k')
  await page.getByLabel('Sök bland kommandon').fill('glöm sparade')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').last()).toContainText('Det sparade är borta')
  // Fliken på skärmen står kvar.
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  await page.reload()
  await expect(page.locator('.tomt')).toBeVisible()
})
