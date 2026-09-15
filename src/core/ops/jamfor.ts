import type { Column, ColumnId, Frame } from '../types.js'
import { createColumn, intern } from '../frame/column.js'
import { findColumn } from '../frame/frame.js'
import { MATCHNINGSTYPER, normalisera, nyckelantal, type Matchningstyp } from './match.js'

/**
 * Jämför två tabeller.
 *
 * Sammanslagningen svarar på *vilka rader hör ihop* och bygger en ny fil av
 * svaret. Det här verktyget svarar på en enklare fråga — *är det här samma
 * sak?* — och skriver svaret tillbaka i de filer man redan har, som färg
 * eller som en kolumn. Två sätt att fråga:
 *
 * **Rad mot rad** ställer rad 1 mot rad 1, rad 2 mot rad 2, i den ordning
 * man *ser* raderna. Att det går på vyn och inte på filen är hela poängen:
 * sortera båda flikarna på samma nyckel först, och jämförelsen möter rätt
 * rader. Två exporter av samma register skiljer sig sällan i ordning men
 * ofta i en cell.
 *
 * **Finns någonstans** letar upp varje värde i vänsterkolumnen var som helst
 * i högerkolumnen. Det räcker att det finns; antalet räknas och visas.
 *
 * **Varje kolumnpar bedöms för sig.** Sammanslagningen slår ihop paren till
 * en nyckel, för där är frågan om raden som helhet. Här är frågan om
 * kolumnen: `Namn` kan stämma medan `E-post` skiljer sig, och det är just
 * det man vill se.
 *
 * Normaliseringen är sammanslagningens egen (`normalisera`), så `Öberg` och
 * `oberg` är lika på samma villkor på båda ställena. Tomma värden matchar
 * aldrig något i uppslagsläget, av samma skäl som tomma nycklar aldrig
 * matchar i hashjoinen.
 */

export type Jamforlage = 'radMotRad' | 'finnsNagonstans'

export type Jamfortyp = 'exakt' | 'oberoende' | 'accentoberoende' | 'siffror'

/** De matchningstyper som läser en kolumn på varje sida. */
export const JAMFORTYPER = MATCHNINGSTYPER.filter(
  (m): m is (typeof MATCHNINGSTYPER)[number] & { typ: Jamfortyp } =>
    !m.tvaHoger && m.typ !== 'epostNamn',
)

export interface Jamforpar {
  vansterColId: ColumnId
  hogerColId: ColumnId
  typ: Jamfortyp
}

/**
 * Utfallet per rad, som en byte.
 *
 * `badaTomma` skiljs från `lika` för att räknas för sig — två tomma celler
 * är inte ett bevis på att något stämmer — men ordnas och färgas som lika.
 * `tom` finns bara i uppslagsläget: vänstervärdet saknas, så det finns
 * inget att leta efter.
 */
export const Utfall = {
  ejJamford: 0,
  lika: 1,
  skiljer: 2,
  saknas: 3,
  badaTomma: 4,
  tom: 5,
} as const

export type Utfallskod = (typeof Utfall)[keyof typeof Utfall]

export const UTFALLSKODER: readonly Utfallskod[] = [1, 2, 3, 4, 5]

/** Texten som skrivs i resultatkolumnen. Data, alltså svenska som Träff. */
export const UTFALLSTEXT: Record<Utfallskod, string> = {
  0: '',
  1: 'lika',
  2: 'skiljer sig',
  3: 'saknas',
  4: 'båda tomma',
  5: 'tom',
}

/** Kolumnens egen ordning: från samstämmigt till frånvarande, som Träff. */
export const UTFALLSORDNING: readonly string[] = ['lika', 'båda tomma', 'skiljer sig', 'saknas', 'tom']

/** Palettfärgen per utfall. `lika` grön, `skiljer sig` röd, `saknas` orange. */
export const UTFALLSFARG: Partial<Record<Utfallskod, number>> = { 1: 3, 2: 7, 3: 2 }

export interface Sidoresultat {
  /** Utfallskod per fysisk rad; 0 för rader som inte jämfördes. */
  utfall: Uint8Array
  /** Uppslagsläget: antal förekomster i den andra kolumnen, per fysisk rad. */
  traffar: Uint32Array | null
  antal: Record<Utfallskod, number>
}

export interface Parresultat {
  par: Jamforpar
  vanster: Sidoresultat
  hoger: Sidoresultat
}

/** Normaliserad form per ordbokspost — en gång per unikt värde, inte per rad. */
export function normaliseradOrdbok(col: Column, typ: Jamfortyp): string[] {
  const ut = new Array<string>(col.dict.length)
  for (let k = 0; k < col.dict.length; k++) ut[k] = normalisera(col.dict[k]!, typ)
  return ut
}

function tomSida(rowCount: number, medTraffar: boolean): Sidoresultat {
  return {
    utfall: new Uint8Array(rowCount),
    traffar: medTraffar ? new Uint32Array(rowCount) : null,
    antal: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  }
}

