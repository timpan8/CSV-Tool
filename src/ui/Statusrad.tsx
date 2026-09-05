import type { Frame } from '../core/types.js'
import { DELIMITER_NAMES } from '../core/csv/sniff.js'
import { formatCount, formatSum } from '../core/locale/sv.js'
import type { Flikensverkstad } from '../state/matchning.js'
import { beskrivSortering } from '../core/ops/sort.js'
import { aggregera } from '../state/selection.js'
import { selectableColumns } from '../state/edits.js'
import type { Tab } from '../state/store.js'
import { inaktuellaRegler } from '../state/regel.js'
import { rader, t, tf } from './sprak.js'

/**
 * Statusraden.
 *
 * Den svarar på "vad tittar jag på just nu": hur många rader av hur många,
 * hur filen lästes, vad markeringen summerar till — och sedan etapp 4 också
 * vilken ordning raderna ligger i, och om den ordningen fortfarande stämmer.
 */
/*
 * Märket är också vägen till att rensa.
 *
 * Frågan "vad håller verktyget om mig?" och svaret "ta bort alltihop" hör
 * ihop, och märket är redan den plats där den första frågan ställs. Förut
 * hänvisade det till ett kommando man fick leta upp i paletten.
 */
const LOKALTITEL =
  'Verktyget kan inte skicka data någonstans. Filerna sparas i din egen webbläsare så att de finns kvar nästa gång. Klicka för att se vad som ligger där och rensa alltihop.'

export function Statusrad(props: {
  tab: Tab | null
  begransad: boolean
  sorterat: string
  sorteringInaktuell: boolean
  /** Den parkerade sammanslagningen, när fliken hör till den. */
  verkstad: Flikensverkstad | null
  onRensaVy: () => void
  onSorteraOm: () => void
  onRensaSortering: () => void
  onFortsattVerkstad: () => void
  onUppdateraRegler: () => void
  onBorjaOm: () => void
  onRadmeny: (x: number, y: number) => void
}) {
  const tab = props.tab
  if (!tab) {
    return (
      <div class="statusrad">
        <span>{t('Ingen fil öppen')}</span>
        <button class="statusrad__lokal" onClick={props.onBorjaOm} title={LOKALTITEL}>
          {t('● Allt lokalt')}
        </button>
      </div>
    )
  }
  const frame: Frame = tab.frame
  const parse = frame.meta.parse
  const kolumner = selectableColumns(tab)
  const regler = inaktuellaRegler(tab)
  const trasiga = regler.filter((r) => r.saknade.length > 0)
  const agg = tab.markering ? aggregera(frame, kolumner, tab.markering) : null

  return (
    <div class="statusrad">
      <span>
        {props.begransad
          ? tf('{0} av {1} rader', formatCount(frame.view.length), formatCount(frame.rowCount))
          : tf('{0} rader', formatCount(frame.rowCount))}
      </span>
      <span>{tf('{0} kolumner', formatCount(kolumner.length))}</span>
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
              ? t('Ordningen räknades innan de senaste ändringarna. Raderna ligger kvar där de var.')
              : t('Så här är raderna sorterade.')
          }
        >
          <span class="sortchip__text">{tf('Sorterat: {0}', props.sorterat)}</span>
          {props.sorteringInaktuell && (
            <button class="sortchip__knapp" onClick={props.onSorteraOm}>
              {t('Sortera om')}
            </button>
          )}
          <button
            class="sortchip__stang"
            aria-label={t('Ta bort sorteringen')}
            title={t('Ta bort sorteringen')}
            onClick={props.onRensaSortering}
          >
            ✕
          </button>
        </span>
      )}

      {/*
        Mallkolumner som blivit äldre än sina källor.

        Samma spår och samma ton som den inaktuella sorteringen, eftersom det
        är samma sorts besked: det du ser på skärmen räknades före de senaste
        ändringarna, och ingenting har gått sönder. Skillnaden mot ett
        kalkylark är att kolumnen står kvar tills du säger till.
      */}
      {regler.length > 0 && (
        <span
          class="sortchip sortchip--inaktuell"
          title={
            trasiga.length > 0
              ? t('Mallen pekar på en kolumn som inte finns längre. Kolumnen står kvar som den är.')
              : t('Kolumnen byggdes ur en mall, och källorna har ändrats sedan dess.')
          }
        >
          <span class="sortchip__text">
            {regler.length === 1
              ? tf('{0} är inaktuell', regler[0]!.col.name)
              : tf('{0} mallkolumner är inaktuella', formatCount(regler.length))}
          </span>
          {trasiga.length < regler.length && (
            <button class="sortchip__knapp" onClick={props.onUppdateraRegler}>
              {t('Uppdatera')}
            </button>
          )}
        </span>
      )}

      {/*
        Den påbörjade sammanslagningen.

        Vägen tillbaka in i verkstaden låg förut bara under *Flera filer* i
        verktygsraden. Den som inte redan visste att den fanns hittade den
        aldrig, och arbetet låg kvar utan att någon kom och hämtade det.
        Chippet dyker upp i just de filer sammanslagningen gäller — de två
        källorna och resultaten den skapat — och bara när det faktiskt finns
        rader kvar.
      */}
      {props.verkstad && (
        <span
          class="verkstadchip"
          title={tf(
            'Sammanslagningen {0} är påbörjad och har rader kvar att beta av.',
            props.verkstad.namn,
          )}
        >
          <span class="verkstadchip__text">
            {props.verkstad.roll === 'resultat'
              ? tf('{0} kom inte med', rader(props.verkstad.kvar))
              : tf('{0} kvar att beta av', rader(props.verkstad.kvar))}
          </span>
          <button class="verkstadchip__knapp" onClick={props.onFortsattVerkstad}>
            {t('Fortsätt')}
          </button>
        </span>
      )}

      {agg && agg.celler > 1 && (
        <span title={t('Snabbsumma för markeringen')}>
          {tf('{0} markerade', formatCount(agg.celler))}
          {agg.tal > 0 && ` · Σ ${formatSum(agg.summa)}`}
          {agg.tal > 1 && ` · ø ${formatSum(agg.medel)}`}
          {agg.tal === 0 && agg.ifyllda > 0 && ` · ${tf('{0} unika', formatCount(agg.unika))}`}
        </span>
      )}
      {props.begransad && (
        <button class="statusrad__knapp" onClick={props.onRensaVy}>
          {t('Visa alla rader')}
        </button>
      )}
      <button
        class="statusrad__knapp"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          props.onRadmeny(r.left, r.top - 150)
        }}
      >
        {t('Rader ▾')}
      </button>
      <button class="statusrad__lokal" onClick={props.onBorjaOm} title={LOKALTITEL}>
        {t('● Allt lokalt')}
      </button>
    </div>
  )
}

export { beskrivSortering }
