import { Modal, Notis } from './parts.js'
import { formatCount } from '../core/locale/sv.js'
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
  onKlistraIn: (utoka: boolean) => void
}) {
  const { plan } = props
  const bredd = Math.max(...plan.rader.map((r) => r.length), 0)

  return (
    <Modal
      titel="Klistra in"
      underrubrik={`${formatCount(plan.rader.length)} rader × ${formatCount(bredd)} kolumner`}
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            Avbryt
          </button>
          <button class="knapp" onClick={() => props.onKlistraIn(false)}>
            Klipp av
          </button>
          <button class="knapp knapp--primar" onClick={() => props.onKlistraIn(true)}>
            Lägg till plats
          </button>
        </>
      }
    >
      <Notis ton="varning">
        Det du klistrar in är{' '}
        <strong>
          {formatCount(plan.rader.length)} rader och {formatCount(bredd)} kolumner
        </strong>
        , men markeringen är {formatCount(props.markeradeRader)} ×{' '}
        {formatCount(props.markeradeKolumner)}.
      </Notis>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Lägg till plats</strong> utökar tabellen med{' '}
        {plan.extraRader > 0 && `${formatCount(plan.extraRader)} rader`}
        {plan.extraRader > 0 && plan.extraKolumner > 0 && ' och '}
        {plan.extraKolumner > 0 && `${formatCount(plan.extraKolumner)} kolumner`} så att allt får
        plats. <strong>Klipp av</strong> skriver bara in det som ryms i tabellen som den ser ut nu
        — resten kastas.
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
