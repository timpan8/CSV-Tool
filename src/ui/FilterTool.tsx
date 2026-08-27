import { useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column, Frame } from '../core/types.js'
import { valueCounts } from '../core/frame/column.js'
import { findColumn, identityView, visibleColumns } from '../core/frame/frame.js'
import {
  aktivaRegler,
  nyRegelId,
  operatorerFor,
  operatorpost,
  tillampaFilter,
  type Filter,
  type Filterregel,
  type Operator,
} from '../core/ops/filter.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'

/**
 * Filterbyggaren.
 *
 * En platt regellista med ett val mellan *alla* och *någon*, inte nästlade
 * grupper. Nästlingen är kraftfullare men gör det lätt att bygga ett filter
 * man inte längre förstår, och den som verkligen behöver den kan bygga
 * mellansteg i stället.
 *
 * Varje regel kan slås av utan att tas bort. Det är skillnaden mellan att
 * pröva sig fram och att börja om.
 */
export function FilterTool(props: {
  frame: Frame
  revision: number
  filter: Filter
  startkolumn: string | null
  onFilter: (filter: Filter) => void
  /** Tar bort de rader som visas just nu. */
  onTaBortSynliga: () => void
  /** Tar bort alla rader utom de som visas just nu. */
  onBehallSynliga: () => void
  onStang: () => void
}) {
  const { frame, filter } = props
  const [oppenLista, setOppenLista] = useState<string | null>(null)

  const kolumner = visibleColumns(frame)

  const andra = (id: string, delta: Partial<Filterregel>) =>
    props.onFilter({
      ...filter,
      regler: filter.regler.map((r) => (r.id === id ? { ...r, ...delta } : r)),
    })

  const taBort = (id: string) =>
    props.onFilter({ ...filter, regler: filter.regler.filter((r) => r.id !== id) })

  const lagg = () => {
    const col = (props.startkolumn && findColumn(frame, props.startkolumn)) || kolumner[0]
    if (!col) return
    props.onFilter({
      ...filter,
      regler: [
        ...filter.regler,
        { id: nyRegelId(), colId: col.id, operator: 'ar', varde: '' },
      ],
    })
  }

  const aktiva = aktivaRegler(frame, filter)
  const { fel } = useMemo(
    () => tillampaFilter(frame, filter, identityView(frame.rowCount)),
    [frame, filter, props.revision],
  )

  return (
    <Verktygspanel
      titel="Filter"
      underrubrik={
        aktiva.length === 0
          ? 'Inga aktiva regler'
          : `${formatCount(frame.view.length)} av ${formatCount(frame.rowCount)} rader`
      }
      onStang={props.onStang}
      fot={
        <>
          <button
            class="knapp"
            disabled={filter.regler.length === 0}
            onClick={() => props.onFilter({ ...filter, regler: [] })}
          >
            Ta bort alla regler
          </button>
          <button class="knapp knapp--primar" onClick={props.onStang}>
            Klar
          </button>
        </>
      }
    >
      {filter.regler.length > 1 && (
        <div class="falt">
          <span class="falt__etikett">En rad visas när</span>
          <Val
            varden={[
              { varde: 'alla' as const, etikett: 'Alla regler stämmer' },
              { varde: 'nagon' as const, etikett: 'Någon regel stämmer' },
            ]}
            valt={filter.koppling}
            onValj={(v) => props.onFilter({ ...filter, koppling: v })}
          />
        </div>
      )}

      <div class="falt">
        <span class="falt__etikett">Regler</span>
        {filter.regler.map((regel) => {
          const col = findColumn(frame, regel.colId)
          const post = operatorpost(regel.operator)
          const regelfel = fel.find((f) => f.regelId === regel.id)
          return (
            <div
              class={`regel${regel.av ? ' regel--av' : ''}${col ? '' : ' regel--trasig'}`}
              key={regel.id}
            >
              <label class="kryss regel__pa">
                <input
                  type="checkbox"
                  checked={regel.av !== true}
                  aria-label="Regeln är på"
                  onChange={(e) =>
                    andra(regel.id, { av: !(e.currentTarget as HTMLInputElement).checked })
                  }
                />
              </label>

              <select
                class="nivarad__kolumn"
                value={regel.colId}
                onChange={(e) => andra(regel.id, { colId: (e.currentTarget as HTMLSelectElement).value })}
              >
                {!col && <option value={regel.colId}>Borttagen kolumn</option>}
                {frame.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                class="nivarad__kolumn"
                value={regel.operator}
                onChange={(e) =>
                  andra(regel.id, {
                    operator: (e.currentTarget as HTMLSelectElement).value as Operator,
                  })
                }
              >
                {operatorerFor(col?.type ?? 'text').map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.etikett}
                  </option>
                ))}
              </select>

              {regel.operator === 'iLista' ? (
                <button
                  class="knapp knapp--tyst regel__lista"
                  onClick={() => setOppenLista(oppenLista === regel.id ? null : regel.id)}
                >
                  {(regel.varden?.length ?? 0) === 0
                    ? 'Välj värden…'
                    : `${formatCount(regel.varden!.length)} valda`}
                </button>
              ) : (
                post.falt > 0 && (
                  <input
                    class="regel__varde"
                    value={regel.varde}
                    placeholder={
                      regel.operator === 'langreAn' || regel.operator === 'kortareAn'
                        ? 'antal tecken'
                        : 'värde'
                    }
                    onInput={(e) => andra(regel.id, { varde: (e.currentTarget as HTMLInputElement).value })}
                  />
                )
              )}
              {post.falt === 2 && (
                <input
                  class="regel__varde"
                  value={regel.varde2 ?? ''}
                  placeholder="till"
                  onInput={(e) => andra(regel.id, { varde2: (e.currentTarget as HTMLInputElement).value })}
                />
              )}

              <button
                class="kolrad__oga"
                aria-label="Ta bort regeln"
                title="Ta bort regeln"
                onClick={() => taBort(regel.id)}
              >
                ✕
              </button>

              {regelfel && <div class="regel__fel">{regelfel.text}</div>}
              {!col && (
                <div class="regel__fel">
                  Kolumnen finns inte längre. Regeln ligger kvar och börjar gälla igen om du
                  ångrar borttagningen.
                </div>
              )}

              {oppenLista === regel.id && col && (
                <Vardelista
                  frame={frame}
                  col={col}
                  filter={filter}
                  regel={regel}
                  onValda={(varden) => andra(regel.id, { varden })}
                />
              )}
            </div>
          )
        })}
        {filter.regler.length === 0 && (
          <p class="verktyg__sammanfattning">Inga regler än. Alla rader visas.</p>
        )}
        <button class="knapp" onClick={lagg}>
          ＋ Lägg till regel
        </button>
      </div>

      {aktiva.length > 0 && (
        <div class="falt">
          <label class="kryss">
            <input
              type="checkbox"
              checked={filter.inverterat === true}
              onChange={(e) =>
                props.onFilter({
                  ...filter,
                  inverterat: (e.currentTarget as HTMLInputElement).checked,
                })
              }
            />
            <span>Visa i stället de rader filtret döljer</span>
          </label>
          <p class="verktyg__sammanfattning">
            Vändningen gäller filtret som helhet. Att se vad man sorterat bort är det enda
            sättet att märka att man sorterat bort fel saker.
          </p>
        </div>
      )}

      {aktiva.length > 0 && (
        <div class="falt">
          <span class="falt__etikett">Gör urvalet permanent</span>
          <div class="insp__knappar" style={{ marginTop: 6 }}>
            <button class="knapp" onClick={props.onBehallSynliga}>
              Behåll bara de {raderText(frame.view.length)} som visas
            </button>
            <button class="knapp knapp--fara" onClick={props.onTaBortSynliga}>
              Ta bort de {raderText(frame.view.length)} som visas
            </button>
          </div>
          <p class="verktyg__sammanfattning">
            Båda ändrar filen och går att ångra. Filtret rensas efteråt, eftersom det inte
            längre har något att dölja.
          </p>
        </div>
      )}

      {filter.regler.length > aktiva.length && (
        <Notis ton="info">
          {formatCount(filter.regler.length - aktiva.length)} av reglerna räknas inte just nu —
          de är avslagna, ofärdiga eller pekar på en kolumn som tagits bort. De ligger kvar.
        </Notis>
      )}
    </Verktygspanel>
  )
}

