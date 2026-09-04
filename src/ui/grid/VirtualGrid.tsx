import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Column, ColumnId, Frame } from '../../core/types.js'
import { Flag } from '../../core/types.js'
import { t, tf } from '../sprak.js'
import { getCell, filledCount, flagCount, matchDictionary } from '../../core/frame/column.js'
import { TYPE_BADGES, TYPE_LABELS, violatesType } from '../../core/infer.js'
import { formatCount } from '../../core/locale/sv.js'
import { cellenMatchar, type ViewSpec } from '../../state/view.js'
import {
  forCell,
  forKolumn,
  spokvarde,
  uppslag,
  PROBLEM,
  type Forhandsvisning,
} from '../../state/preview.js'
import type { Riktning, Sorteringsniva } from '../../core/ops/sort.js'
import { innehaller, rect, type Selection } from '../../state/selection.js'
import type { Dubblettgrupper } from '../../core/ops/duplicates.js'

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

export type Flytt = 'ned' | 'hoger' | 'ingen'

export interface GridProps {
  frame: Frame
  /** Bumpas när ramen muterats, så komponenten vet att rita om. */
  revision: number
  activeColumnId: ColumnId | null
  viewSpec: ViewSpec
  /**
   * Omskrivningar som visas men ännu inte är gjorda, en per kolumn verktyget
   * körs över. Ritas som före → efter, eller som spökkolumner.
   */
  forhandsvisning: readonly Forhandsvisning[]
  /** Aktiva sorteringsnivåer, för pilen i rubriken. */
  sortering: readonly Sorteringsniva[]
  /** Dubblettgrupperna, för linjen mellan dem och för valet av vilken rad som stannar. */
  grupper: Dubblettgrupper | null
  /** Fysiska rader som är utpekade att stanna, eller null när valet är av. */
  behallnaRader: ReadonlySet<number> | null
  /** Pekar ut raden som ska stanna i sin grupp. */
  onBehall: ((fysisk: number) => void) | null
  markering: Selection | null
  redigerar: { rad: number; kol: number } | null
  onSelectColumn: (id: ColumnId) => void
  /** Kolumnmenyn, vid en punkt i fönstret. */
  onOpenColumnMenu: (id: ColumnId, x: number, y: number) => void
  /** Cellmenyn, vid pekaren. Markeringen är redan flyttad hit vid behov. */
  onOpenCellMenu: (rad: number, kol: number, x: number, y: number) => void
  /** Radmenyn, vid pekaren. */
  onOpenRowMenu: (x: number, y: number) => void
  onMoveColumn: (id: ColumnId, toIndex: number) => void
  onResizeColumn: (id: ColumnId, width: number) => void
  /** Dubbelklick på kolumngreppet: anpassa bredden efter innehållet. */
  onAutofit: (id: ColumnId) => void
  onCycleType: (id: ColumnId) => void
  /** Klick på sortpilen. `lagg` när skift hölls nere: bygg en nivå till. */
  onSortera: (id: ColumnId, lagg: boolean) => void
  onSelect: (sel: Selection) => void
  onStartEdit: (rad: number, kol: number) => void
  onCommitEdit: (rad: number, kol: number, value: string, flytt: Flytt) => void
  onCancelEdit: () => void
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
    const bad = matchDictionary(col, (v) => v !== '' && violatesType(v, col.type))
    for (let i = 0; i < frame.view.length; i++) {
      if (bad[col.codes[frame.view[i]!]!]! === 1) invalid += 1
    }
  }
  invalid += flagCount(col, frame.view, Flag.ExcelError)
  return { filled: filled - invalid, empty: total - filled, invalid }
}

