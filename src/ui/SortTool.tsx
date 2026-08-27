import { useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { TYPE_LABELS } from '../core/infer.js'
import type { Riktning, Sorteringsniva } from '../core/ops/sort.js'
import { formatCount } from '../core/locale/sv.js'

/**
 * Flernivåsortering.
 *
 * Nivåerna är en lista och inte en handfull rullgardiner, eftersom ordningen
 * mellan dem *är* betydelsen: "Ort, sedan Belopp" är inte samma sak som
 * "Belopp, sedan Ort". Att kunna dra dem är därför inte en bekvämlighet utan
 * det som gör listan begriplig.
 */
export function SortTool(props: {
  frame: Frame
  nivaer: readonly Sorteringsniva[]
  inaktuell: boolean
  onNivaer: (nivaer: Sorteringsniva[]) => void
  onSorteraOm: () => void
  onStang: () => void
}) {
  const [drar, setDrar] = useState<number | null>(null)
  const kolumner = visibleColumns(props.frame)
  const nivaer = props.nivaer

  const andra = (i: number, delta: Partial<Sorteringsniva>) => {
    const nya = nivaer.map((n) => ({ ...n }))
    nya[i] = { ...nya[i]!, ...delta }
    props.onNivaer(nya)
  }

  const taBort = (i: number) => props.onNivaer(nivaer.filter((_, j) => j !== i).map((n) => ({ ...n })))

  const lagg = () => {
    const ledig = kolumner.find((c) => !nivaer.some((n) => n.colId === c.id))
    if (!ledig) return
    props.onNivaer([...nivaer.map((n) => ({ ...n })), { colId: ledig.id, riktning: 'stigande' }])
  }

  const flytta = (fran: number, till: number) => {
    if (fran === till) return
    const nya = nivaer.map((n) => ({ ...n }))
    const [flyttad] = nya.splice(fran, 1)
    nya.splice(till, 0, flyttad!)
    props.onNivaer(nya)
  }

  const allaAnvanda = nivaer.length >= kolumner.length

  return (
    <Verktygspanel
      titel="Sortera"
      underrubrik={
        nivaer.length === 0
          ? 'Ingen sortering'
          : `${formatCount(nivaer.length)} ${nivaer.length === 1 ? 'nivå' : 'nivåer'}`
      }
      onStang={props.onStang}
      fot={
        <>
          <button
            class="knapp"
            disabled={nivaer.length === 0}
            onClick={() => props.onNivaer([])}
          >
            Ta bort sorteringen
          </button>
          <button class="knapp knapp--primar" onClick={props.onStang}>
            Klar
          </button>
        </>
      }
    >
      {props.inaktuell && (
        <Notis ton="varning">
          Ordningen räknades innan de senaste ändringarna, så raderna ligger kvar där de var.{' '}
          <button class="knapp knapp--tyst" onClick={props.onSorteraOm}>
            Sortera om
          </button>
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">Nivåer, viktigast först</span>
        <div class="kollista">
          {nivaer.map((niva, i) => {
            const col = props.frame.columns.find((c) => c.id === niva.colId)
            return (
              <div
                class={`kolrad nivarad${drar === i ? ' kolrad--slappmal' : ''}`}
                key={`${niva.colId}-${i}`}
                draggable
                onDragStart={() => setDrar(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drar !== null) flytta(drar, i)
                  setDrar(null)
                }}
                onDragEnd={() => setDrar(null)}
              >
                <span class="kolrad__grepp" aria-hidden="true">
                  ⠿
                </span>
                <span class="nivarad__nr">{i + 1}</span>
                <select
                  class="nivarad__kolumn"
                  value={niva.colId}
                  onChange={(e) => andra(i, { colId: (e.currentTarget as HTMLSelectElement).value })}
                >
                  {props.frame.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.hidden ? ' (dold)' : ''}
                    </option>
                  ))}
                </select>
                <Val
                  varden={[
                    { varde: 'stigande' as Riktning, etikett: '↑', titel: stigandeText(col?.type) },
                    { varde: 'fallande' as Riktning, etikett: '↓', titel: fallandeText(col?.type) },
                  ]}
                  valt={niva.riktning}
                  onValj={(v) => andra(i, { riktning: v })}
                />
                <button
                  class="kolrad__oga"
                  aria-label={`Ta bort nivån ${col?.name ?? ''}`}
                  title="Ta bort nivån"
                  onClick={() => taBort(i)}
                >
                  ✕
                </button>
              </div>
            )
          })}
          {nivaer.length === 0 && (
            <p class="verktyg__sammanfattning">
              Raderna ligger i filens ordning. Lägg till en nivå, eller klicka på pilen i en
              kolumnrubrik.
            </p>
          )}
        </div>
        <button class="knapp" disabled={allaAnvanda} onClick={lagg}>
          ＋ Lägg till nivå
        </button>
      </div>

      <Notis ton="info">
        Sorteringen ändrar bara i vilken ordning raderna visas — inga värden flyttas i filen, och
        radnumret till vänster fortsätter visa var raden stod. Tomma celler hamnar alltid sist,
        oavsett riktning: en tom cell är inte det minsta värdet, den saknas.
      </Notis>
    </Verktygspanel>
  )
}

function stigandeText(type: string | undefined): string {
  if (type === 'number') return 'Minst först'
  if (type === 'date') return 'Äldst först'
  return `A→Ö${type ? ` (${TYPE_LABELS[type as never] ?? ''})` : ''}`.trim()
}

function fallandeText(type: string | undefined): string {
  if (type === 'number') return 'Störst först'
  if (type === 'date') return 'Nyast först'
  return 'Ö→A'
}
