import { normalizeAlways } from '../locale/sv.js'

/**
 * E-post → namn och domän.
 *
 * Verktyget bygger på ett mönster som är vanligt men inte garanterat:
 * `fornamn.efternamn@doman.se`. Två saker följer av det, och båda syns i
 * gränssnittet i stället för att gömmas.
 *
 * **Å, ä och ö går inte att få tillbaka.** `erik.oberg@` blir `Erik Oberg`,
 * aldrig `Erik Öberg`. Informationen finns inte i adressen, och att gissa
 * skulle ge fel namn på just de personer vars namn oftast stavas fel ändå.
 *
 * **Vilken del som är förnamn är en konvention, inte ett faktum.**
 * `karlsson.anna@` ser likadan ut som `anna.karlsson@`. Ordningen är därför
 * ett val användaren gör för hela kolumnen, precis som dag eller månad först
 * i datumverktyget.
 */

/** Adresser som hör till en funktion i stället för en person. */
const ROLLKONTON = new Set([
  'info',
  'kontakt',
  'contact',
  'support',
  'help',
  'helpdesk',
  'kundtjanst',
  'kundservice',
  'service',
  'order',
  'orders',
  'bestallning',
  'faktura',
  'fakturor',
  'invoice',
  'ekonomi',
  'kassa',
  'admin',
  'administration',
  'webmaster',
  'postmaster',
  'hostmaster',
  'abuse',
  'security',
  'noreply',
  'no-reply',
  'donotreply',
  'mail',
  'email',
  'post',
  'brev',
  'hej',
  'hello',
  'hallo',
  'office',
  'kontor',
  'reception',
  'hr',
  'jobb',
  'jobs',
  'karriar',
  'rekrytering',
  'press',
  'media',
  'marknad',
  'marketing',
  'sales',
  'salj',
  'forsaljning',
  'styrelsen',
  'styrelse',
  'kansli',
  'expedition',
  'it',
  'drift',
  'teknik',
  'webb',
  'web',
  'nyhetsbrev',
  'newsletter',
])

/** Domäner för privatpersoner. Listan är kort med flit: bara de vanliga. */
const PRIVATA_DOMANER = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.se',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.se',
  'live.se',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.se',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'gmx.com',
  'gmx.de',
  'telia.com',
  'telia.se',
  'comhem.se',
  'bredband.net',
  'bredband2.com',
  'tele2.se',
  'glocalnet.net',
  'spray.se',
  'passagen.se',
  'bahnhof.se',
  'home.se',
  'swipnet.se',
  'zoho.com',
  'yandex.ru',
  'mail.ru',
  'web.de',
])

/**
 * Toppdomäner som består av två delar.
 *
 * Utan den här listan skulle `firma.co.uk` få huvuddomänen `co`. Listan täcker
 * de former en svensk fil realistiskt innehåller; en fullständig lista över
 * publika suffix är ett eget bibliotek och en egen nedladdning.
 */
const TVADELADE_SUFFIX = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'co.jp',
  'co.nz',
  'co.za',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'com.tr',
  'com.cn',
  'pp.se',
  'tv.se',
])

const EPOST = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/

export interface Epostdel {
  /** Allt före @, i gemener. */
  lokal: string
  /** Allt efter @, i gemener. */
  doman: string
  /** Domänen utan toppdomän: `nordbygg` ur `nordbygg.se`. */
  huvuddoman: string
  /** Toppdomänen: `se`, `com`, `co.uk`. */
  toppdoman: string
  fornamn: string
  efternamn: string
  rollkonto: boolean
  /** Domänen är en känd privatadress. */
  privat: boolean
}

export interface Epostval {
  /** Efternamnet står först i den lokala delen: `karlsson.anna@`. */
  efternamnForst: boolean
}

export const STANDARDVAL: Epostval = { efternamnForst: false }

/** Versalisering som klarar bindestreck och apostrof: Anna-Lena, O'Brien, C-J. */
function storForstaBokstav(value: string): string {
  return value
    .toLocaleLowerCase('sv')
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, fore: string, bokstav: string) =>
      fore + bokstav.toLocaleUpperCase('sv'),
    )
}

/**
 * Delar upp den lokala delen i namndelar.
 *
 * Punkt och understreck delar alltid. Bindestreck delar **bara** när det inte
 * finns någon annan avgränsare — annars skulle `c-j.nilsson` bli tre delar i
 * stället för Carl-Johans initialer plus efternamn.
 */
function delaLokal(lokal: string): string[] {
  const utanSiffror = lokal.replace(/[._-]?\d+$/, '')
  const bas = utanSiffror === '' ? lokal : utanSiffror
  const delar = bas.includes('.') || bas.includes('_') ? bas.split(/[._]+/) : bas.split('-')
  return delar.filter((d) => d !== '')
}

