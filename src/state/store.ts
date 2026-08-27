import { computed, signal } from '@preact/signals'
import type { ColumnId, Frame } from '../core/types.js'
import { computeView, harBegransning, TOM_VY, utanBegransning, type ViewSpec } from './view.js'
import type { Forhandsvisning } from './preview.js'
import { synkaOrdning, type Ordning } from './ordning.js'
import type { Sorteringsniva } from '../core/ops/sort.js'
import { aktivaRegler, TOMT_FILTER, type Filter } from '../core/ops/filter.js'
import type { Dubblettnyckel } from '../core/ops/duplicates.js'
import { cell, klamp, type Selection } from './selection.js'
import type { Profilsteg } from '../core/ops/profil.js'

let seq = 0
const nextId = () => `t${(seq += 1).toString(36)}`

/**
 * Ett utfört steg.
 *
 * Steglistan är samma sak som ångra-historiken: det användaren ser i panelen
 * är exakt det som `Ctrl+Z` backar. Att hålla isär dem är hur historik och
 * ångra hamnar ur synk.
 *
 * `revert` och `apply` är stängningar över den konkreta ändringen. När
 * profiler byggs får varje steg dessutom en serialiserbar beskrivning, men
 * ordningen och innebörden är redan den här.
 */
export interface AppliedStep {
  id: number
  label: string
  kind: string
  apply: () => void
  revert: () => void
  /**
   * Steget uttryckt som data, för profiler.
   *
   * `apply` och `revert` är stängningar över den här filens kolumner och går
   * varken att spara eller köra någon annanstans. Beskrivningen är samma
   * ändring uttryckt i inställningar och kolumnnamn. Steg utan beskrivning —
   * en handredigerad cell, en inklistring, en borttagen rad — hör till just
   * den här filen och tas inte med i en profil.
   */
  profil?: Profilsteg
}

export interface Tab {
  id: string
  frame: Frame
  history: AppliedStep[]
  /** Antal steg i `history` som är tillämpade. Ångra flyttar den bakåt. */
  cursor: number
  /**
   * Räknare som bara stegas när cellinnehållet faktiskt ändrats.
   *
   * Den globala `revision` bumpas av allt som ska ritas om, inklusive
   * markering, sökning och förhandsvisning. Ett verktyg som räknar om sitt
   * förslag varje gång `revision` ändras skulle mata sig självt: förslaget
   * skrivs till fliken, fliken ritas om, förslaget räknas om. Den här
   * räknaren svarar på den snävare frågan — har datat ändrats? — och är
   * därför den ett verktyg ska lyssna på.
   */
  dataRevision: number
  activeColumnId: ColumnId | null
  /** Sant tills innehållet exporterats — visas som prick i fliken. */
  smutsig: boolean
  /**
   * Vad som visas. Sökning och "visa ogiltiga" skriver hit, aldrig direkt
   * till `frame.view`, så att de inte skriver över varandra.
   */
  viewSpec: ViewSpec
  /** Antal kolumner med sökträff, för sökradens räknare. */
  kolumnerMedTraff: number
  markering: Selection | null
  /** Cellen som redigeras just nu, i vy-koordinater. */
  redigerar: { rad: number; kol: number } | null
  /**
   * Den omskrivning som visas i tabellen men ännu inte är gjord.
   *
   * Den ligger på fliken och inte i dialogens eget läge, eftersom rutnätet
   * ritar den och `refreshView` filtrerar på den. En förhandsvisning är
   * heller aldrig en dataändring och hamnar därför aldrig i historiken.
   */
  forhandsvisning: Forhandsvisning | null
  /**
   * Den frusna visningsordningen, eller null när filens ordning gäller.
   *
   * Den är en cache av `viewSpec.sortering` och inget annat — se
   * `src/state/ordning.ts` för varför den aldrig får bli en sanning i sig.
   */
  ordning: Ordning | null
}

export const tabs = signal<Tab[]>([])
export const activeTabId = signal<string | null>(null)

