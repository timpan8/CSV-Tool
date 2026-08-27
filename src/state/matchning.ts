import { signal } from '@preact/signals'
import {
  matcha,
  slaSamman,
  type Matchning,
  type Matchningspar,
  type Sammanslagning,
  TOM_MATCHNING,
} from '../core/ops/match.js'
import { tabs, type Tab } from './store.js'
import { findColumn } from '../core/frame/frame.js'
import type { ColumnId, Frame } from '../core/types.js'

/**
 * Matchningsverkstaden: sessionen som betar av restlistorna.
 *
 * Den spänner över två flikar och hör därför inte hemma i en `Tab`. Vad den
 * håller reda på är inte data utan *arbete*: vilka par användaren gjort för
 * hand, vilka förslag som avvisats, och vilka rader som skrivits av.
 *
 * **Fysiska radindex är sessionens valuta**, samma som `Matchning.par`,
 * `vansterUtan` och `hogerUtan` redan talar. Det är därför den måste veta när
 * raderna numrerats om — se `synkaVerkstad`.
 */

export type Parkalla = 'runda' | 'forslag' | 'hand'

/** Ett par som verkstaden lagt till utöver den automatiska matchningen. */
export interface Extrapar {
  v: number
  h: number
  kalla: Parkalla
  /** Kort förklaring att visa i listan: "runda 2", "89 % lika", "för hand". */
  notis: string
}

export interface Runda {
  par: Matchningspar[]
  traffar: number
}

export interface Verkstad {
  vansterTabId: string
  hogerTabId: string
  /** Grundparen från dialogen. */
  par: Matchningspar[]
  sammanslagning: Sammanslagning
  extra: Extrapar[]
  /** Par användaren sagt nej till, som `${v}:${h}`. */
  avvisade: Set<string>
  avskrivnaVanster: Set<number>
  avskrivnaHoger: Set<number>
  rundor: Runda[]
  /** Radformen på vardera sidan när radindexen senast stämde. */
  vansterForm: Radform
  hogerForm: Radform
}

/**
 * Tabellens radform: vilka rader som finns och i vilken ordning.
 *
 * Två fält med olika roller. `sourceRow` är arrayobjektet — `rebuildRows`
 * byter alltid ut hela arrayen, så samma objekt betyder *säkert* oförändrad
 * radform och kostar en jämförelse. `signatur` är en hash över innehållet och
 * behövs bara när objektet bytts: den svarar på om bytet betydde något.
 */
export interface Radform {
  sourceRow: Uint32Array
  signatur: number
}

export const verkstad = signal<Verkstad | null>(null)

export interface Verkstadsflikar {
  vanster: Tab
  hoger: Tab
}

/** Flikarna sessionen arbetar med, eller null om någon av dem stängts. */
export function flikarna(): Verkstadsflikar | null {
  const s = verkstad.value
  if (!s) return null
  const vanster = tabs.value.find((t) => t.id === s.vansterTabId)
  const hoger = tabs.value.find((t) => t.id === s.hogerTabId)
  return vanster && hoger ? { vanster, hoger } : null
}

export function oppnaVerkstad(
  vanster: Tab,
  hoger: Tab,
  par: Matchningspar[],
  sammanslagning: Sammanslagning,
): void {
  verkstad.value = {
    vansterTabId: vanster.id,
    hogerTabId: hoger.id,
    par: par.map((p) => ({ ...p })),
    sammanslagning: { ...sammanslagning, hogerKolumner: [...sammanslagning.hogerKolumner] },
    extra: [],
    avvisade: new Set(),
    avskrivnaVanster: new Set(),
    avskrivnaHoger: new Set(),
    rundor: [],
    vansterForm: radform(vanster.frame),
    hogerForm: radform(hoger.frame),
  }
}

/**
 * Radformens signatur.
 *
 * FNV-1a över `frame.sourceRow`, samma sorts hash som `nyckelsignatur` i
 * `ordning.ts`. Radantalet ingår, eftersom en tabell som växt bakifrån annars
 * hade gett samma hash som innan.
 */
export function radformssignatur(frame: Frame): number {
  let h = Math.imul(0x811c9dc5 ^ frame.rowCount, 0x01000193)
  const kalla = frame.sourceRow
  for (let r = 0; r < kalla.length; r++) h = Math.imul(h ^ kalla[r]!, 0x01000193)
  return h >>> 0
}

function radform(frame: Frame): Radform {
  return { sourceRow: frame.sourceRow, signatur: radformssignatur(frame) }
}

