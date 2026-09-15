import { expect, test, type Page } from '@playwright/test'
import { vantaPaSparat } from './lagringshjalp.js'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Klistrar in en liten tabell som en ny fil, som Ctrl+Skift+V gör. */
async function klistraInSomNyFil(page: Page, text: string) {
  await page.evaluate((t) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    const data = new DataTransfer()
    data.setData('text/plain', t)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, text)
  await page.getByRole('button', { name: 'Öppna filen' }).click()
}

test('dubbelklick på fliken byter namn, och Escape ångrar', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.flik__namn').first().dblclick()
  const falt = page.getByRole('textbox', { name: 'Nytt namn för exempel-kunder.csv' })
  await expect(falt).toBeFocused()
  await falt.fill('Kunder 2024')
  await page.keyboard.press('Enter')
  await expect(page.locator('.flik__namn').first()).toHaveText('Kunder 2024')

  await page.locator('.flik__namn').first().dblclick()
  await page.getByRole('textbox', { name: 'Nytt namn för Kunder 2024' }).fill('Fel')
  await page.keyboard.press('Escape')
  await expect(page.locator('.flik__namn').first()).toHaveText('Kunder 2024')
  // Ett namnbyte är utseende, inte data: inget ångra-steg.
  await expect(page.getByRole('button', { name: /^Ångra/ })).toBeDisabled()
})

test('högerklick på fliken ger en meny med Byt namn', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.flik').first().click({ button: 'right' })
  const meny = page.locator('.meny').first()
  await expect(meny).toBeVisible()
  await meny.getByRole('menuitem', { name: /Byt namn/ }).click()
  await page.getByRole('textbox', { name: /Nytt namn för/ }).fill('Via menyn')
  await page.keyboard.press('Enter')
  await expect(page.locator('.flik__namn').first()).toHaveText('Via menyn')
})

test('namnet följer med till exporten och överlever en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await page.locator('.flik__namn').first().dblclick()
  await page.getByRole('textbox', { name: /Nytt namn för/ }).fill('Rapport')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: 'Exportera' }).click()
  await expect(page.locator('.falt', { hasText: 'Filnamn' }).locator('input')).toHaveValue(
    'Rapport-bearbetad.xlsx',
  )
  await page.keyboard.press('Escape')

  // Ingen cell ändrades, så det är bara namnet som ska få ramen skriven.
  await vantaPaSparat(page, '"name":"Rapport"')
  await page.reload()
  await expect(page.locator('.flik__namn').first()).toHaveText('Rapport')
})

test('två inklistringar får var sitt namn', async ({ page }) => {
  await oppnaExempel(page)
  await klistraInSomNyFil(page, 'Grupp\tKod\nEkonomi\tE1')
  await klistraInSomNyFil(page, 'Grupp\tKod\nTeknik\tT1')
  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(page.locator('.flik__namn', { hasText: 'Inklistrat 1' })).toHaveCount(1)
  await expect(page.locator('.flik__namn', { hasText: 'Inklistrat 2' })).toHaveCount(1)
})

test('ett namn som krockar med en annan flik får ett löpnummer', async ({ page }) => {
  await oppnaExempel(page)
  await klistraInSomNyFil(page, 'Grupp\tKod\nEkonomi\tE1')
  await page.locator('.flik__namn', { hasText: 'Inklistrat 1' }).dblclick()
  await page.getByRole('textbox', { name: /Nytt namn för/ }).fill('exempel-kunder.csv')
  await page.keyboard.press('Enter')
  await expect(page.locator('.flik__namn', { hasText: 'exempel-kunder (2).csv' })).toHaveCount(1)
})