/**
 * Värdelistan för `är något av`.
 *
 * Antalen räknas med den egna regeln avstängd. Räknar man på den synliga vyn
 * försvinner alternativen medan man kryssar i dem — Excels klassiska
 * irritationsmoment — och räknar man på hela kolumnen ignoreras de andra
 * reglerna.
 */
function Vardelista(props: {
  frame: Frame
  col: Column
  filter: Filter
  regel: Filterregel
  onValda: (varden: string[]) => void
}) {
  const [sok, setSok] = useState('')
  const valda = new Set(props.regel.varden ?? [])

  const poster = useMemo(() => {
    const utan: Filter = {
      ...props.filter,
      regler: props.filter.regler.filter((r) => r.id !== props.regel.id),
    }
    const { rader } = tillampaFilter(props.frame, utan, identityView(props.frame.rowCount))
    const antal = valueCounts(props.col, rader)
    const lista: { varde: string; antal: number }[] = []
    for (let kod = 1; kod < props.col.dict.length; kod++) {
      if (antal[kod]! > 0) lista.push({ varde: props.col.dict[kod]!, antal: antal[kod]! })
    }
    lista.sort((a, b) => b.antal - a.antal || a.varde.localeCompare(b.varde, 'sv'))
    return lista
  }, [props.frame, props.col, props.filter, props.regel.id])

  const synliga = poster.filter((p) => p.varde.toLowerCase().includes(sok.toLowerCase()))

  return (
    <div class="vardelista">
      <input
        type="search"
        placeholder={`Sök bland ${formatCount(poster.length)} värden…`}
        value={sok}
        onInput={(e) => setSok((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="vardelista__poster">
        {synliga.slice(0, 200).map((p) => (
          <label class="kryss vardelista__post" key={p.varde}>
            <input
              type="checkbox"
              checked={valda.has(p.varde)}
              onChange={(e) => {
                const nya = new Set(valda)
                if ((e.currentTarget as HTMLInputElement).checked) nya.add(p.varde)
                else nya.delete(p.varde)
                props.onValda([...nya])
              }}
            />
            <span class="vardelista__text">{p.varde}</span>
            <span class="insp__antal">{formatCount(p.antal)}</span>
          </label>
        ))}
        {synliga.length > 200 && (
          <p class="verktyg__sammanfattning">
            Visar de 200 vanligaste av {raderText(synliga.length)}. Sök för att hitta fler.
          </p>
        )}
        {synliga.length === 0 && <p class="verktyg__sammanfattning">Inga värden matchar.</p>}
      </div>
    </div>
  )
}
