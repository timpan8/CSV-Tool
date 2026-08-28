import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Öppnar dialogen och grupperar på en kolumn, utan några beräkningar kvar. */
async function oppnaSammanfatta(page: Page) {
  await page.getByRole('button', { name: 'Sammanfatta…' }).click()
  await expect(page.getByRole('dialog', { name: 'Gruppera och summera' })).toBeVisible()
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gruppera och summera' })

/**
 * Väljer exakt de kolumner som ska gruppera, i den ordning de anges.
 *
 * Allt avmarkeras först och väljs sedan om — ordningen är en del av
 * resultatet, och att klicka i den ordning knapparna råkar stå i vore att
 * testa något annat än det man bad om.
 */
async function grupperaPa(page: Page, ...namn: string[]) {
  const grupp = dialog(page).locator('.falt', { hasText: 'Gruppera på' }).first()
  for (const knapp of await grupp.getByRole('button').all()) {
    if ((await knapp.getAttribute('aria-pressed')) === 'true') await knapp.click()
  }
  for (const n of namn) {
    await grupp.getByRole('button', { name: n, exact: true }).click()
  }
}

/** Ersätter beräkningslistan med precis de par man ber om. */
async function beraknaBara(page: Page, par: [string, string | null][]) {
  const rader = dialog(page).locator('.gruppera__rad')
  // Ta bort allt utom den första raden, och skriv sedan om raderna i ordning.
  while ((await rader.count()) > par.length) {
    await rader.last().getByRole('button').click()
  }
  while ((await rader.count()) < par.length) {
    await dialog(page).getByRole('button', { name: '+ Lägg till beräkning' }).click()
  }
  for (let i = 0; i < par.length; i++) {
    const [typ, kolumn] = par[i]!
    await rader.nth(i).getByLabel('Beräkning').selectOption({ label: typ })
    if (kolumn !== null) {
      await rader.nth(i).getByLabel('Kolumn att räkna på').selectOption({ label: kolumn })
    }
  }
}

/** Raden som säger hur många grupper det blev. */
const sammanfattningen = (page: Page) =>
  dialog(page).locator('.verktyg__sammanfattning').last()

/** Förhandsvisningens rader som textmatris. */
async function forhandsrader(page: Page): Promise<string[][]> {
  const rader = dialog(page).locator('.fortab tbody tr')
  return Promise.all(
    (await rader.all()).map(async (r) =>
      Promise.all((await r.locator('td').all()).map(async (c) => (await c.textContent()) ?? '')),
    ),
  )
}

test('summerar belopp per status och skapar en ny flik', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Status')
  await beraknaBara(page, [
    ['Antal rader', null],
    ['Summa', 'Belopp'],
  ])

  // Grupperna kommer i den ordning de dyker upp i filen.
  await expect(dialog(page).locator('.fortab thead')).toContainText('Summa Belopp')
  expect(await forhandsrader(page)).toEqual([
    ['Aktiv', '10', '19606,75'],
    ['Avslutad', '3', '15615,75'],
    ['Vilande', '3', '3525'],
  ])
  await expect(sammanfattningen(page)).toContainText('3 grupper')

  await page.getByRole('button', { name: 'Skapa fliken' }).click()

  // Resultatet är en egen flik; originalet står kvar orört.
  await expect(page.locator('.statusrad')).toContainText('3 rader')
  await expect(page.locator('.flik--aktiv')).toContainText('per Status')
  await expect(page.getByRole('gridcell', { name: '19606,75' })).toBeVisible()
  await page.locator('.flik', { hasText: 'Exempel' }).first().click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})

test('rader utan värde i nyckeln räknas inte med förrän man ber om det', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSammanfatta(page)
  // Ida Ängström saknar belopp och hör därför inte till någon beloppsgrupp.
  await grupperaPa(page, 'Belopp')
  await beraknaBara(page, [['Antal rader', null]])

  const varning = dialog(page).locator('.notis--varning')
  await expect(varning).toContainText('1 rad')
  await expect(varning).toContainText('saknar värde i Belopp')
  await expect(sammanfattningen(page)).toContainText('14 grupper ur 15 rader')

  await dialog(page).getByText('Ta med raderna som saknar värde').click()
  await expect(dialog(page).locator('.notis--varning')).toHaveCount(0)
  await expect(sammanfattningen(page)).toContainText('15 grupper ur 16 rader')
})

