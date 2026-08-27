import type { ComponentChildren } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { dismiss, toasts } from '../state/store.js'

export function Modal(props: {
  titel: string
  underrubrik?: string
  onStang: () => void
  fot: ComponentChildren
  children: ComponentChildren
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onStang()
    }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onStang])

  return (
    <div class="overlagg" onMouseDown={(e) => e.target === e.currentTarget && props.onStang()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={props.titel} tabIndex={-1} ref={ref}>
        <div class="modal__rubrik">
          <h2>{props.titel}</h2>
          {props.underrubrik && <span class="modal__underrubrik">{props.underrubrik}</span>}
          <button class="modal__stang" onClick={props.onStang} aria-label="Stäng">
            ✕
          </button>
        </div>
        <div class="modal__kropp">{props.children}</div>
        <div class="modal__fot">{props.fot}</div>
      </div>
    </div>
  )
}

export interface MenyPost {
  etikett: string
  genvag?: string
  fara?: boolean
  /** Markerar posten som det nuvarande valet, t.ex. sorteringens riktning. */
  aktiv?: boolean
  /** Kort förklaring efter etiketten: ”14 av 16 ser ut som adresser”. */
  skal?: string
  /** Undermeny. Posten öppnar den i stället för att köra något. */
  undermeny?: (MenyPost | 'avdelare')[]
  /** Skäl till att posten inte går att välja. Visas som förklaring. */
  inaktiv?: string
  kor?: () => void
}

/** Postens knappar på den här nivån, i DOM-ordning. */
function knapparna(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      ':scope > .meny__post, :scope > .meny__grupp > .meny__post',
    ),
  )
}

function flyttaFokus(container: HTMLElement, steg: number): void {
  const knappar = knapparna(container)
  if (knappar.length === 0) return
  const nu = knappar.indexOf(document.activeElement as HTMLButtonElement)
  const nasta =
    nu === -1
      ? steg > 0
        ? 0
        : knappar.length - 1
      : (nu + steg + knappar.length) % knappar.length
  knappar[nasta]!.focus()
}

/**
 * En menynivå.
 *
 * Menyn tar fokus när den öppnas. Utan det skulle piltangenterna gå till
 * rutnätet bakom och flytta markeringen medan menyn står öppen — och
 * tangentbordet är hela poängen med att menyn också går att nå med
 * menytangenten.
 */
