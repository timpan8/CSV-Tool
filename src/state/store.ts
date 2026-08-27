import { computed, signal } from '@preact/signals'
import type { ColumnId, Frame } from '../core/types.js'
import { computeView, harBegransning, TOM_VY, type ViewSpec } from './view.js'
import type { Forhandsvisning } from './preview.js'
import { cell, klamp, type Selection } from './selection.js'

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
  const result = computeView(tab.frame, tab.viewSpec, tab.forhandsvisning)
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

export function clearViewSpec(tab: Tab): void {
  tab.viewSpec = { ...TOM_VY }
  tab.redigerar = null
  refreshView(tab)
}

export function viewIsLimited(tab: Tab | null): boolean {
  return tab !== null && harBegransning(tab.viewSpec)
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

export function openFrame(frame: Frame): Tab {
  const tab: Tab = {
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
  }
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
