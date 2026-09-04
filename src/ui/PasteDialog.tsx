import { Modal, Notis } from './parts.js'
import { formatCount } from '../core/locale/sv.js'
import { serUtSomRubrikrad } from '../core/csv/parse.js'
import type { PasteRequest } from '../state/edits.js'
import { kolumner as kolumnerText, rader as raderText, t, tf, tj } from './sprak.js'

/**
 * Frågar innan inklistring som inte får plats.
 *
 * Att bara skriva in det som ryms och tyst kasta resten är precis den sortens
 * dataförlust som inte går att upptäcka i efterhand — man ser celler som
 * fylldes, inte de som inte gjorde det. Därför är avklippning ett aktivt val,
 * och utökning är standard.
 */
export function PasteDialog(props: {
  plan: PasteRequest
  markeradeRader: number
  markeradeKolumner: number
  onAvbryt: () => void
  /** Öppnar det inklistrade som en egen flik i stället. */
  onNyFil: () => void
  onKlistraIn: (utoka: boolean) => void
}) {
  const { plan } = props
  const bredd = Math.max(...plan.rader.map((r) => r.length), 0)
  /*
   * Rubrikraden avgör vilken knapp som är förvald.
   *
   * Har det inklistrade kolumnnamn med sig är det nästan alltid ett helt
   * dokument och inte celler ur ett annat — och då är att utöka den öppna
   * tabellen med hundra rader sällan vad någon menade. Båda valen står kvar;
   * det är bara vilket fingret landar på som byts.
   */
  const harRubriker = serUtSomRubrikrad(plan.rader)

  return (
    <Modal
      titel={t('Klistra in')}
      underrubrik={`${raderText(plan.rader.length)} × ${kolumnerText(bredd)}`}
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            {t('Avbryt')}
          </button>
          {/*
            Att det inklistrade inte får plats är det tydligaste tecknet på
            att det kanske aldrig var tänkt för den här tabellen. Då ska
            valet stå här, bredvid de andra, och inte kräva att man avbryter
            och letar reda på en genväg.
          */}
          <button
            class={`knapp${harRubriker ? ' knapp--primar' : ''}`}
            onClick={props.onNyFil}
          >
            {t('Öppna som ny fil')}
          </button>
          <button class="knapp" onClick={() => props.onKlistraIn(false)}>
            {t('Klipp av')}
          </button>
          <button
            class={`knapp${harRubriker ? '' : ' knapp--primar'}`}
            onClick={() => props.onKlistraIn(true)}
          >
            {t('Lägg till plats')}
          </button>
        </>
      }
    >
      <Notis ton={harRubriker ? 'info' : 'varning'}>
        {harRubriker
          ? tj(
              'Det du klistrar in har {0} och ser därför ut som ett eget dokument — {1} och {2}, mot en markering på {3} × {4}.',
              <strong>{t('kolumnnamn på första raden')}</strong>,
              raderText(plan.rader.length),
              kolumnerText(bredd),
              formatCount(props.markeradeRader),
              formatCount(props.markeradeKolumner),
            )
          : tj(
              'Det du klistrar in är {0}, men markeringen är {1} × {2}.',
              <strong>
                {tf('{0} och {1}', raderText(plan.rader.length), kolumnerText(bredd))}
              </strong>,
              formatCount(props.markeradeRader),
              formatCount(props.markeradeKolumner),
            )}
      </Notis>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {tj(
          '{0} lämnar den här tabellen orörd och lägger det inklistrade i en egen flik. {1} utökar tabellen med {2} så att allt får plats. {3} skriver bara in det som ryms i tabellen som den ser ut nu — resten kastas.',
          <strong>{t('Öppna som ny fil')}</strong>,
          <strong>{t('Lägg till plats')}</strong>,
          [
            plan.extraRader > 0 ? raderText(plan.extraRader) : '',
            plan.extraRader > 0 && plan.extraKolumner > 0 ? t('och') : '',
            plan.extraKolumner > 0 ? kolumnerText(plan.extraKolumner) : '',
          ]
            .filter(Boolean)
            .join(' '),
          <strong>{t('Klipp av')}</strong>,
        )}
      </p>

      <div class="falt">
        <span class="falt__etikett">{t('Första raderna av det du klistrar in')}</span>
        <div class="fortab__omslag">
          <table class="fortab">
            <tbody>
              {plan.rader.slice(0, 5).map((rad, i) => (
                <tr key={i}>
                  {rad.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
