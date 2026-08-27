import { useState } from 'preact/hooks'
import type { Column, ColumnId, Frame } from '../core/types.js'
import type { AppliedStep, Tab } from '../state/store.js'
import { TYPE_LABELS } from '../core/infer.js'
import { formatCount } from '../core/locale/sv.js'

export function ColumnPanel(props: {
  frame: Frame
  tab: Tab
  activeColumnId: ColumnId | null
  onSelect: (id: ColumnId) => void
  onToggleHidden: (id: ColumnId) => void
  onMove: (id: ColumnId, toIndex: number) => void
  onInsert: () => void
  onUndoThrough: (index: number) => void
}) {
  const [sok, setSok] = useState('')
  const [drar, setDrar] = useState<ColumnId | null>(null)
  const [mal, setMal] = useState<number | null>(null)

  const alla = props.frame.columns
  const filtrerade = sok.trim() === ''
    ? alla
    : alla.filter((c) => c.name.toLocaleLowerCase('sv').includes(sok.toLocaleLowerCase('sv')))
  const dolda = alla.filter((c) => c.hidden).length

  return (
    <div class="panel">
      <div class="panel__rubrik">
        Kolumner
        <span class="panel__rubrik__antal">
          {formatCount(alla.length)}
          {dolda > 0 && ` · ${formatCount(dolda)} dolda`}
        </span>
      </div>

      <div style={{ padding: '0 8px 8px' }}>
        <input
          type="search"
          placeholder="Sök kolumn…"
          value={sok}
          style={{ width: '100%' }}
          onInput={(e) => setSok((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <div class="panel__innehall">
        <div class="kollista">
          {filtrerade.map((col) => {
            const index = alla.indexOf(col)
            const classes = ['kolrad']
            if (col.id === props.activeColumnId) classes.push('kolrad--aktiv')
            if (col.hidden) classes.push('kolrad--dold')
            if (mal === index) classes.push('kolrad--slappmal')
            return (
              <div
                key={col.id}
                class={classes.join(' ')}
                draggable
                title={`${col.name} — ${TYPE_LABELS[col.type]}`}
                onClick={() => props.onSelect(col.id)}
                onDragStart={() => setDrar(col.id)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setMal(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (drar && mal !== null) props.onMove(drar, mal)
                  setDrar(null)
                  setMal(null)
                }}
                onDragEnd={() => {
                  setDrar(null)
                  setMal(null)
                }}
              >
                <span class="kolrad__grepp" aria-hidden="true">
                  ⠿
                </span>
                <button
                  class="kolrad__oga"
                  title={col.hidden ? 'Visa kolumnen' : 'Dölj kolumnen'}
                  aria-label={col.hidden ? 'Visa kolumnen' : 'Dölj kolumnen'}
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onToggleHidden(col.id)
                  }}
                >
                  {col.hidden ? '○' : '●'}
                </button>
                <span class="kolrad__namn">{col.name}</span>
                <TypMarke col={col} />
              </div>
            )
          })}
          {filtrerade.length === 0 && (
            <p style={{ color: 'var(--text-svag)', fontSize: 13, padding: '6px' }}>
              Ingen kolumn matchar ”{sok}”.
            </p>
          )}
        </div>
      </div>

      <div class="panel__fot">
        <button class="knapp" style={{ width: '100%' }} onClick={props.onInsert}>
          ＋ Ny kolumn
        </button>
      </div>

      <StegLista tab={props.tab} onUndoThrough={props.onUndoThrough} />
    </div>
  )
}

function TypMarke({ col }: { col: Column }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-svagast)',
        letterSpacing: '0.03em',
      }}
    >
      {TYPE_LABELS[col.type]}
    </span>
  )
}

/**
 * Steglistan är samma sak som ångra-historiken.
 *
 * Att visa en separat "vad har hänt"-logg vid sidan av en ångra-stack är hur
 * de två hamnar ur synk. Här är listan stacken: klick på ett steg backar till
 * precis före det.
 */
function StegLista(props: { tab: Tab; onUndoThrough: (index: number) => void }) {
  const { history, cursor } = props.tab
  if (history.length === 0) return null

  return (
    <>
      <div class="panel__rubrik" style={{ borderTop: '1px solid var(--linje)' }}>
        Steg
        <span class="panel__rubrik__antal">{formatCount(cursor)}</span>
      </div>
      <div class="panel__innehall" style={{ flex: '0 1 auto', maxHeight: '30%' }}>
        {history.map((step: AppliedStep, i) => (
          <button
            key={step.id}
            class={`steg${i >= cursor ? ' steg--angrad' : ''}`}
            title={i < cursor ? 'Ångra till och med det här steget' : 'Ångrat — gör om med Ctrl+Y'}
            onClick={() => i < cursor && props.onUndoThrough(i)}
          >
            <span class="steg__nr">{i + 1}</span>
            <span>{step.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
