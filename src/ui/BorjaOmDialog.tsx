import { useEffect, useState } from 'preact/hooks'
import { Modal, Notis } from './parts.js'
import { formatByte } from '../core/locale/sv.js'
import { omstartslage, type Omstartslage } from '../state/store.js'
import { sessionslage, type Sessionslage } from '../state/matchning.js'
import { filer as filerText, rader as raderText, t, tf, tj } from './sprak.js'

/**
 * Frågar innan allt rensas.
 *
 * Att stänga varje flik för hand och sedan leta upp *Glöm sparade filer* i
 * paletten är tre olika handgrepp för en enda tanke: *jag är klar, ta bort
 * alltihop.* Den här rutan gör det till ett, och räknar upp vad som försvinner
 * innan den gör det — det är en av få åtgärder i verktyget som inte går att
 * ångra, och då ska den vara den enda i sitt slag som säger det rakt ut.
 *
 * Siffrorna mäts när rutan öppnas och inte medan man tittar: de ska svara på
 * "vad har jag här", inte fladdra.
 */
export function BorjaOmDialog(props: { onAvbryt: () => void; onBorjaOm: () => void }) {
  const [lage, setLage] = useState<Omstartslage | null>(null)
  const [session] = useState<Sessionslage>(() => sessionslage())

  useEffect(() => {
    let avbruten = false
    void omstartslage().then((l) => {
      if (!avbruten) setLage(l)
    })
    return () => {
      avbruten = true
    }
  }, [])

  const harNagot =
    lage !== null && (lage.filer > 0 || session.lage !== 'ingen' || (lage.lagrat ?? 0) > 0)

  return (
    <Modal
      titel={t('Börja om')}
      underrubrik={t('Stänger allt och tömmer webbläsarens lagring')}
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            {t('Avbryt')}
          </button>
          <button class="knapp knapp--fara" onClick={props.onBorjaOm} disabled={lage === null}>
            {t('Rensa allt')}
          </button>
        </>
      }
    >
      {lage !== null && lage.osparade > 0 && (
        <Notis ton="varning">
          {tj(
            '{0} har ändringar som inte exporterats. De går inte att få tillbaka efteråt — exportera först om du vill behålla dem.',
            <strong>{filerText(lage.osparade)}</strong>,
          )}
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Det här försvinner')}</span>
        <table class="inventering">
          <tbody>
            {lage === null ? (
              <tr>
                <td colSpan={2} class="inventering__exempel">
                  {t('Räknar…')}
                </td>
              </tr>
            ) : (
              <>
                <tr>
                  <td class="inventering__antal">{lage.filer}</td>
                  <td>
                    {t('öppna filer')}
                    {lage.filer > 0 && tf(', tillsammans {0}', raderText(lage.rader))}
                  </td>
                </tr>
                {session.lage !== 'ingen' && (
                  <tr class="inventering--okant">
                    <td class="inventering__antal">1</td>
                    <td>
                      {tf('påbörjad sammanslagning — {0}', session.namn)}
                      {session.ogjort > 0 && tf(' med {0} beslut', session.ogjort)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td class="inventering__antal">
                    {lage.lagrat === null ? '—' : formatByte(lage.lagrat)}
                  </td>
                  <td>
                    {t(
                      lage.lagrat === null
                        ? 'webbläsaren säger inte hur mycket den sparat'
                        : 'sparat i webbläsaren',
                    )}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {lage !== null && !harNagot && (
        <p class="verktyg__sammanfattning">
          {t('Det finns ingenting att rensa. Du kan börja om ändå — sidan laddas då bara om.')}
        </p>
      )}

      <Notis ton="info">
        {/*
          Ärligheten om minnet hör hemma här, eftersom det är därför man
          klickar. Att släppa referenserna räcker inte för att se en skillnad i
          aktivitetshanteraren — det är omladdningen som river högen.
        */}
        {t(
          'Sidan laddas om till sist. Det är det som gör att webbläsaren faktiskt lämnar tillbaka minnet; att bara stänga flikarna räcker inte, eftersom den själv bestämmer när den städar.',
        )}
      </Notis>
    </Modal>
  )
}
