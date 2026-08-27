import { useCallback, useEffect, useState } from 'preact/hooks'
import type { ColumnId, ColumnType, Frame } from '../core/types.js'
import { getCell } from '../core/frame/column.js'
import {
  columnIndex,
  duplicateColumn,
  findColumn,
  identityView,
  insertColumn,
  moveColumn,
  uniqueColumnName,
} from '../core/frame/frame.js'
import { violatesType } from '../core/infer.js'
import { formatCount } from '../core/locale/sv.js'
import { DELIMITER_NAMES } from '../core/csv/sniff.js'
import { toTsv } from '../core/csv/stringify.js'
import { dataWorker } from '../worker/client.js'
import {
  activeTab,
  activeTabId,
  applyAppearance,
  canRedo,
  canUndo,
  closeTab,
  notify,
  openFrame,
  redo,
  revision,
  runStep,
  setActiveColumn,
  tabs,
  tathet,
  theme,
  touch,
  undo,
  undoThrough,
  type Tab,
} from '../state/store.js'
import { VirtualGrid } from './grid/VirtualGrid.jsx'
import { ColumnPanel } from './ColumnPanel.jsx'
import { Inspector } from './Inspector.jsx'
import { EmptyState } from './EmptyState.jsx'
import { ImportDialog, type ImportSettings } from './ImportDialog.jsx'
import { ExportDialog } from './ExportDialog.jsx'
import { Meny, Toastar, type MenyPost } from './parts.jsx'
import { EXEMPELFIL } from './exempel.js'

const TYPCYKEL: ColumnType[] = ['text', 'number', 'date', 'email', 'bool']

interface MenyLage {
  x: number
  y: number
  columnId: ColumnId
}

