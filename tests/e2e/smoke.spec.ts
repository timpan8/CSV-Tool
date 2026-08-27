import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const FIXTUR = fileURLToPath(new URL('../fixtures/semikolon-cp1252-crlf.csv', import.meta.url))

test('öppnar en svensk Excel-export och behåller å ä ö genom hela kedjan', async ({ page }) => {
  // Integritetslöftet testas, inte bara påstås: ingen begäran får gå utanför
  // appens eget ursprung under hela körningen.
  const utanfor: string[] = []
  page.on('request', (req) => {
    if (!req.url().startsWith('http://127.0.0.1:4173') && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
      utanfor.push(req.url())
    }
  })

  await page.goto('/')
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()

  await page.locator('input[type=file]').first().setInputFiles(FIXTUR)

  // Importdialogen ska ha gissat rätt och sagt det på svenska.
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Semikolon/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radio', { name: 'Windows-1252' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/Ser rätt ut/)).toBeVisible()
  await expect(page.getByText(/svenska tecken visas korrekt/)).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Åsa Öhman' })).toBeVisible()

  await page.getByRole('button', { name: 'Öppna filen' }).click()

  // Rutnätet visar svenska tecken korrekt.
  await expect(page.getByRole('columnheader', { name: /Registrerad/ })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'Björn Åkesson' })).toBeVisible()
  await expect(page.locator('.statusrad')).toContainText('5 rader')

  // Ledande nolla i postnummer överlever.
  await expect(page.getByRole('gridcell', { name: '01234', exact: true })).toBeVisible()

  // Flytta en kolumn och kontrollera att steget hamnar i historiken.
  const rubriker = page.locator('.rubrik__namn span')
  await expect(rubriker.first()).toHaveText('Kundnr')
  await page.locator('.kolrad').filter({ hasText: 'E-post' }).locator('.kolrad__oga').click()
  await expect(page.getByText(/Dolde kolumnen E-post/)).toBeVisible()

  // Ångra tar tillbaka den.
  await page.getByRole('button', { name: /Ångra/ }).click()
  await expect(page.locator('.rubrik__namn span').filter({ hasText: 'E-post' })).toBeVisible()

  expect(utanfor, `Anrop utanför appens ursprung: ${utanfor.join(', ')}`).toEqual([])
})

test('exporterar Excel-vänlig CSV med BOM och semikolon', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(FIXTUR)
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('5 rader')

  await page.getByRole('button', { name: 'Exportera' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // Excel-formatet är förvalt eftersom det är det enda som skyddar ledande
  // nollor. Här testar vi CSV-vägen och väljer den uttryckligen.
  await page.getByRole('radio', { name: 'CSV, Excel-vänlig' }).click()

  const nedladdning = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Ladda ner' }).click()
  const fil = await nedladdning
  const sokvag = await fil.path()
  const bytes = readFileSync(sokvag)

  // BOM först, annars visar Excel å ä ö som skräp.
  expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
  const text = bytes.subarray(3).toString('utf8')
  expect(text.split('\r\n')[0]).toBe('Kundnr;Namn;E-post;Registrerad;Postnr;Ort;Belopp')
  expect(text).toContain('Åsa Öhman')
  expect(text).toContain(';01234;')
})

test('samma fil två gånger sägs rakt ut', async ({ page }) => {
  const csv = 'Ort;Antal\r\nMalmö;1\r\nLund;2\r\n'
  const fil = { name: 'orter.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }

  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(fil)
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('2 rader')

  // Samma innehåll igen — ett vanligt misstag när exporter hämtas ur flera
  // system. Det sägs som en varning, inte som en fråga som står i vägen.
  await page.locator('input[type=file]').first().setInputFiles(fil)
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.toast--varning')).toContainText('Identisk med ”orter.csv”')
  await expect(page.locator('.flik')).toHaveCount(2)
})
