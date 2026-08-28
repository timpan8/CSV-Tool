import { expect, test, type Page } from '@playwright/test'

/** Öppnar exempelparet och går in i verkstaden på Namn ↔ Name. */
async function oppnaVerkstaden(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Slå ihop…' }).click()
  await page.getByRole('button', { name: 'Beta av resten…' }).click()
  await expect(page.locator('.verkstad')).toBeVisible()
}

const vanster = (page: Page) => page.locator('.restlista').first()
const hoger = (page: Page) => page.locator('.restlista').nth(1)

test('restlistorna visar precis de rader som inte matchade', async ({ page }) => {
  await oppnaVerkstaden(page)

  // Carl-Johan har ingen order; Petra Sund finns inte bland kunderna.
  await expect(vanster(page).getByText('Carl-Johan Nilsson')).toBeVisible()
  await expect(hoger(page).getByText('Petra Sund')).toBeVisible()
  // Den som matchade ligger inte i någon lista.
  await expect(vanster(page).getByText('Maja Lind')).toHaveCount(0)

  // Rutnätets egna rader hör till en tabell man inte längre tittar på.
  await expect(page.locator('.statusrad')).toHaveCount(0)
})

test('två rader går att para ihop för hand', async ({ page }) => {
  await oppnaVerkstaden(page)

  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()

  // Båda lämnar sina listor, och paret syns med sin härkomst.
  await expect(vanster(page).getByText('Carl-Johan Nilsson')).toHaveCount(0)
  await expect(hoger(page).getByText('Petra Sund')).toHaveCount(0)
  await expect(page.locator('.verkstad__par')).toContainText('Carl-Johan Nilsson ↔ Petra Sund')
  await expect(page.locator('.verkstad__par')).toContainText('för hand')
})

test('en ny runda på e-post plockar upp de felstavade namnen', async ({ page }) => {
  await oppnaVerkstaden(page)
  await expect(vanster(page).getByText('Zlatan Ek', { exact: true })).toBeVisible()

  await page.getByLabel('Kolumn i vänsterfilen').selectOption({ label: 'E-post' })
  await page.getByLabel('Kolumn i högerfilen').selectOption({ label: 'mail' })
  await page.getByRole('button', { name: /Kör runda/ }).click()

  // Zlatan Ekk och Ängström Ida har rätt adress men fel skrivet namn.
  await expect(vanster(page).getByText('Zlatan Ek', { exact: true })).toHaveCount(0)
  await expect(hoger(page).getByText('Zlatan Ekk')).toHaveCount(0)
  await expect(vanster(page).getByText('Ida Ängström')).toHaveCount(0)
  await expect(page.locator('.verkstad__par').first()).toContainText('runda 1')
})

test('ett rättat värde gör att raden hittar sin partner av sig själv', async ({ page }) => {
  await oppnaVerkstaden(page)

  // ORD-1014 har både skräp i namnet och ett stavfel i adressen, så varken
  // grundmatchningen eller en runda på e-post når den.
  const rad = hoger(page).locator('.restrad', { hasText: 'Nils Ödman (avliden)' })
  await expect(rad).toBeVisible()
  await rad.click()

  // Rättningen sker i jämförelsen, på den sida värdet står.
  const falt = page.locator('.jamforelse__rad', { hasText: 'Namn ↔ Name' })
  await falt.getByRole('button', { name: 'Nils Ödman (avliden)' }).click()
  await falt.getByLabel('Name i högerfilen').fill('Nils Ödman')
  await falt.getByLabel('Name i högerfilen').press('Enter')

  // Ingen knapp trycktes för att koppla ihop dem — raden matchar nu själv.
  await expect(hoger(page).getByText('Nils Ödman (avliden)')).toHaveCount(0)
  await expect(vanster(page).getByText('Nils Ödman')).toHaveCount(0)
  await expect(page.locator('.verkstad__par')).toHaveCount(0)
})

test('att skriva av en rad tar bort den ur listan men inte ur resultatet', async ({ page }) => {
  await oppnaVerkstaden(page)

  const rad = hoger(page).locator('.restrad', { hasText: 'Hans Vik' })
  await rad.hover()
  await rad.getByRole('button', { name: /Skriv av/ }).click()

  await expect(hoger(page).getByText('Hans Vik')).toHaveCount(0)
  await expect(page.locator('.restlista__avskrivna').last()).toContainText('1 avskrivna')
  await expect(page.locator('.inventering')).toContainText(
    'följer med i resultatet precis som förut',
  )
})

test('sammanslagningen tar med både de automatiska och de handgjorda paren', async ({ page }) => {
  await oppnaVerkstaden(page)

  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()
  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()

  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(page.locator('.verkstad')).toHaveCount(0)
  // Anna fick sin order automatiskt, Carl-Johan sin för hand.
  await expect(page.getByRole('gridcell', { name: 'ORD-1001', exact: true })).toHaveCount(2)
  await expect(page.getByRole('gridcell', { name: 'ORD-1008', exact: true })).toHaveCount(1)
})