export function VirtualGrid(props: GridProps) {
  const { frame, activeColumnId, markering, redigerar } = props
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [rowHeight, setRowHeight] = useState(30)
  const [dragging, setDragging] = useState<ColumnId | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const drarMarkering = useRef(false)

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

  // Håll fokuscellen i bild när markeringen flyttas med tangentbordet.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !markering) return
    const top = markering.fokusRad * rowHeight
    const rubrik = 46
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowHeight > el.scrollTop + el.clientHeight - rubrik) {
      el.scrollTop = top + rowHeight - el.clientHeight + rubrik
    }
  }, [markering?.fokusRad, rowHeight])

  // Förhandsvisningen av en *ny* kolumn ritas som en spökkolumn intill sin
  // källa. Den ligger inte i ramen och går inte att markera, så
  // markeringens kolumnindex räknar fortfarande bara riktiga kolumner.
  const spoke = (col: Column): Forhandsvisning | null => {
    const f = forKolumn(props.forhandsvisning, col.id)
    return f && f.nyaKolumner.length > 0 ? f : null
  }

  const total = frame.view.length
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2
  const last = Math.min(total, first + visibleCount)
  const markerat = markering ? rect(markering) : null

  const valj = (rad: number, kol: number, utoka: boolean) => {
    if (utoka && markering) props.onSelect({ ...markering, fokusRad: rad, fokusKol: kol })
    else props.onSelect({ ankareRad: rad, ankareKol: kol, fokusRad: rad, fokusKol: kol })
  }

  /** Klick på radnumret markerar hela raden; skift-klick ett spann av rader. */
  const valjRad = (rad: number, utoka: boolean) => {
    const sista = Math.max(0, columns.length - 1)
    if (utoka && markering) {
      props.onSelect({ ...markering, ankareKol: 0, fokusRad: rad, fokusKol: sista })
    } else {
      props.onSelect({ ankareRad: rad, ankareKol: 0, fokusRad: rad, fokusKol: sista })
    }
  }

  /**
   * Högerklick flyttar markeringen bara när det sker utanför den.
   *
   * Att markera tre kolumner och sedan högerklicka i dem för att komma åt
   * Städa vore meningslöst om klicket först kastade markeringen.
   */
  const menyklick = (rad: number, kol: number) => {
    if (!markering || !innehaller(markering, rad, kol)) valj(rad, kol, false)
  }

  const rows: preact.JSX.Element[] = []
  for (let i = first; i < last; i++) {
    const physical = frame.view[i]!
    const radMarkerad = markerat !== null && i >= markerat.r1 && i <= markerat.r2
    const source = frame.sourceRow[physical] ?? 0
    // Sista raden i en dubblettgrupp får en linje under sig, så att grupperna
    // går att skilja åt utan att färgas — en bakgrundsfärg skulle krocka med
    // markeringen.
    const nasta = frame.view[i + 1]
    const gruppnr = props.grupper?.grupp[physical] ?? 0
    const gruppslut =
      props.grupper !== null &&
      gruppnr !== 0 &&
      (nasta === undefined || props.grupper.grupp[nasta] !== gruppnr)
    const heltLika = gruppnr !== 0 && props.grupper?.heltLika[gruppnr] === 1
    const behallen = props.behallnaRader?.has(physical) === true
    rows.push(
      <div
        class={`rutnat__rad${radMarkerad ? ' rutnat__rad--markerad' : ''}${
          gruppslut ? ' rutnat__rad--gruppslut' : ''
        }`}
        key={physical}
        role="row"
        style={{ height: `${rowHeight}px` }}
      >
        <div
          class={`rutnat__radnr rutnat__radnr--valjbar${
            source === 0 ? ' rutnat__radnr--tillagd' : ''
          }`}
          title={
            (source === 0 ? t('Tillagd rad — fanns inte i filen') : tf('Rad {0} i filen', source)) +
            (heltLika ? t('. Identisk med de andra i sin dubblettgrupp.') : '') +
            t('. Klicka för att markera raden.')
          }
          onPointerDown={(e) => {
            if (e.button !== 0) return
            valjRad(i, e.shiftKey)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            if (!markerat || i < markerat.r1 || i > markerat.r2) valjRad(i, false)
            props.onOpenRowMenu(e.clientX, e.clientY)
          }}
        >
          {props.onBehall !== null && gruppnr !== 0 && (
            <button
              class={`radnr__behall${behallen ? ' radnr__behall--vald' : ''}`}
              aria-pressed={behallen}
              title={
                behallen
                  ? 'Den här raden stannar när dubbletterna tas bort.'
                  : 'Låt den här raden stanna i stället.'
              }
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                props.onBehall!(physical)
              }}
            >
              {behallen ? '●' : '○'}
            </button>
          )}
          {gruppnr !== 0 && heltLika && props.onBehall === null && (
            <span
              class="radnr__identisk"
              title={t('Raden är identisk med de andra i sin grupp i varje kolumn.')}
            >
              =
            </span>
          )}
          {source === 0 ? '–' : formatCount(source)}
        </div>
        {columns.flatMap((col, kol) => [
          <Cell
            key={col.id}
            col={col}
            row={physical}
            markerad={markering !== null && innehaller(markering, i, kol)}
            fokus={markering?.fokusRad === i && markering.fokusKol === kol}
            redigeras={redigerar?.rad === i && redigerar.kol === kol}
            viewSpec={props.viewSpec}
            forhandsvisning={forKolumn(props.forhandsvisning, col.id)}
            onPointerDown={(utoka) => {
              drarMarkering.current = true
              valj(i, kol, utoka)
            }}
            onPointerEnter={() => {
              if (drarMarkering.current && markering) {
                props.onSelect({ ...markering, fokusRad: i, fokusKol: kol })
              }
            }}
            onMeny={(x, y) => {
              menyklick(i, kol)
              props.onOpenCellMenu(i, kol, x, y)
            }}
            onDoubleClick={() => props.onStartEdit(i, kol)}
            onCommit={(value, flytt) => props.onCommitEdit(i, kol, value, flytt)}
            onCancel={props.onCancelEdit}
          />,
          ...(spoke(col)?.nyaKolumner.map((_, mal) => (
            <SpokCell
              key={`spoke${col.id}-${mal}`}
              kall={col}
              row={physical}
              mal={mal}
              forh={spoke(col)!}
            />
          )) ?? []),
        ])}
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
      onPointerUp={() => {
        drarMarkering.current = false
      }}
      onPointerLeave={() => {
        drarMarkering.current = false
      }}
    >
      <div class="rutnat__rubrikrad" role="row">
        <div
          class="rutnat__radnr"
          title={t('Radens nummer i källfilen. Ändras inte av sortering eller filtrering.')}
        >
          #
        </div>
        {columns.flatMap((col, index) => [
          <Header
            key={col.id}
            col={col}
            aktiv={col.id === activeColumnId}
            markerad={markerat !== null && index >= markerat.k1 && index <= markerat.k2}
            kvalitet={quality.get(col.id)!}
            sortniva={props.sortering.findIndex((n) => n.colId === col.id)}
            sortriktning={props.sortering.find((n) => n.colId === col.id)?.riktning ?? null}
            flerniva={props.sortering.length > 1}
            onSortera={(lagg) => props.onSortera(col.id, lagg)}
            drar={dragging === col.id}
            slappmal={dropIndex === index}
            onSelect={() => {
              props.onSelectColumn(col.id)
              if (total > 0) {
                props.onSelect({
                  ankareRad: 0,
                  ankareKol: index,
                  fokusRad: total - 1,
                  fokusKol: index,
                })
              }
            }}
            onMenu={(x, y) => props.onOpenColumnMenu(col.id, x, y)}
            onAutofit={() => props.onAutofit(col.id)}
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
          />,
          ...(spoke(col)?.nyaKolumner.map((namn, mal) => (
            <div
              key={`spoke${col.id}-${mal}`}
              class="rubrik rubrik--spoke"
              style={{ width: `${col.width ?? DEFAULT_WIDTH}px` }}
              role="columnheader"
            >
              <span class="rubrik__namn">{namn}</span>
              <span class="rubrik__spoke">{t('ny kolumn')}</span>
            </div>
          )) ?? []),
        ])}
      </div>

      {total === 0 ? (
        <div class="rutnat__tomt">{t('Inga rader att visa.')}</div>
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

/**
 * En cell i spökkolumnen.
 *
 * Den läser sitt värde ur källkolumnens kod och förhandsvisningens tabell, är
 * inte markerbar och går inte att redigera. Kolumnen finns inte i ramen förrän
 * någon klickat Tillämpa.
 */
function SpokCell(props: { kall: Column; row: number; mal: number; forh: Forhandsvisning }) {
  const value = spokvarde(props.forh, props.kall, props.row, props.mal)
  const problem =
    ((props.forh.status[uppslag(props.forh, props.kall, props.row)] ?? 0) & PROBLEM) !== 0
  return (
    <div
      class={`rutnat__cell rutnat__cell--forhand rutnat__cell--spoke${
        problem ? ' rutnat__cell--forhand-problem' : ''
      }`}
      role="gridcell"
      aria-readonly="true"
      style={{ width: `${props.kall.width ?? DEFAULT_WIDTH}px` }}
      title={value}
    >
      <span class="forhand__efter">{value}</span>
    </div>
  )
}

interface CellProps {
  col: Column
  row: number
  markerad: boolean
  fokus: boolean
  redigeras: boolean
  viewSpec: ViewSpec
  forhandsvisning: Forhandsvisning | null
  onPointerDown: (utoka: boolean) => void
  onPointerEnter: () => void
  onMeny: (x: number, y: number) => void
  onDoubleClick: () => void
  onCommit: (value: string, flytt: Flytt) => void
  onCancel: () => void
}

function Cell(props: CellProps) {
  const { col, row } = props
  const value = getCell(col, row)
  const flags = col.flags[row]!
  const invalid = value !== '' && violatesType(value, col.type)
  const forh = forCell(props.forhandsvisning, col, row)

  const classes = ['rutnat__cell']
  if (forh) {
    classes.push('rutnat__cell--forhand')
    if (forh.andrad) classes.push('rutnat__cell--forhand-andrad')
    if (forh.problem) classes.push('rutnat__cell--forhand-problem')
  }
  if (col.type === 'number') classes.push('rutnat__cell--tal')
  if (col.type === 'date') classes.push('rutnat__cell--datum')
  if (invalid) classes.push('rutnat__cell--ogiltig')
  if ((flags & Flag.Padded) !== 0) classes.push('rutnat__cell--utfylld')
  if ((flags & Flag.UserEdited) !== 0) classes.push('rutnat__cell--redigerad')
  if (value === '') classes.push('rutnat__cell--tom')
  if (props.markerad) classes.push('rutnat__cell--markerad')
  if (props.fokus) classes.push('rutnat__cell--fokus')
  if (!props.redigeras && cellenMatchar(value, props.viewSpec)) classes.push('rutnat__cell--traff')

  return (
    <div
      class={classes.join(' ')}
      role="gridcell"
      aria-selected={props.markerad}
      style={{ width: `${col.width ?? DEFAULT_WIDTH}px` }}
      title={
        forh?.andrad
          ? `${value} → ${forh.efter || '(tomt)'}`
          : forh?.problem
            ? `Går inte att tolka. ${value}`
            : invalid
              ? `Kunde inte tolkas som ${TYPE_LABELS[col.type].toLowerCase()}. Värdet står kvar som det är.`
              : value
      }
      onPointerDown={(e) => {
        if (props.redigeras) return
        // Bara vänsterknappen flyttar markeringen. Högerklick hanteras av
        // onContextMenu, som behåller en flercellsmarkering man just gjort.
        if (e.button !== 0) return
        props.onPointerDown(e.shiftKey)
      }}
      onPointerEnter={props.onPointerEnter}
      onContextMenu={(e) => {
        e.preventDefault()
        props.onMeny(e.clientX, e.clientY)
      }}
      onDblClick={props.onDoubleClick}
    >
      {props.redigeras ? (
        <CellEditor start={value} onCommit={props.onCommit} onCancel={props.onCancel} />
      ) : forh?.andrad ? (
        <span class="forhand">
          <span class="forhand__fore">{value}</span>
          <span class="forhand__pil" aria-hidden="true">
            →
          </span>
          <span class="forhand__efter">{forh.efter === '' ? '(tomt)' : forh.efter}</span>
        </span>
      ) : (
        <span>{value}</span>
      )}
    </div>
  )
}

function CellEditor(props: {
  start: string
  onCommit: (value: string, flytt: Flytt) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  /**
   * Escape stänger fältet, vilket i sin tur utlöser blur. Utan den här
   * flaggan skulle blur-hanteraren skriva in värdet som användaren just
   * ångrade — alltså raka motsatsen till vad Escape betyder.
   */
  const klar = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  return (
    <input
      ref={ref}
      class="rutnat__redigering"
      defaultValue={props.start}
      onKeyDown={(e) => {
        const el = e.currentTarget as HTMLInputElement
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          klar.current = true
          props.onCommit(el.value, 'ned')
        } else if (e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          klar.current = true
          props.onCommit(el.value, 'hoger')
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          klar.current = true
          props.onCancel()
        } else {
          // Piltangenter och genvägar hör till rutnätet, men medan man skriver
          // hör de till fältet. Utan det här flyttar markeringen medan man
          // försöker rätta ett tecken.
          e.stopPropagation()
        }
      }}
      onBlur={(e) => {
        if (klar.current) return
        props.onCommit((e.currentTarget as HTMLInputElement).value, 'ingen')
      }}
    />
  )
}

interface HeaderProps {
  col: Column
  aktiv: boolean
  markerad: boolean
  kvalitet: Quality
  /** Nollbaserat index i sorteringen, eller -1 när kolumnen inte ingår. */
  sortniva: number
  sortriktning: Riktning | null
  flerniva: boolean
  onSortera: (lagg: boolean) => void
  drar: boolean
  slappmal: boolean
  onSelect: () => void
  onMenu: (x: number, y: number) => void
  onAutofit: () => void
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
  const total = Math.max(1, kvalitet.filled + kvalitet.empty + kvalitet.invalid)

  const classes = ['rubrik']
  if (props.aktiv) classes.push('rubrik--aktiv')
  if (props.markerad) classes.push('rubrik--markerad')
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
      onContextMenu={(e) => {
        e.preventDefault()
        props.onMenu(e.clientX, e.clientY)
      }}
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
          class={`rubrik__sort${props.sortriktning ? ' rubrik__sort--aktiv' : ''}`}
          aria-label={
            props.sortriktning
              ? tf(
                  'Sorterat på {0}, {1}. Klicka för att vända.',
                  col.name,
                  t(props.sortriktning),
                )
              : tf('Sortera på {0}', col.name)
          }
          title={t('Klicka för att sortera. Skift-klick lägger till en nivå.')}
          onClick={(e) => {
            e.stopPropagation()
            props.onSortera(e.shiftKey)
          }}
        >
          {/*
            Osorterad har ett eget tecken.
            Förut visades ↑ även när kolumnen inte var sorterad — bara i en
            svagare färg. Pilen syns dessutom alltid på den aktiva kolumnen,
            så ett klick på rubriknamnet (som *markerar* kolumnen) lämnade ett
            ↑ efter sig som såg ut som "sorterad stigande". Då läser man
            filens egen ordning som en sorterad ordning, och blir med rätta
            förvirrad när den inte ser sorterad ut. ↕ betyder "går att
            sortera"; ↑ och ↓ betyder att den *är* det.
          */}
          {props.sortriktning === 'stigande'
            ? '↑'
            : props.sortriktning === 'fallande'
              ? '↓'
              : '↕'}
          {props.sortniva !== -1 && props.flerniva && (
            <span class="rubrik__sortniva">{props.sortniva + 1}</span>
          )}
        </button>
        <button
          class="rubrik__meny"
          aria-label={tf('Meny för kolumnen {0}', col.name)}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            e.stopPropagation()
            props.onMenu(r.left, r.bottom + 4)
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
      <div
        class="rubrik__greppa"
        title={t('Dra för att ändra bredd. Dubbelklicka för att anpassa efter innehållet.')}
        onPointerDown={startResize}
        onClick={(e) => e.stopPropagation()}
        onDblClick={(e) => {
          e.stopPropagation()
          props.onAutofit()
        }}
      />
    </div>
  )
}
