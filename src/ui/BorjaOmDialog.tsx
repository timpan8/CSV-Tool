import { useEffect, useState } from 'preact/hooks'
import { Modal, Notis } from './parts.js'
import { filer as filerText, formatByte, rader as raderText } from '../core/locale/sv.js'
import { omstartslage, type Omstartslage } from '../state/store.js'
import { sessionslage, type Sessionslage } from '../state/matchning.js'

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
      titel="Börja om"
      underrubrik="Stänger allt och tömmer webbläsarens lagring"
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            Avbryt
          </button>
          <button class="knapp knapp--fara" onClick={props.onBorjaOm} disabled={lage === null}>
            Rensa allt
          </button>
        </>
      }
    >
      {lage !== null && lage.osparade > 0 && (
        <Notis ton="varning">
          <strong>{filerText(lage.osparade)}</strong> har ändringar som inte exporterats. De går
          inte att få tillbaka efteråt — exportera först om du vill behålla dem.
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">Det här försvinner</span>
        <table class="inventering">
          <tbody>
            {lage === null ? (
              <tr>
                <td colSpan={2} class="inventering__exempel">
                  Räknar…
                </td>
              </tr>
            ) : (
              <>
                <tr>
                  <td class="inventering__antal">{lage.filer}</td>
                  <td>
                    öppna filer
                    {lage.filer > 0 && `, tillsammans ${raderText(lage.rader)}`}
                  </td>
                </tr>
                {session.lage !== 'ingen' && (
                  <tr class="inventering--okant">
                    <td class="inventering__antal">1</td>
                    <td>
                      påbörjad sammanslagning — {session.namn}
                      {session.ogjort > 0 && ` med ${session.ogjort} beslut`}
                    </td>
                  </tr>
                )}
                <tr>
                  <td class="inventering__antal">
                    {lage.lagrat === null ? '—' : formatByte(lage.lagrat)}
                  </td>
                  <td>
                    {lage.lagrat === null
                      ? 'webbläsaren säger inte hur mycket den sparat'
                      : 'sparat i webbläsaren'}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {lage !== null && !harNagot && (
        <p class="verktyg__sammanfattning">
          Det finns ingenting att rensa. Du kan börja om ändå — sidan laddas då bara om.
        </p>
      )}

      <Notis ton="info">
        {/*
          Ärligheten om minnet hör hemma här, eftersom det är därför man
          klickar. Att släppa referenserna räcker inte för att se en skillnad i
          aktivitetshanteraren — det är omladdningen som river högen.
        */}
        Sidan laddas om till sist. Det är det som gör att webbläsaren faktiskt lämnar tillbaka
        minnet; att bara stänga flikarna räcker inte, eftersom den själv bestämmer när den städar.
      </Notis>
    </Modal>
  )
}
