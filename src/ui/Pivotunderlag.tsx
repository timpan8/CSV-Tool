import { useMemo, useState } from 'preact/hooks'
import { VirtualGrid } from './grid/VirtualGrid.js'
import type { Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { toDelimited } from '../core/csv/stringify.js'
import { malformAvKallor, stapla } from '../core/ops/stapla.js'
import { TOM_VY } from '../state/view.js'
import { rect, type Selection } from '../state/selection.js'
import { rader as raderText, t, tf } from './sprak.js'

/**
 * Raderna bakom en cell i pivoten.
 *
 * Pivoten svarar på *hur många*. Det här är svaret på **vilka** — den
 * följdfråga man alltid har framför en korstabell, och som i Excel kräver ett
 * dubbelklick och ett nytt blad. Här byts rutan direkt när man klickar på en
 * annan rad, så att man kan leta sig fram utan att samla på sig flikar.
 *
 * **Rutnätet är appens eget.** `VirtualGrid` läser sina rader ur `frame.view`
 * och rör varken store eller signaler, så den går att montera en andra gång
 * med urvalet som vy — samma knep som exportdialogens smakprov. Det är hela
 * poängen: det här *är* rutnätet, med samma typfärger, kvalitetsstaplar och
 * kolumnbredder, inte en tabell som liknar det.
 *
 * **Men den skriver inte.** Redigering hör hemma på fliken man gör av
 * urvalet, där hela verktygsfältet finns. En panel som ändrade värden hade
 * dessutom räknat om pivoten under fingret: raden man tittade på kunde flytta
 * sig medan man skrev i den.
 */
export function Pivotunderlag(props: {
  frame: Frame
  revision: number
  /** Vad urvalet heter i klartext: `Malmö × Aktiv`, eller filens namn. */
  rubrik: string
  /** Raderna bakom cellen, som fysiska radnummer. */
  rader: Uint32Array
  onNyFlik: (resultat: Frame, text: string) => void
  onStang: () => void
}) {
  const { frame, rader } = props
  /*
   * Markeringen är lokal, och det är den enda som är riktig här.
   *
   * `Selection` är ett index i `Frame.view`, och panelens rutnät har sin egen
   * vy — flikens markering betyder något helt annat och får inte röras. Att
   * de två inte kan blandas ihop är också varför panelen har en egen
   * kopieringsknapp: `Ctrl+C` går till fliken, som appens tangentbord alltid
   * gjort.
   */
  const [markering, setMarkering] = useState<Selection | null>(null)

  /*
   * Samma ram, en annan vy. Kolumnerna delas med fliken, så bredder och
   * typer är desamma — det är önskvärt: det är samma kolumner.
   */
  const vy = useMemo<Frame>(() => ({ ...frame, view: rader }), [frame, rader])

  const kolumner = visibleColumns(frame)

  const kopiera = async () => {
    const valda = markering ? rect(markering) : null
    const spalter = valda ? kolumner.slice(valda.k1, valda.k2 + 1) : kolumner
    const valdaRader = valda
      ? rader.slice(valda.r1, valda.r2 + 1)
      : rader
    await navigator.clipboard.writeText(toDelimited(spalter, valdaRader, '\t'))
  }

  /*
   * Fliken byggs av `stapla` med en enda källa.
   *
   * Det är precis vad Kombinera gör, och det som gör det värt att återanvända
   * är `sourceRow`: den nya fliken vet vilka rader i källfilen den kom från,
   * så radnumren i kanten säger sanningen. En handrullad kopia hade fått göra
   * om både det och typgissningen.
   */
  const gorFlik = () => {
    const namn = `${frame.name} – ${props.rubrik}`
    const resultat = stapla([{ frame, rader }], {
      kolumner: malformAvKallor([frame]),
      kallkolumn: null,
      namn,
    })
    props.onNyFlik(resultat.frame, tf('{0} ur {1}', raderText(rader.length), frame.name))
  }

  return (
    <section class="pivotunderlag" aria-label={t('Raderna bakom')}>
      <div class="pivotunderlag__topp">
        <h3 class="pivotunderlag__rubrik">
          {props.rubrik}
          <span class="pivotunderlag__antal">{raderText(rader.length)}</span>
        </h3>
        <div class="pivotunderlag__knappar">
          <button
            class="knapp knapp--tyst"
            disabled={rader.length === 0}
            title={t('Kopiera raderna som TSV — klistra in direkt i Excel.')}
            onClick={kopiera}
          >
            {t('Kopiera')}
          </button>
          <button class="knapp" disabled={rader.length === 0} onClick={gorFlik}>
            {t('Gör flik av urvalet')}
          </button>
          <button
            class="kolrad__oga"
            aria-label={t('Dölj raderna bakom')}
            title={t('Dölj raderna bakom')}
            onClick={props.onStang}
          >
            ✕
          </button>
        </div>
      </div>

      {rader.length === 0 ? (
        <p class="pivotunderlag__tomt">{t('Inga rader bakom den cellen.')}</p>
      ) : (
        <VirtualGrid
          frame={vy}
          revision={props.revision}
          activeColumnId={null}
          viewSpec={TOM_VY}
          forhandsvisning={[]}
          sortering={[]}
          inaktuellaRegler={TOMMA_IDER}
          grupper={null}
          behallnaRader={null}
          onBehall={null}
          markering={markering}
          redigerar={null}
          onSelect={setMarkering}
          /*
           * Allt som skriver, sorterar eller öppnar en meny är avstängt.
           * Panelen läser; fliken är där man ändrar. Bredderna ärvs från
           * fliken av samma skäl — det är samma kolumner, och två ställen som
           * ändrade dem hade dragit i varandra.
           */
          onSelectColumn={ingenting}
          onOpenColumnMenu={ingenting}
          onOpenCellMenu={ingenting}
          onOpenRowMenu={ingenting}
          onOpenTomrumMenu={ingenting}
          onMoveColumn={ingenting}
          onResizeColumn={ingenting}
          onAutofit={ingenting}
          onCycleType={ingenting}
          onSortera={ingenting}
          onStartEdit={ingenting}
          onCommitEdit={ingenting}
          onCancelEdit={ingenting}
        />
      )}

      {rader.length > 0 && (
        <p class="pivotunderlag__fot">
          {t('Rutan läser bara. Gör en flik av urvalet för att städa, sortera eller exportera.')}
        </p>
      )}
    </section>
  )
}

/** Rutnätets skrivande händelser leder ingenstans här. */
const ingenting = () => {}

const TOMMA_IDER: ReadonlySet<string> = new Set()
