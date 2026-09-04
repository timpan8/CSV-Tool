import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { samladOrdbok } from '../core/frame/column.js'
import {
  TALFORMAT,
  inventeraTal,
  talTransform,
  tolkaTal,
  type Talformat,
} from '../core/ops/numbers.js'
import { beraknaForhandsvisning, sammanfatta, type Forhandsvisning } from '../state/preview.js'
import { formatCount } from '../core/locale/sv.js'
import { kolumnrubrik } from './verktyg.js'
import { celler, sprak, t, tf, tj } from './sprak.js'

type Feltillstand = 'behall' | 'tom' | 'markera'

const FELTILLSTAND: { varde: Feltillstand; etikett: string; titel: string }[] = [
  { varde: 'behall', etikett: 'Låt stå', titel: 'Värdet lämnas som det är.' },
  { varde: 'markera', etikett: 'Skriv OGILTIGT', titel: 'Gör raderna lätta att filtrera fram.' },
  { varde: 'tom', etikett: 'Töm cellen', titel: 'Tar bort värdet helt.' },
]

type Decimalval = 'som-i-filen' | 'oforandrat' | '0' | '1' | '2'

export function NumberTool(props: {
  kolumner: Column[]
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}) {
  const { kolumner } = props
  /*
   * Kolumnlistan är en ny array vid varje omritning, medan kolumnobjekten
   * är desamma. Att beroendeställa på arrayen skulle räkna om
   * förhandsvisningen varje gång, och effekten som skriver den till fliken
   * skulle rita om — en slinga. Nyckeln är identiteterna, inte arrayen.
   */
  const nyckel = kolumner.map((c) => c.id).join(',')
  const [format, setFormat] = useState<Talformat>('komma')
  const [decimalval, setDecimalval] = useState<Decimalval>('som-i-filen')
  const [onError, setOnError] = useState<Feltillstand>('behall')
  const [svar, setSvar] = useState<boolean | null>(null)

  // Inventeringen räknar celler över alla valda kolumner — det är dem
  // Tillämpa kommer att röra.
  const { varden, vikter } = useMemo(
    () => samladOrdbok(kolumner),
    [nyckel, props.dataRevision],
  )
  const grund = useMemo(
    () => inventeraTal(varden, { punktArTusental: false }, vikter),
    [varden, vikter],
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

  const forhLista = useMemo(
    () =>
      kolumner.map((col) =>
        beraknaForhandsvisning(col, {
          etikett: tf('Städade tal i ”{0}”', col.name),
          kind: 'numbers',
          profil: { typ: 'tal', kolumn: col.name, inst },
          fn: talTransform(inst),
          arProblem: (v) => tolkaTal(v, inst).tal === null,
          nyTyp: 'number',
        }),
      ),
    [nyckel, props.dataRevision, punktArTusental, format, decimaler, onError, sprak.value],
  )
  const forh = sammanfatta(forhLista)

  useEffect(() => {
    props.onForhandsvisning(forhLista)
  }, [forhLista])
  useEffect(() => () => props.onForhandsvisning(null), [])

  return (
    <Verktygspanel
      titel={t('Tal')}
      underrubrik={kolumnrubrik(kolumner)}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            {t('Avbryt')}
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0 || maasteSvara}
            title={
              maasteSvara
                ? t('Svara först på vad punkten betyder.')
                : forh.andrade === 0
                  ? t('Ingenting skulle ändras.')
                  : undefined
            }
            onClick={() => props.onTillampa(forhLista)}
          >
            {kolumner.length > 1 ? tf('Tillämpa på {0} kolumner', kolumner.length) : t('Tillämpa')}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">{t('Det här finns i kolumnen')}</span>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(grund.tal)}</td>
              <td>{t('går att läsa som tal')}</td>
              <td class="inventering__exempel" />
            </tr>
            {grund.ejTal > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(grund.ejTal)}</td>
                <td>{t('gör det inte')}</td>
                <td class="inventering__exempel" />
              </tr>
            )}
            {grund.enheter.map((e) => (
              <tr key={e.enhet}>
                <td class="inventering__antal">{formatCount(e.antal)}</td>
                <td>{t('skalas av')}</td>
                <td class="inventering__exempel">{e.enhet}</td>
              </tr>
            ))}
            {grund.negativaFormat > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(grund.negativaFormat)}</td>
                <td>{t('negativa som (1 240) eller 1240–')}</td>
                <td class="inventering__exempel" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grund.bevis !== null && (
        <Notis ton="lyckat">
          {tj(
            'Kolumnen svarar själv: {0} visar att punkten är {1}.',
            <code>{grund.bevis}</code>,
            t(grund.bevisSagerTusental ? 'tusentalsavgränsare' : 'decimaltecken'),
          )}
        </Notis>
      )}

      {grund.tvetydig && (
        <div class="falt">
          <span class="falt__etikett">
            {tj('Vad betyder punkten i {0}?', <code>1.234</code>)}
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
              {t(
                'Inget värde i kolumnen avgör saken. Skillnaden är tusen gånger, så frågan måste besvaras.',
              )}
            </Notis>
          )}
        </div>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Decimaltecken')}</span>
        <Val
          varden={TALFORMAT.map((f) => ({ varde: f.varde, etikett: f.etikett, titel: f.exempel }))}
          valt={format}
          onValj={setFormat}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">{t('Antal decimaler')}</span>
        <Val
          varden={[
            {
              varde: 'som-i-filen' as const,
              etikett: tf('Som i filen ({0})', formatCount(grund.storstaAntalDecimaler)),
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
        <span class="falt__etikett">{t('Värden som inte går att läsa som tal')}</span>
        <Val varden={FELTILLSTAND} valt={onError} onValj={setOnError} />
      </div>

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={forh.problem}
        etikettProblem="Bara problem"
      >
        {tj(
          '{0} av {1} skrivs om',
          <strong>{formatCount(forh.andrade)}</strong>,
          celler(forh.ifyllda),
        )}
        {forh.problem > 0 &&
          tj(
            ' · {0} är inte tal',
            <strong class="verktyg__problem">{formatCount(forh.problem)}</strong>,
          )}
        .
      </Resultat>

      <Notis ton="info">
        {tj(
          'Tusentalsavgränsare skrivs aldrig ut. De är till för att läsas av människor; ett tal i en fil ska kunna läsas av nästa program. Kolumnen typas som tal, vilket gör att {0} fungerar direkt i en Excel-export.',
          <strong>{t('SUMMA')}</strong>,
        )}
      </Notis>
    </Verktygspanel>
  )
}
