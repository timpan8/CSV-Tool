import type { Column, ColumnId, Frame } from '../types.js'
import { createColumn, getCell, intern } from '../frame/column.js'
import { findColumn, identityView, newFrameId, uniqueColumnName } from '../frame/frame.js'
import { inferAllTypes } from '../infer.js'
import { kolumnrang, talnycklar, TOM_RANG } from '../frame/rank.js'
import { byggNormaliserare, gruppIder, type Normalisering } from './duplicates.js'
import { sorteraNiva } from './sort.js'
import { skrivTal, type Talformat } from './numbers.js'

/**
 * Gruppera och summera.
 *
 * Etapp 11 del 1 gav verktyget ett räknesätt per rad. Det här är den andra
 * halvan: ett svar per *grupp* av rader. ”Summa Belopp per Ort”, ”antal
 * ordrar per kund”, ”första och sista datum per projekt” — frågor som annars
 * kräver ett kalkylark och en pivottabell.
 *
 * **Grupperingen är samma beräkning som dubblettvyn gör.** Varje
 * nyckelkolumns ordbok normaliseras till ett grupp-id (`gruppIder`), raderna
 * räknesorteras på dessa id:n med `sorteraNiva`, och lika rader hamnar då
 * intill varandra så att ett linjärt svep hittar grupperna. Att dela koden är
 * inte bara mindre skrivande: det garanterar att *hitta dubbletter i Ort* och
 * *summera per Ort* är eniga om vad som räknas som samma ort.
 *
 * **Beräkningarna läser per ordbokskod, inte per cell.** Talvärden kommer ur
 * `talnycklar` och ordningen ur `kolumnrang` — båda cachade per kolumn och
 * delade med sortering och filter, så en summa över 200 000 rader tolkar lika
 * många tal som kolumnen har *unika* värden.
 *
 * **Grupperingen går på det du ser.** Har du filtrerat till 2024 är summan
 * 2024 års summa. En summering som tyst räknar bortfiltrerade rader är den
 * sortens fel som inte upptäcks förrän någon jämför mot facit.
 */

/** Vad en beräkning svarar på. */
export type Berakningstyp =
  | 'antal'
  | 'ifyllda'
  | 'unika'
  | 'summa'
  | 'snitt'
  | 'minsta'
  | 'storsta'
  | 'forsta'
  | 'sista'
  | 'lista'

export interface Berakningspost {
  typ: Berakningstyp
  etikett: string
  /** Sant när beräkningen behöver en kolumn att räkna på. */
  behoverKolumn: boolean
  /** Sant när beräkningen läser värdena som tal. */
  taluppgift: boolean
  hjalp: string
}

export const BERAKNINGAR: Berakningspost[] = [
  {
    typ: 'antal',
    etikett: 'Antal rader',
    behoverKolumn: false,
    taluppgift: false,
    hjalp: 'Hur många rader gruppen har. Räknar även tomma.',
  },
  {
    typ: 'summa',
    etikett: 'Summa',
    behoverKolumn: true,
    taluppgift: true,
    hjalp: 'Lägger ihop värdena. Det som inte går att läsa som tal räknas inte med.',
  },
  {
    typ: 'snitt',
    etikett: 'Snitt',
    behoverKolumn: true,
    taluppgift: true,
    hjalp: 'Summan delad med antalet värden som gick att läsa som tal.',
  },
  {
    typ: 'minsta',
    etikett: 'Minsta',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Det första värdet i kolumnens egen ordning — minsta talet, tidigaste datumet, första ordet.',
  },
  {
    typ: 'storsta',
    etikett: 'Största',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Det sista värdet i kolumnens egen ordning — största talet, senaste datumet, sista ordet.',
  },
  {
    typ: 'ifyllda',
    etikett: 'Antal ifyllda',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Hur många av gruppens rader som har ett värde i kolumnen.',
  },
  {
    typ: 'unika',
    etikett: 'Antal unika',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Hur många olika värden gruppen har i kolumnen.',
  },
  {
    typ: 'forsta',
    etikett: 'Första värdet',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Det första ifyllda värdet, i den ordning raderna visas.',
  },
  {
    typ: 'sista',
    etikett: 'Sista värdet',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Det sista ifyllda värdet, i den ordning raderna visas.',
  },
  {
    typ: 'lista',
    etikett: 'Lista värdena',
    behoverKolumn: true,
    taluppgift: false,
    hjalp: 'Gruppens olika värden på en rad, åtskilda med komma.',
  },
]

export function berakningspost(typ: Berakningstyp): Berakningspost {
  return BERAKNINGAR.find((b) => b.typ === typ) ?? BERAKNINGAR[0]!
}

