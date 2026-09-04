import { useState } from 'preact/hooks'
import type { Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import {
  antalKallor,
  krockandeKallor,
  TOMT,
  type Hamtning,
  type Malkolumn,
} from '../core/ops/stapla.js'
import { formatCount } from '../core/locale/sv.js'
import { t, tf } from './sprak.js'

/** Så lång en ledtråd får bli innan den klipps. */
const PROVLANGD = 26

/**
 * Vad som står under en källväljare.
 *
 * `null` betyder att det inte finns något att säga: ingen kolumn är vald, eller
 * filen bidrar inga rader alls. `'tom'` är något annat — kolumnen *är* vald och
 * innehåller ingenting i någon av raderna som tas med. Att låta de två se
 * likadana ut vore att kasta bort just den skillnad kartan finns för.
 */
export type Prov = null | 'tom' | { varde: string }

export interface Aliaskalla {
  id: string
  frame: Frame
  /** Rader filen bidrar med. */
  radantal: number
}

/**
 * Aliaskartan: en rad per målkolumn, en spalt per fil.
 *
 * En riktig tabell och inte en rad `.regel`-fält, eftersom kartan växer i
 * bredd med antalet filer. Det man läser är spalterna nedåt: att `Namn`,
 * `Name` och `kundnamn` faktiskt hamnat på samma rad.
 *
 * Under varje vald källkolumn står **ett av dess värden**. Rubriker ljuger:
 * `Kontakt` kan vara ett namn i den ena filen och en e-postadress i den andra,
 * och det syns först när man ser innehållet. Mallens `ledtrad` svarar på den
 * motsatta frågan — vad kolumnen *ska* innehålla — och de två kompletterar
 * varandra.
 *
 * Komponenten räknar ingenting tungt. Proven kommer färdiga utifrån: kartan
 * ritas om vid varje tecken man skriver i ett namnfält, och ett svep över
 * raderna per cell hade betalat filens pris för en ledtråd.
 */
export function Aliaskarta(props: {
  kallor: readonly Aliaskalla[]
  kolumner: readonly Malkolumn[]
  /** Ett prov per målkolumn och källa, i samma ordning. */
  prov: readonly (readonly Prov[])[]
  /** Sant för målkolumner som blir tomma i hela resultatet. */
  blirTomma: readonly boolean[]
  /** Sant när en mall bestämmer namnen — då står de fast. */
  namnLast: boolean
  onHamtning: (rad: number, kalla: number, hamtning: Hamtning) => void
  onNamn: (rad: number, namn: string) => void
  onBeslut: (rad: number, med: boolean | null) => void
  onStandard: (rad: number, standard: string) => void
  onSammanfoga: (behall: number, slopa: number) => void
  onDelaUpp: (rad: number) => void
}) {
  /* Raden som just nu letar efter en spaltkamrat. */
  const [letar, setLetar] = useState<string | null>(null)
  const [motpart, setMotpart] = useState<number | null>(null)

  const borja = (i: number) => {
    setLetar(props.kolumner[i]!.forslagsnamn)
    setMotpart(props.kolumner.findIndex((_, j) => j !== i))
  }

  return (
    <div class="aliaskarta__omslag">
      <table class="aliaskarta">
        <thead>
          <tr>
            <th class="aliaskarta__mal">{t('Målkolumn')}</th>
            {props.kallor.map((k) => (
              <th key={k.id}>{k.frame.name}</th>
            ))}
            <th class="aliaskarta__standard" title={t('Värde för de filer som inte ger något.')}>
              {t('Standard')}
            </th>
            <th class="aliaskarta__beslut">{t('Med')}</th>
          </tr>
        </thead>
        <tbody>
          {props.kolumner.map((kol, i) => {
            const fyllda = antalKallor(kol.hamtning)
            const luckor = fyllda < props.kallor.length
            let tomma = 0
            for (let j = 0; j < props.kallor.length; j++) {
              if ((kol.hamtning[j] ?? TOMT).fran === 'tomt') tomma += props.kallor[j]!.radantal
            }
            const standard = kol.standard ?? ''
            const ihopmed = kol.sammanslagna ?? []
            return (
              <tr
                // Nyckeln är radens oföränderliga identitet, inte dess index.
                // Index river fel rad när en hopslagning tar bort en rad mitt
                // i listan; namnet river raden vid varje tecken man skriver.
                key={kol.forslagsnamn}
                data-mal={kol.namn}
                class={
                  kol.med === null
                    ? 'aliasrad aliasrad--obeslutad'
                    : kol.med
                      ? 'aliasrad'
                      : 'aliasrad aliasrad--av'
                }
              >
                <th class="aliaskarta__mal">
                  <div class="aliaskarta__namnrad">
                    {props.namnLast ? (
                      <span class="aliaskarta__namn">{kol.namn}</span>
                    ) : (
                      <input
                        class="aliaskarta__namnfalt"
                        value={kol.namn}
                        aria-label={tf('Namn på målkolumn {0}', i + 1)}
                        onInput={(e) => props.onNamn(i, (e.currentTarget as HTMLInputElement).value)}
                      />
                    )}
                    {props.kolumner.length > 1 && (
                      <button
                        class="knapp knapp--tyst knapp--ikon"
                        aria-label={tf('Samma spalt som en annan målkolumn: {0}', kol.namn)}
                        title={t('Samma spalt som…')}
                        onClick={() =>
                          letar === kol.forslagsnamn ? setLetar(null) : borja(i)
                        }
                      >
                        ⋯
                      </button>
                    )}
                  </div>
                  {kol.ledtrad ? (
                    <span class="aliaskarta__ledtrad">{tf('t.ex. {0}', kol.ledtrad)}</span>
                  ) : null}
                  {ihopmed.length > 0 && (
                    <span class="aliaskarta__ihopmed">
                      + {ihopmed.join(', ')}
                      <button
                        class="knapp knapp--tyst knapp--ikon"
                        aria-label={tf('Dela upp {0} igen', kol.namn)}
                        title={t('Dela upp igen')}
                        onClick={() => props.onDelaUpp(i)}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  <span class="aliaskarta__not">
                    {tf('finns i {0} av {1}', formatCount(fyllda), formatCount(props.kallor.length))}
                    {tomma > 0 &&
                      (standard === ''
                        ? ` · ${tf('{0} rader blir tomma', formatCount(tomma))}`
                        : ` · ${tf('{0} rader fylls med {1}', formatCount(tomma), standard)}`)}
                  </span>
                  {props.blirTomma[i] && (
                    <span class="aliaskarta__tomvarning">{t('Blir tom i hela resultatet')}</span>
                  )}
                  {letar === kol.forslagsnamn && (
                    <Spaltkamrat
                      kolumner={props.kolumner}
                      denna={i}
                      motpart={motpart}
                      onMotpart={setMotpart}
                      onKlar={(slopa) => {
                        setLetar(null)
                        props.onSammanfoga(i, slopa)
                      }}
                      onAvbryt={() => setLetar(null)}
                    />
                  )}
                </th>

                {props.kallor.map((kalla, j) => {
                  const h = kol.hamtning[j] ?? TOMT
                  const prov = props.prov[i]?.[j] ?? null
                  return (
                    <td key={kalla.id}>
                      <select
                        class="nivarad__kolumn"
                        aria-label={tf('{0} ur {1}', kol.namn, kalla.frame.name)}
                        value={h.fran === 'kolumn' ? h.colId : ''}
                        onChange={(e) => {
                          const varde = (e.currentTarget as HTMLSelectElement).value
                          props.onHamtning(
                            i,
                            j,
                            varde === '' ? TOMT : { fran: 'kolumn', colId: varde },
                          )
                        }}
                      >
                        <option value="">— tomt —</option>
                        {visibleColumns(kalla.frame).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {prov === 'tom' ? (
                        <span class="aliaskarta__prov aliaskarta__prov--tom">{t('alla tomma')}</span>
                      ) : prov ? (
                        <span class="aliaskarta__prov">{kapa(prov.varde)}</span>
                      ) : null}
                    </td>
                  )
                })}

                <td class="aliaskarta__standard">
                  {/*
                   * Fältet står alltid framme, även när alla filer har
                   * kolumnen. Ett dolt men sparat värde skulle börja gälla i
                   * samma sekund man kryssar av den fil som hade kolumnen —
                   * utan att något syntes.
                   */}
                  <input
                    class="aliaskarta__standardfalt"
                    value={standard}
                    placeholder={t('tomt')}
                    disabled={!luckor}
                    aria-label={tf('Standardvärde för {0}', kol.namn)}
                    title={t(
                      luckor
                        ? 'Fyller bara de filer som inte ger något. Celler som finns men är tomma rörs inte.'
                        : 'Alla filer ger något — inget att fylla i.',
                    )}
                    onInput={(e) => props.onStandard(i, (e.currentTarget as HTMLInputElement).value)}
                  />
                </td>

                <td class="aliaskarta__beslut">
                  {kol.med === null ? (
                    <div class="aliaskarta__svar">
                      <button class="knapp knapp--liten" onClick={() => props.onBeslut(i, true)}>
                        {t('Ta med')}
                      </button>
                      <button
                        class="knapp knapp--liten knapp--tyst"
                        onClick={() => props.onBeslut(i, false)}
                      >
                        {t('Hoppa över')}
                      </button>
                    </div>
                  ) : (
                    <div class="aliaskarta__svar">
                      <label class="kryss">
                        <input
                          type="checkbox"
                          checked={kol.med}
                          aria-label={tf('Ta med {0}', kol.namn)}
                          onChange={(e) =>
                            props.onBeslut(i, (e.currentTarget as HTMLInputElement).checked)
                          }
                        />
                      </label>
                      {/*
                       * Bara en fråga verktyget själv ställt går att ta
                       * tillbaka. En kolumn som finns i alla filer fick aldrig
                       * någon fråga, och att kunna göra den obeslutad vore att
                       * spärra körningen utan att något behövde avgöras.
                       */}
                      {kol.fraga === true && (
                        <button
                          class="knapp knapp--tyst knapp--ikon"
                          aria-label={tf('Fråga igen om {0}', kol.namn)}
                          title={t('Fråga igen')}
                          onClick={() => props.onBeslut(i, null)}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Väljaren för en handgjord hopslagning.
 *
 * Inline i raden och inte i en dialog: frågan är *vilken av de andra raderna
 * betyder samma sak*, och det svarar man på genom att titta på kartan. En ruta
 * över kartan hade dolt just det man behöver se.
 */
function Spaltkamrat(props: {
  kolumner: readonly Malkolumn[]
  denna: number
  motpart: number | null
  onMotpart: (i: number) => void
  onKlar: (slopa: number) => void
  onAvbryt: () => void
}) {
  const denna = props.kolumner[props.denna]
  const andra = props.motpart === null ? undefined : props.kolumner[props.motpart]
  const krockar = denna && andra ? krockandeKallor(denna, andra) : []
  return (
    <div class="aliaskarta__ihop">
      <select
        class="nivarad__kolumn"
        aria-label={t('Målkolumn som hör till samma spalt')}
        value={props.motpart === null ? '' : String(props.motpart)}
        onChange={(e) => props.onMotpart(Number((e.currentTarget as HTMLSelectElement).value))}
      >
        {props.kolumner.map((k, j) =>
          j === props.denna ? null : (
            <option key={k.forslagsnamn} value={String(j)}>
              {k.namn}
            </option>
          ),
        )}
      </select>
      <div class="faltrad">
        <button
          class="knapp knapp--liten"
          disabled={props.motpart === null}
          onClick={() => props.motpart !== null && props.onKlar(props.motpart)}
        >
          {t('Samma spalt')}
        </button>
        <button class="knapp knapp--liten knapp--tyst" onClick={props.onAvbryt}>
          {t('Avbryt')}
        </button>
      </div>
      <span class="aliaskarta__not">
        {krockar.length > 0
          ? tf(
              '{0} {1} båda kolumnerna. Där ryms bara en, så resten står kvar som en egen rad att besluta om.',
              formatCount(krockar.length),
              t(krockar.length === 1 ? 'fil har' : 'filer har'),
            )
          : tf('Värdena flyttas hit och {0} tas bort.', andra ? andra.namn : t('raden'))}
      </span>
    </div>
  )
}

function kapa(varde: string): string {
  return varde.length > PROVLANGD ? `${varde.slice(0, PROVLANGD - 1)}…` : varde
}
