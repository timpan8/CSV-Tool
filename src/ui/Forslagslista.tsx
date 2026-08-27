import type { ColumnId, Frame } from '../core/types.js'
import { cellText } from '../core/ops/match.js'
import type { Forslag, Hinder } from '../core/ops/likhet.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'
import { Notis } from './parts.js'

/**
 * Luddiga förslag att godkänna ett i taget.
 *
 * Poängen visas som två tal och inte ett, eftersom det ena förklarar det
 * andra: `Ängström Ida` mot `Ida Ängström` får sitt höga tal av ordmängden och
 * inte av teckenlikheten, och det är precis vad man vill se innan man
 * godkänner. Ett ensamt tal hade sett ut som en dom.
 *
 * Att avvisa ett förslag tar inte bort raden ur restlistan — den ligger kvar
 * och visar sin tvåa.
 */
export function Forslagslista(props: {
  forslag: readonly Forslag[]
  hinder: Hinder
  avkortat: boolean
  vanster: Frame
  hoger: Frame
  vansterKolumner: readonly ColumnId[]
  hogerKolumner: readonly ColumnId[]
  restVanster: number
  restHoger: number
  onGodkann: (f: Forslag) => void
  onAvvisa: (f: Forslag) => void
}) {
  if (props.hinder === 'talkolumn') {
    return (
      <Notis ton="varning">
        Luddig likhet är avstängd för talkolumner. 10021 och 10024 liknar varandra som text, men
        är olika kunder — och ett förslag som ser rimligt ut är farligare än inget förslag.
      </Notis>
    )
  }
  if (props.hinder === 'forStoraRestlistor') {
    return (
      <Notis ton="varning">
        Restlistorna har {formatCount(props.restVanster)} och {formatCount(props.restHoger)}{' '}
        rader. Verkstaden är gjord för tiotal eller hundratal — så många rader betyder nästan
        alltid att grundmatchningen behöver ett annat kolumnpar först.
      </Notis>
    )
  }
  if (props.hinder === 'ingaVarden') {
    return (
      <Notis ton="info">
        Värdena i de här kolumnerna är för korta för att jämföras luddigt. Tre tecken som liknar
        varandra är brus.
      </Notis>
    )
  }
  if (props.forslag.length === 0) {
    return (
      <p class="restlista__tom">
        Inga rader liknar varandra tillräckligt. Prova en annan kolumn.
      </p>
    )
  }

  return (
    <div class="falt">
      <span class="falt__etikett">
        Liknande rader ({raderText(props.forslag.length)})
      </span>
      {props.forslag.map((f) => (
        <div class="forslag" key={`${f.v}:${f.h}`}>
          <div class="forslag__rader">
            <span class="forslag__rad">
              {text(props.vanster, props.vansterKolumner, f.v)}
            </span>
            <span class="forslag__rad">{text(props.hoger, props.hogerKolumner, f.h)}</span>
          </div>
          <div class="forslag__poang">
            {f.omsesidigt && (
              <span class="forslag__omsesidigt" title="Raderna är varandras bästa träff">
                bästa åt båda håll
              </span>
            )}
            <span title="Dice över teckentrigram">
              stavning {f.poang.stavning.toFixed(2)}
            </span>
            <span title="Dice över ordmängderna — fångar omkastad ordföljd">
              orden {f.poang.orden.toFixed(2)}
            </span>
          </div>
          <div class="forslag__knappar">
            <button class="knapp knapp--primar" onClick={() => props.onGodkann(f)}>
              Godkänn
            </button>
            <button class="knapp knapp--tyst" onClick={() => props.onAvvisa(f)}>
              Nej
            </button>
          </div>
        </div>
      ))}
      {props.avkortat && (
        <p class="restlista__tom">
          Listan kortades av vid taket. Kör en runda på en annan kolumn för att korta ner den
          först.
        </p>
      )}
    </div>
  )
}

function text(frame: Frame, kolumner: readonly ColumnId[], rad: number): string {
  const delar = kolumner.map((id) => cellText(frame, id, rad)).filter((t) => t !== '')
  return delar.length > 0 ? delar.join(' · ') : `rad ${frame.sourceRow[rad] || rad + 1}`
}
