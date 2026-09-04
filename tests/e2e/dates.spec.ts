import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/**
 * Öppnar ett verktyg ur kolumnmenyn.
 *
 * Verktygen sorteras efter vad kolumnen innehåller, och de som inte passar
 * ligger under *Fler verktyg*. Hjälparen tar båda vägarna, så att testet
 * handlar om verktyget och inte om var i menyn det råkar hamna.
 */
async function oppnaUrKolumnmenyn(page: Page, kolumn: string, post: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  // Ett föreslaget verktyg står med sitt skäl efter etiketten, så namnet
  // matchas som delsträng och inte exakt.
  const direkt = page.getByRole('menuitem', { name: post })
  if ((await direkt.count()) === 0) {
    await page.getByRole('menuitem', { name: 'Fler verktyg' }).hover()
  }
  await page.getByRole('menuitem', { name: post }).first().click()
  await expect(page.locator('.verktyg')).toBeVisible()
}

/** Öppnar datumverktyget på kolumnen Registrerad. */
async function oppnaDatumverktyget(page: Page) {
  await oppnaUrKolumnmenyn(page, 'Registrerad', 'Datum…')
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

/**
 * Cell vars innehåll bryter mot kolumnens typ.
 *
 * En sådan cell får ett utropstecken från rutnätet, och det ingår i cellens
 * tillgängliga namn. Matchningen är därför inte exakt.
 */
const flaggadCell = (page: Page, text: string) =>
  page.getByRole('gridcell', { name: text, exact: false })

test('inventerar formaten i kolumnen och visar dem med antal', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  const inventering = page.locator('.inventering')
  await expect(inventering).toContainText('ÅÅÅÅ-MM-DD')
  await expect(inventering).toContainText('ÅÅÅÅ-MM-DD med klockslag')
  await expect(inventering).toContainText('DD/MM/ÅÅÅÅ eller MM/DD/ÅÅÅÅ')
  await expect(inventering).toContainText('27 augusti 2026')
  await expect(inventering).toContainText('Går inte att tolka')
  // Exempel ur användarens egen fil, inte påhittade.
  await expect(inventering).toContainText('i går')
})

test('låter kolumnens eget innehåll avgöra dag- eller månadsordningen', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  // 27/08/2026 kan bara läsas med dagen först, så frågan ska inte ställas.
  await expect(page.locator('.verktyg')).toContainText('Kolumnen svarar själv')
  await expect(page.locator('.verktyg')).toContainText('27/08/2026')
  await expect(page.getByRole('radio', { name: 'Månaden först' })).toHaveCount(0)
})

test('visar före → efter i tabellen utan att ändra något', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  // Första ändrade cellen i kolumnen är den med klockslag: tiden faller bort.
  const forsta = page.locator('.rutnat__cell--forhand-andrad').first()
  await expect(forsta.locator('.forhand__fore')).toHaveText('2026-08-27 12:55')
  await expect(forsta.locator('.forhand__efter')).toHaveText('2026-08-27')

  // Och snedstrecksformatet skrivs om till samma dag.
  const snedstreck = page
    .locator('.rutnat__cell--forhand-andrad')
    .filter({ hasText: '27/08/2026' })
    .first()
  await expect(snedstreck.locator('.forhand__efter')).toHaveText('2026-08-27')

  // Rader som redan står rätt lämnas utan förslag.
  await expect(
    page.locator('.rutnat__cell--forhand').filter({ hasText: '2026-08-26' }).first(),
  ).not.toHaveClass(/forhand-andrad/)

  // Ingenting får ha hamnat i historiken av att bara titta.
  await expect(page.getByRole('button', { name: /Ångra/ })).toBeDisabled()
})

test('går inte att tolka-raderna kan filtreras fram', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  // Två värden går inte att tolka: "i går", och talet 45231 så länge
  // Exceldatum inte är påslaget.
  await expect(page.locator('.verktyg__resultat')).toContainText('2 går inte att tolka')
  await page.getByRole('radio', { name: 'Bara problem' }).click()

  await expect(page.locator('.statusrad')).toContainText('2 av 16 rader')
  // Kolumnen typades som datum redan vid import, så båda värdena bär
  // rutnätets avvikelsemarkör.
  await expect(flaggadCell(page, 'i går')).toBeVisible()
  await expect(cell(page, 'Ida Ängström')).toBeVisible()
  await expect(flaggadCell(page, '45231')).toBeVisible()

  await page.getByRole('radio', { name: 'Alla rader' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})

test('skriver om kolumnen till ÅÅÅÅ-MM-DD och går att ångra', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  await page.getByRole('button', { name: 'Tillämpa' }).click()

  // Panelen stängs och förhandsvisningen med den.
  await expect(page.locator('.verktyg')).toHaveCount(0)
  await expect(page.locator('.rutnat__cell--forhand')).toHaveCount(0)

  // Klockslaget faller bort, snedstrecken blir bindestreck, månadsnamnet tolkas.
  await expect(cell(page, '2026-08-27').first()).toBeVisible()
  await expect(cell(page, '2026-08-27 12:55')).toHaveCount(0)
  await expect(cell(page, '27/08/2026')).toHaveCount(0)
  await expect(cell(page, 'den 27 augusti 2026')).toHaveCount(0)

  // Det otolkbara värdet står kvar orört — standardvalet är att låta stå.
  // Kolumnen är nu en datumkolumn, så rutnätet flaggar värdet som avvikande.
  await expect(flaggadCell(page, 'i går')).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(cell(page, '27/08/2026')).toBeVisible()
  await expect(cell(page, 'den 27 augusti 2026')).toBeVisible()
})

