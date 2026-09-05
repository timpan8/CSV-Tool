import type { Page } from '@playwright/test'

/*
 * Panelen styrs via chipmenyerna, inte via dragrörelser.
 *
 * Det är samma väg en tangentbordsanvändare tar, och den enda som går att
 * skriva ned utan att testet börjar hävda pixlar. Att dra och släppa provas
 * för sig, i `pivotpanel.spec.ts`, och där är det själva dragningen som är
 * påståendet.
 *
 * Pivoten öppnas med fyra tomma rutor. Ett test som vill se tal måste alltså
 * själv lägga något i Värden — `antalRader` är den kortaste vägen dit.
 */
export const ruta = (page: Page, namn: string) =>
  page
    .locator('.pivotruta')
    .filter({ has: page.getByRole('heading', { name: namn, exact: true }) })

/** Fältlistans chip för en kolumn — exakt namnmatchning, så att Ort inte tar Postnr. */
export const listchip = (page: Page, namn: string) =>
  page
    .locator('.pivotpanel__falt .pivotruta__chip')
    .filter({ has: page.locator('.pivotruta__namn', { hasText: new RegExp(`^${namn}$`) }) })
    .first()

/** Lägg ett fält i en ruta, längst ned i den. */
export async function laggI(page: Page, namnRuta: string, falt: string) {
  await listchip(page, falt).getByRole('button', { name: new RegExp(`^Lägg till ${falt}`) }).click()
  await page.locator('.meny__post', { hasText: `Lägg i ${namnRuta}` }).click()
}

/** Töm en ruta helt, via varje chips meny. */
export async function tom(page: Page, namnRuta: string) {
  const chips = ruta(page, namnRuta).locator('.pivotruta__chip')
  while ((await chips.count()) > 0) {
    await chips.first().getByRole('button', { name: /Åtgärder för/ }).click()
    await page.locator('.meny__post', { hasText: 'Ta bort ur pivoten' }).click()
  }
}

/** Sätt en ruta till exakt de här fälten, i ordning. */
export async function satt(page: Page, namnRuta: string, ...falt: string[]) {
  await tom(page, namnRuta)
  for (const f of falt) await laggI(page, namnRuta, f)
}

/** Mätvärdet *Antal rader* i Värden — det enda som inte behöver ett fält. */
export async function antalRader(page: Page) {
  await ruta(page, 'Värden').getByRole('button', { name: /Antal rader/ }).click()
}

/** Öppna exempelfilen och pivoten. */
export async function oppnaPivot(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.locator('.statusrad').getByText('16 rader').waitFor()
  await page.getByRole('button', { name: 'Pivot', exact: true }).click()
  await page.locator('.pivot').waitFor()
}