function Niva(props: {
  poster: (MenyPost | 'avdelare')[]
  onStang: () => void
  style?: Record<string, string>
  /** Sant för en undermeny: placeras intill sin förälder i stället för fritt. */
  under?: boolean
  /** Flytta fokus hit när nivån öppnas. */
  autofokus?: boolean
  /** Stäng den här nivån och lämna fokus till föräldern. */
  onTillbaka?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [oppen, setOppen] = useState<number | null>(null)
  const [oppnadMedTangent, setOppnadMedTangent] = useState(false)
  const [atVanster, setAtVanster] = useState(false)

  useEffect(() => {
    if (props.autofokus !== false) knapparna(ref.current!)[0]?.focus()
  }, [])

  // En undermeny nära högerkanten fälls ut åt vänster i stället. Mätningen
  // sker efter monteringen, eftersom bredden beror på postens text.
  useLayoutEffect(() => {
    if (!props.under) return
    const el = ref.current
    if (!el) return
    setAtVanster(el.getBoundingClientRect().right > window.innerWidth - 8)
  }, [props.under])

  return (
    <div
      class={`meny${props.under ? ' meny--under' : ''}${atVanster ? ' meny--vanster' : ''}`}
      ref={ref}
      style={props.style}
      role="menu"
      onKeyDown={(e) => {
        // Menyns tangenter är menyns. Utan stoppet flyttar rutnätet
        // markeringen bakom en öppen meny.
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          e.stopPropagation()
          flyttaFokus(ref.current!, e.key === 'ArrowDown' ? 1 : -1)
        } else if (e.key === 'ArrowLeft' && props.onTillbaka) {
          e.preventDefault()
          e.stopPropagation()
          props.onTillbaka()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          if (props.onTillbaka) props.onTillbaka()
          else props.onStang()
        } else if (e.key !== 'Tab') {
          e.stopPropagation()
        }
      }}
    >
      {props.poster.map((post, i) => {
        if (post === 'avdelare') return <div class="meny__avdelare" key={`a${i}`} />

        const knapp = (
          <button
            key={post.etikett}
            class={`meny__post${post.fara ? ' meny__post--fara' : ''}${
              post.aktiv ? ' meny__post--aktiv' : ''
            }${post.skal ? ' meny__post--medskal' : ''}${
              post.inaktiv ? ' meny__post--inaktiv' : ''
            }`}
            role={post.aktiv === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={post.aktiv === undefined ? undefined : post.aktiv}
            aria-haspopup={post.undermeny ? 'menu' : undefined}
            aria-expanded={post.undermeny ? oppen === i : undefined}
            /*
             * En avstängd post står kvar och går att nå med piltangenterna.
             * Skälet är det man behövde veta — `disabled` skulle dölja både
             * posten och förklaringen till varför den inte går att välja.
             */
            aria-disabled={post.inaktiv !== undefined}
            title={post.inaktiv}
            onKeyDown={(e) => {
              if (post.undermeny && e.key === 'ArrowRight') {
                e.preventDefault()
                e.stopPropagation()
                setOppen(i)
                setOppnadMedTangent(true)
              }
            }}
            onClick={() => {
              if (post.inaktiv !== undefined) return
              if (post.undermeny) {
                setOppen((nu) => (nu === i ? null : i))
                setOppnadMedTangent(true)
                return
              }
              post.kor?.()
              props.onStang()
            }}
          >
            <span class="meny__etikett">{post.etikett}</span>
            {post.skal && <span class="meny__skal">{post.skal}</span>}
            {post.genvag && <span class="meny__genvag">{post.genvag}</span>}
            {post.undermeny && (
              <span class="meny__pil" aria-hidden="true">
                ›
              </span>
            )}
          </button>
        )

        if (!post.undermeny) return knapp

        return (
          <div
            class="meny__grupp"
            key={post.etikett}
            onMouseEnter={() => {
              setOppen(i)
              setOppnadMedTangent(false)
            }}
            onMouseLeave={() => setOppen((nu) => (nu === i ? null : nu))}
          >
            {knapp}
            {oppen === i && (
              <Niva
                poster={post.undermeny}
                onStang={props.onStang}
                under
                autofokus={oppnadMedTangent}
                onTillbaka={() => {
                  setOppen(null)
                  const knappar = knapparna(ref.current!)
                  knappar.find((k) => k.textContent?.startsWith(post.etikett))?.focus()
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Meny(props: {
  x: number
  y: number
  poster: (MenyPost | 'avdelare')[]
  onStang: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  /*
   * Escape hanteras på två ställen, och inget av dem är här.
   *
   * Står fokus i menyn tar `Niva` hand om den och stoppar händelsen. Står
   * fokus någon annanstans fångar appens fönsterhanterare den. Att lägga en
   * tredje lyssnare här vore inte bara en dubblett — den skulle registreras
   * i en effekt, och effekter körs efter ritningen. Menyn kan alltså stå på
   * skärmen innan lyssnaren finns, och då når Escape ingen alls. Appen läser
   * i stället menyns läge ur en ref som skrivs under renderingen.
   */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onStang()
    }
    // Fördröj så att klicket som öppnade menyn inte omedelbart stänger den.
    const timer = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDown)
    }
  }, [props.onStang])

  // Håll menyn innanför fönstret även när den öppnas nära kanten.
  const left = Math.min(props.x, window.innerWidth - 248)
  const top = Math.min(props.y, window.innerHeight - 40 - props.poster.length * 30)

  return (
    <div ref={ref} class="meny__rot">
      <Niva
        poster={props.poster}
        onStang={props.onStang}
        style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }}
      />
    </div>
  )
}

export function Toastar() {
  return (
    <div class="toastar" aria-live="polite">
      {toasts.value.map((t) => (
        <div class={`toast toast--${t.ton}`} key={t.id}>
          <span>{t.message}</span>
          {t.atgard && (
            <button
              class="toast__atgard"
              onClick={() => {
                t.atgard!.kor()
                dismiss(t.id)
              }}
            >
              {t.atgard.etikett}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function Notis(props: {
  ton: 'lyckat' | 'varning' | 'info' | 'fara'
  children: ComponentChildren
}) {
  const ikon = { lyckat: '✓', varning: '!', info: 'i', fara: '✕' }[props.ton]
  return (
    <div class={`notis notis--${props.ton}`}>
      <strong aria-hidden="true">{ikon}</strong>
      <div class="notis__text">{props.children}</div>
    </div>
  )
}

/** `valt: null` betyder att inget är valt — en fråga som ännu inte besvarats. */
export function Val<T extends string>(props: {
  varden: readonly { varde: T; etikett: string; titel?: string }[]
  valt: T | null
  onValj: (v: T) => void
}) {
  return (
    <div class="val" role="radiogroup">
      {props.varden.map((v) => (
        <button
          key={v.varde}
          class={`val__knapp${v.varde === props.valt ? ' val__knapp--vald' : ''}`}
          role="radio"
          aria-checked={v.varde === props.valt}
          title={v.titel}
          onClick={() => props.onValj(v.varde)}
        >
          {v.etikett}
        </button>
      ))}
    </div>
  )
}