/**
 * Ramar muteras på plats, så identitetsjämförelse räcker inte för att veta
 * att något ändrats. Räknaren bumpas vid varje ändring och läses av de
 * komponenter som visar data.
 */
export const revision = signal(0)

export const activeTab = computed<Tab | null>(
  () => tabs.value.find((t) => t.id === activeTabId.value) ?? null,
)

export const activeFrame = computed<Frame | null>(() => activeTab.value?.frame ?? null)

export function touch(): void {
  revision.value += 1
}

/**
 * Räknar om vilka rader som visas utifrån flikens vy-beskrivning.
 *
 * Anropas efter varje ändring av `viewSpec` och efter varje dataändring som
 * kan påverka vilka rader som matchar — en redigerad cell kan mycket väl
 * falla ur en pågående sökning.
 */
export function refreshView(tab: Tab): void {
  synkaOrdning(tab, tab.viewSpec.sortering ?? [], tab.viewSpec.dubbletter ?? null)
  const result = computeView(tab.frame, tab.viewSpec, tab.forhandsvisning, tab.ordning)
  tab.frame.view = result.view
  tab.kolumnerMedTraff = result.kolumnerMedTraff
  if (tab.markering) {
    const synliga = tab.frame.columns.filter((c) => !c.hidden).length
    tab.markering =
      result.view.length === 0 || synliga === 0
        ? null
        : klamp(tab.markering, result.view.length, synliga)
  }
  touch()
}

export function setViewSpec(tab: Tab, delta: Partial<ViewSpec>): void {
  tab.viewSpec = { ...tab.viewSpec, ...delta }
  tab.redigerar = null
  refreshView(tab)
}

/**
 * Nollställer allt som *döljer* rader.
 *
 * Sorteringen behålls med flit: den gömmer ingenting, så en knapp som heter
 * "Visa alla rader" ska inte kasta den. Dubblettvyn däremot måste med — en
 * gruppordning utan gruppfilter är obegriplig att titta på.
 */
export function clearViewSpec(tab: Tab): void {
  tab.viewSpec = utanBegransning(tab.viewSpec)
  tab.redigerar = null
  refreshView(tab)
}

export function viewIsLimited(tab: Tab | null): boolean {
  return tab !== null && harBegransning(tab.viewSpec, tab.frame)
}

/* ---------- Sortering ---------- */

export function harSortering(tab: Tab | null): boolean {
  return (tab?.viewSpec.sortering?.length ?? 0) > 0
}

export function sorteringenArInaktuell(tab: Tab | null): boolean {
  return tab?.ordning?.inaktuell === true
}

/**
 * Byter ordning och låter markeringen följa med sin rad.
 *
 * Markeringen ligger i vy-koordinater, vilket är rätt när urvalet ändras —
 * då ska blicken stanna där den är. Men när *ordningen* byts förväntar man
 * sig, som i Excel, att raden man tittade på fortfarande är markerad. Ett
 * rektangulärt område över rader som inte längre ligger intill varandra är
 * dessutom inte en markering någon har gjort, så det kollapsar till
 * fokuscellen.
 */
function medOmforankring(tab: Tab, andra: () => void): void {
  const fysisk = tab.markering ? (tab.frame.view[tab.markering.fokusRad] ?? null) : null
  const kol = tab.markering?.fokusKol ?? 0
  andra()
  tab.redigerar = null
  refreshView(tab)
  if (fysisk === null) return
  const ny = tab.frame.view.indexOf(fysisk)
  // Föll raden ur vyn gäller klämningen som refreshView redan gjort.
  if (ny !== -1) tab.markering = cell(ny, kol)
  touch()
}

export function sattSortering(tab: Tab, nivaer: Sorteringsniva[]): void {
  medOmforankring(tab, () => {
    tab.viewSpec = { ...tab.viewSpec, sortering: nivaer.length > 0 ? nivaer : undefined }
  })
}

/**
 * Växlar sorteringen på en kolumn.
 *
 * Utan `lagg` ersätter den alla nivåer — det är vad ett klick på en rubrik
 * betyder. Med `lagg` läggs kolumnen till som en ytterligare nivå, eller
 * vänds om den redan finns.
 */
