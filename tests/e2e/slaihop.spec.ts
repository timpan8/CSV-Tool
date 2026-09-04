import { expect, test, type Page } from '@playwright/test'

/** Öppnar båda exempelfilerna som två flikar. */
async function oppnaParet(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna två filer att slå ihop' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  // Orderfliken blir aktiv sist; gå tillbaka till kundfilen.
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Öppnar en post ur verktygsradens meny "Flera filer". */
async function oppnaFlerfilsmenyn(page: Page, post: string) {
  await page.getByRole('button', { name: 'Flera filer ▾' }).click()
  await page.getByRole('menuitem', { name: post }).click()
}

const vy = (page: Page) => page.locator('.slaihop')

const oppnaVyn = async (page: Page) => {
  await oppnaFlerfilsmenyn(page, 'Slå ihop…')
  await expect(vy(page)).toBeVisible()
}

/** Kolumnparet i railen: selects i ordningen vänster, höger, (höger 2), jämförelse. */
const parrad = (page: Page) => page.locator('.slaihop__par').first()

const kor = (page: Page) => page.getByRole('button', { name: 'Slå ihop', exact: true })

/**
 * Ställer paret på Namn ↔ Name.
 *
 * Förslaget provar numera alla kolumnpar och väljer det som ger flest
 * träffar, vilket för exempelparet är E-post ↔ mail. De tester som handlar om
 * namnmatchningens siffror ställer därför in paret själva i stället för att
 * luta sig mot förvalet.
 */
const valjNamnpar = async (page: Page) => {
  await parrad(page).locator('select').nth(0).selectOption({ label: 'Namn' })
  await parrad(page).locator('select').nth(1).selectOption({ label: 'Name' })
}

test('erbjuder en filväljare när den andra filen saknas', async ({ page }) => {
  // Förr var det här en återvändsgränd: en ruta som sa "öppna den andra filen
  // först" med Stäng som enda knapp.
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await oppnaVyn(page)

  await expect(vy(page)).toContainText('Öppna filen du vill slå ihop med')
  await expect(page.getByRole('button', { name: 'Öppna fil…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Öppna exempelparet' })).toBeVisible()
  await expect(kor(page)).toHaveCount(0)

  // Och exempelparet tar en hela vägen fram utan att lämna vyn.
  await page.getByRole('button', { name: 'Öppna exempelparet' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(kor(page)).toBeVisible()
})

test('föreslår det kolumnpar som faktiskt ger flest träffar', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)

  /*
   * Namn ↔ Name är det par rubrikerna pekar ut, och det var förr förslaget.
   * Men E-post ↔ mail matchar tio rader mot åtta — Carl-Johan Nilsson står
   * med bindestreck i den ena filen och utan i den andra, och hittas bara via
   * adressen. Förslaget provar därför alla par mot varandra och tar det som
   * matchar bäst. Etiketterna asserteras, inte selectens värde mot sig själv.
   */
  await expect(parrad(page).locator('select').nth(0).locator('option:checked')).toHaveText('E-post')
  await expect(parrad(page).locator('select').nth(1).locator('option:checked')).toHaveText('mail')
  await expect(vy(page)).toContainText('alla kolumnpar provats mot varandra')
  await expect(vy(page)).toContainText('10 av 16 rader')

  const siffror = page.locator('.slaihop .vytal')
  await expect(siffror).toContainText('10 av 16 rader hittar en träff')
  await expect(siffror).toContainText('blir över')

  // Och namnparet går att välja för hand, med sitt eget facit: åtta kunder
  // har en order med samma namn.
  await valjNamnpar(page)
  await expect(siffror).toContainText('8 av 16 rader hittar en träff')
})

test('räknar kardinalitet och tomma nycklar före körningen', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  // Anna Karlsson finns två gånger i kundfilen och Erik har två order.
  await expect(vy(page)).toContainText('används av flera')
  await expect(vy(page)).toContainText('matchar flera (som mest 2)')
  // ORD-1011 saknar namn och kan aldrig matcha.
  await expect(vy(page)).toContainText('har tom nyckel och kan aldrig matcha')

  // Valet för flerträff dyker upp bara när det faktiskt finns flerträffar.
  await expect(page.getByRole('radio', { name: 'En rad per träff' })).toBeVisible()
})