export interface Berakning {
  id: string
  typ: Berakningstyp
  /** Kolumnen som räknas. `null` bara för *Antal rader*. */
  colId: ColumnId | null
  /** Egen rubrik i resultatet, eller tom sträng för den automatiska. */
  namn: string
}

export interface Grupperingsplan {
  /** Kolumnerna som avgör vilka rader som hör ihop. Tom lista ger en enda grupp. */
  nycklar: ColumnId[]
  berakningar: readonly Berakning[]
  strunta: Normalisering
  /** Ta med de rader vars hela nyckel är tom. */
  tommaMed: boolean
  /** Namn på resultatfliken. */
  namn: string
  format: Talformat
  decimaler: number | null
}

/** Hur många värden en beräkning faktiskt kunde läsa. */
export interface Lasbarhet {
  id: string
  /** Celler den kunde räkna på. */
  lasta: number
  /** Ifyllda celler den tittade på. */
  ifyllda: number
}

export interface Grupperingsresultat {
  frame: Frame
  antalGrupper: number
  /** Rader som kom med i någon grupp. */
  radermed: number
  /** Rader som lämnades utanför för att hela nyckeln var tom. */
  utanNyckel: number
  /** Största gruppens storlek. */
  storsta: number
  lasbarhet: Lasbarhet[]
}

/**
 * Så många värden `lista` radar upp innan den säger hur många fler det fanns.
 *
 * Utan tak kan en enda cell bli en megabyte, och en cell ingen kan läsa är
 * inte ett svar. Taket står i värdet — `… (+128 till)` — så att en kapad
 * lista aldrig ser ut som en fullständig.
 */
export const LISTTAK = 50

/** Automatisk rubrik för en beräkning. */
export function berakningsnamn(berakning: Berakning, frame: Frame): string {
  if (berakning.namn.trim() !== '') return berakning.namn.trim()
  if (berakning.typ === 'antal') return 'Antal rader'
  const col = berakning.colId === null ? undefined : findColumn(frame, berakning.colId)
  const kolumn = col?.name ?? '?'
  switch (berakning.typ) {
    case 'summa':
      return `Summa ${kolumn}`
    case 'snitt':
      return `Snitt ${kolumn}`
    case 'minsta':
      return `Minsta ${kolumn}`
    case 'storsta':
      return `Största ${kolumn}`
    case 'ifyllda':
      return `Ifyllda ${kolumn}`
    case 'unika':
      return `Unika ${kolumn}`
    case 'forsta':
      return `Första ${kolumn}`
    case 'sista':
      return `Sista ${kolumn}`
    case 'lista':
      return `${kolumn} (lista)`
  }
}

/** Förslag på namn för resultatfliken. */
export function forslagsnamn(frame: Frame, nycklar: readonly ColumnId[]): string {
  const namn = nycklar
    .map((id) => findColumn(frame, id)?.name)
    .filter((n): n is string => n !== undefined)
  if (namn.length === 0) return `${frame.name} – sammanfattning`
  return `${frame.name} per ${namn.join(', ')}`
}

interface Grupp {
  /** Index i den sorterade radlistan, [start, slut). */
  start: number
  slut: number
  /** Gruppens första rad i visningsordning — bestämmer resultatets radordning. */
  plats: number
}