test('lika värden hamnar i samma grupp', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Ort')
  await beraknaBara(page, [['Antal rader', null]])

  // Malmö finns två gånger — Anna Karlsson står med en dubblett.
  expect(await forhandsrader(page)).toContainEqual(['Malmö', '2'])
  await expect(sammanfattningen(page)).toContainText('15 grupper ur 16 rader')
})

test('normaliseringen avgör vad som räknas som samma värde', async ({ page }) => {
  // Orderfilen har samma namn skrivet på tre sätt: gemener, VERSALER och med
  // dubbelt mellanslag. Det är precis vad valen ovanför handlar om.
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)

  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Name')
  await beraknaBara(page, [['Antal rader', null]])
  // Erik Öberg står två gånger, en gång i VERSALER.
  expect(await forhandsrader(page)).toContainEqual(['Erik Öberg', '2'])

  await dialog(page).getByText('VERSALER').click()
  expect(await forhandsrader(page)).toContainEqual(['Erik Öberg', '1'])
  expect(await forhandsrader(page)).toContainEqual(['ERIK ÖBERG', '1'])
})

test('summan gäller det filtret visar, inte hela filen', async ({ page }) => {
  await oppnaExempel(page)
  // Filtrera på en enda ort via cellens meny.
  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Filtrera på ”Malmö”' }).click()
  await expect(page.locator('.statusrad')).toContainText('2 av 16')

  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Ort')
  await beraknaBara(page, [
    ['Antal rader', null],
    ['Summa', 'Belopp'],
  ])
  // 1 240,50 två gånger, och ingenting från de bortfiltrerade raderna.
  expect(await forhandsrader(page)).toEqual([['Malmö', '2', '2481']])
})

test('kolumnmenyn öppnar dialogen med kolumnen redan vald', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('button', { name: 'Meny för kolumnen Status' }).click()
  await page.getByRole('menuitem', { name: 'Gruppera på Status' }).click()

  await expect(dialog(page)).toBeVisible()
  const vald = dialog(page)
    .locator('.falt', { hasText: 'Gruppera på' })
    .first()
    .getByRole('button', { name: 'Status' })
  await expect(vald).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog(page).getByPlaceholder('Exempel')).toBeVisible()
})

test('säger till när en summa inte hittar några tal', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Status')
  await beraknaBara(page, [['Summa', 'Ort']])

  await expect(dialog(page).locator('.notis--fara')).toContainText('hittar inga tal alls')
  // Kolumnen skapas ändå — tom, inte noll.
  await expect(page.getByRole('button', { name: 'Skapa fliken' })).toBeEnabled()
})

test('minsta och största följer kolumnens egen ordning', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Status')
  await beraknaBara(page, [
    ['Minsta', 'Belopp'],
    ['Största', 'Belopp'],
  ])

  // Vilande: 2 010,00 / 640,00 / 875,00 — jämförda som tal, skrivna som i filen.
  expect(await forhandsrader(page)).toContainEqual(['Vilande', '640,00', '2 010,00'])
})

test('flera grupperingskolumner numreras i den ordning man valde dem', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaSammanfatta(page)
  await grupperaPa(page, 'Status', 'Ort')
  await beraknaBara(page, [['Antal rader', null]])

  const grupp = dialog(page).locator('.falt', { hasText: 'Gruppera på' }).first()
  await expect(grupp.getByRole('button', { name: 'Status' })).toContainText('1')
  await expect(grupp.getByRole('button', { name: 'Ort', exact: false }).first()).toContainText('2')
  expect((await forhandsrader(page))[0]).toEqual(['Aktiv', 'Malmö', '2'])
})
