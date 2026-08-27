import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Column, ColumnId, Frame } from '../../core/types.js'
import { Flag } from '../../core/types.js'
import { getCell, filledCount, flagCount } from '../../core/frame/column.js'
import { TYPE_BADGES, TYPE_LABELS, violatesType } from '../../core/infer.js'
import { formatCount } from '../../core/locale/sv.js'

const DEFAULT_WIDTH = 168
const MIN_WIDTH = 56
/** Extra rader ovanför och under fönstret, så att rullning aldrig blottar tomrum. */
const OVERSCAN = 8

const TYPE_COLOR: Record<string, string> = {
  text: 'var(--typ-text)',
  number: 'var(--typ-tal)',
  date: 'var(--typ-datum)',
  email: 'var(--typ-epost)',
  bool: 'var(--typ-bool)',
  empty: 'var(--typ-text)',
}

export interface GridProps {
  frame: Frame
  /** Bumpas när ramen muterats, så komponenten vet att rita om. */
  revision: number
  activeColumnId: ColumnId | null
  onSelectColumn: (id: ColumnId) => void
  onOpenColumnMenu: (id: ColumnId, anchor: DOMRect) => void
  onMoveColumn: (id: ColumnId, toIndex: number) => void
  onResizeColumn: (id: ColumnId, width: number) => void
  onCycleType: (id: ColumnId) => void
}

interface Quality {
  filled: number
  empty: number
  invalid: number
}

/** Räknar kvalitet per kolumn på ordboken, inte på raderna. */
function measure(col: Column, frame: Frame): Quality {
  const total = frame.view.length
  const filled = filledCount(col, frame.view)
  let invalid = 0
  if (col.type !== 'text' && col.type !== 'empty') {
    // Räkna på ordboken och multiplicera upp: en kolumn med tre unika värden
    // kräver tre kontroller, inte hundratusen.
    const bad = new Uint8Array(col.dict.length)
    for (let d = 1; d < col.dict.length; d++) {
      bad[d] = violatesType(col.dict[d]!, col.type) ? 1 : 0
    }
    for (let i = 0; i < frame.view.length; i++) {
      if (bad[col.codes[frame.view[i]!]!]! === 1) invalid += 1
    }
  }
  invalid += flagCount(col, frame.view, Flag.ExcelError)
  return { filled: filled - invalid, empty: total - filled, invalid }
}

