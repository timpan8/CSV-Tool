import { expect, test, type Page } from '@playwright/test'
import {
  markeraForeOmladdning,
  sparatInnehall,
  vantaPaBorttaget,
  vantaPaOmladdning,
  vantaPaSparat,
} from './lagringshjalp.js'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

test('flikarna finns kvar efter en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await vantaPaSparat(page, 'Anna Karlsson')

  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.locator('.flik')).toHaveCount(1)
  await expect(page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true }).first()).toBeVisible()
  // Att historiken börjar om sägs rakt ut, i stället för att upptäckas när
  // Ctrl+Z inte gör något.
  await expect(page.locator('.toast').last()).toContainText('Ångra-historiken börjar om')
})

test('en redigering och ett filter följer med tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await page.getByRole('gridcell', { name: 'Malmö', exact: true }).first().dblclick()
  await page.locator('.rutnat__redigering').fill('Malmö stad')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: /^Filter/ }).click()
  await page.getByRole('button', { name: '＋ Lägg till regel' }).click()
  const regel = page.locator('.regel').first()
  await regel.locator('select').first().selectOption({ label: 'Status' })
  await regel.locator('.regel__varde').first().fill('Aktiv')
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')
  await vantaPaSparat(page, 'Malmö stad', '"varde":"Aktiv"')

  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')
  await expect(page.locator('.filterrad .chip')).toContainText('Status är Aktiv')
  await expect(page.getByRole('gridcell', { name: 'Malmö stad', exact: true })).toBeVisible()
})

test('en stängd flik kommer inte tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await vantaPaSparat(page, 'Anna Karlsson')
  await page.locator('.flik__stang').first().click()
  await expect(page.locator('.tomt')).toBeVisible()
  await vantaPaBorttaget(page, 'Anna Karlsson')

  await page.reload()
  await expect(page.locator('.tomt')).toBeVisible()
  await expect(page.locator('.flik')).toHaveCount(0)
})

test('glöm sparade filer tömmer lagringen men rör inte flikarna', async ({ page }) => {
  await oppnaExempel(page)
  await vantaPaSparat(page, 'Anna Karlsson')

  await page.keyboard.press('Control+k')
  await page.getByLabel('Sök bland kommandon').fill('glöm sparade')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').last()).toContainText('Det sparade är borta')
  // Fliken på skärmen står kvar.
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  await vantaPaBorttaget(page, 'Anna Karlsson')
  await page.reload()
  await expect(page.locator('.tomt')).toBeVisible()
})

/*
 * Regressionsvakt: städsvepet i skrivningen raderade förut varje nyckel som
 * inte fanns i den egna instansens fliklista — så två webbläsarflikar med
 * verktyget raderade varandras sparade filer vid varje skrivning.
 */
test('två webbläsarflikar raderar inte varandras sparade filer', async ({ page, context }) => {
  // Flik A sparar exempelfilen.
  await oppnaExempel(page)
  await vantaPaSparat(page, 'Anna Karlsson')

  // Flik B startar och återställer den — B:s bokföring känner bara till den.
  const andra = await context.newPage()
  await andra.goto('/')
  await expect(andra.locator('.statusrad')).toContainText('16 rader')

  // Flik A öppnar en andra fil, som bara A vet om.
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'djur.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Djur;Ben\nKatt;4\nStrandpipare;2\n'),
  })
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.flik')).toHaveCount(2)
  await vantaPaSparat(page, 'Strandpipare')

  // B gör en ändring, så att B:s fördröjda skrivning körs.
  await andra.getByRole('gridcell', { name: 'Malmö', exact: true }).first().dblclick()
  await andra.locator('.rutnat__redigering').fill('Uggleboet')
  await andra.keyboard.press('Enter')
  await vantaPaSparat(andra, 'Uggleboet')

  // A:s andra fil ska ha överlevt B:s skrivning...
  expect(await sparatInnehall(page)).toContain('Strandpipare')

  // ...och komma tillbaka när A laddas om.
  await page.reload()
  await expect(page.locator('.flik')).toHaveCount(2)
  await expect(page.locator('.flik__namn', { hasText: 'djur.csv' })).toBeVisible()
})

