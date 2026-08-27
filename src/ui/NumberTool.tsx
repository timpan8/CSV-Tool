import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { codeCounts } from '../core/frame/column.js'
import {
  TALFORMAT,
  inventeraTal,
  talTransform,
  tolkaTal,
  type Talformat,
} from '../core/ops/numbers.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

type Feltillstand = 'behall' | 'tom' | 'markera'

const FELTILLSTAND: { varde: Feltillstand; etikett: string; titel: string }[] = [
  { varde: 'behall', etikett: 'Låt stå', titel: 'Värdet lämnas som det är.' },
  { varde: 'markera', etikett: 'Skriv OGILTIGT', titel: 'Gör raderna lätta att filtrera fram.' },
  { varde: 'tom', etikett: 'Töm cellen', titel: 'Tar bort värdet helt.' },
]

type Decimalval = 'som-i-filen' | 'oforandrat' | '0' | '1' | '2'

export function NumberTool(props: {
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}) {
  const { col } = props
  const [format, setFormat] = useState<Talformat>('komma')
  const [decimalval, setDecimalval] = useState<Decimalval>('som-i-filen')
  const [onError, setOnError] = useState<Feltillstand>('behall')
  const [svar, setSvar] = useState<boolean | null>(null)

  const antal = useMemo(() => codeCounts(col), [col, props.dataRevision])
  const grund = useMemo(
    () => inventeraTal(col.dict, { punktArTusental: false }, Array.from(antal)),
    [col, props.dataRevision, antal],
  )

  const bevisSvar = grund.bevis !== null ? grund.bevisSagerTusental : null
  const punktArTusental = svar ?? bevisSvar ?? false
  const maasteSvara = grund.tvetydig && svar === null
  /**
   * Antal decimaler att skriva ut.
   *
   * Standardvalet är så många som kolumnen mest har, inte så många talet
   * råkar behöva. `1 240,50` är 1240,5 som tal, men filen visade två
   * decimaler och en beloppskolumn som plötsligt skriver `980` där det stod
   * `980,00` ser trasig ut även om siffran är densamma.
   */
  const decimaler =
    decimalval === 'oforandrat'
      ? null
      : decimalval === 'som-i-filen'
        ? grund.storstaAntalDecimaler
        : Number(decimalval)

  const inst = { punktArTusental, format, decimaler, onError }

  const forh = useMemo(
    () =>
      beraknaForhandsvisning(col, {
        etikett: `Städade tal i ”${col.name}”`,
        kind: 'numbers',
        profil: { typ: 'tal', kolumn: col.name, inst },
        fn: talTransform(inst),
        arProblem: (v) => tolkaTal(v, inst).tal === null,
        nyTyp: 'number',
      }),
    [col, props.dataRevision, punktArTusental, format, decimaler, onError],
  )

  useEffect(() => {
    props.onForhandsvisning(forh)
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  return (
    <Verktygspanel
      titel="Tal"
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0 || maasteSvara}
            title={
              maasteSvara
                ? 'Svara först på vad punkten betyder.'
                : forh.andrade === 0
                  ? 'Ingenting skulle ändras.'
                  : undefined
            }
            onClick={() => props.onTillampa(forh)}
          >
            Tillämpa
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Det här finns i kolumnen</span>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(grund.tal)}</td>
              <td>går att läsa som tal</td>
              <td class="inventering__exempel" />
            </tr>
            {grund.ejTal > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(grund.ejTal)}</td>
                <td>gör det inte</td>
                <td class="inventering__exempel" />
              </tr>
            )}
            {grund.enheter.map((e) => (
              <tr key={e.enhet}>
                <td class="inventering__antal">{formatCount(e.antal)}</td>
                <td>skalas av</td>
                <td class="inventering__exempel">{e.enhet}</td>
              </tr>
            ))}
            {grund.negativaFormat > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(grund.negativaFormat)}</td>
                <td>negativa som (1 240) eller 1240–</td>
                <td class="inventering__exempel" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grund.bevis !== null && (
        <Notis ton="lyckat">
          Kolumnen svarar själv: <code>{grund.bevis}</code> visar att punkten är{' '}
          {grund.bevisSagerTusental ? 'tusentalsavgränsare' : 'decimaltecken'}.
        </Notis>
      )}

      {grund.tvetydig && (
        <div class="falt">
          <span class="falt__etikett">
            Vad betyder punkten i <code>1.234</code>?
          </span>
          <Val
            varden={[
              { varde: 'decimal' as const, etikett: 'Decimaltecken', titel: 'Talet 1,234.' },
              { varde: 'tusental' as const, etikett: 'Tusental', titel: 'Talet 1234.' },
            ]}
            valt={svar === null ? null : svar ? 'tusental' : 'decimal'}
            onValj={(v) => setSvar(v === 'tusental')}
          />
          {maasteSvara && (
            <Notis ton="varning">
              Inget värde i kolumnen avgör saken. Skillnaden är tusen gånger, så frågan måste
              besvaras.
            </Notis>
          )}
        </div>
      )}

      <div class="falt">
        <span class="falt__etikett">Decimaltecken</span>
        <Val
          varden={TALFORMAT.map((f) => ({ varde: f.varde, etikett: f.etikett, titel: f.exempel }))}
          valt={format}
          onValj={setFormat}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Antal decimaler</span>
        <Val
          varden={[
            {
              varde: 'som-i-filen' as const,
              etikett: `Som i filen (${formatCount(grund.storstaAntalDecimaler)})`,
              titel: 'Så många decimaler som kolumnen mest innehåller.',
            },
            {
              varde: 'oforandrat' as const,
              etikett: 'Oförändrat',
              titel: 'Så många decimaler talet behöver. 980,00 blir 980.',
            },
            { varde: '0' as const, etikett: '0' },
            { varde: '1' as const, etikett: '1' },
            { varde: '2' as const, etikett: '2' },
          ]}
          valt={decimalval}
          onValj={setDecimalval}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Värden som inte går att läsa som tal</span>
        <Val varden={FELTILLSTAND} valt={onError} onValj={setOnError} />
      </div>

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={forh.problem}
        etikettProblem="Bara problem"
      >
        <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} skrivs om
        {forh.problem > 0 && (
          <>
            {' · '}
            <strong class="verktyg__problem">{formatCount(forh.problem)}</strong> är inte tal
          </>
        )}
        .
      </Resultat>

      <Notis ton="info">
        Tusentalsavgränsare skrivs aldrig ut. De är till för att läsas av människor; ett tal i en
        fil ska kunna läsas av nästa program. Kolumnen typas som tal, vilket gör att{' '}
        <strong>SUMMA</strong> fungerar direkt i en Excel-export.
      </Notis>
    </Verktygspanel>
  )
}