test('luddig likhet vägrar talkolumner men föreslår liknande namn', async ({ page }) => {
  await oppnaVerkstaden(page)
  await page.getByLabel('Så här jämförs värdena').selectOption({ label: 'Luddig' })

  // Standardvalet är Kundnr ↔ Order. 10021 och 10024 liknar varandra som
  // text, men är olika kunder — och det ska verktyget säga, inte gissa.
  await page.getByRole('button', { name: 'Visa liknande rader' }).click()
  await expect(page.locator('.verkstad__mitt')).toContainText('avstängd för talkolumner')

  await page.getByLabel('Kolumn i vänsterfilen').selectOption({ label: 'Namn' })
  await page.getByLabel('Kolumn i högerfilen').selectOption({ label: 'Name' })
  await page.getByRole('button', { name: 'Visa liknande rader' }).click()

  const forslag = page.locator('.forslag')
  await expect(forslag.filter({ hasText: 'Zlatan Ekk' })).toBeVisible()
  // Omkastad ordföljd får sitt tal av ordmängden, inte av teckenlikheten.
  const ordfoljd = forslag.filter({ hasText: 'Ängström Ida' })
  await expect(ordfoljd).toContainText('orden 1.00')
})

test('ett godkänt förslag blir ett par, ett avvisat lämnar raden kvar', async ({ page }) => {
  await oppnaVerkstaden(page)
  await page.getByLabel('Kolumn i vänsterfilen').selectOption({ label: 'Namn' })
  await page.getByLabel('Kolumn i högerfilen').selectOption({ label: 'Name' })
  await page.getByLabel('Så här jämförs värdena').selectOption({ label: 'Luddig' })
  await page.getByRole('button', { name: 'Visa liknande rader' }).click()

  // Nej på Nils Ödman: förslaget försvinner, men raden ligger kvar.
  await page
    .locator('.forslag')
    .filter({ hasText: 'avliden' })
    .getByRole('button', { name: 'Nej' })
    .click()
  await expect(page.locator('.forslag').filter({ hasText: 'avliden' })).toHaveCount(0)
  await expect(hoger(page).getByText('Nils Ödman (avliden)')).toBeVisible()

  // Godkänn Zlatan: raden lämnar båda listorna och paret bär sin poäng.
  await page
    .locator('.forslag')
    .filter({ hasText: 'Zlatan Ekk' })
    .getByRole('button', { name: 'Godkänn' })
    .click()
  await expect(hoger(page).getByText('Zlatan Ekk')).toHaveCount(0)
  await expect(vanster(page).getByText('Zlatan Ek', { exact: true })).toHaveCount(0)
  await expect(page.locator('.verkstad__par')).toContainText('% lika')
})

test('bänken säger varför raderna inte blev ett par', async ({ page }) => {
  await oppnaVerkstaden(page)
  await vanster(page).locator('.restrad', { hasText: 'Nils Ödman' }).first().click()
  await hoger(page).locator('.restrad', { hasText: 'Nils Ödman (avliden)' }).click()

  // Fälten står mot varandra, och nyckelraden är märkt som den som fällde det.
  const nyckelrad = page.locator('.jamforelse__rad--nyckel')
  await expect(nyckelrad).toHaveAttribute('data-falt', 'Namn ↔ Name')
  await expect(nyckelrad).toHaveClass(/jamforelse__rad--skiljer/)

  // Den normaliserade nyckeln syns — det verkstaden aldrig visade förut — och
  // just det som skiljer dem åt är markerat.
  await expect(nyckelrad.locator('.jamforelse__norm').first()).toHaveText('nils ödman')
  await expect(nyckelrad.locator('mark')).toHaveText('(avliden)')

  // Ett fält som bara finns på ena sidan står för sig, inte parat på position.
  await expect(page.locator('.jamforelse__rad[data-falt="Levererad"]')).toBeVisible()
})

test('bänken visar fälten även med bara en rad vald', async ({ page }) => {
  await oppnaVerkstaden(page)
  // Det vanligaste läget: man har markerat en rad och letar efter dess partner.
  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()

  const nyckelrad = page.locator('.jamforelse__rad--nyckel')
  await expect(nyckelrad).toContainText('Carl-Johan Nilsson')
  // Ingen dom fälls om ett par som inte finns.
  await expect(nyckelrad).not.toHaveClass(/jamforelse__rad--skiljer/)
  await expect(page.locator('.jamforelse__cell--saknas').first()).toBeVisible()
})

test('restlistan skiljer på tom nyckel, ingen partner och flera träffar', async ({ page }) => {
  await oppnaVerkstaden(page)

  // ORD-1011 saknar namn: nyckeln är tom, och då hjälper ingen ny runda.
  await expect(hoger(page).locator('.restrad[data-sort="tom"]')).toContainText('ORD-1011')
  // Erik Öberg matchar två orderrader. Den raden syntes inte i någon lista alls
  // förut — räknaren fanns, raderna gjorde det inte.
  await expect(vanster(page).locator('.restrad[data-sort="flera"]')).toContainText('Erik Öberg')
  await expect(page.locator('.inventering')).toContainText('matchar flera rader')
  // Och de vanliga resterna är kvar som de var.
  await expect(
    vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }),
  ).toHaveAttribute('data-sort', 'utan')
})

test('en rättning i bänken går till källfliken och är ångrabar', async ({ page }) => {
  await oppnaVerkstaden(page)
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()

  const falt = page.locator('.jamforelse__rad[data-falt="Namn ↔ Name"]')
  await falt.getByRole('button', { name: 'Petra Sund' }).click()
  await falt.getByLabel('Name i högerfilen').fill('Petra Sundberg')
  await falt.getByLabel('Name i högerfilen').press('Enter')

  await expect(falt.getByRole('button', { name: 'Petra Sundberg' })).toBeVisible()
  // Rättningen hör hemma i källfliken, inte i verkstaden.
  await expect(page.locator('.toast', { hasText: 'Rättade' })).toContainText(
    'Rättade Name i exempel-order.csv',
  )
})