test('visar båda källfilerna med nyckelkolumnen främst', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  // Fyra rutor: två källfiler, paren, resultatet.
  await expect(page.locator('.slaihop__rutor .ruta')).toHaveCount(4)

  const vansterfil = page.locator('.slaihop__rutor .ruta').nth(0)
  const hogerfil = page.locator('.slaihop__rutor .ruta').nth(1)
  await expect(vansterfil).toContainText('exempel-kunder.csv')
  await expect(hogerfil).toContainText('exempel-order.csv')

  // Nyckeln ligger först, inte där den råkar stå i filen. Kundnr är
  // kundfilens första kolumn, men Namn är den man matchar på.
  await expect(vansterfil.locator('th').first()).toContainText('Namn')
  await expect(vansterfil.locator('th').first()).toContainText('nyckel')
  await expect(hogerfil.locator('th').first()).toContainText('Name')

  // Och raderna är filens egna.
  await expect(vansterfil).toContainText('Anna Karlsson')
  await expect(hogerfil).toContainText('ORD-1001')
})

test('visar den normaliserade nyckeln när den skiljer sig från värdet', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  // ERIK ÖBERG jämförs som "erik öberg" — det är hela skillnaden mellan
  // jämförelsetyperna, och den syns ingen annanstans.
  const hogerfil = page.locator('.slaihop__rutor .ruta').nth(1)
  await expect(hogerfil.locator('.fortab__norm', { hasText: 'erik öberg' }).first()).toBeVisible()

  // Med teckenexakt jämförelse normaliseras ingenting, så raden försvinner.
  await parrad(page).locator('select').last().selectOption({ label: 'Teckenexakt' })
  await expect(hogerfil.locator('.fortab__norm')).toHaveCount(0)
})

test('visar hur raderna paras ihop, och vilka som blev utan', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)

  const paren = page.locator('.slaihop__rutor .ruta').nth(2)
  await expect(paren).toContainText('Så här paras de')
  // Ett riktigt par ur filerna, inte en siffra.
  await expect(paren.locator('.slaihop__paret', { hasText: 'Anna Karlsson' })).toContainText(
    'ORD-1001',
  )
  // Och de som inte hittade någon står med sitt skäl.
  await expect(paren.locator('.slaihop__ingen').first()).toBeVisible()

  // Byter man jämförelse ändras paren medan man tittar. Carl-Johan Nilsson
  // står som "Carl-Johan Nilsson" i kundfilen men saknas i orderfilen på
  // namn — via e-post hittar han sin order.
  await parrad(page).locator('select').nth(0).selectOption({ label: 'E-post' })
  await parrad(page).locator('select').nth(1).selectOption({ label: 'mail' })
  await expect(paren.locator('.slaihop__paret').first()).toContainText('@')
})

test('visar resultatet med sömmen först och tomma celler synliga', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  const resultat = page.locator('.slaihop__rutor .ruta').nth(3)
  await expect(resultat).toContainText('Så här blir resultatet')
  // Nyckeln först, sedan de hämtade kolumnerna — inte filens egen ordning.
  await expect(resultat.locator('th').nth(0)).toHaveText('Namn')
  await expect(resultat.locator('th').nth(1)).toHaveText('Order')
  // En rad utan partner märks i de hämtade kolumnerna — men bara där, och
  // bara när partnern saknades. En cell som är tom för att värdet var tomt
  // är något annat och ska inte se likadan ut.
  const utan = resultat.locator('.fortab__utan')
  await expect(utan.first()).toBeVisible()
  await expect(utan.first()).toHaveAttribute('title', 'Raden hittade ingen partner')
  // Nyckelkolumnen är aldrig märkt — den kom ur vänsterfilen och finns alltid.
  await expect(resultat.locator('tbody tr').first().locator('td').first()).not.toHaveClass(
    /fortab__utan/,
  )

  // Prefixet syns i rubrikerna direkt, utan att något körs.
  await page.getByPlaceholder('t.ex. exempel-order.csv – ').fill('o–')
  await expect(resultat.locator('th').nth(1)).toHaveText('o–Order')
})

test('slår ihop till en ny flik där omatchade rader finns kvar tomma', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await kor(page).click()

  await expect(page.locator('.flik')).toHaveCount(3)
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  // Kundfilens kolumner först, orderkolumnerna efter.
  // Radnummerrutan är ingen kolumnrubrik, så den första är Kundnr.
  const rubriker = page.getByRole('columnheader')
  await expect(rubriker.nth(0)).toContainText('Kundnr')
  await expect(page.getByRole('columnheader', { name: /Summa/ })).toBeVisible()

  // Anna fick sin ordersumma. Hon står två gånger i kundfilen, så samma
  // order hamnar på båda raderna — det är just det "används av flera" räknar.
  await expect(page.getByRole('gridcell', { name: '2 400,00', exact: true })).toHaveCount(2)
  await expect(page.getByRole('gridcell', { name: 'ORD-1001', exact: true })).toHaveCount(2)

  // Carl-Johan har ingen order och står kvar med tomma orderceller — och de
  // är märkta som frånvarande, inte som tomma. Skillnaden syns i den färdiga
  // fliken och inte bara i förhandsvisningen.
  await expect(page.getByRole('gridcell', { name: 'Carl-Johan Nilsson', exact: true })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'ORD-1008', exact: true })).toHaveCount(0)
  await expect(page.locator('.rutnat__cell--utfylld').first()).toBeVisible()
})

