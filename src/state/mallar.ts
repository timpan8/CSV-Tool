import { signal } from '@preact/signals'

/**
 * De senast använda mallarna.
 *
 * En mall är text man skrivit för hand, och den skrivs sällan en enda gång:
 * `('{Namn}'),` som körts på en fil ska köras på nästa månads fil också.
 * Listan finns för att slippa skriva om den.
 *
 * **Ingen namngivning.** Ett bibliotek med namn kräver att man döper något
 * innan man vet om man vill ha kvar det, och `('{Namn}'),` beskriver sig redan
 * bättre än ett påhittat namn skulle göra. Priset är att listan är en historik
 * och inte ett urval: den som användes en gång i förrgår trängs undan.
 *
 * **Samma lista för mallar och mönster.** *Bygg kolumn ur mall* och
 * *Dela kolumnen*s mönsterläge läser samma syntax, så det är samma sorts text.
 * `sort` skiljer dem åt så att varje panel bara visar sina egna.
 */

const NYCKEL = 'csv-verkstan.mallar'

/**
 * Så många mallar listan minns.
 *
 * En lista utan tak är ingen lista, den är en logg — och chipsen ska rymmas på
 * en rad eller två utan att panelen blir en meny.
 */
export const TAK = 8

export type Mallsort = 'mall' | 'monster'

/**
 * En mall som använts.
 *
 * Inte en `Kolumnregel`: den bär varken källor eller avtryck, eftersom de hör
 * till en viss kolumn i en viss fil. Det här är bara inställningen.
 */
export interface Sparadmall {
  sort: Mallsort
  /** Malltexten, eller mönstret. Samma syntax i båda fallen. */
  text: string
  /** Bara för `mall`: undantaget för vyns första rad. */
  forsta?: string
  /** Bara för `mall`: undantaget för vyns sista rad. */
  sista?: string
  /** Bara för `mall`: om luckor efter tomma värden städas bort. */
  stadaLuckor?: boolean
}

export const mallar = signal<Sparadmall[]>(las())

/* ---------- Lagring ---------- */

function las(): Sparadmall[] {
  try {
    const rått = localStorage.getItem(NYCKEL)
    if (rått === null) return []
    return tolkaMallar(rått) ?? []
  } catch {
    // Privat läge eller blockerad lagring. Listan finns bara i minnet.
    return []
  }
}

function skriv(): void {
  try {
    localStorage.setItem(NYCKEL, JSON.stringify(mallar.value))
  } catch {
    // Lagringen är full eller blockerad. Listan gäller för den här sessionen;
    // att krascha på en bekvämlighet vore fel avvägning.
  }
}

/**
 * Läser listan ur lagringen.
 *
 * Innehållet kommer utifrån och kan vara skrivet av en annan version, så varje
 * post kontrolleras. En post som inte går att lita på hoppas över i stället för
 * att fylla ett fält med `undefined` — en mall som tyst blivit tom ser ut som
 * ett fel i verktyget.
 */
export function tolkaMallar(text: string): Sparadmall[] | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null

  const ut: Sparadmall[] = []
  for (const m of data) {
    if (typeof m !== 'object' || m === null) continue
    const post = m as Partial<Sparadmall>
    if (post.sort !== 'mall' && post.sort !== 'monster') continue
    if (typeof post.text !== 'string' || post.text === '') continue
    ut.push({
      sort: post.sort,
      text: post.text,
      ...(typeof post.forsta === 'string' ? { forsta: post.forsta } : {}),
      ...(typeof post.sista === 'string' ? { sista: post.sista } : {}),
      ...(typeof post.stadaLuckor === 'boolean' ? { stadaLuckor: post.stadaLuckor } : {}),
    })
    if (ut.length === TAK) break
  }
  return ut
}

/* ---------- Listan ---------- */

/**
 * Två mallar är samma mall när varje inställning stämmer.
 *
 * Inte bara texten: `('{Namn}'),` med och utan undantag för sista raden ger
 * olika kolumner, och att låta den ena tränga undan den andra hade tappat den
 * man var på väg att återanvända.
 */
function lika(a: Sparadmall, b: Sparadmall): boolean {
  return (
    a.sort === b.sort &&
    a.text === b.text &&
    a.forsta === b.forsta &&
    a.sista === b.sista &&
    a.stadaLuckor === b.stadaLuckor
  )
}

/**
 * Lägger mallen först i listan.
 *
 * Anropas när en mall *körs*, inte medan den skrivs. Ett tangenttryck är inget
 * användande, och en lista full av halvskrivna mallar hade varit värdelös.
 *
 * Kör man samma mall igen flyttas den upp i stället för att läggas till en gång
 * till — annars hade listan fyllts av samma post och trängt ut allt annat.
 */
export function anvandeMall(ny: Sparadmall): void {
  if (ny.text.trim() === '') return
  mallar.value = [ny, ...mallar.value.filter((m) => !lika(m, ny))].slice(0, TAK)
  skriv()
}

/** Mallarna av en viss sort, senast använd först. */
export function mallarAvSort(sort: Mallsort): Sparadmall[] {
  return mallar.value.filter((m) => m.sort === sort)
}

/** Tömmer listan. För *Börja om*, som rensar allt annat verktyget sparat. */
export function glomMallar(): void {
  mallar.value = []
  try {
    localStorage.removeItem(NYCKEL)
  } catch {
    // Se `skriv`.
  }
}
