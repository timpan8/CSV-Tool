import { useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { ColumnId, ColumnType, Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { TYPE_LABELS } from '../core/infer.js'
import { grundFor, type Riktning, type Sorteringsgrund, type Sorteringsniva } from '../core/ops/sort.js'
import { formatCount } from '../core/locale/sv.js'
import { startaDrag } from './drag.js'
import { t, tf } from './sprak.js'

/**
 * Flernivåsortering.
 *
 * Nivåerna är en lista och inte en handfull rullgardiner, eftersom ordningen
 * mellan dem *är* betydelsen: "Ort, sedan Belopp" är inte samma sak som
 * "Belopp, sedan Ort". Att kunna dra dem är därför inte en bekvämlighet utan
 * det som gör listan begriplig — och ↑/↓ finns för den som inte drar.
 *
 * Varje nivå säger med ord vad den gör. En pil betyder olika saker på olika
 * kolumner — *minst först* på ett tal, *äldst först* på ett datum — och
 * panelen är stället där det ska stå, inte gissas. Riktningen står som
 * *A→Ö* på text oavsett gränssnittets språk, för sorteringen är svensk och
 * *A→Z* hade lovat en ordning verktyget inte kör.
 */
export function SortTool(props: {
  frame: Frame
  nivaer: readonly Sorteringsniva[]
  inaktuell: boolean
  /** Kolumnen markören står i — den som en ny nivå helst ska gälla. */
  aktivKolumn: ColumnId | null
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
    const anvand = (id: ColumnId) => nivaer.some((n) => n.colId === id)
    const ledig =
      (props.aktivKolumn !== null && !anvand(props.aktivKolumn)
        ? kolumner.find((c) => c.id === props.aktivKolumn)
        : undefined) ?? kolumner.find((c) => !anvand(c.id))
    if (!ledig) return
    props.onNivaer([...nivaer.map((n) => ({ ...n })), { colId: ledig.id, riktning: 'stigande' }])
  }

  const flytta = (fran: number, till: number) => {
    if (fran === till || till < 0 || till >= nivaer.length) return
    const nya = nivaer.map((n) => ({ ...n }))
    const [flyttad] = nya.splice(fran, 1)
    nya.splice(till, 0, flyttad!)
    props.onNivaer(nya)
  }

  const allaAnvanda = nivaer.length >= kolumner.length

  return (
    <Verktygspanel
      titel={t('Sortera')}
      underrubrik={
        nivaer.length === 0
          ? t('Ingen sortering')
          : `${formatCount(nivaer.length)} ${t(nivaer.length === 1 ? 'nivå' : 'nivåer')}`
      }
      onStang={props.onStang}
      fot={
        <>
          <button
            class="knapp"
            disabled={nivaer.length === 0}
            onClick={() => props.onNivaer([])}
          >
            {t('Ta bort sorteringen')}
          </button>
          <button class="knapp knapp--primar" onClick={props.onStang}>
            {t('Klar')}
          </button>
        </>
      }
    >
      {props.inaktuell && (
        <Notis ton="varning">
          {t(
            'Ordningen räknades innan de senaste ändringarna, så raderna ligger kvar där de var.',
          )}{' '}
          <button class="knapp knapp--tyst" onClick={props.onSorteraOm}>
            {t('Sortera om')}
          </button>
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Nivåer, viktigast först')}</span>
        <div class="kollista">
          {nivaer.map((niva, i) => {
            const col = props.frame.columns.find((c) => c.id === niva.colId)
            const grund = grundFor(niva)
            const namn = col?.name ?? ''
            return (
              <div
                class={`kolrad nivarad${drar === i ? ' kolrad--slappmal' : ''}`}
                key={`${niva.colId}-${i}`}
                draggable
                onDragStart={(e) => {
                  startaDrag(e)
                  setDrar(i)
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drar !== null) flytta(drar, i)
                  setDrar(null)
                }}
                onDragEnd={() => setDrar(null)}
              >
                <div class="nivarad__rad">
                  <span class="kolrad__grepp" aria-hidden="true">
                    ⠿
                  </span>
                  <span class="nivarad__nr">{i + 1}</span>
                  <select
                    class="nivarad__kolumn"
                    aria-label={tf('Kolumn för nivån {0}', i + 1)}
                    value={niva.colId}
                    onChange={(e) => andra(i, { colId: (e.currentTarget as HTMLSelectElement).value })}
                  >
                    {props.frame.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.hidden ? t(' (dold)') : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    class="kolrad__oga"
                    aria-label={tf('Flytta nivån {0} upp', namn)}
                    title={t('Flytta upp')}
                    disabled={i === 0}
                    onClick={() => flytta(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    class="kolrad__oga"
                    aria-label={tf('Flytta nivån {0} ned', namn)}
                    title={t('Flytta ned')}
                    disabled={i === nivaer.length - 1}
                    onClick={() => flytta(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    class="kolrad__oga"
                    aria-label={tf('Ta bort nivån {0}', namn)}
                    title={t('Ta bort nivån')}
                    onClick={() => taBort(i)}
                  >
                    ✕
                  </button>
                </div>
                <div class="nivarad__rad nivarad__rad--val">
                  <Val
                    etikett={t('Efter')}
                    varden={[
                      { varde: 'varde' as Sorteringsgrund, etikett: 'Värde' },
                      { varde: 'farg' as Sorteringsgrund, etikett: 'Färg', titel: 'Cellernas färg, i palettens ordning. Ofärgade sist.' },
                    ]}
                    valt={grund}
                    onValj={(v) => andra(i, { grund: v })}
                  />
                  <Val
                    varden={[
                      { varde: 'stigande' as Riktning, etikett: riktningsetikett(col?.type, grund, 'stigande') },
                      { varde: 'fallande' as Riktning, etikett: riktningsetikett(col?.type, grund, 'fallande') },
                    ]}
                    valt={niva.riktning}
                    onValj={(v) => andra(i, { riktning: v })}
                  />
                </div>
              </div>
            )
          })}
          {nivaer.length === 0 && (
            <p class="verktyg__sammanfattning">
              {t(
                'Raderna ligger i filens ordning. Lägg till en nivå, eller klicka på pilen i en kolumnrubrik.',
              )}
            </p>
          )}
          {nivaer.length >= 2 && (
            <p class="verktyg__sammanfattning">
              {t('Rader som är lika på nivå 1 ordnas efter nivå 2, och så vidare.')}
            </p>
          )}
        </div>
        <button class="knapp" disabled={allaAnvanda} onClick={lagg}>
          {t('＋ Lägg till nivå')}
        </button>
      </div>

      <Notis ton="info">
        {t(
          'Sorteringen ändrar bara i vilken ordning raderna visas — inga värden flyttas i filen, och radnumret till vänster fortsätter visa var raden stod. Tomma celler hamnar alltid sist, oavsett riktning: en tom cell är inte det minsta värdet, den saknas.',
        )}{' '}
        {t(
          'En nivå på färg lägger raderna i palettens ordning — blå, orange, grön, gul, rosa, lila, röd — med de ofärgade sist.',
        )}
      </Notis>
    </Verktygspanel>
  )
}

/*
 * Riktningen med ord. `A→Ö` och `Ö→A` översätts inte: sorteringen är svensk
 * oavsett gränssnittets språk — å ä ö ligger efter z — och `A→Z` hade lovat
 * en ordning verktyget inte kör. Riktningen är beteende, inte etikett.
 *
 * Etiketterna går genom `Val`, som översätter dem själv; därför står de här
 * som svenska literaler och inte som `t(...)`.
 */
function riktningsetikett(
  type: ColumnType | undefined,
  grund: Sorteringsgrund,
  riktning: Riktning,
): string {
  const stigande = riktning === 'stigande'
  if (grund === 'farg') return stigande ? 'Färgordning' : 'Omvänd färgordning'
  if (type === 'number') return stigande ? 'Minst först' : 'Störst först'
  if (type === 'date') return stigande ? 'Äldst först' : 'Nyast först'
  if (type === 'bool') return stigande ? 'Nej först' : 'Ja först'
  const typ = type ? ` (${t(TYPE_LABELS[type] ?? '')})` : ''
  return stigande ? `A→Ö${typ}` : `Ö→A${typ}`
}
