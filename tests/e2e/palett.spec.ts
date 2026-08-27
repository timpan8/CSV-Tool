import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const palett = (page: Page) => page.locator('.palett')
const falt = (page: Page) => page.getByLabel('Sök bland kommandon')

test('Ctrl+K öppnar och stänger paletten', async ({ page }) => {
  await oppnaExempel(page)

  await page.keyboard.press('Control+k')
  await expect(palett(page)).toBeVisible()
  await expect(falt(page)).toBeFocused()

  await page.keyboard.press('Control+k')
  await expect(palett(page)).toHaveCount(0)

  // Escape ska stänga även när fokus inte ligger i fältet — det gör det inte
  // under den korta stunden innan fokus hunnit landa, och inte alls om man
  // klickat någon annanstans.
  await page.keyboard.press('Control+k')
  await expect(palett(page)).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Escape')
  await expect(palett(page)).toHaveCount(0)
})

test('paletten öppnas även innan en fil är öppen', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.tomt')).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(palett(page)).toBeVisible()
  // Utan fil finns bara det som går att göra ändå.
  await expect(page.locator('.palett__post')).toHaveCount(2)
  await expect(palett(page)).toContainText('Öppna fil…')
})

test('söker fram ett kommando och kör det med Enter', async ({ page }) => {
  await oppnaExempel(page)
  await page.keyboard.press('Control+k')

  await falt(page).fill('dubblett')
  await expect(page.locator('.palett__post')).toHaveCount(1)
  await page.keyboard.press('Enter')

  await expect(palett(page)).toHaveCount(0)
  await expect(page.locator('.verktyg')).toContainText('Dubbletter')
})

test('hittar kommandot på engelska och på ord som inte står i etiketten', async ({ page }) => {
  await oppnaExempel(page)
  await page.keyboard.press('Control+k')

  await falt(page).fill('join')
  await expect(page.locator('.palett__post')).toContainText('Slå ihop med en annan fil…')

  await falt(page).fill('makro')
  await expect(page.locator('.palett__post')).toContainText('Profiler…')

  await falt(page).fill('teleportera')
  await expect(page.locator('.palett__post')).toHaveCount(0)
  await expect(palett(page)).toContainText('Inget kommando matchar')
})

test('kolumnkommandon gäller den kolumn man står i', async ({ page }) => {
  await oppnaExempel(page)
  // Ställ markören i Ort-kolumnen.
  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().click()

  await page.keyboard.press('Control+k')
  await falt(page).fill('dolj')
  await expect(page.locator('.palett__post')).toContainText('Dölj Ort')
  await page.keyboard.press('Enter')

  await expect(page.locator('.rubrik[title="Ort"]')).toHaveCount(0)
})

test('pilarna flyttar valet och rutnätet rör sig inte bakom', async ({ page }) => {
  await oppnaExempel(page)
  const forst = page.getByRole('gridcell', { name: '10021', exact: true })
  await forst.click()

  await page.keyboard.press('Control+k')
  await falt(page).fill('rad')
  const poster = page.locator('.palett__post')
  await expect(poster.first()).toHaveClass(/palett__post--vald/)
  await page.keyboard.press('ArrowDown')
  await expect(poster.nth(1)).toHaveClass(/palett__post--vald/)

  await page.keyboard.press('Escape')
  // Markeringen står kvar där den stod: pilarna gick till paletten.
  await expect(forst).toHaveClass(/rutnat__cell--fokus/)
})

test('Escape stänger paletten även när effekterna släpar efter', async ({ page }) => {
  /*
   * Fönstrets tangenthanterare registreras i en effekt, och Preact spolar
   * effekter i requestAnimationFrame. Fördröjs den ligger paletten på
   * skärmen innan hanteraren sett att den öppnats — och då gick Escape till
   * rutnätet, som inte gör någonting med den. Felet syntes bara i CI, på en
   * långsammare maskin med två arbetare; här framkallas samma läge med flit.
   */
  await page.addInitScript(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 2000)) as typeof requestAnimationFrame
  })
  await oppnaExempel(page)

  await page.keyboard.press('Control+k')
  await expect(palett(page)).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Escape')
  await expect(palett(page)).toHaveCount(0)
})
