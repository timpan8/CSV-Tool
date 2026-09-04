import type { Column, ColumnId } from '../core/types.js'
import {
  createColumn,
  getCell,
  intern,
  mapColumnValues,
  restoreCell,
  restoreColumn,
  setCell,
  snapshotColumn,
  type ColumnSnapshot,
} from '../core/frame/column.js'
import {
  columnIndex,
  deleteRows,
  duplicateRows,
  findColumn,
  findEmptyColumns,
  findEmptyRows,
  insertRows,
  restoreRows,
  uniqueColumnName,
  type SavedRow,
} from '../core/frame/frame.js'
import type { Forhandsvisning } from './preview.js'
import { rect, type Selection } from './selection.js'
import { runStep, type Tab } from './store.js'
import { celler, kolumner, rader } from '../core/locale/sv.js'
import type { Stadning } from '../core/ops/clean.js'
import type { Profilsteg } from '../core/ops/profil.js'

/** Kolumner i den ordning markeringen räknar dem: synliga, i visningsordning. */
export function selectableColumns(tab: Tab): Column[] {
  return tab.frame.columns.filter((c) => !c.hidden)
}

/** Fysiska radindex som markeringen täcker. */
export function selectedRows(tab: Tab, sel: Selection): number[] {
  const r = rect(sel)
  const rows: number[] = []
  for (let rad = r.r1; rad <= r.r2; rad++) {
    const fysisk = tab.frame.view[rad]
    if (fysisk !== undefined) rows.push(fysisk)
  }
  return rows
}

function selectedColumns(tab: Tab, sel: Selection): Column[] {
  const r = rect(sel)
  return selectableColumns(tab).slice(r.k1, r.k2 + 1)
}

/**
 * Kör en ändring över ett antal kolumner och gör den ångringsbar genom
 * ögonblicksbilder.
 *
 * Bara de berörda kolumnerna kopieras; övriga delas vidare med referens. För
 * en enskild cell är det överdrivet — se `redigeraCell`, som klarar sig med
 * två tal.
 */
function korOverKolumner(
  tab: Tab,
  label: string,
  kind: string,
  kolumner: Column[],
  utfor: () => void,
  profil?: Profilsteg,
): void {
  const bilder = new Map<ColumnId, ColumnSnapshot>()
  for (const col of kolumner) bilder.set(col.id, snapshotColumn(col))
  runStep(tab, {
    label,
    kind,
    profil,
    apply: utfor,
    revert: () => {
      for (const col of kolumner) {
        const bild = bilder.get(col.id)
        if (bild) restoreColumn(col, bild)
      }
    },
  })
}

/* ---------- Celler ---------- */

/** Skriver en cell i vy-koordinater — rutnätets väg in. */
export function redigeraCell(tab: Tab, viewRow: number, colIndex: number, value: string): void {
  const col = selectableColumns(tab)[colIndex]
  const fysisk = tab.frame.view[viewRow]
  if (!col || fysisk === undefined) return
  redigeraCellFysisk(tab, col, fysisk, value)
}

/**
 * Skriver en cell på ett fysiskt radindex.
 *
 * Verkstaden har inga vy-koordinater att gå via, och skulle inte kunna ha det:
 * en restrad kan mycket väl vara bortfiltrerad i sin egen flik, och då ligger
 * den inte i `view` alls. Kolumnen kommer som objekt av samma skäl — en dold
 * kolumn har inget index i `selectableColumns`.
 *
 * Ångra kostar två tal: den föregående ordbokskoden och flaggorna. Ingen
 * kolumnkopiering behövs för en enskild redigering.
 */
export function redigeraCellFysisk(
  tab: Tab,
  col: Column,
  fysisk: number,
  value: string,
): boolean {
  if (fysisk < 0 || fysisk >= tab.frame.rowCount) return false
  const foregaende = getCell(col, fysisk)
  if (foregaende === value) return false
  const flaggor = col.flags[fysisk]!

  let kod = 0
  runStep(tab, {
    label: `Ändrade ${col.name}: ”${kort(foregaende)}” → ”${kort(value)}”`,
    kind: 'edit',
    apply: () => {
      kod = setCell(col, fysisk, value)
    },
    revert: () => restoreCell(col, fysisk, kod, flaggor),
  })
  return true
}

