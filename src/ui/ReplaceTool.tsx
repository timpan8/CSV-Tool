import { useEffect, useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis } from './parts.js'
import type { Column } from '../core/types.js'
import { TOM_ERSATTNING, byggErsattare, type Ersattning } from '../core/ops/replace.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

/**
 * Sök och ersätt i en kolumn.
 *
 * Verktyget är avsiktligt begränsat till en kolumn i taget. En ersättning
 * över hela tabellen låter smidigt tills den träffar en kolumn man inte tänkt
 * på, och då är skadan gjord i tysthet. Kolumn för kolumn, med
 * förhandsvisning, är den avvägning som gör verktyget ofarligt att prova.
 */
export function ReplaceTool(props: {
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}) {
  const { col } = props
  const [inst, setInst] = useState<Ersattning>(TOM_ERSATTNING)

  const uppdatera = (delta: Partial<Ersattning>) => setInst((i) => ({ ...i, ...delta }))

  const { fn, fel } = useMemo(() => byggErsattare(inst), [inst])

  const forh = useMemo(
    () =>
      fn === null
        ? null
        : beraknaForhandsvisning(col, {
            etikett: `Ersatte ”${kort(inst.sok)}” med ”${kort(inst.ersatt)}” i ”${col.name}”`,
            kind: 'replace',
            profil: { typ: 'ersatt', kolumn: col.name, inst },
            fn,
          }),
    [col, props.dataRevision, fn],
  )

  useEffect(() => {
    props.onForhandsvisning(forh)
  }, [forh])

  useEffect(() => {
    return () => props.onForhandsvisning(null)
  }, [])

  return (
    <Verktygspanel
      titel="Sök och ersätt"
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh === null || forh.andrade === 0}
            title={forh !== null && forh.andrade === 0 ? 'Ingenting träffas.' : undefined}
            onClick={() => forh && props.onTillampa(forh)}
          >
            Ersätt
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Sök efter</span>
        <input
          value={inst.sok}
          placeholder={inst.regex ? '^\\d{3} ?\\d{2}$' : 'text att hitta'}
          onInput={(e) => uppdatera({ sok: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Ersätt med</span>
        <input
          value={inst.ersatt}
          placeholder="lämna tomt för att radera träffen"
          onInput={(e) => uppdatera({ ersatt: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>

      <div class="faltrad">
        <label class="kryss">
          <input
            type="checkbox"
            checked={inst.helaCellen}
            onChange={(e) => uppdatera({ helaCellen: (e.currentTarget as HTMLInputElement).checked })}
          />
          Hela cellen
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={inst.versalkanslig}
            onChange={(e) =>
              uppdatera({ versalkanslig: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          Skilj på VERSALER och gemener
        </label>
      </div>

      <div class="faltrad">
        <label class="kryss">
          <input
            type="checkbox"
            checked={inst.regex}
            disabled={inst.accentokanslig}
            onChange={(e) => uppdatera({ regex: (e.currentTarget as HTMLInputElement).checked })}
          />
          Reguljärt uttryck
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={inst.accentokanslig}
            onChange={(e) =>
              uppdatera({
                accentokanslig: (e.currentTarget as HTMLInputElement).checked,
                // Accentokänslig matchning jämför hela värden; de två lägena
                // hör ihop och kan inte ställas in var för sig.
                helaCellen: (e.currentTarget as HTMLInputElement).checked ? true : inst.helaCellen,
                regex: (e.currentTarget as HTMLInputElement).checked ? false : inst.regex,
              })
            }
          />
          Strunta i å ä ö (<code>oberg</code> hittar <code>Öberg</code>)
        </label>
      </div>

      {fel !== null && <Notis ton="fara">{fel}</Notis>}

      {inst.regex && fel === null && (
        <Notis ton="info">
          <code>\d</code> siffra · <code>\s</code> blanksteg · <code>^</code> början ·{' '}
          <code>$</code> slut · <code>(…)</code> grupp som <code>$1</code> i ersättningen.
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">Vad som händer</span>
        <p class="verktyg__sammanfattning verktyg__resultat">
          {forh === null ? (
            'Skriv något att söka efter.'
          ) : (
            <>
              <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} ändras.
            </>
          )}
        </p>
        <div class="val" role="radiogroup">
          <button
            class={`val__knapp${props.visaBara === undefined ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === undefined}
            onClick={() => props.onVisaBara(undefined)}
          >
            Alla rader
          </button>
          <button
            class={`val__knapp${props.visaBara === 'andrade' ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === 'andrade'}
            disabled={forh === null || forh.andrade === 0}
            onClick={() => props.onVisaBara('andrade')}
          >
            Bara träffar
          </button>
        </div>
      </div>
    </Verktygspanel>
  )
}

function kort(value: string): string {
  if (value === '') return ''
  return value.length > 20 ? `${value.slice(0, 19)}…` : value
}
