import { useCallback, useEffect, useState } from 'preact/hooks'
import type { Column, ColumnId, ColumnType, Frame } from '../core/types.js'
import {
  columnIndex,
  duplicateColumn,
  findColumn,
  insertColumn,
  moveColumn,
  uniqueColumnName,
} from '../core/frame/frame.js'
import {
  celler,
  formatCount,
  formatSum,
  kolumner as kolumnerText,
  rader as raderText,
} from '../core/locale/sv.js'
import { DELIMITER_NAMES } from '../core/csv/sniff.js'
import { parseDelimitedText } from '../core/csv/parse.js'
import { toDelimited } from '../core/csv/stringify.js'
import { STADNINGAR } from '../core/ops/clean.js'
import { dataWorker } from '../worker/client.js'
import {
  activeTab,
  activeTabId,
  applyAppearance,
  canRedo,
  canUndo,
  clearViewSpec,
  closeTab,
  notify,
  openFrame,
  redo,
  revision,
  runStep,
  setActiveColumn,
  setForhandsvisning,
  setSelection,
  setViewSpec,
  tabs,
  tathet,
  theme,
  touch,
  undo,
  undoThrough,
  viewIsLimited,
  type Tab,
} from '../state/store.js'
import {
  dupliceraRader,
  fyllNedat,
  infogaRader,
  klistraIn,
  planeraInklistring,
  redigeraCell,
  sattMarkering,
  selectableColumns,
  selectedRows,
  stadaKolumner,
  taBortRader,
  taBortTommaKolumner,
  taBortTommaRader,
  tillampaForhandsvisning,
  type PasteRequest,
} from '../state/edits.js'
import { aggregera, cell, klamp, rect, type Selection } from '../state/selection.js'
import type { Forhandsvisning } from '../state/preview.js'
import { VirtualGrid, type Flytt } from './grid/VirtualGrid.jsx'
import { ColumnPanel } from './ColumnPanel.jsx'
import { Inspector } from './Inspector.jsx'
import { EmptyState } from './EmptyState.jsx'
import { ImportDialog, type ImportSettings } from './ImportDialog.jsx'
import { ExportDialog } from './ExportDialog.jsx'
import { SearchBar } from './SearchBar.jsx'
import { PasteDialog } from './PasteDialog.jsx'
import { DateTool } from './DateTool.jsx'
import { EmailTool } from './EmailTool.jsx'
import { ReplaceTool } from './ReplaceTool.jsx'
import { Meny, Toastar, type MenyPost } from './parts.jsx'
import { EXEMPELFIL } from './exempel.js'

const TYPCYKEL: ColumnType[] = ['text', 'number', 'date', 'email', 'bool']

/** Städverktygen som bor i sidopanelen. */
type Verktygsnamn = 'datum' | 'epost' | 'ersatt'

interface MenyLage {
  x: number
  y: number
  poster: (MenyPost | 'avdelare')[]
}

interface PasteState {
  plan: PasteRequest
  sel: Selection
}

