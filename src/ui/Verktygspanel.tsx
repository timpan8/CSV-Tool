import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import { t } from './sprak.js'

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
        <button class="modal__stang" onClick={props.onStang} aria-label={t('Stäng')}>
          ✕
        </button>
      </div>
      <div class="verktyg__kropp">{props.children}</div>
      <div class="verktyg__fot">{props.fot}</div>
    </aside>
  )
}

/**
 * Sammanfattningen och filterknapparna, delade av alla verktyg.
 *
 * Siffran och möjligheten att se just de berörda raderna hör ihop: ett tal
 * utan väg till raderna bakom sig är en uppmaning att lita på verktyget, och
 * det är precis vad det här gränssnittet försöker slippa be om.
 */
export function Resultat(props: {
  /** Sammanfattningen i ord. */
  children: ComponentChildren
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  andrade: number
  problem: number
  /** Etiketterna för de två filterknapparna. */
  etikettAndrade?: string
  etikettProblem?: string
}) {
  const knapp = (
    varde: 'andrade' | 'problem' | undefined,
    etikett: string,
    avstangd: boolean,
  ) => (
    <button
      class={`val__knapp${props.visaBara === varde ? ' val__knapp--vald' : ''}`}
      role="radio"
      aria-checked={props.visaBara === varde}
      disabled={avstangd}
      onClick={() => props.onVisaBara(varde)}
    >
      {etikett}
    </button>
  )

  return (
    <div class="falt">
      <span class="falt__etikett">{t('Vad som händer')}</span>
      <p class="verktyg__sammanfattning verktyg__resultat">{props.children}</p>
      <div class="val" role="radiogroup">
        {knapp(undefined, t('Alla rader'), false)}
        {knapp('andrade', t(props.etikettAndrade ?? 'Bara ändrade'), props.andrade === 0)}
        {props.etikettProblem !== undefined &&
          knapp('problem', t(props.etikettProblem), props.problem === 0)}
      </div>
    </div>
  )
}