function kort(value: string): string {
  if (value === '') return 'tomt'
  return value.length > 24 ? `${value.slice(0, 23)}…` : value
}

/** Sätter alla markerade celler till samma värde. */
export function sattMarkering(tab: Tab, sel: Selection, value: string): number {
  const valda = selectedColumns(tab, sel)
  const radlista = selectedRows(tab, sel)
  let andrade = 0
  for (const col of valda) {
    for (const rad of radlista) if (getCell(col, rad) !== value) andrade += 1
  }
  if (andrade === 0) return 0

  korOverKolumner(
    tab,
    value === ''
      ? `Tömde ${celler(andrade)}`
      : `Satte ${celler(andrade)} till ”${kort(value)}”`,
    'setRange',
    valda,
    () => {
      for (const col of valda) {
        for (const rad of radlista) setCell(col, rad, value)
      }
    },
  )
  return andrade
}

/**
 * Fyller nedåt: översta raden i markeringen kopieras till resten.
 *
 * Räddningen för Excel-exporter med sammanslagna celler, där bara första
 * raden i varje grupp har ett värde.
 */
export function fyllNedat(tab: Tab, sel: Selection): number {
  const valda = selectedColumns(tab, sel)
  const radlista = selectedRows(tab, sel)
  if (radlista.length < 2 || valda.length === 0) return 0

  const [forsta, ...resten] = radlista as [number, ...number[]]
  let andrade = 0
  for (const col of valda) {
    const kalla = getCell(col, forsta)
    for (const rad of resten) if (getCell(col, rad) !== kalla) andrade += 1
  }
  if (andrade === 0) return 0

  korOverKolumner(tab, `Fyllde nedåt i ${celler(andrade)}`, 'fillDown', valda, () => {
    for (const col of valda) {
      const kalla = getCell(col, forsta)
      for (const rad of resten) setCell(col, rad, kalla)
    }
  })
  return andrade
}

/* ---------- Inklistring ---------- */

export interface PasteRequest {
  rader: string[][]
  /** Hur mycket större det inklistrade är än markeringen. */
  extraRader: number
  extraKolumner: number
}

export function planeraInklistring(tab: Tab, sel: Selection, rader: string[][]): PasteRequest {
  const r = rect(sel)
  const bredd = Math.max(...rader.map((rad) => rad.length), 0)
  const platsRader = tab.frame.view.length - r.r1
  const platsKolumner = selectableColumns(tab).length - r.k1
  return {
    rader,
    extraRader: Math.max(0, rader.length - platsRader),
    extraKolumner: Math.max(0, bredd - platsKolumner),
  }
}

/**
 * Klistrar in celler från markeringens övre vänstra hörn.
 *
 * `utoka` styr om tabellen växer för att rymma det inklistrade. Att bara
 * klippa av vore tyst dataförlust, så valet ligger hos användaren och
 * standardvalet är att utöka.
 */
export function klistraIn(tab: Tab, sel: Selection, plan: PasteRequest, utoka: boolean): number {
  const r = rect(sel)
  const frame = tab.frame
  const bilder = new Map<ColumnId, ColumnSnapshot>()
  for (const col of frame.columns) bilder.set(col.id, snapshotColumn(col))
  const kolumnerFore = frame.columns.slice()
  const radAntalFore = frame.rowCount
  const sourceRowFore = frame.sourceRow.slice()

  let andrade = 0

  runStep(tab, {
    label: `Klistrade in ${rader(plan.rader.length)}`,
    kind: 'paste',
    apply: () => {
      if (utoka && plan.extraRader > 0) insertRows(frame, frame.rowCount, plan.extraRader)
      if (utoka && plan.extraKolumner > 0) {
        for (let i = 0; i < plan.extraKolumner; i++) {
          const namn = uniqueColumnName(frame.columns.map((c) => c.name), 'Ny kolumn')
          frame.columns.push(createColumn(namn, frame.rowCount))
        }
      }
      const kolumner = selectableColumns(tab)
      const vy = frame.view.length > 0 ? frame.view : null
      andrade = 0
      for (let i = 0; i < plan.rader.length; i++) {
        const radIVy = r.r1 + i
        const fysisk = vy && radIVy < vy.length ? vy[radIVy]! : radIVy
        if (fysisk >= frame.rowCount) break
        const kalla = plan.rader[i]!
        for (let j = 0; j < kalla.length; j++) {
          const col = kolumner[r.k1 + j]
          if (!col) break
          const value = kalla[j] ?? ''
          if (getCell(col, fysisk) !== value) andrade += 1
          setCell(col, fysisk, value)
        }
      }
    },
    revert: () => {
      frame.columns = kolumnerFore
      for (const col of frame.columns) {
        const bild = bilder.get(col.id)
        if (bild) restoreColumn(col, bild)
      }
      frame.rowCount = radAntalFore
      frame.sourceRow = sourceRowFore.slice()
    },
  })
  return andrade
}