export function App() {
  const [kö, setKö] = useState<File[]>([])
  const [exportOppen, setExportOppen] = useState(false)
  const [meny, setMeny] = useState<MenyLage | null>(null)
  const [laddar, setLaddar] = useState<string | null>(null)
  const [slappOver, setSlappOver] = useState(false)
  const [sokOppen, setSokOppen] = useState(false)
  const [inklistring, setInklistring] = useState<PasteState | null>(null)
  /** Vilket städverktyg som är öppet, och på vilken kolumn. */
  const [verktyg, setVerktyg] = useState<{ id: Verktygsnamn; colId: ColumnId } | null>(null)

  const tab = activeTab.value
  const frame = tab?.frame ?? null
  const rev = revision.value

  useEffect(() => applyAppearance(), [theme.value, tathet.value])

  /* ---------- Filer ---------- */

  const oppnaFiler = useCallback((files: File[]) => {
    const tillatna = files.filter(
      (f) => /\.(csv|txt|tsv|xlsx)$/i.test(f.name) || f.type.startsWith('text/'),
    )
    if (tillatna.length === 0) {
      notify('Verktyget öppnar CSV, TXT, TSV och Excel-filer (.xlsx).', { ton: 'varning' })
      return
    }
    setKö((current) => [...current, ...tillatna])
  }, [])

  const laddaFil = async (file: File, settings: ImportSettings) => {
    setKö((current) => current.slice(1))
    setLaddar(file.name)
    try {
      const parsed = await dataWorker.parse(
        file,
        {
          delimiter: settings.delimiter,
          encoding: settings.encoding,
          trimFields: settings.trimFields,
          skipEmptyRows: settings.skipEmptyRows,
          headerRow: settings.headerRow,
        },
        undefined,
        /\.xlsx$/i.test(file.name)
          ? { sheet: settings.sheet, decimal: settings.decimal }
          : undefined,
      )
      openFrame(parsed)
      const varningar = parsed.meta.warnings.filter((w) => w.kind !== 'encoding-uncertain')
      notify(
        `${file.name} öppnad — ${formatCount(parsed.rowCount)} rader, ${formatCount(parsed.columns.length)} kolumner.` +
          (varningar.length > 0
            ? ` ${varningar.length} sak${varningar.length === 1 ? '' : 'er'} att titta på.`
            : ''),
        { ton: varningar.length > 0 ? 'varning' : 'info' },
      )
    } catch (error) {
      notify(`Kunde inte öppna ${file.name}: ${(error as Error).message}`, { ton: 'fara' })
    } finally {
      setLaddar(null)
    }
  }

  const oppnaExempel = () => {
    const blob = new Blob([EXEMPELFIL], { type: 'text/csv' })
    setKö((current) => [...current, new File([blob], 'exempel-kunder.csv', { type: 'text/csv' })])
  }

  /** Öppnar text från urklipp som en ny flik. */
  const oppnaText = (text: string, namn: string) => {
    const blob = new Blob([text], { type: 'text/csv' })
    setKö((current) => [...current, new File([blob], namn, { type: 'text/csv' })])
  }

  /* ---------- Kolumnåtgärder ---------- */

  const kor = (label: string, kind: string, apply: () => void, revert: () => void) => {
    if (!tab) return
    runStep(tab, { label, kind, apply, revert })
  }

  const flyttaKolumn = (id: ColumnId, toIndex: number) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const from = columnIndex(frame, id)
    if (from === toIndex) return
    kor(
      `Flyttade kolumnen ${col.name}`,
      'move',
      () => moveColumn(frame, id, toIndex),
      () => moveColumn(frame, id, from),
    )
  }

  const vaxlaDold = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const nyDold = !col.hidden
    kor(
      `${nyDold ? 'Dolde' : 'Visade'} kolumnen ${col.name}`,
      'hide',
      () => {
        col.hidden = nyDold
      },
      () => {
        col.hidden = !nyDold
      },
    )
  }

  const infogaKolumn = (atIndex?: number) => {
    if (!frame) return
    const namn = uniqueColumnName(frame.columns.map((c) => c.name), 'Ny kolumn')
    const index = atIndex ?? frame.columns.length
    let skapad: ColumnId | null = null
    kor(
      `Infogade kolumnen ${namn}`,
      'insert',
      () => {
        const col = insertColumn(frame, namn, index)
        skapad = col.id
        setActiveColumn(col.id)
      },
      () => {
        if (skapad) {
          const at = columnIndex(frame, skapad)
          if (at !== -1) frame.columns.splice(at, 1)
        }
      },
    )
  }

  const taBortKolumn = (id: ColumnId) => {
    if (!frame || !tab) return
    const col = findColumn(frame, id)
    if (!col) return
    const index = columnIndex(frame, id)
    kor(
      `Tog bort kolumnen ${col.name}`,
      'drop',
      () => {
        frame.columns.splice(columnIndex(frame, id), 1)
      },
      () => {
        frame.columns.splice(index, 0, col)
      },
    )
    notify(`Kolumnen ”${col.name}” togs bort.`, {
      atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
    })
  }

  const dopOmKolumn = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const svar = window.prompt(`Nytt namn för kolumnen ”${col.name}”`, col.name)
    if (svar === null) return
    const nytt = uniqueColumnName(
      frame.columns.filter((c) => c.id !== id).map((c) => c.name),
      svar,
    )
    const gammalt = col.name
    if (nytt === gammalt) return
    kor(
      `Bytte namn: ${gammalt} → ${nytt}`,
      'rename',
      () => {
        col.name = nytt
      },
      () => {
        col.name = gammalt
      },
    )
  }

  const dupliceraKolumn = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    let skapad: ColumnId | null = null
    kor(
      `Duplicerade kolumnen ${col.name}`,
      'duplicate',
      () => {
        skapad = duplicateColumn(frame, id)?.id ?? null
      },
      () => {
        if (skapad) {
          const at = columnIndex(frame, skapad)
          if (at !== -1) frame.columns.splice(at, 1)
        }
      },
    )
  }

  const sattTyp = (id: ColumnId, typ: ColumnType) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col || col.type === typ) return
    const gammal = col.type
    const gammalLast = col.typeLocked
    kor(
      `Satte typ på ${col.name}: ${typ}`,
      'type',
      () => {
        col.type = typ
        // Ett manuellt val ska inte skrivas över av automatisk omtolkning.
        col.typeLocked = true
      },
      () => {
        col.type = gammal
        col.typeLocked = gammalLast
      },
    )
  }

  const cyklaTyp = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    sattTyp(id, TYPCYKEL[(TYPCYKEL.indexOf(col.type) + 1) % TYPCYKEL.length]!)
  }

  const andraBredd = (id: ColumnId, bredd: number) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    // Bredd är utseende, inte data, och hör inte hemma i ångra-historiken —
    // annars känns Ctrl+Z trasigt när den backar en kolumnbredd.
    col.width = bredd
    touch()
  }

  /* ---------- Vy ---------- */

  const visaOgiltiga = (id: ColumnId) => {
    if (!tab || !frame) return
    setViewSpec(tab, { invalidIn: id, search: undefined })
    const col = findColumn(frame, id)
    notify(
      `Visar ${formatCount(frame.view.length)} rader där ”${col?.name ?? ''}” inte går att tolka.`,
      { atgard: { etikett: 'Visa alla igen', kor: () => tab && clearViewSpec(tab) } },
    )
  }

  /* ---------- Markering och redigering ---------- */

  const markering = tab?.markering ?? null
  const synligaKolumner = tab ? selectableColumns(tab) : []

  /**
   * Läser flik och markering ur tillståndet i stället för ur renderingens
   * closure.
   *
   * Tangentbords- och urklippshanterare registreras i en effekt, och den
   * effekten körs *efter* renderingen. Klickar man på en cell och klistrar in
   * innan effekten hunnit registreras om, ser hanteraren fortfarande den
   * gamla markeringen och skriver på fel plats. Det var precis vad som hände
   * i CI, där maskinen klickar och klistrar in inom samma bildruta.
   */
  const nuLage = (): { tab: Tab; frame: Frame; kolumner: Column[]; sel: Selection | null } | null => {
    const t = activeTab.value
    if (!t) return null
    return { tab: t, frame: t.frame, kolumner: selectableColumns(t), sel: t.markering }
  }

  const flyttaMarkering = (dRad: number, dKol: number, utoka: boolean, tillKant: boolean) => {
    const nu = nuLage()
    if (!nu) return
    const { tab, frame, kolumner: synligaKolumner } = nu
    if (frame.view.length === 0 || synligaKolumner.length === 0) return
    const nuvarande = nu.sel ?? cell(0, 0)
    const sistaRad = frame.view.length - 1
    const sistaKol = synligaKolumner.length - 1
    const rad = tillKant
      ? dRad > 0
        ? sistaRad
        : dRad < 0
          ? 0
          : nuvarande.fokusRad
      : nuvarande.fokusRad + dRad
    const kol = tillKant
      ? dKol > 0
        ? sistaKol
        : dKol < 0
          ? 0
          : nuvarande.fokusKol
      : nuvarande.fokusKol + dKol
    const ny: Selection = utoka
      ? { ...nuvarande, fokusRad: rad, fokusKol: kol }
      : { ankareRad: rad, ankareKol: kol, fokusRad: rad, fokusKol: kol }
    setSelection(tab, klamp(ny, frame.view.length, synligaKolumner.length))
  }

  const startaRedigering = (rad?: number, kol?: number) => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    nu.tab.redigerar = { rad: rad ?? nu.sel.fokusRad, kol: kol ?? nu.sel.fokusKol }
    touch()
  }

  const avslutaRedigering = (rad: number, kol: number, value: string, flytt: Flytt) => {
    if (!tab) return
    tab.redigerar = null
    redigeraCell(tab, rad, kol, value)
    if (flytt === 'ned') flyttaMarkering(1, 0, false, false)
    else if (flytt === 'hoger') flyttaMarkering(0, 1, false, false)
    else touch()
  }

  const kopieraMarkering = async () => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const r = rect(nu.sel)
    const kolumner = nu.kolumner.slice(r.k1, r.k2 + 1)
    const rader = selectedRows(nu.tab, nu.sel)
    try {
      await navigator.clipboard.writeText(toDelimited(kolumner, rader, '\t'))
      notify(
        `${celler(rader.length * kolumner.length)} kopierade. Klistra in direkt i Excel.`,
      )
    } catch {
      notify('Webbläsaren tillät inte kopiering till urklipp.', { ton: 'varning' })
    }
  }

  const forbereKlistraIn = (text: string) => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const { tab, sel } = nu
    const { rows } = parseDelimitedText(text)
    if (rows.length === 0) return
    const plan = planeraInklistring(tab, sel, rows)
    if (plan.extraRader === 0 && plan.extraKolumner === 0) {
      const andrade = klistraIn(tab, sel, plan, false)
      notify(`Klistrade in ${celler(andrade)}.`, {
        atgard: { etikett: 'Ångra', kor: () => undo(tab) },
      })
      return
    }
    setInklistring({ plan, sel })
  }

  /* ---------- Rader ---------- */

  const taBortMarkeradeRader = () => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const rader = selectedRows(nu.tab, nu.sel)
    if (rader.length === 0) return
    taBortRader(nu.tab, rader)
    notify(`Tog bort ${raderText(rader.length)}.`, {
      atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) },
    })
  }

  const stada = (id: string) => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const { tab } = nu
    const stadning = STADNINGAR.find((s) => s.id === id)
    if (!stadning) return
    const r = rect(nu.sel)
    const kolumner = nu.kolumner.slice(r.k1, r.k2 + 1)
    const andrade = stadaKolumner(tab, kolumner, stadning)
    if (andrade === 0) {
      notify(`${stadning.etikett}: inget att ändra i markeringen.`)
      return
    }
    notify(
      `${stadning.etikett} — ${celler(andrade)} ändrades i ${
        kolumner.length === 1 ? `”${kolumner[0]!.name}”` : kolumnerText(kolumner.length)
      }.`,
      { atgard: { etikett: 'Ångra', kor: () => undo(tab) } },
    )
  }

  /* ---------- Städverktyg ---------- */

  const oppnaVerktyg = (namn: Verktygsnamn, colId: ColumnId) => {
    setActiveColumn(colId)
    setVerktyg({ id: namn, colId })
  }

  const stangVerktyg = () => {
    const nu = nuLage()
    if (nu) setForhandsvisning(nu.tab, null)
    setVerktyg(null)
  }

  // Ett öppet verktyg hör till sin flik. Byter man flik städas både panelen
  // och förhandsvisningen bort från den flik man lämnar — annars skulle den
  // ligga kvar och ritas nästa gång man kom tillbaka, utan panel som
  // förklarar den.
  useEffect(() => {
    const lamnad = activeTab.value
    if (!lamnad) return
    return () => {
      setForhandsvisning(lamnad, null)
      setVerktyg(null)
    }
  }, [tab?.id])

  /* ---------- Tangentbord ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const iFalt = target !== null && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)
      const mod = e.ctrlKey || e.metaKey
      const nu = nuLage()
      if (!nu) return
      const { tab, frame, kolumner: synligaKolumner, sel: markering } = nu

      if (mod) {
        const tangent = e.key.toLowerCase()
        if (tangent === 'z' && !e.shiftKey) {
          e.preventDefault()
          const step = undo(tab)
          if (step) notify(`Ångrade: ${step.label}`)
        } else if (tangent === 'y' || (tangent === 'z' && e.shiftKey)) {
          e.preventDefault()
          const step = redo(tab)
          if (step) notify(`Gjorde om: ${step.label}`)
        } else if (tangent === 's') {
          e.preventDefault()
          setExportOppen(true)
        } else if (tangent === 'f') {
          e.preventDefault()
          setSokOppen(true)
        } else if (tangent === 'a' && !iFalt) {
          e.preventDefault()
          if (frame.view.length > 0 && synligaKolumner.length > 0) {
            setSelection(tab, {
              ankareRad: 0,
              ankareKol: 0,
              fokusRad: frame.view.length - 1,
              fokusKol: synligaKolumner.length - 1,
            })
          }
        } else if (tangent === 'c' && !iFalt) {
          e.preventDefault()
          void kopieraMarkering()
        } else if (tangent === 'd' && !iFalt && markering) {
          e.preventDefault()
          const andrade = fyllNedat(tab, markering)
          if (andrade > 0) {
            notify(`Fyllde nedåt i ${celler(andrade)}.`, {
              atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
            })
          }
        }
        return
      }

      if (iFalt) return

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          flyttaMarkering(-1, 0, e.shiftKey, e.altKey)
          break
        case 'ArrowDown':
          e.preventDefault()
          flyttaMarkering(1, 0, e.shiftKey, e.altKey)
          break
        case 'ArrowLeft':
          e.preventDefault()
          flyttaMarkering(0, -1, e.shiftKey, e.altKey)
          break
        case 'ArrowRight':
          e.preventDefault()
          flyttaMarkering(0, 1, e.shiftKey, e.altKey)
          break
        case 'Home':
          e.preventDefault()
          flyttaMarkering(0, -1, e.shiftKey, true)
          break
        case 'End':
          e.preventDefault()
          flyttaMarkering(0, 1, e.shiftKey, true)
          break
        case 'Enter':
        case 'F2':
          e.preventDefault()
          startaRedigering()
          break
        case 'Delete':
        case 'Backspace':
          if (markering) {
            e.preventDefault()
            const andrade = sattMarkering(tab, markering, '')
            if (andrade > 0) {
              notify(`Tömde ${celler(andrade)}.`, {
                atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
              })
            }
          }
          break
        case 'Escape':
          if (sokOppen) {
            setSokOppen(false)
            clearViewSpec(tab)
          }
          break
        default:
          // Börja skriva direkt i en markerad cell, som i ett kalkylark.
          if (e.key.length === 1 && !e.altKey && markering && !tab.redigerar) {
            startaRedigering()
          }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, frame, markering, synligaKolumner.length, sokOppen, rev])

  /* ---------- Urklipp och släpp ---------- */

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text.trim() === '') return
      e.preventDefault()
      if (!tab) oppnaText(text, 'inklistrat.csv')
      else forbereKlistraIn(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [tab, markering, rev])

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setSlappOver(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setSlappOver(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setSlappOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) oppnaFiler(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [oppnaFiler])

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (tabs.value.some((t) => t.smutsig)) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const aktivKolumn =
    frame && tab?.activeColumnId ? (findColumn(frame, tab.activeColumnId) ?? null) : null
  // Kolumnen kan ha tagits bort medan verktyget stod öppet; då stängs det.
  const verktygKolumn = frame && verktyg ? (findColumn(frame, verktyg.colId) ?? null) : null
  const begransad = viewIsLimited(tab)

  return (
    <div class="app">
      <div class="verktygsrad">
        <span class="verktygsrad__namn">
          <span class="verktygsrad__logga" aria-hidden="true">
            ▤
          </span>
          CSV-verkstan
        </span>
        <FilValjare onFiler={oppnaFiler} />
        <button
          class="knapp"
          disabled={!frame}
          onClick={(e) =>
            setMeny({
              x: (e.currentTarget as HTMLElement).getBoundingClientRect().left,
              y: (e.currentTarget as HTMLElement).getBoundingClientRect().bottom + 4,
              poster: stadMeny(stada, {
                tommaRader: () => {
                  if (!tab) return
                  const n = taBortTommaRader(tab)
                  notify(
                    n === 0
                      ? 'Inga helt tomma rader hittades.'
                      : `Tog bort ${raderText(n)} som var helt tomma.`,
                    n > 0
                      ? { atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) } }
                      : undefined,
                  )
                },
                tommaKolumner: () => {
                  if (!tab) return
                  const n = taBortTommaKolumner(tab)
                  notify(
                    n === 0
                      ? 'Inga helt tomma kolumner hittades.'
                      : `Tog bort ${kolumnerText(n)} som var helt tomma.`,
                    n > 0
                      ? { atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) } }
                      : undefined,
                  )
                },
              }),
            })
          }
        >
          Städa ▾
        </button>
        <button class="knapp" disabled={!frame} onClick={() => setExportOppen(true)}>
          Exportera
        </button>
        <div class="vaxel">
          <button
            class="knapp knapp--tyst"
            disabled={!canUndo(tab)}
            title="Ångra (Ctrl+Z)"
            onClick={() => tab && undo(tab)}
          >
            ↺ Ångra{tab && tab.cursor > 0 ? ` ${tab.cursor}` : ''}
          </button>
          <button
            class="knapp knapp--tyst"
            disabled={!canRedo(tab)}
            title="Gör om (Ctrl+Y)"
            onClick={() => tab && redo(tab)}
          >
            ↻ Gör om
          </button>
          <button
            class="knapp knapp--tyst"
            title="Ljust eller mörkt läge"
            onClick={() => {
              theme.value = theme.value === 'dark' ? 'light' : 'dark'
            }}
          >
            {theme.value === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>

      {tabs.value.length > 0 && (
        <div class="flikrad">
          {tabs.value.map((t) => (
            <FlikKnapp key={t.id} tab={t} aktiv={t.id === tab?.id} />
          ))}
        </div>
      )}

      {sokOppen && tab && frame && (
        <SearchBar
          varde={tab.viewSpec.search ?? ''}
          traffar={frame.view.length}
          totalt={frame.rowCount}
          kolumnerMedTraff={tab.kolumnerMedTraff}
          onSok={(fraga) => setViewSpec(tab, { search: fraga, invalidIn: undefined })}
          onStang={() => {
            setSokOppen(false)
            clearViewSpec(tab)
          }}
          onNasta={() => flyttaMarkering(1, 0, false, false)}
        />
      )}

      {laddar && (
        <div class="forlopp" role="progressbar" aria-label={`Läser ${laddar}`}>
          <div class="forlopp__stapel" />
        </div>
      )}

      {frame && tab ? (
        <div
          class={`arbetsyta arbetsyta--med-inspektor${
            verktygKolumn ? ' arbetsyta--med-verktyg' : ''
          }`}
        >
          <ColumnPanel
            frame={frame}
            tab={tab}
            activeColumnId={tab.activeColumnId}
            onSelect={setActiveColumn}
            onToggleHidden={vaxlaDold}
            onMove={flyttaKolumn}
            onInsert={() => infogaKolumn()}
            onUndoThrough={(i) => undoThrough(tab, i)}
          />
          <VirtualGrid
            frame={frame}
            revision={rev}
            activeColumnId={tab.activeColumnId}
            viewSpec={tab.viewSpec}
            forhandsvisning={tab.forhandsvisning}
            markering={markering}
            redigerar={tab.redigerar}
            onSelectColumn={setActiveColumn}
            onOpenColumnMenu={(id, anchor) =>
              setMeny({
                x: anchor.left,
                y: anchor.bottom + 4,
                poster: kolumnMeny(id, {
                  dopOm: dopOmKolumn,
                  duplicera: dupliceraKolumn,
                  vaxlaDold,
                  infogaFore: (i) => infogaKolumn(columnIndex(frame, i)),
                  infogaEfter: (i) => infogaKolumn(columnIndex(frame, i) + 1),
                  flyttaForst: (i) => flyttaKolumn(i, 0),
                  flyttaSist: (i) => flyttaKolumn(i, frame.columns.length - 1),
                  visaOgiltiga,
                  verktyg: oppnaVerktyg,
                  taBort: taBortKolumn,
                  dold: findColumn(frame, id)?.hidden ?? false,
                }),
              })
            }
            onMoveColumn={flyttaKolumn}
            onResizeColumn={andraBredd}
            onCycleType={cyklaTyp}
            onSelect={(sel) => setSelection(tab, sel)}
            onStartEdit={startaRedigering}
            onCommitEdit={avslutaRedigering}
            onCancelEdit={() => {
              tab.redigerar = null
              touch()
            }}
          />
          {verktygKolumn && verktyg ? (
            <Verktyg
              namn={verktyg.id}
              col={verktygKolumn}
              dataRevision={tab.dataRevision}
              visaBara={tab.viewSpec.visaBara}
              onVisaBara={(v) => setViewSpec(tab, { visaBara: v })}
              onForhandsvisning={(f) => setForhandsvisning(tab, f)}
              onTillampa={(f) => {
                const antal = tillampaForhandsvisning(tab, f)
                stangVerktyg()
                notify(
                  f.nyKolumn === null
                    ? `${f.etikett} — ${celler(antal)} skrevs om.`
                    : `${f.etikett} — ny kolumn med ${celler(antal)} ifyllda.`,
                  { atgard: { etikett: 'Ångra', kor: () => undo(tab) } },
                )
              }}
              onStang={stangVerktyg}
            />
          ) : (
            <Inspector
              frame={frame}
              column={aktivKolumn}
              revision={rev}
              onSetType={(t) => aktivKolumn && sattTyp(aktivKolumn.id, t)}
              onFilterInvalid={() => aktivKolumn && visaOgiltiga(aktivKolumn.id)}
              onRename={() => aktivKolumn && dopOmKolumn(aktivKolumn.id)}
              onDuplicate={() => aktivKolumn && dupliceraKolumn(aktivKolumn.id)}
              onDelete={() => aktivKolumn && taBortKolumn(aktivKolumn.id)}
            />
          )}
        </div>
      ) : (
        <EmptyState onFiler={oppnaFiler} onExempel={oppnaExempel} />
      )}

      <Statusrad
        tab={tab}
        begransad={begransad}
        onRensaVy={() => {
          if (!tab) return
          setSokOppen(false)
          clearViewSpec(tab)
        }}
        onRadmeny={(x, y) =>
          setMeny({
            x,
            y,
            poster: radMeny({
              infogaFore: () => tab && markering && infogaRader(tab, markering.fokusRad, 1, false),
              infogaEfter: () => tab && markering && infogaRader(tab, markering.fokusRad, 1, true),
              duplicera: () => tab && markering && dupliceraRader(tab, selectedRows(tab, markering)),
              taBort: taBortMarkeradeRader,
            }),
          })
        }
      />

      {kö.length > 0 && (
        <ImportDialog
          file={kö[0]!}
          onAvbryt={() => setKö((current) => current.slice(1))}
          onOppna={(settings) => void laddaFil(kö[0]!, settings)}
        />
      )}

      {exportOppen && frame && (
        <ExportDialog
          frame={frame}
          harFilter={begransad}
          onStang={() => setExportOppen(false)}
          onExporterad={() => {
            setExportOppen(false)
            if (tab) tab.smutsig = false
            notify('Filen laddades ner.')
          }}
        />
      )}

      {inklistring && tab && (
        <PasteDialog
          plan={inklistring.plan}
          markeradeRader={rect(inklistring.sel).r2 - rect(inklistring.sel).r1 + 1}
          markeradeKolumner={rect(inklistring.sel).k2 - rect(inklistring.sel).k1 + 1}
          onAvbryt={() => setInklistring(null)}
          onKlistraIn={(utoka) => {
            const andrade = klistraIn(tab, inklistring.sel, inklistring.plan, utoka)
            setInklistring(null)
            notify(`Klistrade in ${celler(andrade)}.`, {
              atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
            })
          }}
        />
      )}

      {meny && (
        <Meny x={meny.x} y={meny.y} poster={meny.poster} onStang={() => setMeny(null)} />
      )}

      {slappOver && <div class="slappoverlagg">Släpp för att öppna som ny flik</div>}
      <Toastar />
    </div>
  )
}

