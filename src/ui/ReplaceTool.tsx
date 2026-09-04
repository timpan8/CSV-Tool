import { useEffect, useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis } from './parts.js'
import type { Column } from '../core/types.js'
import { TOM_ERSATTNING, byggErsattare, type Ersattning } from '../core/ops/replace.js'
import { beraknaForhandsvisning, sammanfatta, type Forhandsvisning } from '../state/preview.js'
import { formatCount } from '../core/locale/sv.js'
import { kolumnrubrik } from './verktyg.js'
import { celler, sprak, t, tf, tj } from './sprak.js'

/**
 * Sök och ersätt i de markerade kolumnerna.
 *
 * Verktyget erbjuder aldrig ”hela tabellen”. Det låter smidigt tills det
 * träffar en kolumn man inte tänkt på, och då är skadan gjord i tysthet.
 * Kolumnerna är de man själv markerat, och förhandsvisningen ritas i var och
 * en av dem — det är skillnaden mellan ett urval man gjort och ett svep man
 * inte överblickar.
 */
export function ReplaceTool(props: {
  kolumner: Column[]
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}) {
  const { kolumner } = props
  /*
   * Kolumnlistan är en ny array vid varje omritning, medan kolumnobjekten
   * är desamma. Att beroendeställa på arrayen skulle räkna om
   * förhandsvisningen varje gång, och effekten som skriver den till fliken
   * skulle rita om — en slinga. Nyckeln är identiteterna, inte arrayen.
   */
  const nyckel = kolumner.map((c) => c.id).join(',')
  const [inst, setInst] = useState<Ersattning>(TOM_ERSATTNING)

  const uppdatera = (delta: Partial<Ersattning>) => setInst((i) => ({ ...i, ...delta }))

  const { fn, fel } = useMemo(() => byggErsattare(inst), [inst])

  const forhLista = useMemo(
    () =>
      fn === null
        ? []
        : kolumner.map((col) =>
            beraknaForhandsvisning(col, {
              etikett: tf(
                'Ersatte ”{0}” med ”{1}” i ”{2}”',
                kort(inst.sok),
                kort(inst.ersatt),
                col.name,
              ),
              kind: 'replace',
              profil: { typ: 'ersatt', kolumn: col.name, inst },
              fn,
            }),
          ),
    [nyckel, props.dataRevision, fn, sprak.value],
  )
  const forh = forhLista.length === 0 ? null : sammanfatta(forhLista)

  useEffect(() => {
    props.onForhandsvisning(forhLista)
  }, [forhLista])

  useEffect(() => {
    return () => props.onForhandsvisning(null)
  }, [])

  return (
    <Verktygspanel
      titel={t('Sök och ersätt')}
      underrubrik={kolumnrubrik(kolumner)}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            {t('Avbryt')}
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh === null || forh.andrade === 0}
            title={forh !== null && forh.andrade === 0 ? t('Ingenting träffas.') : undefined}
            onClick={() => forh && props.onTillampa(forhLista)}
          >
            {kolumner.length > 1 ? tf('Ersätt i {0} kolumner', kolumner.length) : t('Ersätt')}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">{t('Sök efter')}</span>
        <input
          value={inst.sok}
          placeholder={inst.regex ? '^\\d{3} ?\\d{2}$' : t('text att hitta')}
          onInput={(e) => uppdatera({ sok: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">{t('Ersätt med')}</span>
        <input
          value={inst.ersatt}
          placeholder={t('lämna tomt för att radera träffen')}
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
          {t('Hela cellen')}
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={inst.versalkanslig}
            onChange={(e) =>
              uppdatera({ versalkanslig: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          {t('Skilj på VERSALER och gemener')}
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
          {t('Reguljärt uttryck')}
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
          {tj(
            'Strunta i å ä ö ({0} hittar {1})',
            <code>oberg</code>,
            <code>Öberg</code>,
          )}
        </label>
      </div>

      {/*
        `t()` på felet slår igenom för de meddelanden som är hela meningar.
        De som bär med sig regexmotorns egen text står kvar som de kommer —
        den texten är webbläsarens, inte vår.
      */}
      {fel !== null && <Notis ton="fara">{t(fel)}</Notis>}

      {inst.regex && fel === null && (
        <Notis ton="info">
          {tj(
            '{0} siffra · {1} blanksteg · {2} början · {3} slut · {4} grupp som {5} i ersättningen.',
            <code>\d</code>,
            <code>\s</code>,
            <code>^</code>,
            <code>$</code>,
            <code>(…)</code>,
            <code>$1</code>,
          )}
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Vad som händer')}</span>
        <p class="verktyg__sammanfattning verktyg__resultat">
          {forh === null
            ? t('Skriv något att söka efter.')
            : tj(
                '{0} av {1} ändras.',
                <strong>{formatCount(forh.andrade)}</strong>,
                celler(forh.ifyllda),
              )}
        </p>
        <div class="val" role="radiogroup">
          <button
            class={`val__knapp${props.visaBara === undefined ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === undefined}
            onClick={() => props.onVisaBara(undefined)}
          >
            {t('Alla rader')}
          </button>
          <button
            class={`val__knapp${props.visaBara === 'andrade' ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === 'andrade'}
            disabled={forh === null || forh.andrade === 0}
            onClick={() => props.onVisaBara('andrade')}
          >
            {t('Bara träffar')}
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