export function gruppera(frame: Frame, plan: Grupperingsplan): Grupperingsresultat {
  const nyckelkolumner = plan.nycklar
    .map((id) => findColumn(frame, id))
    .filter((c): c is Column => c !== undefined)

  const normalisera = byggNormaliserare(plan.strunta)

  // Ett grupp-id per rad och nyckelkolumn, räknat ur ordboken.
  const nycklar: Uint32Array[] = []
  const hinkar: number[] = []
  for (const col of nyckelkolumner) {
    const ider = gruppIder(col, normalisera)
    const perRad = new Uint32Array(frame.rowCount)
    let max = 0
    for (let r = 0; r < frame.rowCount; r++) {
      const id = ider[col.codes[r]!]!
      perRad[r] = id
      if (id > max) max = id
    }
    nycklar.push(perRad)
    hinkar.push(max + 1)
  }

  /*
   * Sorteringen utgår från `frame.view` och inte från alla rader.
   *
   * Det är vad som gör att summan gäller det du ser, och samtidigt vad som
   * gör att *Första värdet* betyder första i din ordning: räknesorteringen är
   * stabil, så inom en grupp står raderna kvar i vyns ordning.
   */
  let rader: Uint32Array = Uint32Array.from(frame.view)
  for (let i = nycklar.length - 1; i >= 0; i--) {
    rader = sorteraNiva(rader, nycklar[i]!, hinkar[i]!)
  }

  // Radens plats i vyn, för att kunna lägga grupperna i den ordning de dyker
  // upp på skärmen i stället för i ordbokens.
  const plats = new Uint32Array(frame.rowCount)
  for (let i = 0; i < frame.view.length; i++) plats[frame.view[i]!] = i

  const lika = (a: number, b: number): boolean =>
    nycklar.every((nyckelrad) => nyckelrad[a] === nyckelrad[b])
  const heltTom = (r: number): boolean => nycklar.every((nyckelrad) => nyckelrad[r] === 0)

  const grupper: Grupp[] = []
  let utanNyckel = 0
  let radermed = 0
  let storsta = 0

  let i = 0
  while (i < rader.length) {
    let j = i + 1
    while (j < rader.length && lika(rader[i]!, rader[j]!)) j += 1
    const storlek = j - i
    // En tom nyckel är ingen grupp — den är frånvaron av en. Att slå ihop alla
    // rader utan ort till en rad som heter ingenting är sällan vad man vill,
    // men ibland precis det, så det är ett val och inte en regel.
    if (nyckelkolumner.length > 0 && !plan.tommaMed && heltTom(rader[i]!)) {
      utanNyckel += storlek
    } else {
      grupper.push({ start: i, slut: j, plats: plats[rader[i]!]! })
      radermed += storlek
      if (storlek > storsta) storsta = storlek
    }
    i = j
  }

  grupper.sort((a, b) => a.plats - b.plats)

  const kolumner: Column[] = []
  const tagna: string[] = []
  const antalGrupper = grupper.length

  for (const kall of nyckelkolumner) {
    const namn = uniqueColumnName(tagna, kall.name)
    tagna.push(namn)
    const col = createColumn(namn, antalGrupper)
    // Värdet är gruppens *första* rad, inte det normaliserade. Har du struntat
    // i skiftläget står det ”Malmö” om det var stavningen som kom först — och
    // det är i alla fall ett av de värden som faktiskt fanns i filen.
    for (let g = 0; g < antalGrupper; g++) {
      col.codes[g] = intern(col, getCell(kall, rader[grupper[g]!.start]!))
    }
    col.type = kall.type
    col.typeLocked = kall.typeLocked
    kolumner.push(col)
  }

  const lasbarhet: Lasbarhet[] = []
  for (const berakning of plan.berakningar) {
    const namn = uniqueColumnName(tagna, berakningsnamn(berakning, frame))
    tagna.push(namn)
    const { col, lasta, ifyllda } = byggBerakning(namn, berakning, frame, plan, rader, grupper)
    lasbarhet.push({ id: berakning.id, lasta, ifyllda })
    kolumner.push(col)
  }

  // Typen är en tolkning av datat, och det sammanfattade datat är inte
  // källans. Det som är tal eller text per konstruktion har redan låsts i
  // `byggBerakning`, och `inferAllTypes` rör inte låsta kolumner.
  inferAllTypes(kolumner)

  const resultat: Frame = {
    id: newFrameId(),
    name: plan.namn.trim() === '' ? forslagsnamn(frame, plan.nycklar) : plan.namn.trim(),
    columns: kolumner,
    rowCount: antalGrupper,
    view: identityView(antalGrupper),
    // Radnummer 0 betyder ”fanns inte i filen”, och det stämmer: en
    // sammanfattningsrad är många rader och ingen av dem.
    sourceRow: new Uint32Array(antalGrupper),
    meta: { warnings: [] },
  }

  return { frame: resultat, antalGrupper, radermed, utanNyckel, storsta, lasbarhet }
}