/* ---------- Rader ---------- */

export function taBortRader(
  tab: Tab,
  radlista: number[],
  etikett?: string,
  profil?: Profilsteg,
): void {
  if (radlista.length === 0) return
  let sparade: SavedRow[] = []
  runStep(tab, {
    label: etikett ?? `Tog bort ${rader(radlista.length)}`,
    kind: 'deleteRows',
    profil,
    apply: () => {
      sparade = deleteRows(tab.frame, radlista)
    },
    revert: () => restoreRows(tab.frame, sparade),
  })
}

export function infogaRader(tab: Tab, viewRow: number, antal: number, efter: boolean): void {
  const fysisk = tab.frame.view[viewRow]
  const at = fysisk === undefined ? tab.frame.rowCount : fysisk + (efter ? 1 : 0)
  runStep(tab, {
    label: `Infogade ${rader(antal)}`,
    kind: 'insertRows',
    apply: () => insertRows(tab.frame, at, antal),
    revert: () => {
      deleteRows(tab.frame, Array.from({ length: antal }, (_, i) => at + i))
    },
  })
}

export function dupliceraRader(tab: Tab, radlista: number[]): void {
  if (radlista.length === 0) return
  const sorterade = [...radlista].sort((a, b) => a - b)
  runStep(tab, {
    label: `Dubblerade ${rader(sorterade.length)}`,
    kind: 'duplicateRows',
    apply: () => duplicateRows(tab.frame, sorterade),
    revert: () => {
      // Kopiorna ligger direkt efter sina original, förskjutna med antalet
      // kopior som redan lagts in före dem.
      const kopior = sorterade.map((rad, i) => rad + i + 1)
      deleteRows(tab.frame, kopior)
    },
  })
}

export function taBortTommaRader(tab: Tab): number {
  const tomma = findEmptyRows(tab.frame)
  if (tomma.length === 0) return 0
  taBortRader(tab, tomma, `Tog bort ${rader(tomma.length)} som var helt tomma`, {
    typ: 'tommaRader',
  })
  return tomma.length
}

export function taBortTommaKolumner(tab: Tab): number {
  const tomma = findEmptyColumns(tab.frame)
  if (tomma.length === 0) return 0
  const borttagna = tomma
    .map((id) => {
      const index = tab.frame.columns.findIndex((c) => c.id === id)
      return { index, col: tab.frame.columns[index]! }
    })
    .sort((a, b) => a.index - b.index)

  runStep(tab, {
    label: `Tog bort ${kolumner(tomma.length)} som var helt tomma`,
    kind: 'dropEmptyColumns',
    profil: { typ: 'tommaKolumner' },
    apply: () => {
      tab.frame.columns = tab.frame.columns.filter((c) => !tomma.includes(c.id))
    },
    revert: () => {
      for (const { index, col } of borttagna) tab.frame.columns.splice(index, 0, col)
    },
  })
  return tomma.length
}

/**
 * Lägger till en kolumn med löpnummer: 1, 2, 3 … i filens nuvarande ordning.
 *
 * Rutnätets `#`-ruta svarar på en annan fråga — *vilken rad i filen kom det
 * här ifrån?* — och den räknar filens fysiska rader, rubriker och spökrader
 * inräknade. Den blir dessutom 0 för rader man lagt till själv, och den
 * följer inte med vid export. Det här är i stället riktig data: ett värde att
 * sortera på, filtrera på och skicka vidare, så att en lista går att få
 * tillbaka i sin ursprungliga ordning efter att ha sorterats om.
 *
 * **Kolumnen låses som tal med flit.** Ordbokskodningen bygger på att en
 * kolumn har få unika värden, och ett löpnummer har ett per rad — det är
 * modellens värsta fall. Priset i minne är oundvikligt, men den dyra
 * följdkostnaden är det inte: som textkolumn skulle sorteringen rangordna
 * hundratusen unika värden med svensk kollation, vilket `rank.ts` mäter i
 * sekunder. Som talkolumn går den den numeriska vägen i stället.
 */
