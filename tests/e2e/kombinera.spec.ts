import { expect, test, type Page } from '@playwright/test'

/** Öppnar exempelparet och går in i kombineringsvyn. */
async function oppnaKombinera(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Kombinera…' }).click()
  await expect(page.locator('.kombinera')).toBeVisible()
}

/** En rad i aliaskartan. `data-mal` är radens kontrakt mot testerna. */
const rad = (page: Page, namn: string) => page.locator(`.aliasrad[data-mal="${namn}"]`)

test('kolumner som betyder samma sak hamnar på samma rad', async ({ page }) => {
  await oppnaKombinera(page)

  // Namn ↔ Name och E-post ↔ mail är inte samma ord men samma sak.
  await expect(rad(page, 'Namn')).toContainText('finns i 2 av 2')
  await expect(rad(page, 'E-post')).toContainText('finns i 2 av 2')
  // Ort finns bara i kundfilen.
  await expect(rad(page, 'Ort')).toContainText('finns i 1 av 2')

  // Rutnätets egna rader hör till en tabell man inte längre tittar på.
  await expect(page.locator('.statusrad')).toHaveCount(0)
})

test('kolumner som bara finns i vissa filer spärrar körningen tills de beslutats', async ({
  page,
}) => {
  await oppnaKombinera(page)

  const kombinera = page.getByRole('button', { name: 'Kombinera', exact: true })
  await expect(kombinera).toBeDisabled()
  await expect(page.locator('.kombinera__fot')).toContainText('behöver ett beslut')
  await expect(page.locator('.aliasrad--obeslutad').first()).toBeVisible()

  // Ta med allt som är obeslutat.
  const taMed = page.getByRole('button', { name: 'Ta med', exact: true })
  while ((await taMed.count()) > 0) await taMed.first().click()

  await expect(page.locator('.aliasrad--obeslutad')).toHaveCount(0)
  await expect(kombinera).toBeEnabled()
})

test('staplar filerna och visar vilken fil varje rad kom från', async ({ page }) => {
  await oppnaKombinera(page)
  const taMed = page.getByRole('button', { name: 'Ta med', exact: true })
  while ((await taMed.count()) > 0) await taMed.first().click()

  // Förhandsvisningen bygger på riktigt, ur båda filerna.
  await expect(page.locator('.fortab')).toContainText('Anna Karlsson')

  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  // 16 kundrader + 14 orderrader.
  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(page.locator('.statusrad')).toContainText('30 rader')
  await expect(page.locator('.rubrik[title="Källa"]')).toBeVisible()
  await expect(
    page.getByRole('gridcell', { name: 'exempel-kunder.csv', exact: true }).first(),
  ).toBeVisible()
})

test('en kolumn som hoppas över finns inte i resultatet', async ({ page }) => {
  await oppnaKombinera(page)

  await rad(page, 'Summa').getByRole('button', { name: 'Hoppa över', exact: true }).click()
  await expect(rad(page, 'Summa')).toHaveClass(/aliasrad--av/)

  const taMed = page.getByRole('button', { name: 'Ta med', exact: true })
  while ((await taMed.count()) > 0) await taMed.first().click()
  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  // Rubrikens tillgängliga namn bär även sorterings- och menyknappen, så
  // titeln är den exakta kroken.
  await expect(page.locator('.rubrik[title="Summa"]')).toHaveCount(0)
  await expect(page.locator('.rubrik[title="Ort"]')).toBeVisible()
})

test('en ändrad koppling flyttar värdena till en annan spalt', async ({ page }) => {
  await oppnaKombinera(page)

  // Koppla loss orderfilens namnkolumn: då blir Namn tom för orderraderna.
  await rad(page, 'Namn')
    .getByLabel('Namn ur exempel-order.csv')
    .selectOption({ label: '— tomt —' })
  await expect(rad(page, 'Namn')).toContainText('finns i 1 av 2')

  const taMed = page.getByRole('button', { name: 'Ta med', exact: true })
  while ((await taMed.count()) > 0) await taMed.first().click()
  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  await expect(page.locator('.statusrad')).toContainText('30 rader')
  await expect(page.getByRole('gridcell', { name: 'Petra Sund', exact: true })).toHaveCount(0)
})