/** Sant när ramens rader fortfarande är numrerade som när formen togs. */
function samma(frame: Frame, form: Radform): boolean {
  // Samma array betyder säkert oförändrad numrering, utan att räkna någonting.
  if (frame.sourceRow === form.sourceRow) return true
  return radformssignatur(frame) === form.signatur
}

export function stangVerkstad(): void {
  verkstad.value = null
}

export type Synkning = 'ingen' | 'ok' | 'stangd' | 'omnumrerad'

/**
 * Kontrollerar att sessionens radindex fortfarande betyder samma sak.
 *
 * Att skriva en cell numrerar aldrig om raderna. Att ta bort, infoga eller
 * dubblera rader gör det, och all sådan radmanipulation går genom
 * `rebuildRows` i `frame.ts` — som alltid sätter `frame.sourceRow` till en ny
 * `Uint32Array`. Därav den tvådelade kontrollen i `samma`: samma array är ett
 * gratis ja, och först när arrayen bytts kostar det en hash att avgöra om
 * bytet betydde något.
 *
 * Antalet rader duger inte som detektor. En borttagen rad plus en infogad ger
 * samma antal men en helt annan avbildning, och då hade verkstaden parat ihop
 * fel personer utan att någon sett det.
 *
 * Signaturen och inte bara identiteten, därför att en utbytt array inte alltid
 * betyder en ändrad numrering: att ångra en inklistring som inte utökade
 * tabellen sätter `frame.sourceRow` till en kopia med exakt samma innehåll.
 * Med enbart identitetsjämförelse hade det kastat arbetet i onödan.
 *
 * Anropas ur en effekt, aldrig under ritning: den skriver till signalen.
 */
export function synkaVerkstad(): Synkning {
  const s = verkstad.value
  if (!s) return 'ingen'
  const f = flikarna()
  if (!f) {
    verkstad.value = null
    return 'stangd'
  }
  const vOk = samma(f.vanster.frame, s.vansterForm)
  const hOk = samma(f.hoger.frame, s.hogerForm)
  if (vOk && hOk) {
    // Formen stämmer, men arrayen kan ha bytts. Förankra om, så att nästa
    // kontroll blir den billiga igen.
    if (
      f.vanster.frame.sourceRow !== s.vansterForm.sourceRow ||
      f.hoger.frame.sourceRow !== s.hogerForm.sourceRow
    ) {
      verkstad.value = {
        ...s,
        vansterForm: radform(f.vanster.frame),
        hogerForm: radform(f.hoger.frame),
      }
    }
    return 'ok'
  }

  const nagotAttKasta =
    s.extra.length > 0 ||
    s.avvisade.size > 0 ||
    s.avskrivnaVanster.size > 0 ||
    s.avskrivnaHoger.size > 0
  verkstad.value = {
    ...s,
    extra: [],
    avvisade: new Set(),
    avskrivnaVanster: new Set(),
    avskrivnaHoger: new Set(),
    rundor: [],
    vansterForm: radform(f.vanster.frame),
    hogerForm: radform(f.hoger.frame),
  }
  return nagotAttKasta ? 'omnumrerad' : 'ok'
}

/**
 * Nyckelkolumner som inte finns kvar.
 *
 * Tas en nyckelkolumn bort kraschar ingenting: `findColumn` ger `undefined`,
 * `byggNycklar` ger tom nyckel för varje rad, och *varje* rad blir en restrad.
 * Matchningen ser alltså ut att ha misslyckats när det är verkstaden som
 * tappat sin nyckel. Dialogen har samma hål men lever i sekunder; en verkstad
 * lever i minuter, och därför måste den säga till.
 *
 * Ren läsning — går att anropa under ritning.
 */
export function saknadeKolumner(f: Verkstadsflikar, s: Verkstad): ColumnId[] {
  const saknade: ColumnId[] = []
  for (const p of s.par) {
    if (!findColumn(f.vanster.frame, p.vansterColId)) saknade.push(p.vansterColId)
    if (!findColumn(f.hoger.frame, p.hogerColId)) saknade.push(p.hogerColId)
  }
  return saknade
}

/* ---------- Matchningen ---------- */

/** Den automatiska matchningen på grundparen. */
export function grundmatchning(f: Verkstadsflikar, s: Verkstad): Matchning {
  if (s.par.length === 0) return TOM_MATCHNING
  return matcha(f.vanster.frame, f.hoger.frame, s.par)
}

/** Grundmatchningen plus verkstadens egna par. Det är den som slås ihop. */
export function fullmatchning(f: Verkstadsflikar, s: Verkstad, bas: Matchning): Matchning {
  return slaSamman(bas, s.extra, f.vanster.frame, f.hoger.frame)
}