test('alla rader ur båda filerna tar med de omatchade orderraderna', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  // Utgångsläget: 16 kunder, 8 matchar, 6 orderrader blir över.
  const tal = page.locator('.slaihop .vytal')
  await expect(tal).toContainText('8 av 16 rader hittar en träff')
  await expect(tal).toContainText('blir över i exempel-order.csv')
  await expect(tal).toContainText('Resultatet får 16 rader')

  await page.getByRole('radio', { name: 'Alla rader ur båda filerna' }).click()

  // Siffrorna säger nu vad som faktiskt kommer med, innan man klickar.
  await expect(tal).toContainText('kommer med bara från exempel-order.csv')
  await expect(tal).toContainText('Resultatet får 22 rader')
  // Och nyckelkolumnen kryssas i, annars går de raderna inte att känna igen.
  await expect(page.getByRole('checkbox', { name: /^Name/ })).toBeChecked()
  await expect(page.locator('.slaihop__installningar')).toContainText(
    'Nyckelkolumnen följer med automatiskt',
  )

  // Förhandsvisningen visar det man just slog på.
  await expect(page.locator('.slaihop__paret--bara').first()).toBeVisible()

  await kor(page).click()
  await expect(page.locator('.statusrad')).toContainText('22 rader')
  // ORD-1008 saknade kund och föll bort förut — nu finns den.
  await expect(page.getByRole('gridcell', { name: 'ORD-1008', exact: true })).toHaveCount(1)
  // Kundkolumnerna på den raden är frånvarande, inte tomma.
  await expect(page.locator('.rutnat__cell--utfylld').first()).toBeVisible()
})

test('Träff-kolumnen skiljer på ingen träff och bara i den andra filen', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)
  await page.getByRole('radio', { name: 'Alla rader ur båda filerna' }).click()
  await kor(page).click()

  // Filtrera fram raderna som bara finns i orderfilen.
  await page.getByRole('button', { name: /^Filter/ }).click()
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  const regel = page.locator('.regel').first()
  await regel.locator('select').first().selectOption({ label: 'Träff' })
  await regel.locator('.regel__varde').first().fill('bara i den andra filen')
  await expect(page.locator('.statusrad')).toContainText('6 av 22 rader')
})

test('sortering på Träff går från lyckad till helt utan partner', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await page.getByRole('radio', { name: 'Alla rader ur båda filerna' }).click()
  await kor(page).click()

  await page.getByRole('button', { name: 'Sortera på Träff' }).click()
  const varden = await page.evaluate(() => {
    const rubriker = [...document.querySelectorAll('.rubrik')]
    const i = rubriker.findIndex(
      (r) => r.querySelector('.rubrik__namn span')?.textContent === 'Träff',
    )
    return [...document.querySelectorAll('.rutnat__rad')].map((rad) =>
      (rad.querySelectorAll('.rutnat__cell')[i]?.textContent ?? '').trim(),
    )
  })
  // Bokstavsordningen hade lagt ”bara i den andra filen” först. Ordningen som
  // betyder något är den kolumnen berättar.
  expect(varden[0]).toBe('träff')
  expect(varden[varden.length - 1]).toBe('bara i den andra filen')
  // Och varje sort ligger samlad: ingen blandning.
  const grupper = varden.filter((v, i) => v !== varden[i - 1])
  expect(grupper).toEqual([...new Set(varden)])
})

test('förhandsvisningen och körningen är eniga om radantalet', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  // Rutan säger vad hela resultatet blir, inte bara vad den visar.
  const resultat = page.locator('.slaihop__rutor .ruta').nth(3)
  await expect(resultat).toContainText('av 16 rader')

  await page.getByRole('radio', { name: 'En rad per träff' }).click()
  // Erik Öberg har två order, så resultatet får en rad mer än kundfilen —
  // och det ska stå i rutan innan man kör.
  await expect(resultat).toContainText('av 17 rader')

  await kor(page).click()
  await expect(page.locator('.statusrad')).toContainText('17 rader')
  await expect(page.getByRole('gridcell', { name: 'Erik Öberg', exact: true })).toHaveCount(2)
})