function skriv(sida: Sidoresultat, rad: number, kod: Utfallskod): void {
  sida.utfall[rad] = kod
  sida.antal[kod] += 1
}

function radMotRad(vanster: Frame, hoger: Frame, colV: Column, colH: Column, typ: Jamfortyp): Parresultat['vanster'][] {
  const nV = normaliseradOrdbok(colV, typ)
  const nH = normaliseradOrdbok(colH, typ)
  const v = tomSida(vanster.rowCount, false)
  const h = tomSida(hoger.rowCount, false)
  const n = Math.max(vanster.view.length, hoger.view.length)
  for (let i = 0; i < n; i++) {
    const a = vanster.view[i]
    const b = hoger.view[i]
    if (a === undefined) {
      skriv(h, b!, Utfall.saknas)
      continue
    }
    if (b === undefined) {
      skriv(v, a, Utfall.saknas)
      continue
    }
    const ka = nV[colV.codes[a]!]!
    const kb = nH[colH.codes[b]!]!
    const kod: Utfallskod =
      ka === '' && kb === '' ? Utfall.badaTomma : ka === kb ? Utfall.lika : Utfall.skiljer
    skriv(v, a, kod)
    skriv(h, b, kod)
  }
  return [v, h]
}

/** Ena sidan av ett uppslag: varje värde i `col` letas upp i `andra`. */
function slaUpp(frame: Frame, col: Column, typ: Jamfortyp, andra: Map<string, number>): Sidoresultat {
  const norm = normaliseradOrdbok(col, typ)
  const perKod = new Uint8Array(col.dict.length)
  const antalPerKod = new Uint32Array(col.dict.length)
  for (let k = 0; k < col.dict.length; k++) {
    const nyckel = norm[k]!
    if (nyckel === '') {
      perKod[k] = Utfall.tom
      continue
    }
    const n = andra.get(nyckel) ?? 0
    antalPerKod[k] = n
    perKod[k] = n > 0 ? Utfall.lika : Utfall.saknas
  }
  const sida = tomSida(frame.rowCount, true)
  for (let i = 0; i < frame.view.length; i++) {
    const r = frame.view[i]!
    const kod = col.codes[r]!
    skriv(sida, r, perKod[kod] as Utfallskod)
    sida.traffar![r] = antalPerKod[kod]!
  }
  return sida
}

/** Jämför ett par. Null när någon av kolumnerna inte finns längre. */
export function jamforPar(
  vanster: Frame,
  hoger: Frame,
  par: Jamforpar,
  lage: Jamforlage,
): Parresultat | null {
  const colV = findColumn(vanster, par.vansterColId)
  const colH = findColumn(hoger, par.hogerColId)
  if (!colV || !colH) return null
  if (lage === 'radMotRad') {
    const [v, h] = radMotRad(vanster, hoger, colV, colH, par.typ)
    return { par, vanster: v!, hoger: h! }
  }
  // Uppslaget räknas åt båda hållen, så att båda flikarna kan färgas — och
  // så att "saknas i vänster" är lika synligt som "saknas i höger".
  const antalH = nyckelantal(colH, par.typ as Matchningstyp)
  const antalV = nyckelantal(colV, par.typ as Matchningstyp)
  return {
    par,
    vanster: slaUpp(vanster, colV, par.typ, antalH),
    hoger: slaUpp(hoger, colH, par.typ, antalV),
  }
}

/** Alla par, vart och ett för sig. Par vars kolumner saknas hoppas över. */
export function jamfor(
  vanster: Frame,
  hoger: Frame,
  par: readonly Jamforpar[],
  lage: Jamforlage,
): Parresultat[] {
  const ut: Parresultat[] = []
  for (const p of par) {
    const r = jamforPar(vanster, hoger, p, lage)
    if (r) ut.push(r)
  }
  return ut
}

/**
 * Resultatkolumnen: utfallet som text, per rad.
 *
 * Typlåst text med kolumnens egen ordning, så att en sortering lägger
 * *lika* först och *saknas* sist i stället för i bokstavsordning. Fem
 * ordboksposter oavsett radantal.
 */
export function utfallskolumn(namn: string, sida: Sidoresultat, medAntal = false): Column {
  const col = createColumn(namn, sida.utfall.length, 'text')
  col.typeLocked = true
  col.sortordning = UTFALLSORDNING
  const koder = new Map<Utfallskod, number>()
  for (const k of UTFALLSKODER) koder.set(k, intern(col, UTFALLSTEXT[k]))
  for (let r = 0; r < sida.utfall.length; r++) {
    const u = sida.utfall[r] as Utfallskod
    if (u === 0) continue
    if (medAntal && sida.traffar && u === Utfall.lika && sida.traffar[r]! > 1) {
      col.codes[r] = intern(col, `${UTFALLSTEXT[u]} (${sida.traffar[r]})`)
      continue
    }
    col.codes[r] = koder.get(u)!
  }
  return col
}
