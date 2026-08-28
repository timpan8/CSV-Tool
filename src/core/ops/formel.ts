import type { Column, Frame } from '../types.js'
import { getCell } from '../frame/column.js'
import { normalizeAlways } from '../locale/sv.js'
import { parseNumber } from '../infer.js'
import { tolkaDatum, type Datumdel } from './dates.js'

/**
 * Beräknade kolumner.
 *
 * Verktyget kunde städa, matcha, kombinera och filtrera — men aldrig räkna.
 * `Slå ihop kolumner` klarar text som `{Förnamn} {Efternamn}`; det här är
 * samma tanke för tal: `{Antal} * {Pris}`, `{Belopp} * 1,25`, `{Slut} -
 * {Start}`.
 *
 * **Språket är litet med flit.** Fyra räknesätt, parenteser, ett minustecken
 * framför, tal och kolumnhänvisningar. Ingen villkorslogik, inga
 * strängfunktioner, ingen kedja av celler som pekar på varandra. Ett
 * kalkylark har allt det och betalar med att ingen längre vet vad en cell
 * innehåller; här är formeln en beskrivning av *en* ny kolumn, och den står
 * skriven i klartext ovanför tabellen.
 *
 * **Resultatet är alltid ett tal.** En datumkolumn läses som sitt dagnummer,
 * så `{Slut} - {Start}` ger antal dagar. Att låta `{Datum} + 30` ge ett datum
 * tillbaka vore att gissa vad användaren menade utifrån vilka operander som
 * råkade ingå, och den sortens gissning är precis vad resten av verktyget
 * undviker.
 */

/* ---------- Tal ur en cell ---------- */

/**
 * Dagnummer för ett datum, räknat direkt ur år, månad och dag.
 *
 * Ingen `Date` inblandad — samma skäl som i `dates.ts`: ett `Date`-objekt bär
 * en tidszon, och den kan förskjuta dygnet. Algoritmen är den vanliga
 * "days from civil" och är exakt för alla år den här filen kan innehålla.
 */
export function dagnummer(d: Datumdel): number {
  const ar = d.manad <= 2 ? d.ar - 1 : d.ar
  const era = Math.floor(ar / 400)
  const arIEran = ar - era * 400
  const dagIAret =
    Math.floor((153 * (d.manad + (d.manad > 2 ? -3 : 9)) + 2) / 5) + d.dag - 1
  const dagIEran =
    arIEran * 365 + Math.floor(arIEran / 4) - Math.floor(arIEran / 100) + dagIAret
  return era * 146097 + dagIEran - 719468
}

/**
 * Talvärdet för en cell, enligt kolumnens typ.
 *
 * En datumkolumn ger dagnummer, allt annat läses som tal. Tomma celler ger
 * null: en tom cell är okänd, inte noll, och en summa där tomt räknats som
 * noll är den sortens fel som inte syns förrän någon jämför mot facit.
 */
export function cellvarde(col: Column, row: number): number | null {
  const rå = getCell(col, row)
  if (rå.trim() === '') return null
  if (col.type === 'date') {
    const d = tolkaDatum(rå).datum
    return d ? dagnummer(d) : null
  }
  return parseNumber(rå)
}

/* ---------- Tolkning ---------- */

export type Nod =
  | { typ: 'tal'; varde: number }
  | { typ: 'kolumn'; namn: string }
  | { typ: 'unar'; operand: Nod }
  | { typ: 'binar'; operator: '+' | '-' | '*' | '/'; vanster: Nod; hoger: Nod }
  | { typ: 'funktion'; namn: Funktionsnamn; argument: Nod[] }

export type Funktionsnamn = 'RUNDA' | 'ABS' | 'MIN' | 'MAX'

/** Antal argument varje funktion tar. */
const FUNKTIONER: Record<Funktionsnamn, number> = { RUNDA: 2, ABS: 1, MIN: 2, MAX: 2 }

export const FUNKTIONSHJALP: { namn: string; hjalp: string }[] = [
  { namn: 'RUNDA(tal; decimaler)', hjalp: 'Avrundar. RUNDA({Belopp} * 1,25; 2)' },
  { namn: 'ABS(tal)', hjalp: 'Tar bort minustecknet.' },
  { namn: 'MIN(a; b)', hjalp: 'Det minsta av två värden.' },
  { namn: 'MAX(a; b)', hjalp: 'Det största av två värden.' },
]

export interface Formeltolkning {
  rot: Nod | null
  /** Felet i klartext, eller null när formeln går att köra. */
  fel: string | null
  /** Kolumnnamn formeln använder och som finns. */
  anvanda: string[]
  /** Kolumnnamn formeln nämner men som inte finns i filen. */
  okanda: string[]
}

type Token =
  | { typ: 'tal'; varde: number }
  | { typ: 'kolumn'; namn: string }
  | { typ: 'namn'; text: string }
  | { typ: 'tecken'; text: string }

