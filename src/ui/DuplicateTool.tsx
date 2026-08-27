import { useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import {
  TOM_DUBBLETTNYCKEL,
  hittaDubbletter,
  type Behall,
  type Dubblettnyckel,
} from '../core/ops/duplicates.js'
import { formatCount, grupper as grupperText, rader as raderText } from '../core/locale/sv.js'

/**
 * Dubbletter.
 *
 * Nyckeln är hela frågan. En hel rad hittar bara exakta kopior, och två poster
 * om samma person skiljer sig nästan alltid på något — ett kundnummer, ett
 * datum. Därför står nyckelkolumnerna först i panelen, och siffran uppdateras
 * medan man kryssar.
 */
export function DuplicateTool(props: {
  frame: Frame
  revision: number
  /** Nyckeln som dubblettvyn är påslagen med, eller null när den är av. */
  nyckel: Dubblettnyckel | null
  onNyckel: (nyckel: Dubblettnyckel | null) => void
  /** Vilken rad i varje grupp som stannar. Bor i appen, eftersom rutnätet ritar valet. */
  behall: Behall
  onBehall: (behall: Behall) => void
  /** Antal grupper där användaren pekat ut en annan rad än förvalet. */
  egnaVal: number
  onTaBort: (nyckel: Dubblettnyckel, behall: Behall) => void
  onStang: () => void
}) {
  const { frame } = props
  const visas = props.nyckel !== null
  /**
   * Nyckeln bor i panelen tills man ber om att se dubbletterna.
   *
   * Annars skulle varje kryss i kolumnlistan dölja rader direkt — man
   * beskriver vad som räknas som lika, och det är inte samma sak som att
   * säga att resten ska försvinna.
   */
  const [utkast, setUtkast] = useState<Dubblettnyckel>(props.nyckel ?? TOM_DUBBLETTNYCKEL)
  const nyckel = props.nyckel ?? utkast
  const kolumner = visibleColumns(frame)

  // Räknas alltid på hela ramen, aldrig på den filtrerade vyn: en dubblett
  // vars partner ligger utanför vyn är fortfarande en dubblett.
  const grupper = useMemo(
    () => hittaDubbletter(frame, nyckel),
    [frame, props.revision, nyckel],
  )

  const andra = (delta: Partial<Dubblettnyckel>) => {
    const ny = { ...nyckel, ...delta, strunta: { ...nyckel.strunta, ...(delta.strunta ?? {}) } }
    setUtkast(ny)
    // Är vyn redan på ska den följa med ändringen direkt.
    if (visas) props.onNyckel(ny)
  }

  const vaxlaKolumn = (id: string) => {
    const valda = nyckel.kolumner.length === 0 ? kolumner.map((c) => c.id) : nyckel.kolumner
    const nya = valda.includes(id) ? valda.filter((x) => x !== id) : [...valda, id]
    andra({ kolumner: nya })
  }

  const valda = nyckel.kolumner.length === 0 ? kolumner.map((c) => c.id) : nyckel.kolumner

  return (
    <Verktygspanel
      titel="Dubbletter"
      underrubrik={
        grupper.antalGrupper === 0
          ? 'Inga dubbletter med den här nyckeln'
          : `${grupperText(grupper.antalGrupper)} · ${raderText(grupper.antalRader)}`
      }
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Stäng
          </button>
          <button
            class="knapp knapp--fara"
            disabled={grupper.antalOverflodiga === 0}
            onClick={() => props.onTaBort(nyckel, props.behall)}
          >
            Ta bort {raderText(grupper.antalOverflodiga)}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Rader räknas som lika när de stämmer i</span>
        <div class="kollista kollista--kryss">
          {kolumner.map((c) => (
            <label class="kryss" key={c.id}>
              <input
                type="checkbox"
                checked={valda.includes(c.id)}
                onChange={() => vaxlaKolumn(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
        {nyckel.kolumner.length === 0 && (
          <p class="verktyg__sammanfattning">
            Alla kolumner. En hel rad måste vara identisk — kryssa ur det som skiljer sig, som
            ett löpnummer.
          </p>
        )}
      </div>

      <div class="falt">
        <span class="falt__etikett">Strunta i</span>
        <div class="faltrad">
          <label class="kryss">
            <input
              type="checkbox"
              checked={nyckel.strunta.skiftlage}
              onChange={(e) =>
                andra({ strunta: { ...nyckel.strunta, skiftlage: (e.currentTarget as HTMLInputElement).checked } })
              }
            />
            VERSALER
          </label>
          <label class="kryss">
            <input
              type="checkbox"
              checked={nyckel.strunta.blanksteg}
              onChange={(e) =>
                andra({ strunta: { ...nyckel.strunta, blanksteg: (e.currentTarget as HTMLInputElement).checked } })
              }
            />
            Extra blanksteg
          </label>
          <label class="kryss">
            <input
              type="checkbox"
              checked={nyckel.strunta.diakriter}
              onChange={(e) =>
                andra({ strunta: { ...nyckel.strunta, diakriter: (e.currentTarget as HTMLInputElement).checked } })
              }
            />
            å ä ö
          </label>
        </div>
        {nyckel.strunta.diakriter && (
          <Notis ton="varning">
            Med å ä ö bortstruket räknas <strong>För</strong> och <strong>For</strong> som samma
            ord. Det är ofta rätt för namn ur olika system, men det kan också slå ihop två
            personer som faktiskt heter olika.
          </Notis>
        )}
      </div>

      <div class="falt">
        <span class="falt__etikett">Vad som hittades</span>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(grupper.antalGrupper)}</td>
              <td>{grupper.antalGrupper === 1 ? 'grupp med lika rader' : 'grupper med lika rader'}</td>
              <td class="inventering__exempel" />
            </tr>
            <tr>
              <td class="inventering__antal">{formatCount(grupper.antalRader)}</td>
              <td>rader ingår</td>
              <td class="inventering__exempel" />
            </tr>
            <tr>
              <td class="inventering__antal">{formatCount(grupper.antalHeltLika)}</td>
              <td>
                av grupperna är identiska i <em>varje</em> kolumn — de kan tas bort utan att du
                tittar
              </td>
              <td class="inventering__exempel" />
            </tr>
            {grupper.antalGrupper > grupper.antalHeltLika && (
              <tr class="inventering--okant">
                <td class="inventering__antal">
                  {formatCount(grupper.antalGrupper - grupper.antalHeltLika)}
                </td>
                <td>
                  skiljer sig utanför nyckeln — den ena raden kan bära uppgifter den andra
                  saknar
                </td>
                <td class="inventering__exempel" />
              </tr>
            )}
            <tr class={grupper.antalOverflodiga > 0 ? 'inventering--okant' : ''}>
              <td class="inventering__antal">{formatCount(grupper.antalOverflodiga)}</td>
              <td>skulle tas bort</td>
              <td class="inventering__exempel" />
            </tr>
            {grupper.storsta > 2 && (
              <tr>
                <td class="inventering__antal">{formatCount(grupper.storsta)}</td>
                <td>rader i den största gruppen</td>
                <td class="inventering__exempel" />
              </tr>
            )}
          </tbody>
        </table>
        <label class="kryss">
          <input
            type="checkbox"
            checked={nyckel.tommaRaknas}
            onChange={(e) =>
              andra({ tommaRaknas: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          Räkna rader som är tomma i hela nyckeln som lika
        </label>
      </div>

      <div class="falt">
        <span class="falt__etikett">Visa</span>
        <Val
          varden={[
            { varde: 'alla' as const, etikett: 'Alla rader' },
            { varde: 'dubbletter' as const, etikett: 'Bara dubbletterna' },
          ]}
          valt={visas ? 'dubbletter' : 'alla'}
          onValj={(v) => props.onNyckel(v === 'dubbletter' ? nyckel : null)}
        />
        {visas && (
          <p class="verktyg__sammanfattning">
            Grupperna ligger intill varandra, med en linje mellan dem.
          </p>
        )}
      </div>

      <div class="falt">
        <span class="falt__etikett">Vid borttagning, behåll</span>
        <Val
          varden={[
            { varde: 'forsta' as const, etikett: 'Den första i filen' },
            { varde: 'sista' as const, etikett: 'Den sista i filen' },
            {
              varde: 'valda' as const,
              etikett: 'Den jag väljer',
              titel: 'Peka ut raden som ska stanna med ringen vid radnumret.',
            },
          ]}
          valt={props.behall}
          onValj={(v) => {
            props.onBehall(v)
            // Att välja rad kräver att grupperna syns. Att slå på vyn åt
            // användaren är billigare än att förklara varför inget händer.
            if (v === 'valda' && !visas) props.onNyckel(nyckel)
          }}
        />
        {props.behall === 'valda' ? (
          <p class="verktyg__sammanfattning">
            Klicka på ringen vid radnumret för den rad som ska stanna i varje grupp.
            {props.egnaVal > 0
              ? ` ${formatCount(props.egnaVal)} av ${formatCount(grupper.antalGrupper)} grupper har ett eget val; resten behåller den första.`
              : ' Utan eget val stannar den första i filen.'}
          </p>
        ) : (
          <p class="verktyg__sammanfattning">
            Första och sista räknas i filens ordning, inte i den du tittar på nu — annars skulle
            valet betyda olika saker beroende på hur du sorterat. Borttagningen går att ångra.
          </p>
        )}
      </div>
    </Verktygspanel>
  )
}
