import { signal } from '@preact/signals'
import type { Column, Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { rubriknyckel } from '../core/ops/rubriker.js'
import { stadningarEfterId } from '../core/ops/clean.js'
import { delaVarde } from '../core/ops/columns.js'
import { korMall, tolkaMall } from '../core/ops/columns.js'
import { datumTransform, tolkaDatum } from '../core/ops/dates.js'
import { epostNamndelar, epostTransform } from '../core/ops/email.js'
import { skrivTal, talTransform, tolkaTal } from '../core/ops/numbers.js'
import { telefonTransform, tolkaTelefon } from '../core/ops/phone.js'
import { byggErsattare } from '../core/ops/replace.js'
import { formelTransform, tolkaFormel } from '../core/ops/formel.js'
import {
  beskrivSteg,
  stegetsKolumner,
  PROFILVERSION,
  type Profil,
  type Profilfil,
  type Profilsteg,
} from '../core/ops/profil.js'
import { beraknaForhandsvisning, type Forhandsspec } from './preview.js'
import { stadaKolumner, taBortTommaKolumner, taBortTommaRader, tillampaForhandsvisning } from './edits.js'
import { runStep, type Tab } from './store.js'

/**
 * Profiler: lagring och uppspelning.
 *
 * Typerna och beskrivningarna bor i `src/core/ops/profil.ts`; det här är
 * halvan som rör en flik och webbläsarens lagring.
 *
 * **Uppspelningen bygger om verktygens egen förhandsvisning.** Ett steg
 * översätts till exakt den `Forhandsspec` panelen hade byggt, räknas med
 * `beraknaForhandsvisning` och tillämpas med `tillampaForhandsvisning` — samma
 * väg, samma resultat. En andra implementation som ”gör ungefär samma sak”
 * skulle glida isär från panelen vid första rättningen, och glidningen skulle
 * synas först i någons färdiga fil. Räkningen är heller inte bortkastad: det
 * är den som ger antalet ändrade celler i rapporten.
 */

const NYCKEL = 'csv-verkstan.profiler'

export const profiler = signal<Profil[]>(las())

/* ---------- Lagring ---------- */

function las(): Profil[] {
  try {
    const rått = localStorage.getItem(NYCKEL)
    if (rått === null) return []
    return tolkaProfilfil(rått) ?? []
  } catch {
    // Privat läge eller blockerad lagring. Profilerna finns bara i minnet.
    return []
  }
}

function skriv(): void {
  try {
    localStorage.setItem(NYCKEL, profilfilstext(profiler.value))
  } catch {
    // Lagringen är full eller blockerad. Profilerna gäller för den här
    // sessionen; att krascha på det vore fel avvägning.
  }
}

/**
 * Läser en profilfil.
 *
 * Innehållet kommer från webbläsarens lagring eller från en fil användaren
 * valt, alltså utifrån. Ett steg med okänd `typ` — från en nyare version —
 * släpps igenom validering aldrig, eftersom uppspelningen då skulle hoppa över
 * det tyst mitt i en körning.
 */
export function tolkaProfilfil(text: string): Profil[] | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const fil = data as Partial<Profilfil>
  if (fil.format !== 'csv-verkstan-profil' || !Array.isArray(fil.profiler)) return null

  const ut: Profil[] = []
  for (const p of fil.profiler) {
    if (typeof p?.namn !== 'string' || !Array.isArray(p.steg)) continue
    const steg = p.steg.filter((s: Profilsteg) => arKantSteg(s))
    if (steg.length === 0) continue
    ut.push({
      id: typeof p.id === 'string' ? p.id : nyttId(),
      namn: p.namn,
      steg,
      skapad: typeof p.skapad === 'string' ? p.skapad : '',
    })
  }
  return ut
}

const KANDA_TYPER = new Set([
  'stada', 'datum', 'tal', 'telefon', 'epost', 'ersatt', 'dela', 'mall', 'formel',
  'dopOm', 'taBortKolumn', 'doljKolumn', 'sattTyp', 'tommaRader', 'tommaKolumner',
])

