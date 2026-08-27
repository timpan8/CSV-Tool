import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'

/**
 * Sidopanelen som städverktygen bor i.
 *
 * Den är medvetet **inte** en modal. Ett verktyg vars hela poäng är att visa
 * vad det kommer göra med tabellen får inte ligga ovanpå tabellen. Panelen tar
 * inspektörens plats till höger, och rutnätet fortsätter att rulla, markera
 * och visa förhandsvisningen medan man ställer in.
 */
export function Verktygspanel(props: {
  titel: string
  underrubrik?: string
  onStang: () => void
  fot: ComponentChildren
  children: ComponentChildren
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape stänger, men inte medan man skriver i ett fält — där betyder
      // Escape "ångra det jag skrev".
      const mal = e.target as HTMLElement | null
      if (e.key === 'Escape' && mal?.tagName !== 'INPUT') props.onStang()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onStang])

  return (
    <aside class="verktyg" aria-label={props.titel}>
      <div class="verktyg__rubrik">
        <div>
          <h2>{props.titel}</h2>
          {props.underrubrik && <span class="verktyg__underrubrik">{props.underrubrik}</span>}
        </div>
        <button class="modal__stang" onClick={props.onStang} aria-label="Stäng">
          ✕
        </button>
      </div>
      <div class="verktyg__kropp">{props.children}</div>
      <div class="verktyg__fot">{props.fot}</div>
    </aside>
  )
}
