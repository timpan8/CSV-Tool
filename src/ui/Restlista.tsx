import type { ColumnId, Frame } from '../core/types.js'
import { cellText } from '../core/ops/match.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'

/**
 * Så många rader ritas ut på en gång.
 *
 * En restlista kan i värsta fall vara hela filen — ett felvalt kolumnpar gör
 * varje rad till en restrad. Att rita hundratusen rader i en panel som ändå
 * ska betas av för hand hjälper ingen, så listan kapas och säger att den gjort
 * det. Det som faktiskt hjälper vid en så lång lista är en ny runda på en
 * annan kolumn, inte mer att skrolla i.
 */
const TAK = 200

/** En av verkstadens två restlistor. */
export function Restlista(props: {
  titel: string
  filnamn: string
  frame: Frame
  rader: number[]
  kolumner: ColumnId[]
  vald: number | null
  avskrivna: number
  onValj: (rad: number | null) => void
  onSkrivAv: (rad: number) => void
}) {
  const visade = props.rader.slice(0, TAK)

  return (
    <div class="panel restlista">
      <div class="panel__rubrik">
        {props.titel}
        <span class="panel__rubrik__antal">{formatCount(props.rader.length)}</span>
      </div>
      <div class="restlista__fil">{props.filnamn}</div>
      <div class="panel__innehall">
        {props.rader.length === 0 && (
          <p class="restlista__tom">
            {props.avskrivna > 0
              ? 'Inget kvar att beta av.'
              : 'Alla rader hittade en partner.'}
          </p>
        )}
        {visade.map((rad) => (
          <div class={`restrad${props.vald === rad ? ' restrad--vald' : ''}`} key={rad}>
            <button
              class="restrad__val"
              aria-pressed={props.vald === rad}
              onClick={() => props.onValj(props.vald === rad ? null : rad)}
            >
              <span class="restrad__nummer">{props.frame.sourceRow[rad] || '+'}</span>
              <span class="restrad__celler">
                {props.kolumner.map((id, i) => {
                  const text = cellText(props.frame, id, rad)
                  return (
                    <span
                      class={`restrad__cell${i === 0 ? ' restrad__cell--forst' : ''}`}
                      key={id}
                    >
                      {text === '' ? <em class="restrad__tomt">tomt</em> : text}
                    </span>
                  )
                })}
              </span>
            </button>
            <button
              class="restrad__skriv"
              title="Skriv av raden — den försvinner ur listan, men resultatet blir detsamma"
              aria-label={`Skriv av rad ${props.frame.sourceRow[rad] || rad + 1}`}
              onClick={() => props.onSkrivAv(rad)}
            >
              ✕
            </button>
          </div>
        ))}
        {props.rader.length > TAK && (
          <p class="restlista__tom">
            Visar {formatCount(TAK)} av {raderText(props.rader.length)}. Kör en ny runda på en
            annan kolumn för att korta listan.
          </p>
        )}
      </div>
      {props.avskrivna > 0 && (
        <div class="restlista__avskrivna">{formatCount(props.avskrivna)} avskrivna</div>
      )}
    </div>
  )
}
