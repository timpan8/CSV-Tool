import { signal } from '@preact/signals'
import { EN } from './sprak/en.js'

/**
 * Gränssnittets språk.
 *
 * **Bara etiketterna byter språk — aldrig vad verktyget gör.** Sorteringen är
 * fortfarande svensk (å ä ö efter z), tal skrivs fortfarande `1 240,50`,
 * datumverktyget läser fortfarande `augusti` och rubrikmatchningen parar
 * fortfarande ihop svenska och engelska namn på samma sätt. Att låta språket
 * styra även det hade ändrat *resultat*: samma fil sorterad på två språk
 * hade gett två ordningar. Det är ett större beslut än en etikett, och tills
 * det är fattat säger vyn det rakt ut i stället för att låta någon upptäcka
 * det själv.
 *
 * **Ordboken slås upp på den svenska texten, inte på ett id.** Två skäl. Koden
 * är skriven på svenska och ska förbli läsbar — `t('Sortera…')` säger vad som
 * står på knappen, medan `t('toolbar.sort')` kräver att man slår upp den. Och
 * en text som saknar översättning faller tillbaka på svenskan i stället för
 * att visa en nyckel, alltså på något som går att läsa.
 */
export type Sprak = 'sv' | 'en'

const NYCKEL = 'csv-verkstan.sprak'

function last(): Sprak {
  try {
    return localStorage.getItem(NYCKEL) === 'en' ? 'en' : 'sv'
  } catch {
    // Privat läge eller blockerad lagring. Svenska för den här sessionen.
    return 'sv'
  }
}

export const sprak = signal<Sprak>(last())

export function sattSprak(nytt: Sprak): void {
  sprak.value = nytt
  document.documentElement.lang = nytt === 'en' ? 'en' : 'sv'
  try {
    localStorage.setItem(NYCKEL, nytt)
  } catch {
    // Valet gäller för den här sessionen.
  }
}

/** Sätter `lang` på dokumentet vid start, utan att skriva om det som just lästs. */
export function tillampaSprak(): void {
  document.documentElement.lang = sprak.value === 'en' ? 'en' : 'sv'
}

/**
 * Den svenska texten, eller dess engelska motsvarighet.
 *
 * Saknas en översättning står svenskan kvar. Ett halvöversatt gränssnitt är
 * inte snyggt, men det är läsbart — och en saknad nyckel som slår igenom som
 * `toolbar.sort` är det inte.
 */
export function t(svenska: string): string {
  if (sprak.value === 'sv') return svenska
  return EN[svenska] ?? svenska
}

/**
 * Samma sak för text som byggs av delar.
 *
 * `tf('Tog bort {0}.', rader(3))` slår upp mallen och sätter in delarna. Utan
 * den hade varje sammansatt mening antingen behövt bli en nyckel per
 * variant, eller klippts i bitar som inte går att ordna om — och engelskan
 * har ofta en annan ordföljd än svenskan.
 */
export function tf(mall: string, ...delar: (string | number)[]): string {
  return t(mall).replace(/\{(\d+)\}/g, (traff, i: string) => {
    const del = delar[Number(i)]
    return del === undefined ? traff : String(del)
  })
}
