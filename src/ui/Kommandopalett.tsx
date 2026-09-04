import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { sokKommandon, type Kommando } from './kommandon.js'
import { t, tf } from './sprak.js'

/**
 * Kommandopaletten.
 *
 * Verktyget har vuxit förbi vad en verktygsrad rymmer, och kolumnmenyn kräver
 * att man först vet vilken kolumn åtgärden hör till. Paletten är vägen för den
 * som vet *vad* hen vill göra men inte var knappen sitter.
 *
 * Den är inte en genväg förbi bekräftelser: varje kommando öppnar samma panel
 * eller dialog som knappen gör. Det som är farligt att göra av misstag ska
 * vara lika omständligt härifrån.
 */
export function Kommandopalett(props: { kommandon: readonly Kommando[]; onStang: () => void }) {
  const [fraga, setFraga] = useState('')
  const [vald, setVald] = useState(0)
  const listan = useRef<HTMLDivElement>(null)
  const faltet = useRef<HTMLInputElement>(null)

  // `autoFocus` är inte att lita på när elementet monteras mitt i en
  // omritning. En palett man måste klicka i innan man kan skriva är ingen
  // palett, så fokus sätts uttryckligen.
  useEffect(() => {
    faltet.current?.focus()
  }, [])

  const traffar = useMemo(() => sokKommandon(props.kommandon, fraga), [props.kommandon, fraga])
  const aktiv = Math.min(vald, Math.max(0, traffar.length - 1))

  // Håll det valda i sikte när man pilar sig nedåt i en lång lista.
  useEffect(() => {
    listan.current?.querySelector('.palett__post--vald')?.scrollIntoView({ block: 'nearest' })
  }, [aktiv, fraga])

  const kor = (kommando: Kommando | undefined) => {
    if (!kommando) return
    props.onStang()
    kommando.kor()
  }

  const onKey = (e: KeyboardEvent) => {
    // Paletten äger sina tangenter. Utan detta ser fönstrets hanterare samma
    // tryckning och växlar tillbaka det paletten just gjort — två hanterare
    // som turas om att öppna och stänga ser ut som att tangenten inte fungerar.
    e.stopPropagation()
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      props.onStang()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setVald(Math.min(aktiv + 1, traffar.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setVald(Math.max(aktiv - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      kor(traffar[aktiv])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onStang()
    }
  }

  let senasteGrupp = ''

  return (
    <div
      class="overlagg overlagg--palett"
      onMouseDown={(e) => e.target === e.currentTarget && props.onStang()}
    >
      <div class="palett" role="dialog" aria-modal="true" aria-label={t('Kommandon')}>
        <input
          ref={faltet}
          class="palett__falt"
          value={fraga}
          placeholder={t('Vad vill du göra?')}
          aria-label={t('Sök bland kommandon')}
          role="combobox"
          aria-expanded="true"
          aria-controls="palettlista"
          onInput={(e) => {
            setFraga((e.currentTarget as HTMLInputElement).value)
            setVald(0)
          }}
          onKeyDown={onKey}
        />
        <div class="palett__lista" id="palettlista" role="listbox" ref={listan}>
          {traffar.length === 0 && (
            <p class="palett__tomt">{tf('Inget kommando matchar ”{0}”.', fraga)}</p>
          )}
          {traffar.map((k, i) => {
            const nyGrupp = k.grupp !== senasteGrupp
            senasteGrupp = k.grupp
            return (
              <div key={k.id}>
                {nyGrupp && <div class="palett__grupp">{k.grupp}</div>}
                <button
                  class={`palett__post${i === aktiv ? ' palett__post--vald' : ''}`}
                  role="option"
                  aria-selected={i === aktiv}
                  onMouseEnter={() => setVald(i)}
                  onClick={() => kor(k)}
                >
                  <span class="palett__etikett">{k.etikett}</span>
                  {k.beskrivning && <span class="palett__text">{k.beskrivning}</span>}
                  {k.genvag && <span class="palett__genvag">{k.genvag}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