/**
 * Väljer verktygspanel.
 *
 * Alla verktyg har samma gränssnitt mot appen — en kolumn in, en
 * förhandsvisning ut — så valet är en rad och inte en förgrening genom
 * resten av koden.
 */
interface VerktygProps {
  namn: Verktygsnamn
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}

function Verktyg({ namn, ...rest }: VerktygProps) {
  if (namn === 'datum') return <DateTool {...rest} />
  if (namn === 'epost') return <EmailTool {...rest} />
  return <ReplaceTool {...rest} />
}

function stadMeny(
  stada: (id: string) => void,
  rader: { tommaRader: () => void; tommaKolumner: () => void },
): (MenyPost | 'avdelare')[] {
  return [
    ...STADNINGAR.map((s): MenyPost => ({
      etikett: s.etikett,
      kor: () => stada(s.id),
    })),
    'avdelare',
    { etikett: 'Ta bort helt tomma rader', kor: rader.tommaRader },
    { etikett: 'Ta bort helt tomma kolumner', kor: rader.tommaKolumner },
  ]
}

function radMeny(handlers: {
  infogaFore: () => void
  infogaEfter: () => void
  duplicera: () => void
  taBort: () => void
}): (MenyPost | 'avdelare')[] {
  return [
    { etikett: 'Infoga rad ovanför', kor: handlers.infogaFore },
    { etikett: 'Infoga rad nedanför', kor: handlers.infogaEfter },
    { etikett: 'Dubblera markerade rader', kor: handlers.duplicera },
    'avdelare',
    { etikett: 'Ta bort markerade rader', fara: true, kor: handlers.taBort },
  ]
}

