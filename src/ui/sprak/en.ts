import { DIALOGER } from './en/dialoger.js'
import { FLERFIL } from './en/flerfil.js'
import { SKAL } from './en/skal.js'
import { VERKTYG } from './en/verktyg.js'

/**
 * Engelska motsvarigheter till gränssnittets svenska text.
 *
 * Nyckeln *är* den svenska texten. Se `sprak.ts` för varför: koden ska gå att
 * läsa utan att slå upp något, och en text som saknas här faller tillbaka på
 * svenskan i stället för att visa en nyckel.
 *
 * **Ordboken är avsiktligt bara etiketter.** Sorteringen är fortfarande
 * svensk, tal skrivs fortfarande `1 240,50` och datumverktyget läser
 * fortfarande `augusti`. Texterna säger det där det spelar roll, i stället
 * för att låta någon upptäcka det när en lista sorteras "fel".
 *
 * **Ett svenskt ord får en engelsk motsvarighet, inte två.** Nyckeln är texten,
 * så `Visa` blir samma sak i vymenyn som i dubblettpanelen. Det är priset för
 * att koden ska gå att läsa rakt av, och det är sällan ett problem: när två
 * ställen säger samma svenska ord menar de nästan alltid samma sak.
 *
 * **Delad efter yta, inte efter bokstav.** Med drygt 600 meningar i en enda
 * fil går ingen igenom en ändring i den; fyra filer efter var sin del av
 * gränssnittet går att läsa. En nyckel som råkar stå i två av modulerna vore
 * ett tyst fel — den sista skulle vinna — och därför finns ett enhetstest som
 * letar efter just det.
 */
export const EN: Record<string, string> = {
  ...SKAL,
  ...VERKTYG,
  ...FLERFIL,
  ...DIALOGER,
}
