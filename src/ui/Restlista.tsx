import { Flag, type ColumnId, type Frame } from '../core/types.js'
import { hasFlag } from '../core/frame/column.js'
import { cellText } from '../core/ops/match.js'
import { formatCount } from '../core/locale/sv.js'
import { rader as raderText, t, tf } from './sprak.js'

/**
 * Varför raden ligger här.
 *
 * Tre olika problem som fram till nu såg likadana ut. `utan` saknar partner.
 * `tom` har en nyckel som är tom och kan därför aldrig matcha någon — ingen ny
 * runda i världen hjälper. `flera` har tvärtom för många partners och behöver
 * ett val, inte en sökning.
 */
export type Restsort = 'utan' | 'tom' | 'flera'

const SORTTEXT: Record<Restsort, string> = {
  utan: '',
  tom: 'tom nyckel',
  flera: 'flera träffar',
}

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
  /** Varför varje rad ligger här. Utelämnad betyder `utan`. */
  sort?: (rad: number) => Restsort
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
      {/*
        * Ordningsnoten hör hemma här, vid listan den beskriver. Den som
        * sorterat sin flik och sedan ser restlistan i en annan ordning ställer
        * sig frågan varje gång, och svaret ska stå där frågan uppstår.
        */}
      <div class="restlista__fil">
        {props.filnamn}
        <span class="restlista__ordning">{t('filens ordning')}</span>
      </div>
      <div class="panel__innehall">
        {props.rader.length === 0 && (
          <p class="restlista__tom">
            {t(props.avskrivna > 0 ? 'Inget kvar att beta av.' : 'Alla rader hittade en partner.')}
          </p>
        )}
        {visade.map((rad) => {
          const sort = props.sort ? props.sort(rad) : 'utan'
          return (
          <div
            class={`restrad restrad--${sort}${props.vald === rad ? ' restrad--vald' : ''}`}
            key={rad}
            data-sort={sort}
          >
            <button
              class="restrad__val"
              aria-pressed={props.vald === rad}
              onClick={() => props.onValj(props.vald === rad ? null : rad)}
            >
              <span class="restrad__nummer">{props.frame.sourceRow[rad] || '+'}</span>
              <span class="restrad__celler">
                {props.kolumner.map((id, i) => {
                  const text = cellText(props.frame, id, rad)
                  const col = props.frame.columns.find((c) => c.id === id)
                  // En cell som saknades i filen är inte en tom cell. Samma
                  // skillnad som Flag.Padded bär genom hela verktyget.
                  const saknat = col !== undefined && hasFlag(col, rad, Flag.Padded)
                  return (
                    <span
                      class={`restrad__cell${i === 0 ? ' restrad__cell--forst' : ''}`}
                      key={id}
                    >
                      {text === '' ? (
                        <em class="restrad__tomt">{t(saknat ? 'saknades' : 'tomt')}</em>
                      ) : (
                        text
                      )}
                    </span>
                  )
                })}
                {SORTTEXT[sort] !== '' && (
                  <span class="restrad__sort">{t(SORTTEXT[sort])}</span>
                )}
              </span>
            </button>
            <button
              class="restrad__skriv"
              title={t('Skriv av raden — den försvinner ur listan, men resultatet blir detsamma')}
              aria-label={tf('Skriv av rad {0}', props.frame.sourceRow[rad] || rad + 1)}
              onClick={() => props.onSkrivAv(rad)}
            >
              ✕
            </button>
          </div>
          )
        })}
        {props.rader.length > TAK && (
          <p class="restlista__tom">
            {tf(
              'Visar {0} av {1}. Kör en ny runda på en annan kolumn för att korta listan.',
              formatCount(TAK),
              raderText(props.rader.length),
            )}
          </p>
        )}
      </div>
      {props.avskrivna > 0 && (
        <div class="restlista__avskrivna">{tf('{0} avskrivna', formatCount(props.avskrivna))}</div>
      )}
    </div>
  )
}
