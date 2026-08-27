import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
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
  kor: () => void
}

export function Meny(props: {
  x: number
  y: number
  poster: (MenyPost | 'avdelare')[]
  onStang: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onStang()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onStang()
    }
    // Fördröj så att klicket som öppnade menyn inte omedelbart stänger den.
    const timer = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [props.onStang])

  // Håll menyn innanför fönstret även när den öppnas nära kanten.
  const left = Math.min(props.x, window.innerWidth - 248)
  const top = Math.min(props.y, window.innerHeight - 40 - props.poster.length * 30)

  return (
    <div class="meny" ref={ref} style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }} role="menu">
      {props.poster.map((post, i) =>
        post === 'avdelare' ? (
          <div class="meny__avdelare" key={`a${i}`} />
        ) : (
          <button
            key={post.etikett}
            class={`meny__post${post.fara ? ' meny__post--fara' : ''}${
              post.aktiv ? ' meny__post--aktiv' : ''
            }`}
            role={post.aktiv === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={post.aktiv === undefined ? undefined : post.aktiv}
            onClick={() => {
              post.kor()
              props.onStang()
            }}
          >
            {post.etikett}
            {post.genvag && <span class="meny__genvag">{post.genvag}</span>}
          </button>
        ),
      )}
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