function kolumnMeny(
  id: ColumnId,
  handlers: {
    dopOm: (id: ColumnId) => void
    duplicera: (id: ColumnId) => void
    vaxlaDold: (id: ColumnId) => void
    infogaFore: (id: ColumnId) => void
    infogaEfter: (id: ColumnId) => void
    flyttaForst: (id: ColumnId) => void
    flyttaSist: (id: ColumnId) => void
    visaOgiltiga: (id: ColumnId) => void
    verktyg: (namn: Verktygsnamn, id: ColumnId) => void
    taBort: (id: ColumnId) => void
    dold: boolean
  },
): (MenyPost | 'avdelare')[] {
  return [
    { etikett: 'Byt namn…', genvag: 'F2', kor: () => handlers.dopOm(id) },
    { etikett: 'Duplicera kolumnen', kor: () => handlers.duplicera(id) },
    {
      etikett: handlers.dold ? 'Visa kolumnen' : 'Dölj kolumnen',
      kor: () => handlers.vaxlaDold(id),
    },
    'avdelare',
    { etikett: 'Infoga tom kolumn till vänster', kor: () => handlers.infogaFore(id) },
    { etikett: 'Infoga tom kolumn till höger', kor: () => handlers.infogaEfter(id) },
    'avdelare',
    { etikett: 'Flytta först', kor: () => handlers.flyttaForst(id) },
    { etikett: 'Flytta sist', kor: () => handlers.flyttaSist(id) },
    'avdelare',
    { etikett: 'Datum…', kor: () => handlers.verktyg('datum', id) },
    { etikett: 'E-post → namn…', kor: () => handlers.verktyg('epost', id) },
    { etikett: 'Sök och ersätt…', kor: () => handlers.verktyg('ersatt', id) },
    { etikett: 'Visa rader som inte går att tolka', kor: () => handlers.visaOgiltiga(id) },
    'avdelare',
    { etikett: 'Ta bort kolumnen', fara: true, kor: () => handlers.taBort(id) },
  ]
}

