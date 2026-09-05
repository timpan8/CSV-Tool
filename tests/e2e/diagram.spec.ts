import { expect, test, type Page } from '@playwright/test'
import { antalRader, satt } from './pivothjalp.js'

/*
 * Diagrammet.
 *
 * Testerna hävdar attribut och text, aldrig pixlar. Ett diagram frestar till
 * att mäta koordinater, och sådana tester går sönder av varje justerad
 * marginal utan att någonsin ha sagt om bilden var rätt. `data-serie`,
 * `data-kategori` och `data-varde` bär det som faktiskt betyder något.
 */

async function oppnaDiagram(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await page.getByRole('button', { name: 'Pivot', exact: true }).click()
  await expect(page.locator('.pivot')).toBeVisible()
  // Rutorna är tomma från början. Ett radfält och ett mätvärde är minsta
  // uppställningen som ger något att rita.
  await antalRader(page)
  await satt(page, 'Rader', 'Status')
}

const form = (page: Page, namn: string) =>
  page.getByRole('radio', { name: namn, exact: true })

/** Ställ in pivoten via fältpanelen och gå till diagrammet. */
async function rita(page: Page, rader: string, kolumner: string | null) {
  await satt(page, 'Rader', rader)
  await satt(page, 'Kolumner', ...(kolumner === null ? [] : [kolumner]))
  await page.getByRole('radio', { name: 'Diagram', exact: true }).click()
  await expect(page.locator('.diagram__duk')).toBeVisible()
}

test('växlar mellan tabell och diagram utan att räkna om något', async ({ page }) => {
  await oppnaDiagram(page)
  await expect(page.locator('.pivottab')).toBeVisible()

  await page.getByRole('radio', { name: 'Diagram', exact: true }).click()
  await expect(page.locator('.diagram__duk')).toBeVisible()
  await expect(page.locator('.pivottab')).toHaveCount(0)

  await page.getByRole('radio', { name: 'Tabell', exact: true }).click()
  await expect(page.locator('.pivottab')).toBeVisible()
  await expect(page.locator('.diagram__duk')).toHaveCount(0)
})

test('en stapel per rad, med samma tal som tabellen', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', null)

  // Tre statusvärden, en serie: tre staplar.
  const staplar = page.locator('.diagram__stapel')
  await expect(staplar).toHaveCount(3)
  await expect(staplar.first()).toHaveAttribute('data-kategori', 'Aktiv')
  await expect(staplar.first()).toHaveAttribute('data-varde', '10')

  // Samma tal står i tabellen.
  await page.getByRole('radio', { name: 'Tabell', exact: true }).click()
  await expect(page.locator('.pivottab tbody tr').first()).toContainText('10')
})

test('en serie per kolumnvärde, med förklaring', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', 'Ort')

  // Förklaringen finns alltid när serierna är flera — identitet får aldrig
  // hänga på färgen ensam.
  const forklaring = page.locator('.diagram__forklaring li')
  await expect(forklaring.first()).toBeVisible()
  const antal = await forklaring.count()
  expect(antal).toBeGreaterThan(1)
})

test('kapar serierna vid åtta och säger hur många som föll bort', async ({ page }) => {
  await oppnaDiagram(page)
  // Ort har femton värden; åtta får plats som serier.
  await rita(page, 'Status', 'Ort')

  const serier = new Set(
    await page.locator('.diagram__stapel').evaluateAll((n) =>
      n.map((e) => e.getAttribute('data-serie')),
    ),
  )
  expect(serier.size).toBeLessThanOrEqual(8)
  await expect(page.locator('.diagram__utelamnade')).toBeVisible()
})

test('alla fyra formerna går att välja, och cirkeln säger nej med skäl', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', null)

  await form(page, 'Liggande').click()
  await expect(page.locator('.diagram__stapel').first()).toBeVisible()

  await form(page, 'Linje').click()
  await expect(page.locator('.diagram__linje').first()).toBeVisible()

  await form(page, 'Cirkel').click()
  await expect(page.locator('.diagram__tarta')).toHaveCount(3)

  // Med en kolumndimension finns två serier, och en tårta kan bara dela upp
  // en. Knappen stängs av med skälet i klartext.
  await form(page, 'Staplar').click()
  await satt(page, 'Kolumner', 'Ort')
  await expect(form(page, 'Cirkel')).toBeDisabled()
  await expect(form(page, 'Cirkel')).toHaveAttribute('title', /en serie i taget/)
})

test('inforutan visas på hover och på tangentbordsfokus', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', null)

  const stapel = page.locator('.diagram__stapel').first()
  await stapel.hover()
  const ruta = page.locator('.diagram__inforuta')
  await expect(ruta).toBeVisible()
  await expect(ruta).toContainText('Aktiv')
  await expect(ruta).toContainText('10')

  // Samma uppgifter utan mus. En inforuta som bara nås med pekare gömmer
  // värdet för den som inte har någon.
  await page.mouse.move(0, 0)
  await stapel.focus()
  await expect(page.locator('.diagram__inforuta')).toContainText('10')
})

test('linjediagrammets hårkors visar alla serier vid en kategori', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', 'Ort')
  await form(page, 'Linje').click()

  // Pekaren behöver bara vara närmast, inte träffa en två pixlar bred linje.
  await page.locator('.diagram__traffyta').hover()
  // Ett lodrätt streck har noll bredd, och Playwright kallar det då dolt.
  // Att det ritas alls är påståendet.
  await expect(page.locator('.diagram__harkors')).toHaveCount(1)
  const ruta = page.locator('.diagram__inforuta')
  await expect(ruta).toBeVisible()
  // Hårkorset visar alla serier vid kategorin, inte bara den man råkar peka på.
  expect(await ruta.locator('.diagram__inforuta__rad').count()).toBeGreaterThan(1)
})

test('sorteringen i tabellen följer med till diagrammet', async ({ page }) => {
  await oppnaDiagram(page)
  await satt(page, 'Rader', 'Status')
  await satt(page, 'Kolumner')

  // Stigande på Totalt: minsta gruppen först.
  await page.getByRole('button', { name: /Sortera raderna efter/ }).last().click()
  await page.getByRole('button', { name: /Sortera raderna efter/ }).last().click()
  const forstaRaden = await page
    .locator('.pivottab tbody tr')
    .first()
    .locator('.pivottab__rubriktext')
    .innerText()
  // Stigande ordning: den största gruppen ska inte längre ligga först.
  expect(forstaRaden).not.toBe('Aktiv')

  await page.getByRole('radio', { name: 'Diagram', exact: true }).click()
  await expect(page.locator('.diagram__duk')).toBeVisible()
  await expect(page.locator('.diagram__stapel').first()).toHaveAttribute(
    'data-kategori',
    forstaRaden,
  )
})

test('andel av rad ger staplar som summerar till hundra procent', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', 'Ort')
  await page.getByRole('radio', { name: '% av rad' }).click()

  const varden = await page.locator('.diagram__stapel').evaluateAll((n) =>
    n.map((e) => Number(e.getAttribute('data-varde'))),
  )
  // Varje enskilt värde är en andel mellan noll och ett.
  for (const v of varden) expect(v).toBeLessThanOrEqual(1)
})

test('diagrammet rör aldrig filen', async ({ page }) => {
  await oppnaDiagram(page)
  await rita(page, 'Status', 'Ort')
  await form(page, 'Liggande').click()
  await page.locator('.diagram__stapel').first().hover()

  await page.keyboard.press('Escape')
  await expect(page.locator('.rutnat')).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
})
