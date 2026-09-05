import { expect, test, type Page } from '@playwright/test'

/**
 * Den levande mallen.
 *
 * Poängen är att kolumnen **inte** räknar om sig själv. Testet kontrollerar
 * därför två saker som hör ihop: att den säger till när den släpat efter, och
 * att den står kvar tills man klickar.
 */

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

const cell = (page: Page, text: string) => page.getByRole('gridcell', { name: text, exact: true })

async function oppnaUrKolumnmenyn(page: Page, kolumn: string, post: string) {
  await page.getByRole('button', { name: `Meny för kolumnen ${kolumn}` }).click()
  const direkt = page.getByRole('menuitem', { name: post })
  if ((await direkt.count()) === 0) {
    await page.getByRole('menuitem', { name: 'Fler verktyg' }).hover()
  }
  await page.getByRole('menuitem', { name: post }).first().click()
}

/** Bygger en mallkolumn ur Namn och lämnar den skapad. */
async function byggMallkolumn(page: Page) {
  await oppnaUrKolumnmenyn(page, 'Namn', 'Bygg kolumn ur mall…')
  await expect(page.locator('.verktyg')).toBeVisible()
  const mallfalt = page.locator('.verktyg .falt', { hasText: 'Mall' }).locator('input').first()
  await mallfalt.fill("('{Namn}'),")
  const namnfalt = page
    .locator('.verktyg .falt', { hasText: 'Namn på den nya kolumnen' })
    .locator('input')
  await namnfalt.fill('SQL')
  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()
  await expect(cell(page, "('Anna Karlsson'),").first()).toBeVisible()
}

test('mallkolumnen säger till när källan ändrats, och står kvar tills man klickar', async ({
  page,
}) => {
  await oppnaExempel(page)
  await byggMallkolumn(page)

  // Färsk kolumn: märket finns, men inget chip och ingen varningston.
  await expect(page.locator('.mallbricka')).toHaveCount(1)
  await expect(page.locator('.mallbricka--inaktuell')).toHaveCount(0)
  await expect(page.locator('.statusrad')).not.toContainText('inaktuell')

  // Ändra källan.
  await cell(page, 'Anna Karlsson').first().dblclick()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Anna Ny')
  await page.keyboard.press('Enter')

  // Nu säger den till — och värdet står kvar som det var.
  await expect(page.locator('.mallbricka--inaktuell')).toHaveCount(1)
  await expect(page.locator('.statusrad')).toContainText('SQL är inaktuell')
  await expect(cell(page, "('Anna Karlsson'),").first()).toBeVisible()

  // Ett klick fyller den på nytt.
  await page.getByRole('button', { name: 'Uppdatera', exact: true }).click()
  await expect(cell(page, "('Anna Ny'),")).toBeVisible()
  await expect(page.locator('.mallbricka--inaktuell')).toHaveCount(0)

  // Och uppdateringen är ett enda ångra-steg.
  await page.keyboard.press('Control+z')
  await expect(cell(page, "('Anna Karlsson'),").first()).toBeVisible()
  await expect(page.locator('.mallbricka--inaktuell')).toHaveCount(1)
})

test('den senast använda mallen ligger kvar, även efter en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await byggMallkolumn(page)

  // En annan kolumn: fältet är förifyllt med den mall som just kördes, inte
  // med kolumnens eget namn.
  await oppnaUrKolumnmenyn(page, 'Ort', 'Bygg kolumn ur mall…')
  const mallfalt = page.locator('.verktyg .falt', { hasText: 'Mall' }).locator('input').first()
  await expect(mallfalt).toHaveValue("('{Namn}'),")
  await page.getByRole('button', { name: 'Avbryt' }).click()

  // Och den överlever att sidan laddas om.
  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await oppnaUrKolumnmenyn(page, 'Ort', 'Bygg kolumn ur mall…')
  await expect(mallfalt).toHaveValue("('{Namn}'),")
})

test('ett chip fyller fältet med en tidigare mall', async ({ page }) => {
  await oppnaExempel(page)
  await byggMallkolumn(page)

  await oppnaUrKolumnmenyn(page, 'Ort', 'Bygg kolumn ur mall…')
  const mallfalt = page.locator('.verktyg .falt', { hasText: 'Mall' }).locator('input').first()

  // Kör en andra, annorlunda mall — nu finns det något att välja mellan.
  await mallfalt.fill('{Ort} ({Namn})')
  await page.getByRole('button', { name: 'Skapa kolumnen' }).click()

  await oppnaUrKolumnmenyn(page, 'Postnr', 'Bygg kolumn ur mall…')
  const senaste = page.locator('.verktyg .falt', { hasText: 'Senast använda' })
  // Den som redan står i fältet erbjuds inte — bara den föregående.
  await expect(senaste.locator('.val__knapp')).toHaveCount(1)
  await senaste.locator('.val__knapp').click()
  await expect(mallfalt).toHaveValue("('{Namn}'),")
})

test('en omdöpt källkolumn tar mallen med sig', async ({ page }) => {
  await oppnaExempel(page)
  await byggMallkolumn(page)

  page.once('dialog', (d) => void d.accept('Kund'))
  await oppnaUrKolumnmenyn(page, 'Namn', 'Byt namn…')
  await expect(page.locator('.rubrik[title="Kund"]')).toHaveCount(1)

  // Mallen läser den omdöpta kolumnen, alltså går den fortfarande att köra.
  await page.getByRole('button', { name: 'Meny för kolumnen SQL' }).click()
  await expect(page.getByRole('menuitem', { name: /Ändra mallen/ })).toContainText('{Kund}')
})

test('släpp mallen lämnar värdena kvar', async ({ page }) => {
  await oppnaExempel(page)
  await byggMallkolumn(page)

  await page.getByRole('button', { name: 'Meny för kolumnen SQL' }).click()
  await page.getByRole('menuitem', { name: /Släpp mallen/ }).click()

  await expect(page.locator('.mallbricka')).toHaveCount(0)
  await expect(cell(page, "('Anna Karlsson'),").first()).toBeVisible()
})
