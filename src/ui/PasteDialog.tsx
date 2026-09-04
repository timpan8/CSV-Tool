import { Modal, Notis } from './parts.js'
import { formatCount, kolumner as kolumnerText, rader as raderText } from '../core/locale/sv.js'
import { serUtSomRubrikrad } from '../core/csv/parse.js'
import type { PasteRequest } from '../state/edits.js'

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
      titel="Klistra in"
      underrubrik={`${raderText(plan.rader.length)} × ${kolumnerText(bredd)}`}
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            Avbryt
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
            Öppna som ny fil
          </button>
          <button class="knapp" onClick={() => props.onKlistraIn(false)}>
            Klipp av
          </button>
          <button
            class={`knapp${harRubriker ? '' : ' knapp--primar'}`}
            onClick={() => props.onKlistraIn(true)}
          >
            Lägg till plats
          </button>
        </>
      }
    >
      <Notis ton={harRubriker ? 'info' : 'varning'}>
        {harRubriker ? (
          <>
            Det du klistrar in har <strong>kolumnnamn på första raden</strong> och ser därför ut
            som ett eget dokument — {raderText(plan.rader.length)} och{' '}
            {kolumnerText(bredd)}, mot en markering på {formatCount(props.markeradeRader)} ×{' '}
            {formatCount(props.markeradeKolumner)}.
          </>
        ) : (
          <>
            Det du klistrar in är{' '}
            <strong>
              {raderText(plan.rader.length)} och {kolumnerText(bredd)}
            </strong>
            , men markeringen är {formatCount(props.markeradeRader)} ×{' '}
            {formatCount(props.markeradeKolumner)}.
          </>
        )}
      </Notis>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Öppna som ny fil</strong> lämnar den här tabellen orörd och lägger det
        inklistrade i en egen flik.{' '}
        <strong>Lägg till plats</strong> utökar tabellen med{' '}
        {plan.extraRader > 0 && raderText(plan.extraRader)}
        {plan.extraRader > 0 && plan.extraKolumner > 0 && ' och '}
        {plan.extraKolumner > 0 && kolumnerText(plan.extraKolumner)} så att allt får plats.{' '}
        <strong>Klipp av</strong> skriver bara in det som ryms i tabellen som den ser ut nu —
        resten kastas.
      </p>

      <div class="falt">
        <span class="falt__etikett">Första raderna av det du klistrar in</span>
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