function FilValjare({ onFiler }: { onFiler: (files: File[]) => void }) {
  return (
    <label class="knapp">
      Öppna
      <input
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from((e.currentTarget as HTMLInputElement).files ?? [])
          if (files.length > 0) onFiler(files)
          ;(e.currentTarget as HTMLInputElement).value = ''
        }}
      />
    </label>
  )
}

function FlikKnapp({ tab, aktiv }: { tab: Tab; aktiv: boolean }) {
  return (
    <span class={`flik${aktiv ? ' flik--aktiv' : ''}`}>
      <button
        class="flik__namn"
        style={{
          border: 0,
          background: 'transparent',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
        }}
        onClick={() => {
          activeTabId.value = tab.id
        }}
      >
        {tab.smutsig && '● '}
        {tab.frame.name || 'Namnlös'}
      </button>
      <span class="flik__antal">{formatCount(tab.frame.rowCount)}</span>
      <button
        class="flik__stang"
        aria-label={`Stäng ${tab.frame.name}`}
        onClick={() => {
          if (
            tab.smutsig &&
            !window.confirm(`${tab.frame.name} har ändringar som inte exporterats. Stänga ändå?`)
          ) {
            return
          }
          closeTab(tab.id)
        }}
      >
        ✕
      </button>
    </span>
  )
}

