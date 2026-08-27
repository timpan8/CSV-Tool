import type { Frame } from '../core/types.js'
import { findColumn } from '../core/frame/frame.js'
import { beskrivRegel, type Filter } from '../core/ops/filter.js'
import { formatCount } from '../core/locale/sv.js'

/**
 * Filterbanderollen.
 *
 * Reglerna står ovanför tabellen och inte gömda i en panel, av samma skäl som
 * sökraden ligger där: ett filter man glömt bort är ett filter som får en att
 * dra fel slutsats om sitt data. Ett klick på ett chip öppnar panelen, ett
 * klick på krysset tar bort regeln.
 */
export function Filterrad(props: {
  frame: Frame
  filter: Filter
  traffar: number
  totalt: number
  onOppna: () => void
  onVaxla: (id: string) => void
  onTaBort: (id: string) => void
  onRensa: () => void
}) {
  if (props.filter.regler.length === 0) return null

  return (
    <div class="filterrad">
      <span class="filterrad__etikett">
        {props.filter.koppling === 'alla' ? 'Alla:' : 'Någon:'}
      </span>
      {props.filter.regler.map((regel) => {
        const finns = findColumn(props.frame, regel.colId) !== undefined
        return (
          <span
            class={`chip${regel.av ? ' chip--av' : ''}${finns ? '' : ' chip--trasig'}`}
            key={regel.id}
          >
            <button
              class="chip__text"
              title={
                finns
                  ? regel.av
                    ? 'Avslagen. Klicka för att slå på.'
                    : 'Klicka för att slå av regeln.'
                  : 'Kolumnen finns inte längre.'
              }
              onClick={() => props.onVaxla(regel.id)}
            >
              {beskrivRegel(props.frame, regel)}
            </button>
            <button
              class="chip__stang"
              aria-label={`Ta bort regeln ${beskrivRegel(props.frame, regel)}`}
              onClick={() => props.onTaBort(regel.id)}
            >
              ✕
            </button>
          </span>
        )
      })}
      <button class="knapp knapp--tyst" onClick={props.onOppna}>
        Ändra…
      </button>
      <span class="filterrad__antal">
        {formatCount(props.traffar)} av {formatCount(props.totalt)} rader
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <button class="knapp knapp--tyst" onClick={props.onRensa}>
          Rensa filtret
        </button>
      </span>
    </div>
  )
}
