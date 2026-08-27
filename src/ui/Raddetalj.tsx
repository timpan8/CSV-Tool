import { useState } from 'preact/hooks'
import type { Column, Frame } from '../core/types.js'
import { getCell } from '../core/frame/column.js'
import { visibleColumns } from '../core/frame/frame.js'

/**
 * En rads fält, med rättning på plats.
 *
 * Det är den fjärde vägen ur restlistan: ser man att namnet är felstavat
 * rättas det här, ändringen går till källfliken och hamnar i dess ångra-
 * historik, och matchningen körs om så att raden kan hitta sin partner av sig
 * själv. Verkstaden behöver alltså ingen egen ”koppla ihop ändå”-knapp för det
 * fallet — den rätta åtgärden är att rätta datat.
 */
export function Raddetalj(props: {
  rubrik: string
  filnamn: string
  frame: Frame
  rad: number | null
  onRatta: (col: Column, varde: string) => void
}) {
  const [redigerar, setRedigerar] = useState<string | null>(null)
  const [utkast, setUtkast] = useState('')

  if (props.rad === null) {
    return (
      <div class="raddetalj raddetalj--tom">
        <span class="raddetalj__rubrik">{props.rubrik}</span>
        <p class="restlista__tom">Ingen rad vald.</p>
      </div>
    )
  }
  const rad = props.rad

  const borja = (col: Column) => {
    setRedigerar(col.id)
    setUtkast(getCell(col, rad))
  }
  const spara = (col: Column) => {
    setRedigerar(null)
    props.onRatta(col, utkast)
  }

  return (
    <div class="raddetalj">
      <span class="raddetalj__rubrik">
        {props.rubrik}
        <span class="raddetalj__fil">{props.filnamn}</span>
      </span>
      <dl class="raddetalj__falt">
        {visibleColumns(props.frame).map((col) => {
          const varde = getCell(col, rad)
          return (
            <div class="raddetalj__rad" key={col.id}>
              <dt>{col.name}</dt>
              <dd>
                {redigerar === col.id ? (
                  <input
                    class="raddetalj__input"
                    value={utkast}
                    autoFocus
                    aria-label={`${col.name}`}
                    onInput={(e) => setUtkast((e.currentTarget as HTMLInputElement).value)}
                    onBlur={() => spara(col)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') spara(col)
                      if (e.key === 'Escape') setRedigerar(null)
                    }}
                  />
                ) : (
                  <button
                    class="raddetalj__varde"
                    title="Klicka för att rätta värdet i källfilen"
                    onClick={() => borja(col)}
                  >
                    {varde === '' ? <em class="restrad__tomt">tomt</em> : varde}
                  </button>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