export function vaxlaSortering(tab: Tab, colId: ColumnId, lagg = false): void {
  const nuvarande = tab.viewSpec.sortering ?? []
  const index = nuvarande.findIndex((n) => n.colId === colId)
  const riktning =
    index !== -1 && nuvarande[index]!.riktning === 'stigande' ? 'fallande' : 'stigande'

  if (!lagg) {
    sattSortering(tab, [{ colId, riktning }])
    return
  }
  const nya = nuvarande.map((n) => ({ ...n }))
  if (index === -1) nya.push({ colId, riktning })
  else nya[index]!.riktning = riktning
  sattSortering(tab, nya)
}

/** Räknar om den frusna ordningen på nytt data. */
export function sorteraOm(tab: Tab): void {
  medOmforankring(tab, () => {
    synkaOrdning(tab, tab.viewSpec.sortering ?? [], tab.viewSpec.dubbletter ?? null, true)
  })
}

export function rensaSortering(tab: Tab): void {
  sattSortering(tab, [])
}

/* ---------- Filter och dubbletter ---------- */

/**
 * Filtret räknas om löpande, till skillnad från sorteringen.
 *
 * Att filtrera fram trasiga rader, rätta dem och se dem försvinna är ett bra
 * arbetsflöde — och det är redan hur `runStep` beter sig.
 */
export function sattFilter(tab: Tab, filter: Filter): void {
  setViewSpec(tab, { filter: filter.regler.length > 0 ? filter : undefined })
}

export function harFilter(tab: Tab | null): boolean {
  return tab !== null && aktivaRegler(tab.frame, tab.viewSpec.filter ?? TOMT_FILTER).length > 0
}

/** Dubblettvyn byter ordning, så markeringen ska följa med sin rad. */
export function sattDubbletter(tab: Tab, nyckel: Dubblettnyckel | null): void {
  medOmforankring(tab, () => {
    tab.viewSpec = { ...tab.viewSpec, dubbletter: nyckel ?? undefined }
  })
}

/**
 * Visar eller stänger en förhandsvisning.
 *
 * Att stänga den återställer alltid `visaBara`: annars skulle vyn bli tom och
 * oförklarlig när det som filtrerade den försvann.
 */
export function setForhandsvisning(tab: Tab, forh: Forhandsvisning | null): void {
  tab.forhandsvisning = forh
  if (forh === null && tab.viewSpec.visaBara !== undefined) {
    const { visaBara: _, ...kvar } = tab.viewSpec
    tab.viewSpec = kvar
  }
  refreshView(tab)
}

export function setSelection(tab: Tab, markering: Selection | null): void {
  tab.markering = markering
  touch()
}

/**
 * En ny flik i utgångsläge.
 *
 * Formen bor här och ingen annanstans. Testfixturer som bygger en `Tab` för
 * hand går sönder vid varje nytt fält, och det fältet är alltid något de
 * inte bryr sig om.
 */
export function nyTab(frame: Frame): Tab {
  return {
    id: nextId(),
    frame,
    history: [],
    cursor: 0,
    dataRevision: 0,
    activeColumnId: frame.columns[0]?.id ?? null,
    smutsig: false,
    viewSpec: { ...TOM_VY },
    kolumnerMedTraff: 0,
    markering: frame.rowCount > 0 ? cell(0, 0) : null,
    redigerar: null,
    forhandsvisning: null,
    ordning: null,
  }
}

export function openFrame(frame: Frame): Tab {
  const tab = nyTab(frame)
  tabs.value = [...tabs.value, tab]
  activeTabId.value = tab.id
  return tab
}

export function closeTab(id: string): void {
  const remaining = tabs.value.filter((t) => t.id !== id)
  tabs.value = remaining
  if (activeTabId.value === id) {
    activeTabId.value = remaining[remaining.length - 1]?.id ?? null
  }
}

