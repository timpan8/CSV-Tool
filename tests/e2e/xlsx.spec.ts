import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

const FIXTUR = fileURLToPath(new URL('../fixtures/kunder.xlsx', import.meta.url))

test('öppnar en Excel-fil och behåller å ä ö, ledande nollor och datum', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(FIXTUR)

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Excel-filer har ingen råtext, och det ska sägas rakt ut i stället för att
  // presenteras som en bekräftad teckenkodning.
  await expect(dialog).toContainText('typade värden, inte text')
  await expect(dialog).toContainText('Decimaltecken för tal')
  await expect(dialog.getByRole('cell', { name: 'Åsa Öberg' })).toBeVisible()

  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('4 rader')

  await expect(page.getByRole('gridcell', { name: 'Björn Åkesson', exact: true })).toBeVisible()
  // Ledande nolla överlevde vägen genom Excel-formatet.
  await expect(page.getByRole('gridcell', { name: '01234', exact: true })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: '00700', exact: true })).toBeVisible()
  // Datumet blev rätt dag, inte dagen före.
  await expect(page.getByRole('gridcell', { name: '2026-08-27', exact: true })).toBeVisible()
  // Talet skrevs om med decimalkomma, som svenskt Excel förväntar sig.
  await expect(page.getByRole('gridcell', { name: '1240,5', exact: true })).toBeVisible()
})

test('exporterar till Excel med tal som tal och text som text', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(FIXTUR)
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('4 rader')

  await page.getByRole('button', { name: 'Exportera' }).click()
  await expect(page.getByRole('radio', { name: 'Excel-fil (.xlsx)' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  const nedladdning = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Ladda ner' }).click()
  const fil = await nedladdning
  expect(fil.suggestedFilename()).toMatch(/\.xlsx$/)

  const bytes = readFileSync(await fil.path())
  // En xlsx är en zip. Kontrollera arkivets signatur och bladets innehåll.
  expect(Array.from(bytes.subarray(0, 2))).toEqual([0x50, 0x4b])
  const delar = unzipSync(new Uint8Array(bytes))
  const blad = strFromU8(delar['xl/worksheets/sheet1.xml']!)

  // Postnumret ska vara en textcell, annars gör Excel 01234 till 1234.
  expect(blad).toContain('<t xml:space="preserve">01234</t>')
  // Beloppet ska vara en talcell, annars fungerar inte SUMMA.
  expect(blad).toMatch(/<c r="F2"><v>1240\.5<\/v><\/c>/)
  expect(strFromU8(delar['xl/styles.xml']!)).toContain('yyyy')
})