/** Öppnar exempelmallen inifrån kombineringsvyn och väljer den som målform. */
async function valjExempelmall(page: Page) {
  await page.getByRole('button', { name: 'Exempelmall' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.getByLabel('Målform')).toHaveValue(/.+/)
}

test('en mallfil bestämmer resultatets form', async ({ page }) => {
  await oppnaKombinera(page)
  await valjExempelmall(page)

  // Mallens rubriker, i mallens ordning, före de kolumner mallen inte har.
  const rader = page.locator('.aliasrad')
  await expect(rader.nth(0)).toHaveAttribute('data-mal', 'Namn')
  await expect(rader.nth(1)).toHaveAttribute('data-mal', 'E-post')
  await expect(rader.nth(2)).toHaveAttribute('data-mal', 'Ort')
  await expect(rader.nth(3)).toHaveAttribute('data-mal', 'Land')

  // Exempelraden är en ledtråd om vad kolumnen ska innehålla — inte data.
  await expect(rad(page, 'Namn')).toContainText('t.ex. Anna Karlsson')
  await expect(page.locator('.kombinera__kropp')).toContainText(
    'är exempel och tas inte med i resultatet',
  )

  // Land finns i mallen men i ingen fil, och det ska sägas före körningen —
  // både som siffra i toppen och på den rad det gäller.
  await expect(page.locator('.vytal')).toContainText('blir tomma')
  await expect(rad(page, 'Land')).toContainText('Blir tom i hela resultatet')
})

test('mallen får inte bli ett tyst filter', async ({ page }) => {
  await oppnaKombinera(page)
  await valjExempelmall(page)

  // Mallens egna kolumner behöver inga beslut — mallen är beslutet.
  await expect(rad(page, 'Ort')).not.toHaveClass(/aliasrad--obeslutad/)
  // Men kolumner som finns i filerna och inte i mallen kastas inte tyst.
  await expect(rad(page, 'Belopp')).toHaveClass(/aliasrad--obeslutad/)
  await expect(rad(page, 'Summa')).toHaveClass(/aliasrad--obeslutad/)
  await expect(page.getByRole('button', { name: 'Kombinera', exact: true })).toBeDisabled()
})

test('mallens form fylls med data ur båda filerna', async ({ page }) => {
  await oppnaKombinera(page)
  await valjExempelmall(page)

  const hoppaOver = page.getByRole('button', { name: 'Hoppa över', exact: true })
  while ((await hoppaOver.count()) > 0) await hoppaOver.first().click()
  await page.getByRole('button', { name: 'Kombinera', exact: true }).click()

  // 16 kundrader + 14 orderrader. Mallens exempelrad är inte med.
  await expect(page.locator('.statusrad')).toContainText('30 rader')
  await expect(page.locator('.rubrik[title="Land"]')).toBeVisible()
  await expect(page.locator('.rubrik[title="Belopp"]')).toHaveCount(0)
  await expect(page.getByRole('gridcell', { name: 'Petra Sund', exact: true })).toBeVisible()
})

async function oppnaTvaFiler(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
}

test('mallvägen har en egen ingång i verktygsraden', async ({ page }) => {
  await oppnaTvaFiler(page)
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()

  // De tre sätten står under varandra med en rad som säger vad som händer.
  const meny = page.locator('.meny').first()
  await expect(meny).toContainText('sida vid sida')
  await expect(meny).toContainText('på varandra')
  await expect(meny).toContainText('bara rubriker')

  await meny.getByRole('menuitem', { name: 'Fyll en mall med data…' }).click()
  await expect(page.locator('.kombinera')).toBeVisible()
  // Målformen är det man kom för, så den tar fokus.
  await expect(page.getByLabel('Målform')).toBeFocused()
})

test('målformen står överst, före listan med filer', async ({ page }) => {
  await oppnaKombinera(page)

  const panel = page.locator('.kombinera .panel').first()
  const malform = await panel.getByLabel('Målform').boundingBox()
  const forstaFilen = await panel.locator('.kollista .kryss').first().boundingBox()
  expect(malform!.y).toBeLessThan(forstaFilen!.y)
})

test('massbesluten svarar på alla frågor och tar tillbaka svaren', async ({ page }) => {
  await oppnaKombinera(page)
  const obeslutade = page.locator('.aliasrad--obeslutad')
  const fore = await obeslutade.count()
  expect(fore).toBeGreaterThan(1)

  await page.getByRole('button', { name: 'Ta med alla' }).click()
  await expect(obeslutade).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Kombinera', exact: true })).toBeEnabled()

  // Massbesluten verkar på alla frågor, inte bara på de obesvarade — annars
  // vore ett felklick tolv klick att ångra.
  await page.getByRole('button', { name: 'Hoppa över alla' }).click()
  await expect(page.locator('.aliasrad--av')).toHaveCount(fore)

  await page.getByRole('button', { name: 'Fråga igen', exact: true }).click()
  await expect(obeslutade).toHaveCount(fore)
})

test('kolumner som inte beslutats syns ändå i förhandsvisningen, märkta', async ({ page }) => {
  await oppnaKombinera(page)

  // Frågan är "ska Ort vara med?". Att svara på den utan att se Ort vore att
  // svara i blindo — så den visas, provisoriskt med och tydligt märkt.
  const rubrik = page.locator('.fortab th', { hasText: 'Ort' })
  await expect(rubrik).toHaveClass(/fortab__obeslutad/)
  await expect(rubrik).toContainText('ej beslutad')

  await rad(page, 'Ort').getByRole('button', { name: 'Ta med', exact: true }).click()
  await expect(page.locator('.fortab th', { hasText: 'Ort' })).not.toHaveClass(
    /fortab__obeslutad/,
  )
})

test('en cell som filen inte gav syns som sådan i förhandsvisningen', async ({ page }) => {
  await oppnaKombinera(page)
  // Orderfilen har ingen Ort. Tom cell och cell-som-aldrig-fanns är inte samma
  // sak, och skillnaden är hela skälet att fråga per kolumn.
  await expect(page.locator('.fortab td.fortab__utan').first()).toBeVisible()
  await expect(page.locator('.fortab td.fortab__utan').first()).toHaveAttribute(
    'title',
    'Stod inte i filen',
  )
})

test('förhandsvisningen står still medan kartan skrollar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await oppnaKombinera(page)

  // Huvudytan skrollar inte: rutorna delar på den och skrollar var för sig.
  const kropp = page.locator('.kombinera__kropp')
  const matt = await kropp.evaluate((e) => ({ k: e.clientHeight, s: e.scrollHeight }))
  expect(matt.s).toBeLessThanOrEqual(matt.k + 1)

  // Båda rutorna syns samtidigt, innanför fönstret.
  for (const ruta of await page.locator('.kombinera__rutor > .ruta').all()) {
    const box = await ruta.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThan(120)
    expect(box!.y + box!.height).toBeLessThanOrEqual(720)
  }

  // Kartan skrollar i sitt eget omslag, och rubrikraden följer med.
  const sticky = await page.locator('.aliaskarta__omslag').evaluate((om) => {
    const th = om.querySelector('thead th')!
    const fore = Math.round(th.getBoundingClientRect().top - om.getBoundingClientRect().top)
    om.scrollTop = 150
    return { fore, efter: Math.round(th.getBoundingClientRect().top - om.getBoundingClientRect().top), rullade: om.scrollTop }
  })
  expect(sticky.rullade).toBeGreaterThan(0)
  expect(sticky.efter).toBe(sticky.fore)
})

