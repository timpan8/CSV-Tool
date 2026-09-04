import { expect, test, type Page } from '@playwright/test'
import { vantaPaBorttaget, vantaPaSparat } from './lagringshjalp.js'

/**
 * Öppnar exempelparet och går in i verkstaden på Namn ↔ Name.
 *
 * Paret ställs in för hand. Förslaget provar numera alla kolumnpar och väljer
 * det som ger flest träffar, vilket för exempelparet är E-post ↔ mail — men
 * verkstadens hela poäng är just raderna som *inte* matchade på namn.
 */
async function oppnaVerkstaden(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Slå ihop…' }).click()
  const parrad = page.locator('.slaihop__par').first()
  await parrad.locator('select').nth(0).selectOption({ label: 'Namn' })
  await parrad.locator('select').nth(1).selectOption({ label: 'Name' })
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

test('arbetet ligger kvar efter en körning och går att fortsätta med', async ({ page }) => {
  await oppnaVerkstaden(page)

  // Ett par för hand, så att det finns arbete som skulle kunna gå förlorat.
  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()
  await expect(page.locator('.verkstad__par')).toHaveCount(1)

  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()
  await expect(page.locator('.flik')).toHaveCount(3)
  // Notisen säger att resten inte är borta.
  await expect(page.locator('.toast', { hasText: 'ligger kvar att beta av' })).toBeVisible()

  // Vägen tillbaka in, utan att börja om.
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' }).click()
  await expect(page.locator('.verkstad')).toBeVisible()
  await expect(page.locator('.verkstad__par')).toHaveCount(1)

  // En andra omgång blir en egen flik — den första rörs aldrig.
  await expect(page.getByRole('button', { name: 'Slå ihop igen' })).toBeVisible()
  await page.getByRole('button', { name: 'Slå ihop igen' }).click()
  await expect(page.locator('.flik')).toHaveCount(4)
  await expect(page.locator('.flik__namn', { hasText: 'omgång 2' })).toBeVisible()
})

test('den påbörjade sammanslagningen syns i filerna den gäller', async ({ page }) => {
  /*
   * Vägen tillbaka låg förut bara under *Flera filer*. Den som inte redan
   * visste att verkstaden fanns hittade den aldrig — arbetet låg kvar utan
   * att någon kom och hämtade det.
   */
  await oppnaVerkstaden(page)
  await page.keyboard.press('Escape')

  const chip = page.locator('.verkstadchip')
  // Källfilen man står i säger hur mycket som är kvar.
  await expect(chip).toContainText('kvar att beta av')
  // Och flikarna som hör till bär ett märke, så att det syns utifrån.
  await expect(page.locator('.flik__verkstad')).toHaveCount(2)

  // Den andra källfilen säger samma sak.
  await page.locator('.flik__namn', { hasText: 'exempel-order.csv' }).click()
  await expect(chip).toContainText('kvar att beta av')

  // Knappen i chippet är vägen in, utan att gå via menyn.
  await chip.getByRole('button', { name: 'Fortsätt' }).click()
  await expect(page.locator('.verkstad')).toBeVisible()
  await page.keyboard.press('Escape')

  // Efter en körning syns det även i resultatfliken — det är där man står när
  // man undrar över raderna som saknas.
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' }).click()
  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()
  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(chip).toContainText('kom inte med')
  await expect(page.locator('.flik__verkstad')).toHaveCount(3)
})

test('att stänga verkstaden kastar inte arbetet, men Kasta arbetet gör det', async ({ page }) => {
  await oppnaVerkstaden(page)
  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()

  // Escape stänger vyn. Förut nollade den sessionen utan att fråga.
  await page.keyboard.press('Escape')
  await expect(page.locator('.verkstad')).toHaveCount(0)
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' }).click()
  await expect(page.locator('.verkstad__par')).toHaveCount(1)

  // Att kasta är en egen handling, och den frågar när det finns något att kasta.
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Kasta arbetet' }).click()
  await expect(page.locator('.verkstad')).toHaveCount(0)
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await expect(page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' })).toBeDisabled()
})

test('arbetet överlever en omladdning och går att fortsätta med', async ({ page }) => {
  await oppnaVerkstaden(page)
  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()
  await expect(page.locator('.verkstad__par')).toHaveCount(1)
  await page.getByRole('button', { name: 'Slå ihop', exact: true }).click()
  await expect(page.locator('.flik')).toHaveCount(3)

  // Både flikarna och sessionen skrivs fördröjt. Vänta in båda i lagringen:
  // resultatfliken i ramarna, den antecknade omgången i sessionsraden.
  await vantaPaSparat(page, 'exempel-kunder.csv + exempel-order.csv', '"omgangar":1')
  await page.reload()
  await expect(page.locator('.flik')).toHaveCount(3)
  // Sessionen säger ifrån av sig själv — utan den syns ingenting på skärmen.
  await expect(page.locator('.toast', { hasText: 'påbörjad sammanslagning' })).toBeVisible()

  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' }).click()
  await expect(page.locator('.verkstad')).toBeVisible()
  // Paret från förra besöket är kvar, och radindexen betyder samma sak.
  await expect(page.locator('.verkstad__par')).toHaveCount(1)
  await expect(page.locator('.verkstad__par')).toContainText('Carl-Johan Nilsson')

  // Och man kan fortsätta: ett par till, och en ny omgång. Raden väljs bland
  // dem utan träff — en flerträffsrad går inte längre att para för hand.
  await vanster(page).locator('.restrad[data-sort="utan"]').first().click()
  await hoger(page).locator('.restrad[data-sort="utan"]').first().click()
  await page.getByRole('button', { name: 'Para ihop' }).click()
  await expect(page.locator('.verkstad__par')).toHaveCount(2)
  await page.getByRole('button', { name: 'Slå ihop igen' }).click()
  await expect(page.locator('.flik__namn', { hasText: 'omgång 2' })).toBeVisible()
})

/*
 * Regressionsvakt: efter en omladdning var skrivningens bokföring tom, så
 * att kasta sessionen dedupades bort som "ingen ändring" — och det kastade
 * arbetet återuppstod vid nästa start, hur många gånger man än kastade.
 */
test('en kastad session är kastad även efter nästa omladdning', async ({ page }) => {
  await oppnaVerkstaden(page)
  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()
  await vantaPaSparat(page, '"id":"verkstad"')

  await page.reload()
  await expect(page.locator('.toast', { hasText: 'påbörjad sammanslagning' })).toBeVisible()

  // Kasta utan att först gå in i verkstaden: stäng en källflik. Det är vägen
  // som glömdes — att öppna vyn råkar synka om sessionen och dölja felet.
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Stäng exempel-order.csv' }).click()
  await vantaPaBorttaget(page, '"id":"verkstad"')

  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await expect(page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' })).toBeDisabled()
})

test('en stängd källfil tar verkstaden med sig, och säger det', async ({ page }) => {
  await oppnaVerkstaden(page)
  await vanster(page).locator('.restrad', { hasText: 'Carl-Johan Nilsson' }).click()
  await hoger(page).locator('.restrad', { hasText: 'Petra Sund' }).click()
  await page.getByRole('button', { name: 'Para ihop' }).click()
  await page.keyboard.press('Escape')

  // Utan frågan låg sessionen kvar som en zombie med två döda flik-id.
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Stäng exempel-order.csv' }).click()
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await expect(page.getByRole('menuitem', { name: 'Fortsätt beta av resten…' })).toBeDisabled()
})

test('Escape stänger den vy som syns, inte den som ligger under', async ({ page }) => {
  await oppnaVerkstaden(page)

  // Paletten går att öppna ovanpå en egen vy, och därifrån öppnas en annan.
  // Förut valde Escape efter en egen lista i omvänd ordning mot ritningen, så
  // den osynliga verkstaden åt tangenttrycket och Slå ihop krävde ett andra.
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Vad vill du göra?').fill('Slå ihop med')
  await page.keyboard.press('Enter')
  await expect(page.locator('.slaihop')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.slaihop')).toHaveCount(0)
  // Verkstaden var aldrig uppe på skärmen och ska inte ha stängts.
  await expect(page.locator('.verkstad')).toBeVisible()
})