function arKantSteg(steg: unknown): steg is Profilsteg {
  return (
    typeof steg === 'object' &&
    steg !== null &&
    KANDA_TYPER.has((steg as { typ?: string }).typ ?? '')
  )
}

export function profilfilstext(lista: readonly Profil[]): string {
  const fil: Profilfil = {
    format: 'csv-verkstan-profil',
    version: PROFILVERSION,
    profiler: [...lista],
  }
  return JSON.stringify(fil, null, 2)
}

let raknare = 0
function nyttId(): string {
  raknare += 1
  return `p${raknare.toString(36)}${lista36()}`
}
function lista36(): string {
  return profiler.value.length.toString(36)
}

export function sparaProfil(namn: string, steg: readonly Profilsteg[], nu: string): Profil {
  const profil: Profil = { id: nyttId(), namn, steg: [...steg], skapad: nu }
  profiler.value = [...profiler.value, profil]
  skriv()
  return profil
}

export function taBortProfil(id: string): void {
  profiler.value = profiler.value.filter((p) => p.id !== id)
  skriv()
}

export function laggTillProfiler(nya: readonly Profil[]): number {
  profiler.value = [...profiler.value, ...nya.map((p) => ({ ...p, id: nyttId() }))]
  skriv()
  return nya.length
}

/* ---------- Vad som går att spara ---------- */

export interface Historikpost {
  label: string
  steg: Profilsteg | null
}

/**
 * Flikens gjorda steg, med det som går att köra om utpekat.
 *
 * Bara steg fram till markören: allt efter den är ångrat, och en profil ska
 * spegla det som faktiskt står i filen.
 */
export function historikensSteg(tab: Tab): Historikpost[] {
  return tab.history.slice(0, tab.cursor).map((s) => ({ label: s.label, steg: s.profil ?? null }))
}

/* ---------- Uppspelning ---------- */

export type Utfall = 'kord' | 'kolumnSaknas' | 'ingenAndring'

export interface Stegresultat {
  steg: Profilsteg
  utfall: Utfall
  /** Antal ändrade celler, eller antal skapade kolumner. */
  andrade: number
  /** Kolumnen som inte gick att hitta. */
  saknad?: string
}

/**
 * Letar upp en kolumn på namn.
 *
 * Bara exakt namn, bortsett från skiftläge, prickar och skiljetecken —
 * `rubriknyckel`. Ingen synonymmatchning, till skillnad från aliaskartan i
 * Kombinera: där syns varje gissning i en tabell innan något körs, här skulle
 * en gissning tyst skriva om fel kolumn. Ett steg som inte hittar sin kolumn
 * ska säga det, inte välja en granne.
 */
function hittaKolumn(frame: Frame, namn: string): Column | null {
  const nyckel = rubriknyckel(namn)
  if (nyckel === '') return null
  return visibleColumns(frame).find((c) => rubriknyckel(c.name) === nyckel) ?? null
}

/** Bygger samma förhandsvisningsspec som verktygspanelen hade byggt. */
function spec(steg: Profilsteg): Forhandsspec | null {
  const etikett = beskrivSteg(steg)
  switch (steg.typ) {
    case 'datum':
      return {
        etikett,
        kind: 'dates',
        profil: steg,
        fn: datumTransform(steg.inst),
        arProblem: (v) => tolkaDatum(v, steg.inst).datum === null,
        nyTyp: steg.inst.mal === 'datum' ? 'date' : undefined,
      }
    case 'tal':
      return {
        etikett,
        kind: 'numbers',
        profil: steg,
        fn: talTransform(steg.inst),
        arProblem: (v) => tolkaTal(v, steg.inst).tal === null,
        nyTyp: 'number',
      }
    case 'telefon':
      return {
        etikett,
        kind: 'phone',
        profil: steg,
        fn: telefonTransform(steg.inst),
        arProblem: (v) => tolkaTelefon(v, steg.inst).siffror === null,
      }
    case 'epost': {
      const namn = Array.isArray(steg.namn) ? steg.namn : [steg.namn]
      if (steg.falt === 'bada-namnen') {
        return {
          etikett,
          kind: 'email',
          profil: steg,
          delar: epostNamndelar(steg.val),
          nyaKolumner: [namn[0] ?? 'Förnamn', namn[1] ?? 'Efternamn'],
        }
      }
      return {
        etikett,
        kind: 'email',
        profil: steg,
        fn: epostTransform(steg.falt, steg.val),
        nyaKolumner: [namn[0] ?? 'Ny kolumn'],
      }
    }
    case 'ersatt': {
      const ersattare = byggErsattare(steg.inst)
      if (!ersattare.fn) return null
      return { etikett, kind: 'replace', profil: steg, fn: ersattare.fn }
    }
    case 'dela':
      return {
        etikett,
        kind: 'split',
        profil: steg,
        delar: (v) => delaVarde(v, steg.delning),
        nyaKolumner: steg.namn,
      }
    default:
      return null
  }
}

