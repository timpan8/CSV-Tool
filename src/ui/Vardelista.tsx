import { useMemo, useState } from 'preact/hooks'
import type { Column, Frame } from '../core/types.js'
import { valueCounts } from '../core/frame/column.js'
import { formatCount } from '../core/locale/sv.js'
import { t, tf } from './sprak.js'

/** Hur många värden listan visar innan den ber om en sökning i stället. */
const LISTTAK = 200

/**
 * Värdelistan för *är något av*.
 *
 * **Anroparen bestämmer vad antalen räknas på.** Filterbyggaren skickar in
 * raderna med den egna regeln avstängd — räknar man på den synliga vyn
 * försvinner alternativen medan man kryssar i dem, Excels klassiska
 * irritationsmoment, och räknar man på hela kolumnen ignoreras de andra
 * reglerna. Pivotens filterruta har samma fråga att svara på, och därför tar
 * listan raderna som en parameter i stället för att lista ut dem själv.
 */
export function Vardelista(props: {
  frame: Frame
  col: Column
  /** Underlaget antalen räknas på. */
  rader: Uint32Array
  valda: readonly string[]
  onValda: (varden: string[]) => void
}) {
  const [sok, setSok] = useState('')
  const valda = new Set(props.valda)

  const poster = useMemo(() => {
    const antal = valueCounts(props.col, props.rader)
    const lista: { varde: string; antal: number }[] = []
    for (let kod = 1; kod < props.col.dict.length; kod++) {
      if (antal[kod]! > 0) lista.push({ varde: props.col.dict[kod]!, antal: antal[kod]! })
    }
    lista.sort((a, b) => b.antal - a.antal || a.varde.localeCompare(b.varde, 'sv'))
    return lista
  }, [props.col, props.rader])

  const synliga = poster.filter((p) => p.varde.toLowerCase().includes(sok.toLowerCase()))

  return (
    <div class="vardelista">
      <input
        type="search"
        placeholder={tf('Sök bland {0} värden…', formatCount(poster.length))}
        value={sok}
        onInput={(e) => setSok((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="vardelista__poster">
        {synliga.slice(0, LISTTAK).map((p) => (
          <label class="kryss vardelista__post" key={p.varde}>
            <input
              type="checkbox"
              checked={valda.has(p.varde)}
              onChange={(e) => {
                const nya = new Set(valda)
                if ((e.currentTarget as HTMLInputElement).checked) nya.add(p.varde)
                else nya.delete(p.varde)
                props.onValda([...nya])
              }}
            />
            <span class="vardelista__text">{p.varde}</span>
            <span class="insp__antal">{formatCount(p.antal)}</span>
          </label>
        ))}
        {synliga.length > LISTTAK && (
          <p class="verktyg__sammanfattning">
            {tf(
              'Visar de {0} vanligaste av {1} värden. Sök för att hitta fler.',
              formatCount(LISTTAK),
              formatCount(synliga.length),
            )}
          </p>
        )}
        {synliga.length === 0 && <p class="verktyg__sammanfattning">{t('Inga värden matchar.')}</p>}
      </div>
    </div>
  )
}