function byggBerakning(
  namn: string,
  berakning: Berakning,
  frame: Frame,
  plan: Grupperingsplan,
  rader: Uint32Array,
  grupper: readonly Grupp[],
): { col: Column; lasta: number; ifyllda: number } {
  const col = createColumn(namn, grupper.length)
  const kall = berakning.colId === null ? undefined : findColumn(frame, berakning.colId)

  if (berakning.typ === 'antal') {
    col.type = 'number'
    col.typeLocked = true
    for (let g = 0; g < grupper.length; g++) {
      const grupp = grupper[g]!
      col.codes[g] = intern(col, String(grupp.slut - grupp.start))
    }
    return { col, lasta: 0, ifyllda: 0 }
  }

  // En beräkning vars kolumn tagits bort ger en tom kolumn i stället för att
  // kasta. Det är samma val som sorteringen gör för en borttagen nivå.
  if (!kall) return { col, lasta: 0, ifyllda: 0 }

  let lasta = 0
  let ifyllda = 0
  const skriv = (n: number) => skrivTal(n, plan.format, plan.decimaler)

  switch (berakning.typ) {
    case 'summa':
    case 'snitt': {
      col.type = 'number'
      col.typeLocked = true
      const tal = talnycklar(kall)
      for (let g = 0; g < grupper.length; g++) {
        const grupp = grupper[g]!
        let summa = 0
        let antal = 0
        for (let k = grupp.start; k < grupp.slut; k++) {
          const kod = kall.codes[rader[k]!]!
          if (kod === 0) continue
          ifyllda += 1
          const v = tal[kod]!
          if (Number.isNaN(v)) continue
          summa += v
          antal += 1
        }
        lasta += antal
        // Noll läsbara värden ger tom cell, aldrig 0. En tom cell är okänd,
        // och en nolla man inte kan skilja från ”inget att räkna på” är just
        // det fel som inte syns förrän någon jämför mot facit.
        if (antal === 0) continue
        col.codes[g] = intern(col, skriv(berakning.typ === 'summa' ? summa : summa / antal))
      }
      break
    }

    case 'minsta':
    case 'storsta': {
      // Ordningen är kolumnens egen — samma rang som sorteringen använder, så
      // ett datum jämförs som datum och ett tal som tal, och det som skrivs ut
      // är värdet så som det står i filen.
      const { rang } = kolumnrang(kall)
      const minsta = berakning.typ === 'minsta'
      col.type = kall.type
      col.typeLocked = kall.typeLocked
      for (let g = 0; g < grupper.length; g++) {
        const grupp = grupper[g]!
        let bastKod = 0
        let bastRang = 0
        for (let k = grupp.start; k < grupp.slut; k++) {
          const kod = kall.codes[rader[k]!]!
          if (kod === 0) continue
          ifyllda += 1
          const r = rang[kod]!
          if (r === TOM_RANG) continue
          lasta += 1
          if (bastKod === 0 || (minsta ? r < bastRang : r > bastRang)) {
            bastKod = kod
            bastRang = r
          }
        }
        if (bastKod !== 0) col.codes[g] = intern(col, kall.dict[bastKod]!)
      }
      break
    }

    case 'ifyllda':
    case 'unika': {
      col.type = 'number'
      col.typeLocked = true
      // Stämpelfältet nollställs genom att gruppnumret räknas upp — billigare
      // än en ny mängd per grupp, och det är gruppantalet gånger ordboken vi
      // annars hade betalat.
      const sedd = berakning.typ === 'unika' ? new Uint32Array(kall.dict.length) : null
      for (let g = 0; g < grupper.length; g++) {
        const grupp = grupper[g]!
        let antal = 0
        for (let k = grupp.start; k < grupp.slut; k++) {
          const kod = kall.codes[rader[k]!]!
          if (kod === 0) continue
          ifyllda += 1
          if (sedd === null) {
            antal += 1
          } else if (sedd[kod] !== g + 1) {
            sedd[kod] = g + 1
            antal += 1
          }
        }
        lasta += antal
        col.codes[g] = intern(col, String(antal))
      }
      break
    }

    case 'forsta':
    case 'sista': {
      col.type = kall.type
      col.typeLocked = kall.typeLocked
      const bakifran = berakning.typ === 'sista'
      for (let g = 0; g < grupper.length; g++) {
        const grupp = grupper[g]!
        let traff = 0
        for (let n = 0; n < grupp.slut - grupp.start; n++) {
          const k = bakifran ? grupp.slut - 1 - n : grupp.start + n
          const kod = kall.codes[rader[k]!]!
          if (kod === 0) continue
          traff = kod
          break
        }
        // Ifyllda räknas över hela gruppen, inte bara fram till träffen — det
        // är antalet celler frågan gällde.
        for (let k = grupp.start; k < grupp.slut; k++) {
          if (kall.codes[rader[k]!]! !== 0) ifyllda += 1
        }
        if (traff !== 0) {
          lasta += 1
          col.codes[g] = intern(col, kall.dict[traff]!)
        }
      }
      break
    }

    case 'lista': {
      col.type = 'text'
      col.typeLocked = true
      const sedd = new Uint32Array(kall.dict.length)
      for (let g = 0; g < grupper.length; g++) {
        const grupp = grupper[g]!
        const varden: string[] = []
        let unika = 0
        for (let k = grupp.start; k < grupp.slut; k++) {
          const kod = kall.codes[rader[k]!]!
          if (kod === 0) continue
          ifyllda += 1
          if (sedd[kod] === g + 1) continue
          sedd[kod] = g + 1
          unika += 1
          if (varden.length < LISTTAK) varden.push(kall.dict[kod]!)
        }
        lasta += unika
        if (unika === 0) continue
        const kvar = unika - varden.length
        col.codes[g] = intern(
          col,
          kvar > 0 ? `${varden.join(', ')} … (+${kvar} till)` : varden.join(', '),
        )
      }
      break
    }
  }

  return { col, lasta, ifyllda }
}
