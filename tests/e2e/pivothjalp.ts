import type { Page } from '@playwright/test'

/*
 * Panelen styrs via chipmenyerna, inte via dragrörelser.
 *
 * Det är samma väg en tangentbordsanvändare tar, och den enda som går att
 * skriva ned utan att testet börjar hävda pixlar. Att dra och släppa provas
 * en gång, i `pivotpanel.spec.ts`, och där är det själva dragningen som är
 * påståendet.
 */
export const ruta = (page: Page, namn: string) =>
  page
    .locator('.pivotruta')
    .filter({ has: page.getByRole('heading', { name: namn, exact: true }) })

/** Lägg ett fält i en ruta, längst ned i den. */
export async function laggI(page: Page, namnRuta: string, falt: string) {
  await page.locator('.pivotpanel__falt .pivotruta__chip', { hasText: falt }).first()
    .getByRole('button', { name: `Lägg till ${falt}` })
    .click()
  await page.locator('.meny__post', { hasText: `Lägg i ${namnRuta}` }).click()
}

/** Sätt en ruta till exakt de här fälten, i ordning. */
export async function satt(page: Page, namnRuta: string, ...falt: string[]) {
  const chips = ruta(page, namnRuta).locator('.pivotruta__chip')
  while ((await chips.count()) > 0) {
    await chips.first().getByRole('button', { name: /Åtgärder för/ }).click()
    await page.locator('.meny__post', { hasText: 'Ta bort ur pivoten' }).click()
  }
  for (const f of falt) await laggI(page, namnRuta, f)
}
