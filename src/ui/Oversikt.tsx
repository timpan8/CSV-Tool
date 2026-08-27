import { useMemo } from 'preact/hooks'
import type { ColumnId, ColumnType, Frame } from '../core/types.js'
import { kolumnstatistik } from '../core/frame/statistik.js'
import { innehallsprofil } from '../core/frame/innehall.js'
import { TYPE_LABELS } from '../core/infer.js'
import { formatCount, kolumner as kolumnerText, rader as raderText } from '../core/locale/sv.js'
import { ordnaVerktyg, type Verktygsnamn } from './verktyg.js'

const TYPER: ColumnType[] = ['text', 'number', 'date', 'email', 'bool']

/**
 * Kolumnöversikten.
 *
 * Svarar på frågan man ställer *innan* man börjar: vad är det här för fil?
 * Inspektören kan bara svara för en kolumn i taget, och rutnätets kvalitetsstaplar
 * visar proportioner utan tal. Här står alla kolumner under varandra med
 * ifyllnad, unika värden, problem — och vad innehållet talar för att man gör
 * härnäst.
 *
 * Talen räknas mot den vy man har framme, som inspektörens. Förslagen kommer
 * ur `innehallsprofil` och gäller hela kolumnen, eftersom ett verktyg skriver
 * om ordboken och därmed träffar varje rad med samma värde.
 */
export function Oversikt(props: {
  frame: Frame
  revision: number
  onValjKolumn: (id: ColumnId) => void
  onSetType: (id: ColumnId, typ: ColumnType) => void
  onVisaOgiltiga: (id: ColumnId) => void
  onVerktyg: (namn: Verktygsnamn, id: ColumnId) => void
  onStang: () => void
}) {
  const { frame } = props

  const rader = useMemo(
    () =>
      frame.columns.map((col) => ({
        col,
        stat: kolumnstatistik(col, frame, 0),
        ordning: ordnaVerktyg(innehallsprofil(col)),
      })),
    [frame, props.revision],
  )

  const medProblem = rader.filter((r) => r.stat.ogiltiga > 0).length
  const tomma = rader.filter((r) => r.stat.ifyllda === 0).length

  return (
    <div class="oversikt">
      <div class="oversikt__topp">
        <div>
          <h2>Kolumnöversikt</h2>
          <span class="oversikt__underrubrik">
            {frame.name} · {raderText(frame.view.length)} ·{' '}
            {kolumnerText(frame.columns.length)}
            {frame.view.length !== frame.rowCount &&
              ` · talen gäller den vy du har framme, inte alla ${formatCount(frame.rowCount)} rader`}
          </span>
        </div>
        <table class="inventering">
          <tbody>
            <tr class={medProblem > 0 ? 'inventering--okant' : ''}>
              <td class="inventering__antal">{formatCount(medProblem)}</td>
              <td>kolumner har värden som inte går att tolka som sin typ</td>
            </tr>
            {tomma > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(tomma)}</td>
                <td>är helt tomma</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div class="oversikt__kropp">
        <table class="oversikt__tabell">
          <thead>
            <tr>
              <th scope="col">Kolumn</th>
              <th scope="col">Typ</th>
              <th scope="col" class="oversikt__tal">
                Ifyllt
              </th>
              <th scope="col" class="oversikt__tal">
                Unika
              </th>
              <th scope="col" class="oversikt__tal">
                Problem
              </th>
              <th scope="col">Föreslås</th>
            </tr>
          </thead>
          <tbody>
            {rader.map(({ col, stat, ordning }) => {
              const andel = stat.totalt === 0 ? 0 : stat.ifyllda / stat.totalt
              return (
                <tr key={col.id} class={col.hidden ? 'oversikt__rad--dold' : ''}>
                  <th scope="row">
                    <button
                      class="oversikt__namn"
                      title={col.hidden ? `${col.name} är dold` : `Gå till ${col.name}`}
                      onClick={() => {
                        props.onValjKolumn(col.id)
                        props.onStang()
                      }}
                    >
                      {col.name || '(namnlös)'}
                      {col.hidden && <span class="oversikt__dold">dold</span>}
                    </button>
                  </th>
                  <td>
                    <select
                      value={col.type}
                      aria-label={`Typ för ${col.name}`}
                      onChange={(e) =>
                        props.onSetType(
                          col.id,
                          (e.currentTarget as HTMLSelectElement).value as ColumnType,
                        )
                      }
                    >
                      {!TYPER.includes(col.type) && (
                        <option value={col.type}>{TYPE_LABELS[col.type]}</option>
                      )}
                      {TYPER.map((t) => (
                        <option value={t} key={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td class="oversikt__tal">
                    <span class="oversikt__andel" title={`${formatCount(stat.ifyllda)} ifyllda`}>
                      {stat.totalt === 0 ? '–' : `${Math.round(andel * 100)} %`}
                    </span>
                    <span
                      class="oversikt__stapel"
                      aria-hidden="true"
                      style={{ '--andel': `${andel * 100}%` }}
                    />
                  </td>
                  <td class="oversikt__tal">{formatCount(stat.unika)}</td>
                  <td class="oversikt__tal">
                    {stat.ogiltiga === 0 ? (
                      <span class="oversikt__noll">0</span>
                    ) : (
                      <button
                        class="knapp knapp--tyst oversikt__problem"
                        title={`Visa de ${formatCount(stat.ogiltiga)} rader som inte går att tolka som ${TYPE_LABELS[col.type].toLowerCase()}`}
                        onClick={() => {
                          props.onVisaOgiltiga(col.id)
                          props.onStang()
                        }}
                      >
                        {formatCount(stat.ogiltiga)}
                      </button>
                    )}
                  </td>
                  <td>
                    <div class="oversikt__forslag">
                      {ordning.passande.slice(0, 2).map(({ post, skal }) => (
                        <button
                          key={post.namn}
                          class="knapp knapp--tyst oversikt__verktyg"
                          title={skal}
                          onClick={() => {
                            props.onVerktyg(post.namn, col.id)
                            props.onStang()
                          }}
                        >
                          {post.etikett.replace(/…$/, '')}
                          <span class="oversikt__skal">{skal}</span>
                        </button>
                      ))}
                      {ordning.passande.length === 0 && (
                        <span class="oversikt__noll">inget som sticker ut</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div class="oversikt__fot">
        <span class="oversikt__fot__text">
          Förslagen kommer ur vad kolumnerna innehåller, inte ur deras typ. Ett klick öppnar
          verktyget på rätt kolumn.
        </span>
        <button class="knapp knapp--primar" onClick={props.onStang}>
          Stäng översikten
        </button>
      </div>
    </div>
  )
}
