import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Skriver om Registrerad till ÅÅÅÅ-MM-DD — ett steg som går att köra om. */
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

async function skrivOmDatum(page: Page) {
  await oppnaUrKolumnmenyn(page, 'Registrerad', 'Datum…')
  await page.getByRole('button', { name: 'Tillämpa' }).click()
  await expect(page.locator('.verktyg')).toHaveCount(0)
}

/** Nästa månads fil: samma rubriker, nytt innehåll, samma stök. */
const NASTA_MANAD = [
  'Kundnr;Namn;E-post;Registrerad;Postnr;Ort;Belopp;Status',
  '20001;Petra Sund;petra.sund@x.se;01/09/2026;11122;Stockholm;500,00;Aktiv',
  '20002;Hans Vik;hans.vik@x.se;2026-09-02 08:15;41103;Göteborg;750,50;Aktiv',
  '',
].join('\r\n')

async function oppnaNastaManad(page: Page) {
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'september.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(NASTA_MANAD, 'utf-8'),
  })
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
}

/** Fotens stängknapp. Både fliken och modalen har en som heter Stäng. */
const stangDialogen = (page: Page) =>
  page.locator('.modal__fot').getByRole('button', { name: 'Stäng' }).click()

const oppnaProfiler = async (page: Page) => {
  await page.getByRole('button', { name: 'Profiler…' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('visar vad som gjorts och vad av det som går att köra om', async ({ page }) => {
  await oppnaExempel(page)
  await skrivOmDatum(page)

  // En handredigerad cell pekar på en rad i just den här filen.
  await page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true }).first().dblclick()
  await page.locator('.rutnat__redigering').fill('Anna Karlsson-Berg')
  await page.locator('.rutnat__redigering').press('Enter')

  await oppnaProfiler(page)
  const steg = page.locator('.profilsteg__rad')
  await expect(steg).toHaveCount(2)
  await expect(steg.nth(0)).toContainText('Skriv om Registrerad till ÅÅÅÅ-MM-DD')
  await expect(steg.nth(1)).toHaveClass(/profilsteg__rad--av/)
  await expect(steg.nth(1)).toContainText('hör till den här filen')
  await expect(steg.nth(1).locator('input')).toBeDisabled()
})

test('en sparad profil kör om arbetsgången på nästa månads fil', async ({ page }) => {
  await oppnaExempel(page)
  await skrivOmDatum(page)

  await oppnaProfiler(page)
  await page.getByLabel('Namn på profilen').fill('Månadsfilen')
  await page.getByRole('button', { name: /Spara \d+ steg/ }).click()
  await expect(page.locator('.profil')).toContainText('Månadsfilen')
  await stangDialogen(page)

  await oppnaNastaManad(page)
  // Nya filen har datumen skrivna på två olika sätt.
  await expect(page.getByRole('gridcell', { name: '01/09/2026', exact: true })).toBeVisible()

  await oppnaProfiler(page)
  await page.getByRole('button', { name: 'Kör' }).click()

  await expect(page.getByRole('dialog')).toContainText('Alla 1 steg kördes')
  await stangDialogen(page)
  await expect(page.getByRole('gridcell', { name: '2026-09-01', exact: true })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: '2026-09-02', exact: true })).toBeVisible()
})

test('säger vilken kolumn som saknas i stället för att skriva om fel kolumn', async ({ page }) => {
  await oppnaExempel(page)
  await skrivOmDatum(page)

  await oppnaProfiler(page)
  await page.getByLabel('Namn på profilen').fill('Månadsfilen')
  await page.getByRole('button', { name: /Spara \d+ steg/ }).click()
  await stangDialogen(page)

  // En fil utan kolumnen Registrerad.
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'annan.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Kundnr;Namn\r\n1;Anna\r\n', 'utf-8'),
  })
  await page.getByRole('button', { name: 'Öppna filen' }).click()

  await oppnaProfiler(page)
  // Varningen står redan vid profilen, innan man kört den.
  await expect(page.locator('.profil__saknade')).toContainText('Registrerad')

  await page.getByRole('button', { name: 'Kör' }).click()
  await expect(page.getByRole('dialog')).toContainText('hittade inte sin kolumn')
  await expect(page.getByRole('dialog')).toContainText('0 av 1 steg kördes')
})

test('profiler går att spara till fil', async ({ page }) => {
  await oppnaExempel(page)
  await skrivOmDatum(page)
  await oppnaProfiler(page)
  await page.getByLabel('Namn på profilen').fill('Månadsfilen')
  await page.getByRole('button', { name: /Spara \d+ steg/ }).click()

  const nedladdning = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Spara till fil' }).click()
  const fil = await nedladdning
  expect(fil.suggestedFilename()).toBe('csv-verkstan-profiler.json')

  const strom = await fil.createReadStream()
  const bitar: Buffer[] = []
  for await (const bit of strom) bitar.push(bit as Buffer)
  const data = JSON.parse(Buffer.concat(bitar).toString('utf-8'))
  expect(data.format).toBe('csv-verkstan-profil')
  expect(data.profiler[0].namn).toBe('Månadsfilen')
  expect(data.profiler[0].steg[0].typ).toBe('datum')
})
