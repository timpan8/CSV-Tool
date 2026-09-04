import { useMemo } from 'preact/hooks'
import type { Column, ColumnType, Frame } from '../core/types.js'
import { kolumnstatistik } from '../core/frame/statistik.js'
import { TYPE_LABELS } from '../core/infer.js'
import { formatCount } from '../core/locale/sv.js'
import { innehallsprofil } from '../core/frame/innehall.js'
import { ordnaVerktyg, type Verktygsnamn } from './verktyg.jsx'
import { t, tf } from './sprak.js'

const TYPER: ColumnType[] = ['text', 'number', 'date', 'email', 'bool']

export function Inspector(props: {
  frame: Frame
  column: Column | null
  revision: number
  onSetType: (type: ColumnType) => void
  onFilterInvalid: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onVerktyg: (namn: Verktygsnamn) => void
  /** Klick på ett av de vanligaste värdena filtrerar fram just det. */
  onFiltreraVarde: (varde: string) => void
}) {
  const { column, frame } = props
  const stat = useMemo(
    () => (column ? kolumnstatistik(column, frame) : null),
    [column, frame, props.revision],
  )
  /*
   * Vilka verktyg som föreslås kommer ur innehållet, inte ur typen.
   * `foreslasFor` fanns här förut och kunde inte uttrycka det viktigaste
   * fallet: en telefonkolumn, som inte har någon egen kolumntyp alls.
   */
  const ordning = useMemo(
    () => (column ? ordnaVerktyg(innehallsprofil(column)) : null),
    [column, props.revision],
  )
  const forstaSkalet = ordning?.passande[0]?.skal ?? null

  if (!column || !stat || !ordning) {
    return (
      <div class="panel panel--hoger">
        <div class="panel__rubrik">{t('Kolumn')}</div>
        <div class="panel__innehall">
          <p style={{ color: 'var(--text-svag)', fontSize: 13 }}>
            {t('Klicka på en kolumnrubrik för att se antal, tomma värden och de vanligaste värdena.')}
          </p>
        </div>
      </div>
    )
  }

  const maxAntal = stat.topp[0]?.antal ?? 1

  return (
    <div class="panel panel--hoger">
      <div class="panel__rubrik">{t('Kolumn')}</div>
      <div class="panel__innehall" style={{ padding: 0 }}>
        <div class="insp__grupp">
          <h3 class="insp__namn">{column.name}</h3>
          <div class="falt">
            <span class="falt__etikett">{t('Typ')}</span>
            <select
              value={column.type}
              onChange={(e) =>
                props.onSetType((e.currentTarget as HTMLSelectElement).value as ColumnType)
              }
            >
              {TYPER.map((typ) => (
                <option value={typ} key={typ}>
                  {t(TYPE_LABELS[typ])}
                </option>
              ))}
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-svag)' }}>
              {t(
                'Typen styr sortering, filter och vilka verktyg som erbjuds. Den skriver aldrig om ett värde.',
              )}
            </p>
          </div>
        </div>

        <div class="insp__grupp">
          <dl style={{ margin: 0 }}>
            <div class="insp__matt">
              <dt>{t('Rader')}</dt>
              <dd>{formatCount(stat.totalt)}</dd>
            </div>
            <div class="insp__matt">
              <dt>{t('Ifyllda')}</dt>
              <dd>{formatCount(stat.ifyllda)}</dd>
            </div>
            <div class="insp__matt">
              <dt>{t('Tomma')}</dt>
              <dd>{formatCount(stat.tomma)}</dd>
            </div>
            <div class="insp__matt">
              <dt>{t('Unika')}</dt>
              <dd>{formatCount(stat.unika)}</dd>
            </div>
            {stat.ogiltiga > 0 && (
              <div class="insp__matt insp__matt--varning">
                <dt>{t('Går inte att tolka')}</dt>
                <dd>{formatCount(stat.ogiltiga)}</dd>
              </div>
            )}
          </dl>
          {stat.ogiltiga > 0 && (
            <button
              class="knapp"
              style={{ width: '100%', marginTop: 8 }}
              onClick={props.onFilterInvalid}
            >
              {tf('Visa de {0} raderna', formatCount(stat.ogiltiga))}
            </button>
          )}
        </div>

        {stat.topp.length > 0 && (
          <div class="insp__grupp">
            <span class="falt__etikett">{t('Vanligaste värden')}</span>
            <div class="insp__topp" style={{ marginTop: 6 }}>
              {stat.topp.map((post) => (
                <button
                  class="insp__toppost"
                  key={post.varde}
                  title={tf('Filtrera fram {0}', post.varde)}
                  onClick={() => props.onFiltreraVarde(post.varde)}
                >
                  <span class="insp__vardetext">{post.varde}</span>
                  <span class="insp__antal">{formatCount(post.antal)}</span>
                  <div
                    class="insp__stapel"
                    style={{ width: `${(post.antal / maxAntal) * 100}%` }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="insp__grupp">
          <span class="falt__etikett">{t('Städa kolumnen')}</span>
          <div class="insp__knappar" style={{ marginTop: 6 }}>
            {ordning.passande.map(({ post, skal }) => (
              <button
                key={post.namn}
                class="knapp knapp--primar"
                title={skal}
                onClick={() => props.onVerktyg(post.namn)}
              >
                {t(post.etikett)}
              </button>
            ))}
            {ordning.ovriga.map((post) => (
              <button key={post.namn} class="knapp" onClick={() => props.onVerktyg(post.namn)}>
                {t(post.etikett)}
              </button>
            ))}
          </div>
          {forstaSkalet && (
            <p class="insp__skal">{forstaSkalet}</p>
          )}
        </div>

        <div class="insp__grupp" style={{ borderBottom: 0 }}>
          <span class="falt__etikett">{t('Åtgärder')}</span>
          <div class="insp__knappar" style={{ marginTop: 6 }}>
            <button class="knapp" onClick={props.onRename}>
              {t('Byt namn…')}
            </button>
            <button class="knapp" onClick={props.onDuplicate}>
              {t('Duplicera kolumnen')}
            </button>
            <button class="knapp knapp--fara" onClick={props.onDelete}>
              {t('Ta bort kolumnen')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