function Statusrad(props: {
  tab: Tab | null
  begransad: boolean
  onRensaVy: () => void
  onRadmeny: (x: number, y: number) => void
}) {
  const tab = props.tab
  if (!tab) {
    return (
      <div class="statusrad">
        <span>Ingen fil öppen</span>
        <span class="statusrad__lokal">● Allt lokalt</span>
      </div>
    )
  }
  const frame: Frame = tab.frame
  const parse = frame.meta.parse
  const kolumner = selectableColumns(tab)
  const agg = tab.markering ? aggregera(frame, kolumner, tab.markering) : null

  return (
    <div class="statusrad">
      <span>
        {props.begransad
          ? `${formatCount(frame.view.length)} av ${formatCount(frame.rowCount)} rader`
          : `${formatCount(frame.rowCount)} rader`}
      </span>
      <span>{formatCount(kolumner.length)} kolumner</span>
      {parse && (
        <span>
          {parse.encoding.toUpperCase()}
          {parse.hadBom && ' med BOM'} · {DELIMITER_NAMES[parse.delimiter].toLowerCase()}
        </span>
      )}
      {agg && agg.celler > 1 && (
        <span title="Snabbsumma för markeringen">
          {formatCount(agg.celler)} markerade
          {agg.tal > 0 && ` · Σ ${formatSum(agg.summa)}`}
          {agg.tal > 1 && ` · ø ${formatSum(agg.medel)}`}
          {agg.tal === 0 && agg.ifyllda > 0 && ` · ${formatCount(agg.unika)} unika`}
        </span>
      )}
      {props.begransad && (
        <button class="statusrad__knapp" onClick={props.onRensaVy}>
          Visa alla rader
        </button>
      )}
      <button
        class="statusrad__knapp"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          props.onRadmeny(r.left, r.top - 150)
        }}
      >
        Rader ▾
      </button>
      <span class="statusrad__lokal" title="Verktyget kan inte skicka data någonstans.">
        ● Allt lokalt
      </span>
    </div>
  )
}