/**
 * Restlistorna: rader utan par, minus de avskrivna.
 *
 * Att en rad ligger här betyder att den saknar partner — inte att den saknas i
 * resultatet. En oparad vänsterrad följer ändå med, med tomma celler.
 */
export function restlistor(
  s: Verkstad,
  full: Matchning,
): { vanster: number[]; hoger: number[] } {
  return {
    vanster: full.vansterUtan.filter((r) => !s.avskrivnaVanster.has(r)),
    hoger: full.hogerUtan.filter((r) => !s.avskrivnaHoger.has(r)),
  }
}

/* ---------- Åtgärder ---------- */

function skriv(andra: (s: Verkstad) => Verkstad): void {
  const s = verkstad.value
  if (s) verkstad.value = andra(s)
}

/**
 * Parar ihop två rader.
 *
 * Restlistorna innehåller bara rader utan par, så ett handgjort par är alltid
 * ett rent 1:1-par mellan en vänsterrest och en högerrest: det kan varken
 * krocka med den automatiska matchningen eller skapa en flerträff. Bara en
 * runda kan göra det, och dess träffar är ekvivalensträffar precis som
 * grundmatchningens.
 */
export function laggExtrapar(v: number, h: number, kalla: Parkalla, notis: string): void {
  skriv((s) =>
    s.extra.some((p) => p.v === v && p.h === h)
      ? s
      : { ...s, extra: [...s.extra, { v, h, kalla, notis }] },
  )
}

export function taBortExtrapar(v: number, h: number): void {
  skriv((s) => ({ ...s, extra: s.extra.filter((p) => !(p.v === v && p.h === h)) }))
}

/**
 * Säger nej till ett förslag.
 *
 * Skiljer sig från att skriva av en rad: raden ligger kvar i listan, och andra
 * förslag för den kan fortfarande dyka upp. Det är bara just det här paret som
 * är fel.
 */
export function avvisaForslag(v: number, h: number): void {
  skriv((s) => ({ ...s, avvisade: new Set(s.avvisade).add(`${v}:${h}`) }))
}

export function arAvvisat(s: Verkstad, v: number, h: number): boolean {
  return s.avvisade.has(`${v}:${h}`)
}

/** Tar bort en rad ur restlistan. Ändrar ingenting i resultatet. */
export function skrivAv(sida: 'vanster' | 'hoger', rad: number): void {
  skriv((s) =>
    sida === 'vanster'
      ? { ...s, avskrivnaVanster: new Set(s.avskrivnaVanster).add(rad) }
      : { ...s, avskrivnaHoger: new Set(s.avskrivnaHoger).add(rad) },
  )
}

/** Skriver av allt som är kvar. Den som gjort 30 av 400 ska kunna säga stopp. */
export function skrivAvAlla(vanster: readonly number[], hoger: readonly number[]): void {
  skriv((s) => ({
    ...s,
    avskrivnaVanster: new Set([...s.avskrivnaVanster, ...vanster]),
    avskrivnaHoger: new Set([...s.avskrivnaHoger, ...hoger]),
  }))
}

export function angraAvskrivningar(): void {
  skriv((s) => ({ ...s, avskrivnaVanster: new Set(), avskrivnaHoger: new Set() }))
}

export function sattSammanslagning(delta: Partial<Sammanslagning>): void {
  skriv((s) => ({ ...s, sammanslagning: { ...s.sammanslagning, ...delta } }))
}

/**
 * Kör en ny runda: matchar om restraderna på ett annat kolumnpar.
 *
 * Träffarna läggs till direkt och inte som förslag. De är ekvivalensträffar
 * precis som grundmatchningens — samma sorts svar på samma sorts fråga, bara
 * ställd om en annan kolumn. Det som ska granskas rad för rad är den luddiga
 * likheten, inte det här.
 */
export function korRunda(par: Matchningspar[]): number {
  const s = verkstad.value
  const f = flikarna()
  if (!s || !f || par.length === 0) return 0

  const full = fullmatchning(f, s, grundmatchning(f, s))
  const rest = restlistor(s, full)
  const m = matcha(f.vanster.frame, f.hoger.frame, par, {
    vansterRader: rest.vanster,
    hogerRader: rest.hoger,
  })
  if (m.par.length === 0) {
    verkstad.value = { ...s, rundor: [...s.rundor, { par, traffar: 0 }] }
    return 0
  }

  const nr = s.rundor.length + 1
  verkstad.value = {
    ...s,
    extra: [
      ...s.extra,
      ...m.par.map((p) => ({ v: p.v, h: p.h, kalla: 'runda' as const, notis: `runda ${nr}` })),
    ],
    rundor: [...s.rundor, { par, traffar: m.par.length }],
  }
  return m.par.length
}