/**
 * Delar upp texten i beståndsdelar.
 *
 * Tal skrivs som i filerna: `1 240,50` lika väl som `1240.50`. Att kräva
 * punkt av en svensk användare som just läst en fil med komma vore att be om
 * ett fel som ser ut som ett stavfel.
 */
function dela(text: string): { tokens: Token[]; fel: string | null } {
  const tokens: Token[] = []
  const s = normalizeAlways(text)
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (/\s/.test(c)) {
      i += 1
      continue
    }
    if (c === '{') {
      const slut = s.indexOf('}', i)
      if (slut === -1) return { tokens, fel: 'En kolumnhänvisning saknar sitt avslutande }.' }
      tokens.push({ typ: 'kolumn', namn: s.slice(i + 1, slut).trim() })
      i = slut + 1
      continue
    }
    if (/\d/.test(c)) {
      /*
       * Tal får innehålla mellanslag, eftersom filerna skriver `1 240,50`.
       * Därför läses de girigt först — men `2 3` är inte ett tal, och då får
       * den giriga läsningen inte stå kvar. Faller den, tas i stället bara
       * det som säkert är ett tal, och resten blir nästa symbol. `2 3` blir
       * två värden i rad, vilket är vad det är.
       */
      let j = i
      while (j < s.length && /[\d\s.,]/.test(s[j]!)) j += 1
      while (j > i && /[\s.,]/.test(s[j - 1]!)) j -= 1
      let text = s.slice(i, j)
      let n = parseNumber(text)
      if (n === null) {
        const smal = /^\d+(?:[.,]\d+)?/.exec(s.slice(i))
        text = smal ? smal[0] : ''
        n = text === '' ? null : parseNumber(text)
        j = i + text.length
      }
      if (n === null) return { tokens, fel: `”${s.slice(i, j)}” går inte att läsa som ett tal.` }
      tokens.push({ typ: 'tal', varde: n })
      i = j
      continue
    }
    if (/\p{L}/u.test(c)) {
      let j = i
      while (j < s.length && /[\p{L}\d_]/u.test(s[j]!)) j += 1
      tokens.push({ typ: 'namn', text: s.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/();'.includes(c)) {
      tokens.push({ typ: 'tecken', text: c })
      i += 1
      continue
    }
    return { tokens, fel: `Tecknet ”${c}” hör inte hemma i en formel.` }
  }
  return { tokens, fel: null }
}

/**
 * Tolkar formeln.
 *
 * Ett fel är ett svar, inte ett undantag — samma hållning som `byggErsattare`
 * och filtrets reguljära uttryck. Panelen visar det medan man skriver, i
 * stället för att låta en halvskriven formel se ut som en tom kolumn.
 */
export function tolkaFormel(text: string, frame: Frame | null): Formeltolkning {
  const tomt: Formeltolkning = { rot: null, fel: null, anvanda: [], okanda: [] }
  if (text.trim() === '') return tomt

  const { tokens, fel } = dela(text)
  if (fel) return { ...tomt, fel }
  if (tokens.length === 0) return tomt

  let i = 0
  let syntaxfel: string | null = null
  const namnda: string[] = []

  const kika = (): Token | undefined => tokens[i]
  const ar = (text: string) => {
    const t = kika()
    return t?.typ === 'tecken' && t.text === text
  }

  function uttryck(): Nod | null {
    let vanster = term()
    while (vanster && (ar('+') || ar('-'))) {
      const operator = (tokens[i] as { text: '+' | '-' }).text
      i += 1
      const hoger = term()
      if (!hoger) return null
      vanster = { typ: 'binar', operator, vanster, hoger }
    }
    return vanster
  }

  function term(): Nod | null {
    let vanster = faktor()
    while (vanster && (ar('*') || ar('/'))) {
      const operator = (tokens[i] as { text: '*' | '/' }).text
      i += 1
      const hoger = faktor()
      if (!hoger) return null
      vanster = { typ: 'binar', operator, vanster, hoger }
    }
    return vanster
  }

  function faktor(): Nod | null {
    if (ar('-')) {
      i += 1
      const operand = faktor()
      return operand ? { typ: 'unar', operand } : null
    }
    if (ar('+')) {
      i += 1
      return faktor()
    }
    return primar()
  }

  function primar(): Nod | null {
    const t = kika()
    if (!t) {
      syntaxfel ??= 'Formeln slutar mitt i — något saknas på slutet.'
      return null
    }
    if (t.typ === 'tal') {
      i += 1
      return { typ: 'tal', varde: t.varde }
    }
    if (t.typ === 'kolumn') {
      i += 1
      if (t.namn === '') {
        syntaxfel ??= 'En kolumnhänvisning saknar namn: skriv {Kolumnnamn}.'
        return null
      }
      namnda.push(t.namn)
      return { typ: 'kolumn', namn: t.namn }
    }
    if (t.typ === 'namn') {
      const namn = t.text.toUpperCase() as Funktionsnamn
      if (!(namn in FUNKTIONER)) {
        syntaxfel ??= `”${t.text}” är ingen funktion. Menade du {${t.text}} för en kolumn?`
        return null
      }
      i += 1
      if (!ar('(')) {
        syntaxfel ??= `${namn} måste följas av en parentes.`
        return null
      }
      i += 1
      const argument: Nod[] = []
      for (;;) {
        const arg = uttryck()
        if (!arg) return null
        argument.push(arg)
        if (ar(';')) {
          i += 1
          continue
        }
        break
      }
      if (!ar(')')) {
        syntaxfel ??= `${namn} saknar sin avslutande parentes.`
        return null
      }
      i += 1
      const kravs = FUNKTIONER[namn]
      if (argument.length !== kravs) {
        syntaxfel ??= `${namn} tar ${kravs} ${kravs === 1 ? 'värde' : 'värden'}, inte ${argument.length}.`
        return null
      }
      return { typ: 'funktion', namn, argument }
    }
    if (t.typ === 'tecken' && t.text === '(') {
      i += 1
      const inre = uttryck()
      if (!inre) return null
      if (!ar(')')) {
        syntaxfel ??= 'En parentes öppnades men stängdes aldrig.'
        return null
      }
      i += 1
      return inre
    }
    syntaxfel ??= `”${t.typ === 'tecken' ? t.text : String(t)}” kom på en plats där ett värde skulle stå.`
    return null
  }

  const rot = uttryck()
  if (!rot) return { ...tomt, fel: syntaxfel ?? 'Formeln går inte att tolka.' }
  if (i < tokens.length) {
    const kvar = tokens[i]!
    return {
      ...tomt,
      fel: `Formeln fortsätter efter att den tagit slut, vid ”${
        kvar.typ === 'tecken' ? kvar.text : kvar.typ === 'kolumn' ? `{${kvar.namn}}` : 'ett värde'
      }”.`,
    }
  }

  const anvanda: string[] = []
  const okanda: string[] = []
  for (const namn of namnda) {
    const finns = frame ? frame.columns.some((c) => c.name === namn) : true
    const lista = finns ? anvanda : okanda
    if (!lista.includes(namn)) lista.push(namn)
  }
  if (okanda.length > 0) {
    return {
      rot: null,
      fel: `Det finns ingen kolumn som heter ${okanda.map((n) => `”${n}”`).join(', ')}.`,
      anvanda,
      okanda,
    }
  }
  return { rot, fel: null, anvanda, okanda }
}

/* ---------- Räkning ---------- */

/**
 * Räknar ut formeln för en rad.
 *
 * Null betyder "gick inte att räkna" och kommer av en tom cell, ett värde som
 * inte är ett tal, eller en division med noll. Alla tre ger en tom cell i
 * resultatet i stället för en nolla eller ett skräpvärde — en lucka går att
 * se och åtgärda, en felaktig nolla gör det inte.
 */
export function raknaFormel(rot: Nod, las: (namn: string) => number | null): number | null {
  switch (rot.typ) {
    case 'tal':
      return rot.varde
    case 'kolumn':
      return las(rot.namn)
    case 'unar': {
      const v = raknaFormel(rot.operand, las)
      return v === null ? null : -v
    }
    case 'binar': {
      const a = raknaFormel(rot.vanster, las)
      const b = raknaFormel(rot.hoger, las)
      if (a === null || b === null) return null
      switch (rot.operator) {
        case '+':
          return a + b
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          return b === 0 ? null : a / b
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'funktion': {
      const varden = rot.argument.map((a) => raknaFormel(a, las))
      if (varden.some((v) => v === null)) return null
      const [a, b] = varden as number[]
      switch (rot.namn) {
        case 'RUNDA': {
          const n = Math.max(0, Math.min(10, Math.round(b!)))
          const skala = 10 ** n
          return Math.round(a! * skala) / skala
        }
        case 'ABS':
          return Math.abs(a!)
        case 'MIN':
          return Math.min(a!, b!)
        case 'MAX':
          return Math.max(a!, b!)
      }
    }
  }
}

/**
 * Bygger radfunktionen som förhandsvisningen använder.
 *
 * Den läser flera kolumner och kan därför inte räknas per unikt värde — det
 * är samma oundvikliga kostnad som `Slå ihop kolumner` bär, och den står
 * skriven i `Forhandsvisning.perRad`.
 */
export function formelTransform(
  rot: Nod,
  skriv: (n: number) => string,
): (frame: Frame, row: number) => string {
  const cache = new Map<string, Column | undefined>()
  return (frame, row) => {
    const varde = raknaFormel(rot, (namn) => {
      let col = cache.get(namn)
      if (col === undefined) {
        col = frame.columns.find((c) => c.name === namn)
        cache.set(namn, col)
      }
      return col ? cellvarde(col, row) : null
    })
    return varde === null || !Number.isFinite(varde) ? '' : skriv(varde)
  }
}
