import type { Frame } from '../core/types.js'
import { DELIMITER_NAMES } from '../core/csv/sniff.js'
import { formatCount, formatSum } from '../core/locale/sv.js'
import { beskrivSortering } from '../core/ops/sort.js'
import { aggregera } from '../state/selection.js'
import { selectableColumns } from '../state/edits.js'
import type { Tab } from '../state/store.js'

/**
 * Statusraden.
 *
 * Den svarar på "vad tittar jag på just nu": hur många rader av hur många,
 * hur filen lästes, vad markeringen summerar till — och sedan etapp 4 också
 * vilken ordning raderna ligger i, och om den ordningen fortfarande stämmer.
 */
export function Statusrad(props: {
  tab: Tab | null
  begransad: boolean
  sorterat: string
  sorteringInaktuell: boolean
  onRensaVy: () => void
  onSorteraOm: () => void
  onRensaSortering: () => void
  onRadmeny: (x: number, y: number) => void
}) {
  const tab = props.tab
  if (!tab) {
    return (
      <div class="statusrad">
        <span>Ingen fil öppen</span>
        <span class="statusrad__lokal">● Allt lokalt</span>
      </div>
    )
  }
  const frame: Frame = tab.frame
  const parse = frame.meta.parse
  const kolumner = selectableColumns(tab)
  const agg = tab.markering ? aggregera(frame, kolumner, tab.markering) : null

  return (
    <div class="statusrad">
      <span>
        {props.begransad
          ? `${formatCount(frame.view.length)} av ${formatCount(frame.rowCount)} rader`
          : `${formatCount(frame.rowCount)} rader`}
      </span>
      <span>{formatCount(kolumner.length)} kolumner</span>
      {parse && (
        <span>
          {parse.encoding.toUpperCase()}
          {parse.hadBom && ' med BOM'} · {DELIMITER_NAMES[parse.delimiter].toLowerCase()}
        </span>
      )}

      {props.sorterat !== '' && (
        <span
          class={`sortchip${props.sorteringInaktuell ? ' sortchip--inaktuell' : ''}`}
          title={
            props.sorteringInaktuell
              ? 'Ordningen räknades innan de senaste ändringarna. Raderna ligger kvar där de var.'
              : 'Så här är raderna sorterade.'
          }
        >
          <span class="sortchip__text">Sorterat: {props.sorterat}</span>
          {props.sorteringInaktuell && (
            <button class="sortchip__knapp" onClick={props.onSorteraOm}>
              Sortera om
            </button>
          )}
          <button
            class="sortchip__stang"
            aria-label="Ta bort sorteringen"
            title="Ta bort sorteringen"
            onClick={props.onRensaSortering}
          >
            ✕
          </button>
        </span>
      )}

      {agg && agg.celler > 1 && (
        <span title="Snabbsumma för markeringen">
          {formatCount(agg.celler)} markerade
          {agg.tal > 0 && ` · Σ ${formatSum(agg.summa)}`}
          {agg.tal > 1 && ` · ø ${formatSum(agg.medel)}`}
          {agg.tal === 0 && agg.ifyllda > 0 && ` · ${formatCount(agg.unika)} unika`}
        </span>
      )}
      {props.begransad && (
        <button class="statusrad__knapp" onClick={props.onRensaVy}>
          Visa alla rader
        </button>
      )}
      <button
        class="statusrad__knapp"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          props.onRadmeny(r.left, r.top - 150)
        }}
      >
        Rader ▾
      </button>
      <span
        class="statusrad__lokal"
        title="Verktyget kan inte skicka data någonstans. Filerna sparas i din egen webbläsare så att de finns kvar nästa gång — sök upp ”Glöm sparade filer” i paletten för att tömma det."
      >
        ● Allt lokalt
      </span>
    </div>
  )
}

export { beskrivSortering }