export function VirtualGrid(props: GridProps) {
  const { frame, activeColumnId } = props
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [rowHeight, setRowHeight] = useState(30)
  const [dragging, setDragging] = useState<ColumnId | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const columns = useMemo(
    () => frame.columns.filter((c) => !c.hidden),
    // Kolumnlistan ändras genom mutation, så revisionen är beroendet.
    [frame, props.revision],
  )

  const quality = useMemo(
    () => new Map(columns.map((c) => [c.id, measure(c, frame)] as const)),
    [columns, frame, props.revision],
  )

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measured = parseFloat(getComputedStyle(el).getPropertyValue('--radhojd'))
    if (Number.isFinite(measured) && measured > 0) setRowHeight(measured)
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    setViewportHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  const total = frame.view.length
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2
  const last = Math.min(total, first + visibleCount)

  const rows: preact.JSX.Element[] = []
  for (let i = first; i < last; i++) {
    const physical = frame.view[i]!
    rows.push(
      <div class="rutnat__rad" key={physical} style={{ height: `${rowHeight}px` }}>
        <div class="rutnat__radnr" title={`Rad ${frame.sourceRow[physical]} i filen`}>
          {formatCount(frame.sourceRow[physical] ?? physical + 1)}
        </div>
        {columns.map((col) => (
          <Cell key={col.id} col={col} row={physical} />
        ))}
      </div>,
    )
  }

  return (
    <div
      class="rutnat"
      ref={scrollerRef}
      role="grid"
      aria-rowcount={total + 1}
      aria-colcount={columns.length + 1}
      onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
    >
      <div class="rutnat__rubrikrad" role="row">
        <div class="rutnat__radnr" title="Radens nummer i källfilen. Ändras inte av sortering eller filtrering.">
          #
        </div>
        {columns.map((col, index) => (
          <Header
            key={col.id}
            col={col}
            index={index}
            aktiv={col.id === activeColumnId}
            kvalitet={quality.get(col.id)!}
            drar={dragging === col.id}
            slappmal={dropIndex === index}
            onSelect={() => props.onSelectColumn(col.id)}
            onMenu={(rect) => props.onOpenColumnMenu(col.id, rect)}
            onCycleType={() => props.onCycleType(col.id)}
            onResize={(width) => props.onResizeColumn(col.id, width)}
            onDragStart={() => setDragging(col.id)}
            onDragOver={() => setDropIndex(index)}
            onDrop={() => {
              if (dragging && dropIndex !== null) {
                const fromVisible = columns.findIndex((c) => c.id === dragging)
                if (fromVisible !== dropIndex) {
                  const target = columns[dropIndex]!
                  props.onMoveColumn(dragging, frame.columns.indexOf(target))
                }
              }
              setDragging(null)
              setDropIndex(null)
            }}
            onDragEnd={() => {
              setDragging(null)
              setDropIndex(null)
            }}
          />
        ))}
      </div>

      {total === 0 ? (
        <div class="rutnat__tomt">Inga rader att visa.</div>
      ) : (
        <div style={{ height: `${total * rowHeight}px`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: `${first * rowHeight}px`, left: 0, right: 0 }}>
            {rows}
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ col, row }: { col: Column; row: number }) {
  const value = getCell(col, row)
  const flags = col.flags[row]!
  const invalid = value !== '' && violatesType(value, col.type)
  const classes = ['rutnat__cell']
  if (col.type === 'number') classes.push('rutnat__cell--tal')
  if (col.type === 'date') classes.push('rutnat__cell--datum')
  if (invalid) classes.push('rutnat__cell--ogiltig')
  if ((flags & Flag.Padded) !== 0) classes.push('rutnat__cell--utfylld')
  if ((flags & Flag.UserEdited) !== 0) classes.push('rutnat__cell--redigerad')
  if (value === '') classes.push('rutnat__cell--tom')

  return (
    <div
      class={classes.join(' ')}
      role="gridcell"
      style={{ width: `${col.width ?? DEFAULT_WIDTH}px` }}
      title={
        invalid
          ? `Kunde inte tolkas som ${TYPE_LABELS[col.type].toLowerCase()}. Värdet står kvar som det är.`
          : value
      }
    >
      <span>{value}</span>
    </div>
  )
}

interface HeaderProps {
  col: Column
  index: number
  aktiv: boolean
  kvalitet: Quality
  drar: boolean
  slappmal: boolean
  onSelect: () => void
  onMenu: (rect: DOMRect) => void
  onCycleType: () => void
  onResize: (width: number) => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}

function Header(props: HeaderProps) {
  const { col, kvalitet } = props
  const width = col.width ?? DEFAULT_WIDTH
  const menuRef = useRef<HTMLButtonElement>(null)
  const total = Math.max(1, kvalitet.filled + kvalitet.empty + kvalitet.invalid)

  const classes = ['rubrik']
  if (props.aktiv) classes.push('rubrik--aktiv')
  if (props.drar) classes.push('rubrik--drar')
  if (props.slappmal) classes.push('rubrik--slappmal')

  const startResize = (event: PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = width
    const move = (e: PointerEvent) => {
      props.onResize(Math.max(MIN_WIDTH, Math.round(startWidth + e.clientX - startX)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      class={classes.join(' ')}
      role="columnheader"
      style={{ width: `${width}px`, '--typfarg': TYPE_COLOR[col.type] } as never}
      title={col.name}
      draggable
      onClick={props.onSelect}
      onDragStart={props.onDragStart}
      onDragOver={(e) => {
        e.preventDefault()
        props.onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        props.onDrop()
      }}
      onDragEnd={props.onDragEnd}
    >
      <div class="rubrik__namn">
        <span>{col.name}</span>
        <button
          ref={menuRef}
          class="rubrik__meny"
          aria-label={`Meny för kolumnen ${col.name}`}
          onClick={(e) => {
            e.stopPropagation()
            props.onMenu((e.currentTarget as HTMLElement).getBoundingClientRect())
          }}
        >
          ⋮
        </button>
      </div>
      <div class="rubrik__under">
        <button
          class="typbricka"
          title={`Typ: ${TYPE_LABELS[col.type]}. Klicka för att byta. Värden skrivs aldrig om.`}
          onClick={(e) => {
            e.stopPropagation()
            props.onCycleType()
          }}
        >
          {TYPE_BADGES[col.type]}
        </button>
        <div
          class="kvalitet"
          title={
            `${formatCount(kvalitet.filled)} ifyllda · ${formatCount(kvalitet.empty)} tomma` +
            (kvalitet.invalid > 0 ? ` · ${formatCount(kvalitet.invalid)} ogiltiga` : '')
          }
        >
          <div class="kvalitet__ifylld" style={{ width: `${(kvalitet.filled / total) * 100}%` }} />
          <div class="kvalitet__ogiltig" style={{ width: `${(kvalitet.invalid / total) * 100}%` }} />
          <div class="kvalitet__tom" style={{ width: `${(kvalitet.empty / total) * 100}%` }} />
        </div>
      </div>
      <div class="rubrik__greppa" onPointerDown={startResize} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

/** Används av kolumnpanelen så att bredder stämmer överens. */
export const KOLUMNBREDD_STANDARD = DEFAULT_WIDTH

export function useGridKeyboard(handler: (event: KeyboardEvent) => void): void {
  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
