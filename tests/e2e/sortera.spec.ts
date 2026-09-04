import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Cellinnehållet i en kolumn, i visningsordning. */
async function kolumn(page: Page, index: number): Promise<string[]> {
  return page.evaluate((i) => {
    const rader = Array.from(document.querySelectorAll('.rutnat__rad'))
    return rader.map((rad) => rad.querySelectorAll('.rutnat__cell')[i]?.textContent?.trim() ?? '')
  }, index)
}

const sortpil = (page: Page, kolumnnamn: string) =>
  page.getByRole('button', { name: new RegExp(`Sorter\\w+ (på )?${kolumnnamn}`) })

test('sorterar en kolumn med svensk ordning', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()

  const orter = await kolumn(page, 5)
  expect(orter[0]).toBe('Boden')
  expect(orter[orter.length - 1]).toBe('Örebro')
  // Å, ä och ö efter z — och Västerås före Växjö.
  expect(orter.indexOf('Västerås')).toBeLessThan(orter.indexOf('Växjö'))
  expect(orter.indexOf('Umeå')).toBeLessThan(orter.indexOf('Örebro'))

  await expect(page.locator('.statusrad')).toContainText('Sorterat: Ort ↑')
  // Sortering döljer inga rader, så den ska inte tända radbegränsningen.
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.getByRole('button', { name: 'Visa alla rader' })).toHaveCount(0)
})

test('vänder riktningen vid andra klicket', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()
  await sortpil(page, 'Ort').click()

  const orter = await kolumn(page, 5)
  expect(orter[0]).toBe('Örebro')
  await expect(page.locator('.statusrad')).toContainText('Sorterat: Ort ↓')
})

test('skift-klick bygger en andra nivå', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Status').click()
  await sortpil(page, 'Ort').click({ modifiers: ['Shift'] })

  await expect(page.locator('.statusrad')).toContainText('Sorterat: Status ↑, Ort ↑')

  // Inom varje status ska orterna ligga i bokstavsordning.
  const status = await kolumn(page, 7)
  const orter = await kolumn(page, 5)
  const aktiva = orter.filter((_, i) => status[i] === 'Aktiv')
  expect(aktiva).toEqual([...aktiva].sort((a, b) => a.localeCompare(b, 'sv')))
})

test('sorterar tal numeriskt och lägger tomma sist', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Belopp').click()

  const belopp = await kolumn(page, 6)
  expect(belopp[0]).toBe('98,00')
  // Ida Ängström har tomt belopp — tomma hamnar sist, inte först.
  expect(belopp[belopp.length - 1]).toBe('')
  // Textordning skulle lagt 1 240,50 före 980,00.
  expect(belopp.indexOf('980,00')).toBeLessThan(belopp.indexOf('1 240,50'))
})

test('ordningen fryses när man rättar en cell', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()
  expect((await kolumn(page, 5))[0]).toBe('Boden')

  // Döp om Boden till Ystad. Raden ska ligga kvar där den är.
  await page.getByRole('gridcell', { name: 'Boden', exact: true }).dblclick()
  const falt = page.locator('.rutnat__redigering')
  await falt.fill('Ystad')
  await falt.press('Enter')

  expect((await kolumn(page, 5))[0]).toBe('Ystad')
  await expect(page.locator('.sortchip--inaktuell')).toBeVisible()

  await page.getByRole('button', { name: 'Sortera om' }).click()
  // Utan Boden är Göteborg först, och Ystad har flyttat till slutet.
  const efter = await kolumn(page, 5)
  expect(efter[0]).toBe('Göteborg')
  expect(efter[efter.length - 1]).toBe('Örebro')
  expect(efter.indexOf('Ystad')).toBeGreaterThan(efter.indexOf('Växjö'))
  await expect(page.locator('.sortchip--inaktuell')).toHaveCount(0)
})

test('en ändring i en annan kolumn gör inte ordningen inaktuell', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()

  await page.getByRole('gridcell', { name: 'Zlatan Ek', exact: true }).dblclick()
  const falt = page.locator('.rutnat__redigering')
  await falt.fill('Zlatan Eek')
  await falt.press('Enter')

  // Namn ingår inte i sorteringen — banderollen får inte ljuga.
  await expect(page.locator('.sortchip--inaktuell')).toHaveCount(0)
  await expect(page.locator('.statusrad')).toContainText('Sorterat: Ort ↑')
})

test('sorteringen överlever en sökning som en delföljd', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()

  await page.keyboard.press('Control+f')
  await page.locator('.sokrad input').fill('nordbygg')
  await expect(page.locator('.statusrad')).toContainText('av 16 rader')

  const orter = await kolumn(page, 5)
  expect(orter).toEqual([...orter].sort((a, b) => a.localeCompare(b, 'sv')))
})

test('ta bort sorteringen ger tillbaka filens ordning', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()
  await page.getByRole('button', { name: 'Ta bort sorteringen' }).click()

  expect((await kolumn(page, 5))[0]).toBe('Malmö')
  await expect(page.locator('.sortchip')).toHaveCount(0)
})

test('sorteringspanelen visar nivåerna och kan ta bort dem', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()
  await page.getByRole('button', { name: /^Sortera \(1\)$/ }).click()

  const panel = page.locator('.verktyg')
  await expect(panel).toContainText('1 nivå')
  await page.getByRole('button', { name: '＋ Lägg till nivå' }).click()
  await expect(page.locator('.statusrad')).toContainText('Sorterat: Ort ↑, Kundnr ↑')

  await page.getByRole('button', { name: /Ta bort nivån/ }).first().click()
  await expect(page.locator('.statusrad')).toContainText('Sorterat: Kundnr ↑')
})

test('export av alla rader följer sorteringen', async ({ page }) => {
  await oppnaExempel(page)
  await sortpil(page, 'Ort').click()

  await page.getByRole('button', { name: 'Exportera' }).click()
  await page.getByRole('radio', { name: 'CSV, komma + UTF-8' }).click()
  await page.getByRole('radio', { name: /^Alla \(16\)$/ }).click()

  const [nedladdning] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ladda ner' }).click(),
  ])
  const strom = await nedladdning.createReadStream()
  const bitar: Buffer[] = []
  for await (const bit of strom) bitar.push(bit as Buffer)
  const rader = Buffer.concat(bitar).toString('utf-8').split('\n')

  // Utan ordningen skulle den första dataraden vara Malmö, som i filen.
  expect(rader[1]).toContain('Boden')
})

test('pilen säger om kolumnen är sorterad eller bara går att sortera', async ({ page }) => {
  /*
   * Förut var tecknet ↑ även när kolumnen inte var sorterad. Pilen syns
   * alltid på den aktiva kolumnen, så ett klick på rubriknamnet — som bara
   * *markerar* kolumnen — lämnade ett ↑ efter sig. Då läser man filens egen
   * ordning som en sorterad ordning.
   */
  await oppnaExempel(page)
  const pil = sortpil(page, 'Ort')

  // Markera kolumnen genom att klicka på namnet. Ingen sortering ska ske.
  await page.locator('.rubrik').filter({ hasText: 'Ort' }).locator('.rubrik__namn span').click()
  await expect(pil).toHaveText('↕')
  await expect(page.locator('.statusrad')).not.toContainText('Sorterat')

  await pil.click()
  await expect(pil).toHaveText('↑')
  await pil.click()
  await expect(pil).toHaveText('↓')

  // Och när sorteringen tas bort går tecknet tillbaka.
  await page.locator('.sortchip__stang').click()
  await expect(pil).toHaveText('↕')
})
