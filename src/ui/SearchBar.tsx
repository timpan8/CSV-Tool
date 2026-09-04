import { useEffect, useRef, useState } from 'preact/hooks'
import { formatCount } from '../core/locale/sv.js'
import { t, tf } from './sprak.js'

export function SearchBar(props: {
  varde: string
  traffar: number
  totalt: number
  kolumnerMedTraff: number
  onSok: (fraga: string) => void
  onStang: () => void
  onNasta: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [utkast, setUtkast] = useState(props.varde)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // Sökningen räknas om medan man skriver, men inte vid varje tangenttryck.
  useEffect(() => {
    if (utkast === props.varde) return
    const timer = setTimeout(() => props.onSok(utkast), 120)
    return () => clearTimeout(timer)
  }, [utkast])

  const soker = utkast.trim() !== ''
  const noll = soker && props.traffar === 0

  return (
    <div class="sokrad" role="search">
      <input
        ref={ref}
        type="search"
        placeholder={t('Sök i tabellen…')}
        value={utkast}
        aria-label={t('Sök i tabellen')}
        onInput={(e) => setUtkast((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            props.onStang()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            props.onSok(utkast)
            props.onNasta()
          }
        }}
      />
      {soker && (
        <span class={`sokrad__antal${noll ? ' sokrad__antal--noll' : ''}`}>
          {noll
            ? t('Inga träffar')
            : tf('{0} av {1} rader', formatCount(props.traffar), formatCount(props.totalt)) +
              ` · ${formatCount(props.kolumnerMedTraff)} ${t(
                props.kolumnerMedTraff === 1 ? 'kolumn' : 'kolumner',
              )}`}
        </span>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button class="knapp knapp--tyst" onClick={props.onStang}>
          {t('Stäng')}
        </button>
      </span>
    </div>
  )
}