test('matchning på e-post ger fler träffar än på namn', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)

  // Namnnyckelns facit först, så att jämförelsen efter bytet är en riktig
  // jämförelse och inte samma delsträng två gånger.
  await expect(page.locator('.slaihop .vytal')).toContainText('8 av 16 rader hittar en träff')

  await parrad(page).locator('select').nth(0).selectOption({ label: 'E-post' })
  await parrad(page).locator('select').nth(1).selectOption({ label: 'mail' })

  // E-postadresserna är skrivna likadant i båda filerna, så Zlatan Ekk och
  // Ängström Ida hittar sin kund trots de felskrivna namnen: tio i stället
  // för åtta.
  await expect(page.locator('.slaihop .vytal')).toContainText('10 av 16 rader hittar en träff')
  await kor(page).click()
  await expect(page.locator('.flik')).toHaveCount(3)
})

test('varnar när nästan inget matchar', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)

  // Kundnummer mot ordernummer hör inte ihop alls.
  await parrad(page).locator('select').nth(0).selectOption({ label: 'Kundnr' })
  await parrad(page).locator('select').nth(1).selectOption({ label: 'Order' })

  await expect(kor(page)).toBeDisabled()
})

test('byt håll gör den andra filen till stomme', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  const stomme = page.locator('.slaihop__topp .falt').first()
  await expect(stomme.getByRole('radio', { name: /exempel-kunder/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  // Siffrorna räknas från stommens håll: kundfilen har 16 rader.
  await expect(page.locator('.slaihop .vytal')).toContainText('av 16 rader hittar en träff')

  await page.getByRole('button', { name: '⇄ Byt håll' }).click()

  // Nu är orderfilen stommen — 14 rader — och den står först bland rutorna.
  await expect(stomme.getByRole('radio', { name: /exempel-order/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('.slaihop .vytal')).toContainText('av 14 rader hittar en träff')
  await expect(page.locator('.slaihop__rutor .ruta').nth(0)).toContainText('exempel-order.csv')
  await kor(page).click()
  await expect(page.locator('.statusrad')).toContainText('14 rader')
})

test('alla inställningar syns utan att rulla, även på en liten skärm', async ({ page }) => {
  /*
   * Det här är buggen som blev rapporterad: "Slå ihop verkar inte fungera
   * alls nu. Det finns inga filter osv."
   *
   * Inställningarna låg i en 260 px-rail som rymde 870 px innehåll. Allt från
   * *Kolumner att hämta* och nedåt hamnade under vikkanten i en panel som inte
   * såg ut att gå att rulla — så halva verktyget var osynligt. På en 720 px
   * hög skärm låg namnprefixet 400 px nedanför fönsterkanten.
   */
  await page.setViewportSize({ width: 1280, height: 720 })
  await oppnaParet(page)
  await oppnaVyn(page)

  const hojd = 720
  for (const kontroll of [
    page.locator('.slaihop__topp .falt').first(), // stommen
    page.getByRole('button', { name: '⇄ Byt håll' }),
    parrad(page).locator('select').first(), // kolumnparet
    page.getByRole('radio', { name: 'En rad per träff' }), // flerträff
    page.getByRole('radio', { name: 'Alla rader ur båda filerna' }), // omfattning
    page.getByRole('checkbox', { name: /Summa/ }), // kolumner att hämta
    page.getByPlaceholder(/t\.ex\./), // namnprefix
    kor(page),
  ]) {
    const lada = await kontroll.boundingBox()
    expect(lada, 'kontrollen ska finnas').not.toBeNull()
    expect(lada!.y).toBeGreaterThanOrEqual(0)
    expect(lada!.y + lada!.height).toBeLessThanOrEqual(hojd)
  }

  // Och rutorna ska ha kvar användbar höjd — inställningarna får inte äta dem.
  for (const ruta of await page.locator('.slaihop__rutor .ruta').all()) {
    const lada = (await ruta.boundingBox())!
    expect(lada.height).toBeGreaterThan(90)
  }
})

test('Escape stänger vyn', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await page.keyboard.press('Escape')
  await expect(vy(page)).toHaveCount(0)
  await expect(page.locator('.rutnat')).toBeVisible()
})

test('namn mot förnamn + efternamn matchar över två högerkolumner', async ({ page }) => {
  const csv = [
    'Fornamn;Efternamn;Rabatt',
    'Karlsson;Anna;10',
    'erik;öberg;5',
    'Åsa;;7',
    '',
  ].join('\r\n')

  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  await page.locator('input[type=file]').first().setInputFiles({
    name: 'namndelar.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await page.locator('.flik__namn', { hasText: 'exempel-kunder.csv' }).click()

  await oppnaVyn(page)

  // Rubrikerna liknar ingenting i kundfilen, så förslaget hittar inget par.
  await expect(vy(page)).toContainText('Inga kolumnpar valda')
  await page.getByRole('button', { name: '＋ Lägg till kolumnpar' }).click()

  await parrad(page).locator('select').nth(0).selectOption({ label: 'Namn' })
  await parrad(page).locator('select').nth(1).selectOption({ label: 'Fornamn' })
  await parrad(page).locator('select').last().selectOption({ label: 'Namn mot förnamn + efternamn' })

  // Utan den andra kolumnen kan matchningen inte köras, och det sägs rakt ut.
  await expect(vy(page)).toContainText('saknar sin andra högerkolumn')

  await page.getByLabel('Andra högerkolumnen').selectOption({ label: 'Efternamn' })
  await expect(vy(page)).not.toContainText('saknar sin andra högerkolumn')

  await kor(page).click()
  await expect(page.locator('.rubrik[title="Rabatt"]')).toBeVisible()
  // Anna Karlsson finns två gånger i kundfilen och båda får rabatten; Erik
  // Öberg matchar trots skiftläget. Åsa saknar efternamn och får ingenting.
  await expect(page.getByRole('gridcell', { name: '10', exact: true })).toHaveCount(2)
  await expect(page.getByRole('gridcell', { name: '5', exact: true })).toHaveCount(1)
  await expect(page.getByRole('gridcell', { name: '7', exact: true })).toHaveCount(0)
})

test('rutnätets tangenter når inte fliken bakom en öppen vy', async ({ page }) => {
  await oppnaParet(page)

  // Markera en cell i rutnätet, och öppna sedan vyn ovanpå den. Exempelfilen
  // har Anna Karlsson två gånger med flit — det är dess dubblett.
  const anna = page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true })
  await expect(anna).toHaveCount(2)
  await anna.first().click()
  await oppnaVyn(page)

  // Rutnätet finns inte på skärmen. Delete tömde annars en cell i en flik man
  // inte tittar på, och Ctrl+Z ångrade där.
  //
  // Kvittot är kvittensen: varje ändring i en flik ger en toast. Att i stället
  // läsa cellen efteråt skulle inte skilja lägena åt — ett Delete följt av ett
  // Ctrl+Z lämnar samma text som två tangenter som inte gjorde någonting.
  await page.locator('.slaihop__topp h2').click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.toast', { hasText: 'Tömde' })).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.toast', { hasText: 'Ångrade' })).toHaveCount(0)
  // Ingen bokstav startade en redigering i den dolda fliken heller.
  await page.keyboard.press('x')

  await page.getByRole('button', { name: 'Avbryt' }).click()
  await expect(anna).toHaveCount(2)
  await expect(page.locator('.rutnat__cell input')).toHaveCount(0)
})

test('Enter aktiverar knapparna i vyn', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)

  // Rutnätets Enter startar cellredigering med preventDefault, vilket tog
  // knapparnas inbyggda aktivering ifrån dem — vyn gick inte att köra med
  // tangentbordet alls.
  const byt = page.getByRole('button', { name: '⇄ Byt håll' })
  await byt.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.slaihop__rutor .ruta').nth(0)).toContainText('exempel-order.csv')
})

test('resultatet säger per rad hur det gick', async ({ page }) => {
  await oppnaParet(page)
  await oppnaVyn(page)
  await valjNamnpar(page)
  await kor(page).click()
  await expect(page.locator('.flik')).toHaveCount(3)

  // Utan kolumnen går de omatchade raderna inte att få tag på i resultatet:
  // filtren räknas per ordbokspost, så en utfylld cell går inte att söka på.
  await expect(page.locator('.rubrik[title="Träff"]')).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'ingen träff', exact: true }).first()).toBeVisible()

  // Och den går att filtrera på, vilket är hela poängen: en utfylld cell går
  // inte att söka på, så utan kolumnen fanns ingen väg till de omatchade.
  await page.getByRole('button', { name: /^Filter/ }).click()
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  const regel = page.locator('.regel').first()
  await regel.locator('select').first().selectOption({ label: 'Träff' })
  await regel.locator('select').nth(1).selectOption({ label: 'är' })
  await regel.locator('.regel__varde').first().fill('ingen träff')
  await expect(page.locator('.statusrad')).toContainText('8 av 16 rader')
})
