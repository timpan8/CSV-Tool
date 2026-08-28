import { expect, type Page } from '@playwright/test'

/**
 * Läser hela lagringen som en söksträng, utan att skapa databasen.
 *
 * Ett versionslöst `open` mot en databas som inte finns skulle skapa den på
 * version 1 — och då blockera appens egen uppgradering till 2 med ett
 * lagringsfel som inte har med testet att göra. Därför frågas `databases()`
 * först, och en databas som saknas rapporteras som null i stället.
 */
export async function sparatInnehall(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    if (!dbs.some((d) => d.name === 'csv-verkstan')) return null
    const db = await new Promise<IDBDatabase | null>((ok) => {
      const b = indexedDB.open('csv-verkstan')
      b.onsuccess = () => ok(b.result)
      b.onerror = () => ok(null)
    })
    if (!db) return null
    try {
      const namn = ['ramar', 'flikar', 'sessioner'].filter((n) => db.objectStoreNames.contains(n))
      if (namn.length === 0) return null
      return await new Promise<string | null>((ok) => {
        const tx = db.transaction(namn, 'readonly')
        const delar = namn.map((n) => tx.objectStore(n).getAll())
        tx.oncomplete = () =>
          ok(JSON.stringify(Object.fromEntries(namn.map((n, i) => [n, delar[i]!.result]))))
        tx.onerror = () => ok(null)
        tx.onabort = () => ok(null)
      })
    } finally {
      db.close()
    }
  })
}

/**
 * Väntar tills den fördröjda skrivningen faktiskt nått IndexedDB, genom att
 * läsa butikerna tills alla naglar syns i innehållet.
 *
 * En riktig signal i stället för en gissad sömn: den fasta väntetiden som
 * stod här förut var 400 ms marginal på en lastad CI-maskin — och sekunder
 * av död tid på en snabb.
 */
export async function vantaPaSparat(page: Page, ...naglar: string[]): Promise<void> {
  await expect
    .poll(
      async () => {
        const json = await sparatInnehall(page)
        return json !== null && naglar.every((n) => json.includes(n))
      },
      { timeout: 10_000 },
    )
    .toBe(true)
}

/** Väntar tills något som varit sparat inte längre är det. */
export async function vantaPaBorttaget(page: Page, nagel: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const json = await sparatInnehall(page)
        return json !== null && !json.includes(nagel)
      },
      { timeout: 10_000 },
    )
    .toBe(true)
}