export function laggTillLopnummer(tab: Tab, onskatNamn = 'Nr'): Column {
  const namn = uniqueColumnName(
    tab.frame.columns.map((c) => c.name),
    onskatNamn,
  )
  const col = createColumn(namn, tab.frame.rowCount, 'number')
  col.typeLocked = true
  for (let r = 0; r < tab.frame.rowCount; r++) col.codes[r] = intern(col, String(r + 1))

  runStep(tab, {
    label: `Lade till ${namn} med löpnummer`,
    kind: 'lopnummer',
    profil: { typ: 'lopnummer', namn },
    // Först i filen: numret är radens identitet, och identiteten står först.
    apply: () => {
      tab.frame.columns.unshift(col)
    },
    revert: () => {
      tab.frame.columns = tab.frame.columns.filter((c) => c.id !== col.id)
    },
  })
  return col
}

/* ---------- Städning ---------- */

export function stadaKolumner(tab: Tab, valda: Column[], stadning: Stadning): number {
  let andrade = 0
  korOverKolumner(
    tab,
    `${stadning.etikett} i ${
      valda.length === 1 ? valda[0]!.name : kolumner(valda.length)
    }`,
    `clean:${stadning.id}`,
    valda,
    () => {
      andrade = 0
      for (const col of valda) andrade += mapColumnValues(col, stadning.fn)
    },
    { typ: 'stada', kolumner: valda.map((c) => c.name), stadning: stadning.id },
  )
  return andrade
}

/**
 * Tillämpar en eller flera förhandsvisningar som **ett** steg.
 * Returnerar antal ändrade celler.
 *
 * Ett verktyg som körts över en flerkolumnsmarkering ska backas av ett enda
 * Ctrl+Z. `korOverKolumner` tar redan en lista kolumner och en enda
 * ögonblicksbild över dem, så det som tillkommer är att köra transformerna i
 * samma anrop.
 *
 * Nya kolumner (spökkolumner) hanteras en i taget: de skapar kolumner
 * i stället för att skriva om, och blandas därför inte in i den gemensamma
 * ögonblicksbilden.
 */
export function tillampaForhandsvisning(
  tab: Tab,
  forh: Forhandsvisning | readonly Forhandsvisning[],
): number {
  const lista = Array.isArray(forh) ? (forh as readonly Forhandsvisning[]) : [forh as Forhandsvisning]
  if (lista.length === 0) return 0

  const nya = lista.filter((f) => f.nyaKolumner.length > 0 || f.fn === null)
  const omskrivna = lista.filter((f) => f.nyaKolumner.length === 0 && f.fn !== null)

  let andrade = 0
  for (const f of nya) {
    const kall = findColumn(tab.frame, f.colId)
    if (kall) andrade += skapaKolumnerFran(tab, kall, f)
  }

  const jobb = omskrivna
    .map((f) => ({ f, col: findColumn(tab.frame, f.colId) }))
    .filter((j): j is { f: Forhandsvisning; col: Column } => j.col !== undefined)
  if (jobb.length === 0) return andrade

  const forsta = jobb[0]!.f
  korOverKolumner(
    tab,
    jobb.length === 1 ? forsta.etikett : `${forsta.etikett} — ${kolumner(jobb.length)}`,
    forsta.kind,
    jobb.map((j) => j.col),
    () => {
      for (const { f, col } of jobb) {
        andrade += mapColumnValues(col, f.fn!)
        // Typen ingår i ögonblicksbilden, så den följer med tillbaka vid ångra.
        if (f.nyTyp !== undefined && !col.typeLocked) col.type = f.nyTyp
      }
    },
    profilstegFor(jobb.map((j) => j.f)),
  )
  return andrade
}

