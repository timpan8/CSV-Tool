import type { Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { antalKallor, TOMT, type Hamtning, type Malkolumn } from '../core/ops/stapla.js'
import { formatCount } from '../core/locale/sv.js'

/**
 * Aliaskartan: en rad per målkolumn, en spalt per fil.
 *
 * En riktig tabell och inte en rad `.regel`-fält, eftersom kartan växer i
 * bredd med antalet filer. Med fem månadsfiler är det spalterna man läser
 * nedåt för att se att `Namn`, `Name` och `kundnamn` faktiskt hamnat på samma
 * rad — och det går inte i en flexrad.
 */
export function Aliaskarta(props: {
  kallor: readonly { id: string; frame: Frame; radantal: number }[]
  kolumner: readonly Malkolumn[]
  /** Sant när en mall bestämmer namnen — då står de fast. */
  namnLast: boolean
  onHamtning: (rad: number, kalla: number, hamtning: Hamtning) => void
  onNamn: (rad: number, namn: string) => void
  onBeslut: (rad: number, med: boolean) => void
}) {
  return (
    <div class="aliaskarta__omslag">
      <table class="aliaskarta">
        <thead>
          <tr>
            <th class="aliaskarta__mal">Målkolumn</th>
            {props.kallor.map((k) => (
              <th key={k.id}>{k.frame.name}</th>
            ))}
            <th class="aliaskarta__beslut">Med</th>
          </tr>
        </thead>
        <tbody>
          {props.kolumner.map((kol, i) => {
            const fyllda = antalKallor(kol.hamtning)
            let tomma = 0
            for (let j = 0; j < props.kallor.length; j++) {
              if ((kol.hamtning[j] ?? TOMT).fran === 'tomt') tomma += props.kallor[j]!.radantal
            }
            return (
              <tr
                // Nyckeln måste vara stabil medan namnet skrivs, annars river
                // Preact raden vid varje tecken och fältet tappar fokus.
                key={i}
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
                  {props.namnLast ? (
                    <span class="aliaskarta__namn">{kol.namn}</span>
                  ) : (
                    <input
                      class="aliaskarta__namnfalt"
                      value={kol.namn}
                      aria-label={`Namn på målkolumn ${i + 1}`}
                      onInput={(e) => props.onNamn(i, (e.currentTarget as HTMLInputElement).value)}
                    />
                  )}
                  {kol.ledtrad ? (
                    <span class="aliaskarta__ledtrad">t.ex. {kol.ledtrad}</span>
                  ) : null}
                  <span class="aliaskarta__not">
                    finns i {formatCount(fyllda)} av {formatCount(props.kallor.length)}
                    {tomma > 0 && ` · ${formatCount(tomma)} rader blir tomma`}
                  </span>
                </th>

                {props.kallor.map((kalla, j) => {
                  const h = kol.hamtning[j] ?? TOMT
                  return (
                    <td key={kalla.id}>
                      <select
                        class="nivarad__kolumn"
                        aria-label={`${kol.namn} ur ${kalla.frame.name}`}
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
                    </td>
                  )
                })}

                <td class="aliaskarta__beslut">
                  {kol.med === null ? (
                    <>
                      <button class="knapp knapp--liten" onClick={() => props.onBeslut(i, true)}>
                        Ta med
                      </button>
                      <button
                        class="knapp knapp--liten knapp--tyst"
                        onClick={() => props.onBeslut(i, false)}
                      >
                        Hoppa över
                      </button>
                    </>
                  ) : (
                    <label class="kryss">
                      <input
                        type="checkbox"
                        checked={kol.med}
                        aria-label={`Ta med ${kol.namn}`}
                        onChange={(e) =>
                          props.onBeslut(i, (e.currentTarget as HTMLInputElement).checked)
                        }
                      />
                    </label>
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