export function setActiveColumn(id: ColumnId | null): void {
  const tab = activeTab.value
  if (!tab) return
  tab.activeColumnId = id
  touch()
}

/**
 * Kör en ändring och lägger den i historiken.
 *
 * Steg efter markören kastas när en ny ändring görs — standardbeteendet för
 * ångra/gör om, och det som gör att listan alltid speglar vad som faktiskt
 * är tillämpat.
 */
export function runStep(
  tab: Tab,
  step: Omit<AppliedStep, 'id'>,
): void {
  step.apply()
  tab.dataRevision += 1
  const trimmed = tab.history.slice(0, tab.cursor)
  trimmed.push({ ...step, id: (seq += 1) })
  tab.history = trimmed
  tab.cursor = trimmed.length
  tab.smutsig = true
  tab.redigerar = null
  // En dataändring kan mycket väl få raden att falla ur en pågående sökning.
  refreshView(tab)
}

export function canUndo(tab: Tab | null): boolean {
  return tab !== null && tab.cursor > 0
}

export function canRedo(tab: Tab | null): boolean {
  return tab !== null && tab.cursor < tab.history.length
}

export function undo(tab: Tab): AppliedStep | null {
  if (tab.cursor === 0) return null
  const step = tab.history[tab.cursor - 1]!
  step.revert()
  tab.cursor -= 1
  tab.dataRevision += 1
  refreshView(tab)
  return step
}

export function redo(tab: Tab): AppliedStep | null {
  if (tab.cursor >= tab.history.length) return null
  const step = tab.history[tab.cursor]!
  step.apply()
  tab.cursor += 1
  tab.dataRevision += 1
  refreshView(tab)
  return step
}

/** Ångrar till och med ett visst steg, så att steget själv backas. */
export function undoThrough(tab: Tab, stepIndex: number): void {
  while (tab.cursor > stepIndex) {
    const step = tab.history[tab.cursor - 1]
    if (!step) break
    step.revert()
    tab.cursor -= 1
    tab.dataRevision += 1
  }
  refreshView(tab)
}

/* ---------- Notiser ---------- */

export interface Toast {
  id: number
  message: string
  ton: 'info' | 'varning' | 'fara'
  /** Åtgärdsknapp, nästan alltid "Ångra". */
  atgard?: { etikett: string; kor: () => void }
}

export const toasts = signal<Toast[]>([])

export function notify(
  message: string,
  options: { ton?: Toast['ton']; atgard?: Toast['atgard']; tid?: number } = {},
): void {
  const toast: Toast = {
    id: (seq += 1),
    message,
    ton: options.ton ?? 'info',
    atgard: options.atgard,
  }
  toasts.value = [...toasts.value, toast]
  const tid = options.tid ?? (toast.atgard ? 8000 : 4500)
  setTimeout(() => dismiss(toast.id), tid)
}

export function dismiss(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/* ---------- Utseende ---------- */

export type Theme = 'system' | 'light' | 'dark'
export type Tathet = 'kompakt' | 'normal' | 'luftig'

const THEME_KEY = 'csv-verkstan.tema'
const TATHET_KEY = 'csv-verkstan.tathet'

function readStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const stored = localStorage.getItem(key)
    return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback
  } catch {
    // Privat läge eller blockerad lagring — utseendet är inte värt att krascha på.
    return fallback
  }
}

export const theme = signal<Theme>(readStored(THEME_KEY, 'system', ['system', 'light', 'dark']))
export const tathet = signal<Tathet>(
  readStored(TATHET_KEY, 'normal', ['kompakt', 'normal', 'luftig']),
)

export function applyAppearance(): void {
  const root = document.documentElement
  if (theme.value === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme.value)
  if (tathet.value === 'normal') root.removeAttribute('data-tathet')
  else root.setAttribute('data-tathet', tathet.value)
  try {
    localStorage.setItem(THEME_KEY, theme.value)
    localStorage.setItem(TATHET_KEY, tathet.value)
  } catch {
    // Ingen lagring tillgänglig. Valet gäller för den här sessionen.
  }
}