test('ett standardvärde fyller filerna som inte ger något', async ({ page }) => {
  await oppnaKombinera(page)

  await rad(page, 'Ort').getByLabel('Standardvärde för Ort').fill('Okänd')
  // Radens not räknar om: det som skulle bli tomt fylls i stället.
  await expect(rad(page, 'Ort')).toContainText('14 rader fylls med Okänd')

  await page.getByRole('button', { name: 'Ta med alla' }).click()
  // Värdet syns i förhandsvisningen, och strimman säger att det inte stod i filen.
  const cell = page.locator('.fortab td.fortab__utan', { hasText: 'Okänd' }).first()
  await expect(cell).toBeVisible()

  // Där alla filer har kolumnen finns inget att fylla, och fältet säger det.
  await expect(rad(page, 'Namn').getByLabel('Standardvärde för Namn')).toBeDisabled()
})

test('provvärdet under väljaren visar vad kolumnen faktiskt innehåller', async ({ page }) => {
  await oppnaKombinera(page)
  // Rubriker ljuger; innehållet gör det inte.
  await expect(rad(page, 'Ort').locator('.aliaskarta__prov')).toContainText('Malmö')
  await expect(rad(page, 'E-post').locator('.aliaskarta__prov').first()).toContainText('@')
})

test('två kolumner går att lägga i samma spalt för hand, och dela upp igen', async ({ page }) => {
  await oppnaKombinera(page)

  // Belopp och Summa betyder samma sak, men rubrikerna avslöjar det inte —
  // och då finns ingen väg alls utan handgreppet.
  await expect(rad(page, 'Belopp')).toContainText('finns i 1 av 2')
  await expect(rad(page, 'Summa')).toContainText('finns i 1 av 2')

  await rad(page, 'Belopp')
    .getByRole('button', { name: 'Samma spalt som en annan målkolumn: Belopp' })
    .click()
  await rad(page, 'Belopp')
    .getByLabel('Målkolumn som hör till samma spalt')
    .selectOption({ label: 'Summa' })
  await rad(page, 'Belopp').getByRole('button', { name: 'Samma spalt', exact: true }).click()

  await expect(rad(page, 'Summa')).toHaveCount(0)
  await expect(rad(page, 'Belopp')).toContainText('finns i 2 av 2')
  await expect(rad(page, 'Belopp')).toContainText('+ Summa')

  // Ett felklick ska gå att ta tillbaka utan att bygga om kartan.
  await rad(page, 'Belopp').getByRole('button', { name: 'Dela upp Belopp igen' }).click()
  await expect(rad(page, 'Summa')).toHaveCount(1)
  await expect(rad(page, 'Belopp')).toContainText('finns i 1 av 2')
})

test('Escape stänger vyn, men lämnar först fältet man skriver i', async ({ page }) => {
  await oppnaKombinera(page)

  const falt = rad(page, 'Ort').getByLabel('Namn på målkolumn 6')
  await falt.click()
  await page.keyboard.press('Escape')
  // Första Escape lämnar fältet — en halvbyggd karta ska inte rivas för att
  // fokus råkade ligga i ett namnfält.
  await expect(page.locator('.kombinera')).toBeVisible()
  await expect(falt).not.toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.locator('.kombinera')).toHaveCount(0)
})
