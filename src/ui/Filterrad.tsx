import type { Frame } from '../core/types.js'
import { findColumn } from '../core/frame/frame.js'
import { beskrivRegelDelar, type Filter } from '../core/ops/filter.js'
import { formatCount } from '../core/locale/sv.js'
import { t, tf } from './sprak.js'

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
        {t(
          props.filter.inverterat === true
            ? 'Dolda:'
            : props.filter.koppling === 'alla'
              ? 'Alla:'
              : 'Någon:',
        )}
      </span>
      {props.filter.inverterat === true && (
        <span
          class="chip chip--vand"
          title={t('Filtret är vänt: du ser raderna det annars döljer.')}
        >
          {t('vänt')}
        </span>
      )}
      {props.filter.regler.map((regel) => {
        const finns = findColumn(props.frame, regel.colId) !== undefined
        const { mall, delar, etiketter } = beskrivRegelDelar(props.frame, regel)
        const beskrivning = tf(mall, ...delar.map((d, i) => (etiketter.includes(i) ? t(d) : d)))
        return (
          <span
            class={`chip${regel.av ? ' chip--av' : ''}${finns ? '' : ' chip--trasig'}`}
            key={regel.id}
          >
            <button
              class="chip__text"
              title={t(
                finns
                  ? regel.av
                    ? 'Avslagen. Klicka för att slå på.'
                    : 'Klicka för att slå av regeln.'
                  : 'Kolumnen finns inte längre.',
              )}
              onClick={() => props.onVaxla(regel.id)}
            >
              {beskrivning}
            </button>
            <button
              class="chip__stang"
              aria-label={tf('Ta bort regeln {0}', beskrivning)}
              onClick={() => props.onTaBort(regel.id)}
            >
              ✕
            </button>
          </span>
        )
      })}
      <button class="knapp knapp--tyst" onClick={props.onOppna}>
        {t('Ändra…')}
      </button>
      <span class="filterrad__antal">
        {tf('{0} av {1} rader', formatCount(props.traffar), formatCount(props.totalt))}
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <button class="knapp knapp--tyst" onClick={props.onRensa}>
          {t('Rensa filtret')}
        </button>
      </span>
    </div>
  )
}