test('Excel-serienummer tolkas bara när man ber om det', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  // 45231 är ett Exceldatum, men ett tal är inte ett datum förrän någon sagt det.
  await expect(flaggadCell(page, '45231')).toBeVisible()
  await expect(page.locator('.rutnat__cell--forhand-andrad').filter({ hasText: '45231' })).toHaveCount(0)

  await page.getByRole('checkbox', { name: /Exceldatum/ }).check()
  await expect(
    page.locator('.rutnat__cell--forhand-andrad').filter({ hasText: '45231' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Tillämpa' }).click()
  await expect(cell(page, '2023-11-01')).toBeVisible()
})

test('målformatet ÅÅÅÅ-MM ger sammanfattning i stället för datum', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  await page.getByRole('radio', { name: 'ÅÅÅÅ-MM', exact: true }).click()
  await page.getByRole('button', { name: 'Tillämpa' }).click()

  // ÅÅÅÅ-MM är en sammanfattning och inte ett datum, så kolumnen behåller sin
  // datumtyp och rutnätet flaggar värdena — det är riktigt, de *är* inte datum.
  await expect(flaggadCell(page, '2026-08').first()).toBeVisible()
  await expect(cell(page, '2026-08-27')).toHaveCount(0)
})

test('otolkbara värden kan märkas i stället för att lämnas', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  await page.getByRole('radio', { name: 'Skriv OGILTIGT' }).click()
  await page.getByRole('button', { name: 'Tillämpa' }).click()

  // Båda de otolkbara värdena märks, inte bara det ena.
  await expect(flaggadCell(page, 'OGILTIGT')).toHaveCount(2)
  await expect(cell(page, 'i går')).toHaveCount(0)
  await expect(cell(page, '45231')).toHaveCount(0)
})

test('Avbryt lämnar kolumnen precis som den var', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  await page.getByRole('button', { name: 'Avbryt' }).click()

  await expect(page.locator('.verktyg')).toHaveCount(0)
  await expect(page.locator('.rutnat__cell--forhand')).toHaveCount(0)
  await expect(cell(page, '27/08/2026')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ångra/ })).toBeDisabled()
})

test('lägger datumet i en ny kolumn och låter originalet stå kvar', async ({ page }) => {
  await oppnaExempel(page)
  await oppnaDatumverktyget(page)

  await page.getByRole('checkbox', { name: /ny kolumn/ }).check()

  // Namnet följer målformatet tills man skriver något eget.
  const namnfalt = page.getByLabel('Namn på den nya kolumnen')
  await expect(namnfalt).toHaveValue('Registrerad (ÅÅÅÅ-MM-DD)')
  await page.getByRole('radio', { name: 'ÅÅÅÅ-MM', exact: true }).click()
  await expect(namnfalt).toHaveValue('Registrerad (ÅÅÅÅ-MM)')
  await page.getByRole('radio', { name: 'ÅÅÅÅ-MM-DD', exact: true }).click()
  await namnfalt.fill('Datum')

  // Spökkolumnen visar vad som kommer, ingenting är ändrat än.
  const spoke = page.locator('.rubrik--spoke')
  await expect(spoke).toContainText('Datum')
  await expect(page.locator('.rutnat__cell--spoke').first()).toHaveText('2026-08-27')
  await expect(page.locator('.rutnat__cell--forhand-andrad')).toHaveCount(0)

  // Panelen säger vad de otolkbara raderna får i den nya kolumnen.
  await expect(page.locator('.verktyg')).toContainText(
    'De 2 raderna får originalvärdet oförändrat i Datum.',
  )

  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()

  await expect(page.locator('.rubrik[title="Datum"]')).toBeVisible()
  // Originalet med klockslag står kvar bredvid det rena datumet.
  await expect(cell(page, '2026-08-27 12:55').first()).toBeVisible()
  await expect(cell(page, '2026-08-27').first()).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('9 kolumner')

  await page.keyboard.press('Control+z')
  await expect(page.locator('.rubrik[title="Datum"]')).toHaveCount(0)
  await expect(page.locator('.statusrad')).toContainText('8 kolumner')
})