test('en uppgradering av databasen kastar inte det som redan är sparat', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await vantaPaSparat(page, 'Anna Karlsson')

  /*
   * Bygg om databasen som den såg ut i version 1 — två butiker, samma rader.
   * Det är den profil varje användare som redan kört verktyget har, och den
   * som en oaktsam versionshöjning hade tömt: `onupgradeneeded` raderade förut
   * alla butiker, och radfiltret hade dessutom kastat resten.
   */
  const byggd = await page.evaluate(async () => {
    const las = <T,>(r: IDBRequest<T>) =>
      new Promise<T>((ok, no) => {
        r.onsuccess = () => ok(r.result)
        r.onerror = () => no(r.error)
      })
    const v2 = await new Promise<IDBDatabase>((ok) => {
      const b = indexedDB.open('csv-verkstan')
      b.onsuccess = () => ok(b.result)
    })
    const tx = v2.transaction(['ramar', 'flikar'], 'readonly')
    const ramar = await las(tx.objectStore('ramar').getAll())
    const flikar = await las(tx.objectStore('flikar').getAll())
    v2.close()
    if (ramar.length === 0) return 0

    await new Promise<void>((ok) => {
      const d = indexedDB.deleteDatabase('csv-verkstan')
      d.onsuccess = () => ok()
      d.onerror = () => ok()
      d.onblocked = () => ok()
    })
    const v1 = await new Promise<IDBDatabase>((ok) => {
      const b = indexedDB.open('csv-verkstan', 1)
      b.onupgradeneeded = () => {
        b.result.createObjectStore('ramar', { keyPath: 'id' })
        b.result.createObjectStore('flikar', { keyPath: 'id' })
      }
      b.onsuccess = () => ok(b.result)
    })
    await new Promise<void>((ok) => {
      const t = v1.transaction(['ramar', 'flikar'], 'readwrite')
      for (const r of ramar) t.objectStore('ramar').put(r)
      for (const f of flikar) t.objectStore('flikar').put(f)
      t.oncomplete = () => ok()
    })
    v1.close()
    return ramar.length
  })
  expect(byggd).toBe(1)

  // Nu öppnar appen samma databas på version 2 och måste lägga till sin nya
  // butik utan att röra de två som redan fanns.
  await page.reload()
  await expect(page.locator('.flik')).toHaveCount(1)
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(page.getByRole('gridcell', { name: 'Anna Karlsson', exact: true }).first()).toBeVisible()
})

test('Börja om stänger allt, tömmer lagringen och laddar om', async ({ page }) => {
  await oppnaExempel(page)
  await vantaPaSparat(page, 'Anna Karlsson')

  await markeraForeOmladdning(page)

  // Märket i statusraden är vägen in: frågan om vad verktyget håller och
  // svaret "ta bort alltihop" hör ihop.
  await page.getByRole('button', { name: '● Allt lokalt' }).click()

  const ruta = page.getByRole('dialog')
  await expect(ruta).toBeVisible()
  await expect(ruta).toContainText('öppna filer')
  await expect(ruta).toContainText('16 rader')
  await expect(ruta).toContainText('sparat i webbläsaren')
  // Löftet om minnet står i rutan, eftersom det är därför man klickar.
  await expect(ruta).toContainText('Sidan laddas om')

  await ruta.getByRole('button', { name: 'Rensa allt' }).click()

  // Sidan laddas om, och först då står det tomma läget där på riktigt.
  await vantaPaOmladdning(page)
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()
  await expect(page.locator('.flik')).toHaveCount(0)
  await vantaPaBorttaget(page, 'Anna Karlsson')

  // Och det stannar borta: ingen skrivning lägger tillbaka det som raderats.
  await page.reload()
  await expect(page.getByText('Släpp dina filer här')).toBeVisible()
  await expect(page.locator('.flik')).toHaveCount(0)
})

test('Avbryt i Börja om rör ingenting', async ({ page }) => {
  await oppnaExempel(page)
  await vantaPaSparat(page, 'Anna Karlsson')

  await page.getByRole('button', { name: '● Allt lokalt' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Avbryt' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await expect(await sparatInnehall(page)).toContain('Anna Karlsson')
})
