import { useEffect, useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column, Frame } from '../core/types.js'
import { delaTillRader, inventeraRadelning, type Radelning } from '../core/ops/rader.js'
import { formatCount } from '../core/locale/sv.js'
import { t, tf, tj } from './sprak.js'

const AVGRANSARE = [
  { varde: ';', etikett: 'Semikolon' },
  { varde: ',', etikett: 'Komma' },
  { varde: '\n', etikett: 'Radbrytning' },
  { varde: ' ', etikett: 'Mellanslag' },
  { varde: 'eget', etikett: 'Eget…' },
] as const

/**
 * Delar en kolumn på höjden: en rad per del.
 *
 * Panelen förhandsvisar i sig själv i stället för i rutnätet. Ett ändrat
 * radantal går inte att rita som spökkolumner — det finns ingen utrad som
 * hör till en given inrad — så svaret på *vad kommer det här att göra med min
 * fil?* står som siffror och som `före → efter` ur den egna filen. Det är
 * samma löfte som de andra panelerna ger, sagt med de medel som finns kvar.
 */
export function RadTool(props: {
  col: Column
  frame: Frame
  dataRevision: number
  onForhandsvisning: (forh: null) => void
  onNyFlik: (frame: Frame, text: string) => void
  onStang: () => void
}) {
  const { col, frame } = props
  const [avgransarval, setAvgransarval] = useState<(typeof AVGRANSARE)[number]['varde']>(';')
  const [egen, setEgen] = useState('|')
  const [trimma, setTrimma] = useState(true)
  const [hoppaTomma, setHoppaTomma] = useState(true)
  const [namn, setNamn] = useState(`${frame.name} delad`)

  const avgransare = avgransarval === 'eget' ? egen : avgransarval
  const inst: Radelning = { colId: col.id, avgransare, trimma, hoppaTomma, namn }

  const inv = useMemo(
    () => inventeraRadelning(frame, inst),
    [frame, props.dataRevision, col.id, avgransare, trimma, hoppaTomma],
  )

  // Panelen ritar ingenting i rutnätet, och en kvarliggande spökkolumn från
  // ett tidigare verktyg vore ett löfte den här panelen inte håller.
  useEffect(() => {
    props.onForhandsvisning(null)
  }, [])

  const begransad = frame.view.length < frame.rowCount

  return (
    <Verktygspanel
      titel={t('Dela till rader')}
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            {t('Avbryt')}
          </button>
          <button
            class="knapp knapp--primar"
            disabled={inv.resultat === 0 || avgransare === ''}
            title={avgransare === '' ? t('Välj vad det ska delas vid.') : undefined}
            onClick={() => {
              const { frame: resultat, resultat: rader } = delaTillRader(frame, inst)
              props.onNyFlik(resultat, tf('Delade till {0} rader i en ny flik.', formatCount(rader)))
            }}
          >
            {tf('Skapa ny flik med {0} rader', formatCount(inv.resultat))}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">{t('Vid vilket tecken')}</span>
        <Val varden={AVGRANSARE} valt={avgransarval} onValj={setAvgransarval} />
        {avgransarval === 'eget' && (
          <input
            aria-label={t('Eget tecken')}
            value={egen}
            onInput={(e) => setEgen((e.currentTarget as HTMLInputElement).value)}
          />
        )}
      </div>

      <label class="kryss">
        <input
          type="checkbox"
          checked={trimma}
          onChange={(e) => setTrimma((e.currentTarget as HTMLInputElement).checked)}
        />
        {t('Trimma blanksteg runt varje del')}
      </label>

      <label class="kryss">
        <input
          type="checkbox"
          checked={hoppaTomma}
          onChange={(e) => setHoppaTomma((e.currentTarget as HTMLInputElement).checked)}
        />
        {t('Hoppa över tomma delar')}
      </label>

      <div class="falt">
        <span class="falt__etikett">{t('Namn på den nya fliken')}</span>
        <input
          value={namn}
          onInput={(e) => setNamn((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">{t('Vad som händer')}</span>
        <p class="verktyg__sammanfattning">
          {tj(
            '{0} blir {1}.',
            <strong>{tf('{0} rader', formatCount(inv.kalla))}</strong>,
            <strong>{tf('{0} rader', formatCount(inv.resultat))}</strong>,
          )}
          {inv.odelade > 0 &&
            tj(
              ' {0} saknar avgränsare och följer med som de är.',
              <strong>{formatCount(inv.odelade)}</strong>,
            )}
        </p>
        {inv.exempel.length > 0 && (
          <table class="inventering">
            <tbody>
              {inv.exempel.map((e, i) => (
                <tr key={i}>
                  <td class="inventering__exempel">{e.fore}</td>
                  <td>
                    {e.efter.map((d, j) => (
                      <span key={j}>
                        {j > 0 && <br />}
                        <strong>{d === '' ? t('(tomt)') : d}</strong>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {begransad && (
        <Notis ton="varning">
          {tf(
            'Delningen går på det du ser: {0} av filens {1} rader kommer med. Rensa filtret om du vill ha allihop.',
            formatCount(frame.view.length),
            formatCount(frame.rowCount),
          )}
        </Notis>
      )}

      <Notis ton="info">
        {t(
          'Resultatet blir en ny flik. Den här filen rörs inte — övriga kolumners värden följer med ner på de nya raderna.',
        )}
      </Notis>
    </Verktygspanel>
  )
}
