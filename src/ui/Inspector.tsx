import { useMemo } from 'preact/hooks'
import type { Column, ColumnType, Frame } from '../core/types.js'
import { filledCount, valueCounts } from '../core/frame/column.js'
import { TYPE_LABELS, violatesType } from '../core/infer.js'
import { formatCount } from '../core/locale/sv.js'
import { VERKTYG, type Verktygsnamn } from './verktyg.jsx'

const TYPER: ColumnType[] = ['text', 'number', 'date', 'email', 'bool']

interface Statistik {
  totalt: number
  ifyllda: number
  tomma: number
  ogiltiga: number
  unika: number
  topp: { varde: string; antal: number }[]
}

/**
 * All statistik räknas ur ordboken.
 *
 * Antal unika värden, vanligaste värden och andelen ogiltiga är en enda
 * räknarslinga över raderna plus ett svep över de unika värdena — inte en
 * strängjämförelse per cell.
 */
function berakna(col: Column, frame: Frame): Statistik {
  const counts = valueCounts(col, frame.view)
  const totalt = frame.view.length
  const ifyllda = filledCount(col, frame.view)

  let unika = 0
  let ogiltiga = 0
  const poster: { varde: string; antal: number }[] = []
  for (let d = 1; d < col.dict.length; d++) {
    const antal = counts[d]!
    if (antal === 0) continue
    unika += 1
    const varde = col.dict[d]!
    if (violatesType(varde, col.type)) ogiltiga += antal
    poster.push({ varde, antal })
  }
  poster.sort((a, b) => b.antal - a.antal)

  return {
    totalt,
    ifyllda,
    tomma: totalt - ifyllda,
    ogiltiga,
    unika,
    topp: poster.slice(0, 8),
  }
}

export function Inspector(props: {
  frame: Frame
  column: Column | null
  revision: number
  onSetType: (type: ColumnType) => void
  onFilterInvalid: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onVerktyg: (namn: Verktygsnamn) => void
  /** Klick på ett av de vanligaste värdena filtrerar fram just det. */
  onFiltreraVarde: (varde: string) => void
}) {
  const { column, frame } = props
  const stat = useMemo(
    () => (column ? berakna(column, frame) : null),
    [column, frame, props.revision],
  )

  if (!column || !stat) {
    return (
      <div class="panel panel--hoger">
        <div class="panel__rubrik">Kolumn</div>
        <div class="panel__innehall">
          <p style={{ color: 'var(--text-svag)', fontSize: 13 }}>
            Klicka på en kolumnrubrik för att se antal, tomma värden och de vanligaste värdena.
          </p>
        </div>
      </div>
    )
  }

  const maxAntal = stat.topp[0]?.antal ?? 1

  return (
    <div class="panel panel--hoger">
      <div class="panel__rubrik">Kolumn</div>
      <div class="panel__innehall" style={{ padding: 0 }}>
        <div class="insp__grupp">
          <h3 class="insp__namn">{column.name}</h3>
          <div class="falt">
            <span class="falt__etikett">Typ</span>
            <select
              value={column.type}
              onChange={(e) =>
                props.onSetType((e.currentTarget as HTMLSelectElement).value as ColumnType)
              }
            >
              {TYPER.map((t) => (
                <option value={t} key={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-svag)' }}>
              Typen styr sortering, filter och vilka verktyg som erbjuds. Den skriver aldrig om
              ett värde.
            </p>
          </div>
        </div>

        <div class="insp__grupp">
          <dl style={{ margin: 0 }}>
            <div class="insp__matt">
              <dt>Rader</dt>
              <dd>{formatCount(stat.totalt)}</dd>
            </div>
            <div class="insp__matt">
              <dt>Ifyllda</dt>
              <dd>{formatCount(stat.ifyllda)}</dd>
            </div>
            <div class="insp__matt">
              <dt>Tomma</dt>
              <dd>{formatCount(stat.tomma)}</dd>
            </div>
            <div class="insp__matt">
              <dt>Unika</dt>
              <dd>{formatCount(stat.unika)}</dd>
            </div>
            {stat.ogiltiga > 0 && (
              <div class="insp__matt insp__matt--varning">
                <dt>Går inte att tolka</dt>
                <dd>{formatCount(stat.ogiltiga)}</dd>
              </div>
            )}
          </dl>
          {stat.ogiltiga > 0 && (
            <button
              class="knapp"
              style={{ width: '100%', marginTop: 8 }}
              onClick={props.onFilterInvalid}
            >
              Visa de {formatCount(stat.ogiltiga)} raderna
            </button>
          )}
        </div>

        {stat.topp.length > 0 && (
          <div class="insp__grupp">
            <span class="falt__etikett">Vanligaste värden</span>
            <div class="insp__topp" style={{ marginTop: 6 }}>
              {stat.topp.map((post) => (
                <button
                  class="insp__toppost"
                  key={post.varde}
                  title={`Filtrera fram ${post.varde}`}
                  onClick={() => props.onFiltreraVarde(post.varde)}
                >
                  <span class="insp__vardetext">{post.varde}</span>
                  <span class="insp__antal">{formatCount(post.antal)}</span>
                  <div
                    class="insp__stapel"
                    style={{ width: `${(post.antal / maxAntal) * 100}%` }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="insp__grupp">
          <span class="falt__etikett">Städa kolumnen</span>
          <div class="insp__knappar" style={{ marginTop: 6 }}>
            {VERKTYG.map((v) => (
              <button
                key={v.namn}
                class={`knapp${v.foreslasFor.includes(column.type) ? ' knapp--primar' : ''}`}
                onClick={() => props.onVerktyg(v.namn)}
              >
                {v.etikett}
              </button>
            ))}
          </div>
        </div>

        <div class="insp__grupp" style={{ borderBottom: 0 }}>
          <span class="falt__etikett">Åtgärder</span>
          <div class="insp__knappar" style={{ marginTop: 6 }}>
            <button class="knapp" onClick={props.onRename}>
              Byt namn…
            </button>
            <button class="knapp" onClick={props.onDuplicate}>
              Duplicera kolumnen
            </button>
            <button class="knapp knapp--fara" onClick={props.onDelete}>
              Ta bort kolumnen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
