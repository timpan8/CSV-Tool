import { expect, test, type Page } from '@playwright/test'

async function oppnaExempel(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
}

/** Skrivningen är fördröjd, så vänta tills den hunnit ske. */
async function invanta(page: Page) {
  await page.waitForTimeout(1600)
}

test('flikarna finns kvar efter en omladdning', async ({ page }) => {
  await oppnaExempel(page)
  await invanta(page)

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
  await invanta(page)

  await page.reload()
  await expect(page.locator('.statusrad')).toContainText('10 av 16 rader')
  await expect(page.locator('.filterrad .chip')).toContainText('Status är Aktiv')
  await expect(page.getByRole('gridcell', { name: 'Malmö stad', exact: true })).toBeVisible()
})

test('en stängd flik kommer inte tillbaka', async ({ page }) => {
  await oppnaExempel(page)
  await invanta(page)
  await page.locator('.flik__stang').first().click()
  await expect(page.locator('.tomt')).toBeVisible()
  await invanta(page)

  await page.reload()
  await expect(page.locator('.tomt')).toBeVisible()
  await expect(page.locator('.flik')).toHaveCount(0)
})

test('glöm sparade filer tömmer lagringen men rör inte flikarna', async ({ page }) => {
  await oppnaExempel(page)
  await invanta(page)

  await page.keyboard.press('Control+k')
  await page.getByLabel('Sök bland kommandon').fill('glöm sparade')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').last()).toContainText('Det sparade är borta')
  // Fliken på skärmen står kvar.
  await expect(page.locator('.statusrad')).toContainText('16 rader')

  await page.reload()
  await expect(page.locator('.tomt')).toBeVisible()
})

test('en uppgradering av databasen kastar inte det som redan är sparat', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Öppna exempelfil' }).click()
  await page.getByRole('button', { name: 'Öppna filen' }).click()
  await expect(page.locator('.statusrad')).toContainText('16 rader')
  await page.waitForTimeout(2000)

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