export function delaEpost(rawValue: string, val: Epostval = STANDARDVAL): Epostdel | null {
  const value = normalizeAlways(rawValue).trim().toLocaleLowerCase('sv')
  const m = EPOST.exec(value)
  if (!m) return null

  const lokal = m[1]!
  const doman = m[2]!

  const etiketter = doman.split('.')
  const tva = etiketter.slice(-2).join('.')
  const toppdoman = TVADELADE_SUFFIX.has(tva) ? tva : (etiketter[etiketter.length - 1] ?? '')
  const utanTopp = doman.slice(0, doman.length - toppdoman.length - 1)
  const huvuddoman = utanTopp.split('.').pop() ?? utanTopp

  const rollkonto = ROLLKONTON.has(lokal.replace(/\d+$/, ''))
  const privat = PRIVATA_DOMANER.has(doman)

  let fornamn = ''
  let efternamn = ''
  const delar = delaLokal(lokal)
  // Ett rollkonto är ingen person, och `info` är inte ett förnamn.
  if (!rollkonto && delar.length >= 2) {
    if (val.efternamnForst) {
      efternamn = storForstaBokstav(delar[0]!)
      fornamn = delar.slice(1).map(storForstaBokstav).join(' ')
    } else {
      efternamn = storForstaBokstav(delar[delar.length - 1]!)
      fornamn = delar.slice(0, -1).map(storForstaBokstav).join(' ')
    }
  }

  return { lokal, doman, huvuddoman, toppdoman, fornamn, efternamn, rollkonto, privat }
}

export type Epostfalt =
  | 'fornamn'
  | 'efternamn'
  | 'helt-namn'
  | 'lokal'
  | 'doman'
  | 'huvuddoman'
  | 'toppdoman'

export const EPOSTFALT: { varde: Epostfalt; etikett: string; exempel: string }[] = [
  { varde: 'fornamn', etikett: 'Förnamn', exempel: 'Anna' },
  { varde: 'efternamn', etikett: 'Efternamn', exempel: 'Karlsson' },
  { varde: 'helt-namn', etikett: 'Förnamn Efternamn', exempel: 'Anna Karlsson' },
  { varde: 'lokal', etikett: 'Allt före @', exempel: 'anna.karlsson' },
  { varde: 'doman', etikett: 'Domän', exempel: 'nordbygg.se' },
  { varde: 'huvuddoman', etikett: 'Domän utan toppdomän', exempel: 'nordbygg' },
  { varde: 'toppdoman', etikett: 'Toppdomän', exempel: 'se' },
]

export function lasFalt(del: Epostdel, falt: Epostfalt): string {
  switch (falt) {
    case 'fornamn':
      return del.fornamn
    case 'efternamn':
      return del.efternamn
    case 'helt-namn':
      return [del.fornamn, del.efternamn].filter((d) => d !== '').join(' ')
    case 'lokal':
      return del.lokal
    case 'doman':
      return del.doman
    case 'huvuddoman':
      return del.huvuddoman
    case 'toppdoman':
      return del.toppdoman
  }
}

/**
 * Bygger transformen som fyller den nya kolumnen.
 *
 * En adress som inte går att dela ger tom sträng i stället för skräp. Det som
 * inte gick att utläsa syns då som en lucka, vilket är lättare att åtgärda än
 * ett värde som ser rimligt ut men är fel.
 */
export function epostTransform(falt: Epostfalt, val: Epostval = STANDARDVAL): (value: string) => string {
  return (value: string) => {
    const del = delaEpost(value, val)
    return del ? lasFalt(del, falt) : ''
  }
}

export interface Epostinventering {
  /** Antal celler som ser ut som e-postadresser. */
  adresser: number
  /** Antal celler som inte gör det. */
  ejAdress: number
  /** Antal adresser där namnet gick att dela upp. */
  medNamn: number
  rollkonton: number
  privata: number
  /** Vanligaste domänerna, störst först. */
  domaner: { doman: string; antal: number }[]
  /** Ett exempel per utfall, ur den egna filen. */
  exempelNamn: { adress: string; fornamn: string; efternamn: string } | null
  exempelUtanNamn: string | null
}

export function inventeraEpost(
  varden: readonly string[],
  val: Epostval = STANDARDVAL,
  vikter?: readonly number[],
): Epostinventering {
  let adresser = 0
  let ejAdress = 0
  let medNamn = 0
  let rollkonton = 0
  let privata = 0
  const domaner = new Map<string, number>()
  let exempelNamn: Epostinventering['exempelNamn'] = null
  let exempelUtanNamn: string | null = null

  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!.trim()
    if (value === '') continue
    const vikt = vikter ? (vikter[i] ?? 0) : 1
    if (vikt === 0) continue

    const del = delaEpost(value, val)
    if (!del) {
      ejAdress += vikt
      continue
    }
    adresser += vikt
    domaner.set(del.doman, (domaner.get(del.doman) ?? 0) + vikt)
    if (del.rollkonto) rollkonton += vikt
    if (del.privat) privata += vikt
    if (del.fornamn !== '' || del.efternamn !== '') {
      medNamn += vikt
      exempelNamn ??= { adress: value, fornamn: del.fornamn, efternamn: del.efternamn }
    } else {
      exempelUtanNamn ??= value
    }
  }

  return {
    adresser,
    ejAdress,
    medNamn,
    rollkonton,
    privata,
    domaner: [...domaner.entries()]
      .map(([doman, antal]) => ({ doman, antal }))
      .sort((a, b) => b.antal - a.antal),
    exempelNamn,
    exempelUtanNamn,
  }
}