/**
 * Profilsteget för en körning över flera kolumner.
 *
 * Stegen är identiska så när som på kolumnnamnet — det är samma inställning
 * körd på flera kolumner — så de slås ihop till ett steg med en lista
 * kolumner. Går de inte att slå ihop blir körningen ett handgrepp utan
 * profilsteg, vilket är sanningen: en profil som bara tog med den första
 * kolumnen vore värre än ingen.
 */
function profilstegFor(lista: readonly Forhandsvisning[]): Profilsteg | undefined {
  const steg = lista.map((f) => f.profil)
  const forsta = steg[0]
  if (!forsta || steg.some((s) => s === undefined)) return undefined
  if (steg.length === 1) return forsta

  // Bara de fyra omskrivande verktygen bär en kolumnlista i sitt steg.
  if (!FLERKOLUMNSSTEG.has(forsta.typ)) return undefined
  const namn: string[] = []
  for (const s of steg as Profilsteg[]) {
    if (!('kolumn' in s) || typeof s.kolumn !== 'string') return undefined
    // Allt utom kolumnnamnet måste vara identiskt.
    if (JSON.stringify({ ...s, kolumn: '' }) !== JSON.stringify({ ...forsta, kolumn: '' })) {
      return undefined
    }
    namn.push(s.kolumn)
  }
  return { ...forsta, kolumn: namn } as Profilsteg
}

const FLERKOLUMNSSTEG = new Set<Profilsteg['typ']>(['datum', 'tal', 'telefon', 'ersatt'])

/**
 * Skapar de nya kolumner som spökkolumnerna visade.
 *
 * Kolumnerna byggs direkt ur förhandsvisningens tabell. Räknas den per unikt
 * värde blir det en intern-operation per ordbokspost och sedan ett
 * heltalssvep över raderna; räknas den per rad finns ingen sådan genväg, och
 * då görs arbetet en gång per rad — vilket är precis vad en mall över flera
 * kolumner kräver.
 *
 * Ångra tar bort kolumnerna igen, och gör om lägger tillbaka exakt samma
 * kolumnobjekt.
 */
function skapaKolumnerFran(tab: Tab, kall: Column, forh: Forhandsvisning): number {
  const index = columnIndex(tab.frame, kall.id) + 1
  const tagna = tab.frame.columns.map((c) => c.name)
  const nya: Column[] = []

  for (let mal = 0; mal < forh.stride; mal++) {
    const namn = uniqueColumnName(tagna, forh.nyaKolumner[mal] ?? kall.name)
    tagna.push(namn)
    nya.push(createColumn(namn, tab.frame.rowCount, forh.nyTyp ?? 'text'))
  }

  let ifyllda = 0
  if (forh.perRad) {
    for (let r = 0; r < tab.frame.rowCount; r++) {
      let nagot = false
      for (let mal = 0; mal < forh.stride; mal++) {
        const kod = intern(nya[mal]!, forh.nya[r * forh.stride + mal] ?? '')
        nya[mal]!.codes[r] = kod
        if (kod !== 0) nagot = true
      }
      if (nagot) ifyllda += 1
    }
  } else {
    const kartor = nya.map(() => new Uint32Array(kall.dict.length))
    for (let kod = 0; kod < kall.dict.length; kod++) {
      for (let mal = 0; mal < forh.stride; mal++) {
        kartor[mal]![kod] = intern(nya[mal]!, forh.nya[kod * forh.stride + mal] ?? '')
      }
    }
    for (let r = 0; r < tab.frame.rowCount; r++) {
      const kallkod = kall.codes[r]!
      let nagot = false
      for (let mal = 0; mal < forh.stride; mal++) {
        const kod = kartor[mal]![kallkod]!
        nya[mal]!.codes[r] = kod
        if (kod !== 0) nagot = true
      }
      if (nagot) ifyllda += 1
    }
  }

  runStep(tab, {
    label: forh.etikett,
    kind: forh.kind,
    profil: forh.profil,
    apply: () => {
      tab.frame.columns.splice(index, 0, ...nya)
    },
    revert: () => {
      for (const col of nya) {
        const i = tab.frame.columns.indexOf(col)
        if (i !== -1) tab.frame.columns.splice(i, 1)
      }
    },
  })
  return ifyllda
}