export function App() {
  const [kö, setKö] = useState<File[]>([])
  const [exportOppen, setExportOppen] = useState(false)
  const [meny, setMeny] = useState<MenyLage | null>(null)
  const [laddar, setLaddar] = useState<string | null>(null)
  const [slappOver, setSlappOver] = useState(false)

  const tab = activeTab.value
  const frame = tab?.frame ?? null
  const rev = revision.value

  useEffect(() => applyAppearance(), [theme.value, tathet.value])

  /* ---------- Filer ---------- */

  const oppnaFiler = useCallback((files: File[]) => {
    const tillatna = files.filter((f) => /\.(csv|txt|tsv)$/i.test(f.name) || f.type.startsWith('text/'))
    if (tillatna.length === 0) {
      notify('Bara CSV-, TXT- och TSV-filer kan öppnas än så länge.', { ton: 'varning' })
      return
    }
    setKö((current) => [...current, ...tillatna])
  }, [])

  const laddaFil = async (file: File, settings: ImportSettings) => {
    setKö((current) => current.slice(1))
    setLaddar(file.name)
    try {
      const parsed = await dataWorker.parse(file, {
        delimiter: settings.delimiter,
        encoding: settings.encoding,
        trimFields: settings.trimFields,
        skipEmptyRows: settings.skipEmptyRows,
        headerRow: settings.headerRow,
      })
      openFrame(parsed)
      const varningar = parsed.meta.warnings.filter((w) => w.kind !== 'encoding-uncertain')
      notify(
        `${file.name} öppnad — ${formatCount(parsed.rowCount)} rader, ${formatCount(parsed.columns.length)} kolumner.` +
          (varningar.length > 0 ? ` ${varningar.length} sak${varningar.length === 1 ? '' : 'er'} att titta på.` : ''),
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
    const file = new File([blob], 'exempel-kunder.csv', { type: 'text/csv' })
    setKö((current) => [...current, file])
  }

  /* ---------- Kolumnåtgärder ---------- */

  const kor = (label: string, kind: string, apply: () => void, revert: () => void) => {
    if (!tab) return
    runStep(tab, { label, kind, apply, revert })
  }

  const flyttaKolumn = (id: ColumnId, toIndex: number) => {
    if (!frame || !tab) return
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
        const kopia = duplicateColumn(frame, id)
        skapad = kopia?.id ?? null
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
    const nasta = TYPCYKEL[(TYPCYKEL.indexOf(col.type) + 1) % TYPCYKEL.length]!
    sattTyp(id, nasta)
  }

  const andraBredd = (id: ColumnId, bredd: number) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    // Bredd är utseende, inte data. Den hör inte hemma i ångra-historiken —
    // annars känns Ctrl+Z trasigt när den backar en kolumnbredd.
    col.width = bredd
    touch()
  }

  /* ---------- Vy ---------- */

  const visaOgiltiga = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const traffar: number[] = []
    for (let r = 0; r < frame.rowCount; r++) {
      const value = getCell(col, r)
      if (value !== '' && violatesType(value, col.type)) traffar.push(r)
    }
    frame.view = Uint32Array.from(traffar)
    touch()
    notify(
      `Visar ${formatCount(traffar.length)} rader där ”${col.name}” inte går att tolka.`,
      { atgard: { etikett: 'Visa alla igen', kor: rensaVy } },
    )
  }

  const rensaVy = () => {
    if (!frame) return
    frame.view = identityView(frame.rowCount)
    touch()
  }

  const kopieraTsv = async () => {
    if (!frame) return
    try {
      await navigator.clipboard.writeText(toTsv(frame))
      notify('Tabellen kopierad. Klistra in direkt i Excel.')
    } catch {
      notify('Webbläsaren tillät inte kopiering till urklipp.', { ton: 'varning' })
    }
  }

  /* ---------- Tangentbord ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (tab) {
          const step = undo(tab)
          if (step) notify(`Ångrade: ${step.label}`)
        }
      } else if ((e.key.toLowerCase() === 'y') || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        if (tab) {
          const step = redo(tab)
          if (step) notify(`Gjorde om: ${step.label}`)
        }
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (frame) setExportOppen(true)
      } else if (e.key.toLowerCase() === 'c' && e.shiftKey) {
        e.preventDefault()
        void kopieraTsv()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, frame])

  /* ---------- Släpp var som helst ---------- */

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

  /* ---------- Varna innan arbete går förlorat ---------- */

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (tabs.value.some((t) => t.smutsig)) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const aktivKolumn = frame && tab?.activeColumnId ? findColumn(frame, tab.activeColumnId) ?? null : null
  const harFilter = frame !== null && frame.view.length !== frame.rowCount

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

      {laddar && (
        <div class="forlopp" role="progressbar" aria-label={`Läser ${laddar}`}>
          <div class="forlopp__stapel" />
        </div>
      )}

      {frame && tab ? (
        <div class="arbetsyta arbetsyta--med-inspektor">
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
            onSelectColumn={setActiveColumn}
            onOpenColumnMenu={(id, anchor) =>
              setMeny({ x: anchor.left, y: anchor.bottom + 4, columnId: id })
            }
            onMoveColumn={flyttaKolumn}
            onResizeColumn={andraBredd}
            onCycleType={cyklaTyp}
          />
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
        </div>
      ) : (
        <EmptyState onFiler={oppnaFiler} onExempel={oppnaExempel} />
      )}

      <Statusrad frame={frame} harFilter={harFilter} onRensaVy={rensaVy} onKopiera={kopieraTsv} />

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
          harFilter={harFilter}
          onStang={() => setExportOppen(false)}
          onExporterad={() => {
            setExportOppen(false)
            if (tab) tab.smutsig = false
            notify('Filen laddades ner.')
          }}
        />
      )}

      {meny && frame && (
        <Meny
          x={meny.x}
          y={meny.y}
          onStang={() => setMeny(null)}
          poster={kolumnMeny(meny.columnId, {
            dopOm: dopOmKolumn,
            duplicera: dupliceraKolumn,
            vaxlaDold,
            infogaFore: (id) => infogaKolumn(columnIndex(frame, id)),
            infogaEfter: (id) => infogaKolumn(columnIndex(frame, id) + 1),
            flyttaForst: (id) => flyttaKolumn(id, 0),
            flyttaSist: (id) => flyttaKolumn(id, frame.columns.length - 1),
            visaOgiltiga,
            taBort: taBortKolumn,
            dold: findColumn(frame, meny.columnId)?.hidden ?? false,
          })}
        />
      )}

      {slappOver && <div class="slappoverlagg">Släpp för att öppna som ny flik</div>}
      <Toastar />
    </div>
  )
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
        accept=".csv,.txt,.tsv,text/csv,text/plain"
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
        style={{ border: 0, background: 'transparent', padding: 0, color: 'inherit', font: 'inherit' }}
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
          if (tab.smutsig && !window.confirm(`${tab.frame.name} har ändringar som inte exporterats. Stänga ändå?`)) return
          closeTab(tab.id)
        }}
      >
        ✕
      </button>
    </span>
  )
}

function Statusrad(props: {
  frame: Frame | null
  harFilter: boolean
  onRensaVy: () => void
  onKopiera: () => void
}) {
  const { frame } = props
  if (!frame) {
    return (
      <div class="statusrad">
        <span>Ingen fil öppen</span>
        <span class="statusrad__lokal">● Allt lokalt</span>
      </div>
    )
  }
  const parse = frame.meta.parse
  return (
    <div class="statusrad">
      <span>
        {props.harFilter
          ? `${formatCount(frame.view.length)} av ${formatCount(frame.rowCount)} rader`
          : `${formatCount(frame.rowCount)} rader`}
      </span>
      <span>{formatCount(frame.columns.filter((c) => !c.hidden).length)} kolumner</span>
      {parse && (
        <span>
          {parse.encoding.toUpperCase()}
          {parse.hadBom && ' med BOM'} · {DELIMITER_NAMES[parse.delimiter].toLowerCase()}
        </span>
      )}
      {props.harFilter && (
        <button class="statusrad__knapp" onClick={props.onRensaVy}>
          Visa alla rader
        </button>
      )}
      <button class="statusrad__knapp" onClick={props.onKopiera} title="Ctrl+Shift+C">
        Kopiera för Excel
      </button>
      <span class="statusrad__lokal" title="Verktyget kan inte skicka data någonstans.">
        ● Allt lokalt
      </span>
    </div>
  )
}