/**
 * Kör ett steg på en flik.
 *
 * Varje steg blir ett eget ångringsbart steg i historiken, precis som när det
 * gjordes för hand. En körd profil går alltså att backa steg för steg.
 */
export function korSteg(tab: Tab, steg: Profilsteg): Stegresultat {
  const frame = tab.frame

  if (steg.typ === 'tommaRader') {
    return { steg, utfall: 'kord', andrade: taBortTommaRader(tab) }
  }
  if (steg.typ === 'tommaKolumner') {
    return { steg, utfall: 'kord', andrade: taBortTommaKolumner(tab) }
  }

  if (steg.typ === 'formel') {
    const tolkning = tolkaFormel(steg.uttryck, frame)
    if (!tolkning.rot) {
      return {
        steg,
        utfall: 'kolumnSaknas',
        andrade: 0,
        saknad: tolkning.okanda.join(', ') || undefined,
      }
    }
    const forsta = frame.columns[0]
    if (!forsta) return { steg, utfall: 'kolumnSaknas', andrade: 0 }
    const rakna = formelTransform(tolkning.rot, (n) =>
      skrivTal(n, steg.format, steg.decimaler),
    )
    const forh = beraknaForhandsvisning(
      forsta,
      {
        etikett: beskrivSteg(steg),
        kind: 'formel',
        profil: steg,
        rad: (f, row) => [rakna(f, row)],
        nyaKolumner: [steg.namn],
      },
      frame,
    )
    const andrade = tillampaForhandsvisning(tab, forh)
    return { steg, utfall: andrade === 0 ? 'ingenAndring' : 'kord', andrade }
  }

  if (steg.typ === 'mall') {
    const tolkning = tolkaMall(steg.mall, frame)
    if (tolkning.okanda.length > 0) {
      return { steg, utfall: 'kolumnSaknas', andrade: 0, saknad: tolkning.okanda.join(', ') }
    }
    const forsta = frame.columns[0]
    if (!forsta) return { steg, utfall: 'kolumnSaknas', andrade: 0 }
    const forh = beraknaForhandsvisning(
      forsta,
      {
        etikett: beskrivSteg(steg),
        kind: 'merge',
        profil: steg,
        rad: (f, row) => [korMall(f, row, tolkning.delar, { stadaLuckor: steg.stadaLuckor })],
        nyaKolumner: [steg.namn],
      },
      frame,
    )
    const andrade = tillampaForhandsvisning(tab, forh)
    return { steg, utfall: andrade === 0 ? 'ingenAndring' : 'kord', andrade }
  }

  const saknad = stegetsKolumner(steg).find((namn) => hittaKolumn(frame, namn) === null)
  if (saknad !== undefined) return { steg, utfall: 'kolumnSaknas', andrade: 0, saknad }

  switch (steg.typ) {
    case 'stada': {
      const stadning = stadningarEfterId(steg.stadning)
      if (!stadning) return { steg, utfall: 'kolumnSaknas', andrade: 0 }
      const kolumner = steg.kolumner.map((n) => hittaKolumn(frame, n)!)
      const andrade = stadaKolumner(tab, kolumner, stadning)
      return { steg, utfall: andrade === 0 ? 'ingenAndring' : 'kord', andrade }
    }
    case 'dopOm': {
      const col = hittaKolumn(frame, steg.kolumn)!
      const gammalt = col.name
      const nytt = steg.till
      if (gammalt === nytt) return { steg, utfall: 'ingenAndring', andrade: 0 }
      runStep(tab, {
        label: `Bytte namn: ${gammalt} → ${nytt}`,
        kind: 'rename',
        profil: steg,
        apply: () => {
          col.name = nytt
        },
        revert: () => {
          col.name = gammalt
        },
      })
      return { steg, utfall: 'kord', andrade: 1 }
    }
    case 'taBortKolumn': {
      const col = hittaKolumn(frame, steg.kolumn)!
      const index = frame.columns.indexOf(col)
      runStep(tab, {
        label: `Tog bort kolumnen ${col.name}`,
        kind: 'drop',
        profil: steg,
        apply: () => {
          const at = frame.columns.indexOf(col)
          if (at !== -1) frame.columns.splice(at, 1)
        },
        revert: () => frame.columns.splice(index, 0, col),
      })
      return { steg, utfall: 'kord', andrade: 1 }
    }
    case 'doljKolumn': {
      const col = hittaKolumn(frame, steg.kolumn)!
      if (col.hidden === steg.dold) return { steg, utfall: 'ingenAndring', andrade: 0 }
      runStep(tab, {
        label: `${steg.dold ? 'Dolde' : 'Visade'} kolumnen ${col.name}`,
        kind: 'hide',
        profil: steg,
        apply: () => {
          col.hidden = steg.dold
        },
        revert: () => {
          col.hidden = !steg.dold
        },
      })
      return { steg, utfall: 'kord', andrade: 1 }
    }
    case 'sattTyp': {
      const col = hittaKolumn(frame, steg.kolumn)!
      // Låsningen är halva poängen: en Postnr-kolumn som redan *tolkats* som
      // text är inte skyddad mot att tolkas om till tal vid nästa import.
      if (col.type === steg.kolumntyp && col.typeLocked) {
        return { steg, utfall: 'ingenAndring', andrade: 0 }
      }
      const gammal = col.type
      const gammalLast = col.typeLocked
      runStep(tab, {
        label: `Satte typ på ${col.name}: ${steg.kolumntyp}`,
        kind: 'type',
        profil: steg,
        apply: () => {
          col.type = steg.kolumntyp
          col.typeLocked = true
        },
        revert: () => {
          col.type = gammal
          col.typeLocked = gammalLast
        },
      })
      return { steg, utfall: 'kord', andrade: 1 }
    }
    default: {
      // Ett steg kan gälla flera kolumner — samma inställning körd på tolv
      // månadskolumner. Alla får sin egen förhandsvisning, men tillämpas som
      // ett steg, precis som när verktyget kördes för hand.
      const kolumner = stegetsKolumner(steg)
        .map((namn) => hittaKolumn(frame, namn))
        .filter((c): c is Column => c !== null)
      const s = kolumner.length > 0 ? spec(steg) : null
      if (!s) return { steg, utfall: 'ingenAndring', andrade: 0 }
      const forh = kolumner.map((col) => beraknaForhandsvisning(col, s, frame))
      const andrade = tillampaForhandsvisning(tab, forh)
      return { steg, utfall: andrade === 0 ? 'ingenAndring' : 'kord', andrade }
    }
  }
}

/** Kör en hel profil och rapporterar steg för steg. */
export function korProfil(tab: Tab, profil: Profil): Stegresultat[] {
  return profil.steg.map((steg) => korSteg(tab, steg))
}

/** Hitta kolumnen ett steg vill åt — för att kunna visa vad som saknas. */
export function saknadeKolumnerFor(frame: Frame, steg: readonly Profilsteg[]): string[] {
  const saknade = new Set<string>()
  for (const s of steg) {
    for (const namn of stegetsKolumner(s)) {
      if (hittaKolumn(frame, namn) === null) saknade.add(namn)
    }
  }
  return [...saknade]
}

/** Bara för test: nollställer lagringen i minnet. */
export function nollstallProfiler(): void {
  profiler.value = []
}

