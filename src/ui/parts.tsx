import { Component, type ComponentChildren } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { dismiss, toasts } from '../state/store.js'
import { t, tf } from './sprak.js'

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
          <button class="modal__stang" onClick={props.onStang} aria-label={t('Stäng')}>
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
  /** Extra klass på nivåns rot, för rotmenyns höjdtak. */
  extraKlass?: string
  /** Flytta fokus hit när nivån öppnas. */
  autofokus?: boolean
  /** Stäng den här nivån och lämna fokus till föräldern. */
  onTillbaka?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [oppen, setOppen] = useState<number | null>(null)
  const [oppnadMedTangent, setOppnadMedTangent] = useState(false)
  const [atVanster, setAtVanster] = useState(false)
  const [lyft, setLyft] = useState(0)

  useEffect(() => {
    if (props.autofokus !== false) knapparna(ref.current!)[0]?.focus()
  }, [])

  /*
   * En undermeny nära högerkanten fälls ut åt vänster, och en som når nedanför
   * fönsterkanten lyfts upp precis så mycket som behövs.
   *
   * Undermenyn börjar vid sin post, så ju längre ned i föräldern posten
   * ligger, desto större chans att undermenyn hamnar utanför. Lyftet är
   * begränsat till hur långt det finns plats uppåt — hellre en undermeny som
   * ligger kvar delvis utanför än en som skjuts upp förbi överkanten.
   *
   * Mätningen sker efter monteringen, eftersom både bredd och höjd beror på
   * posternas text.
   */
  useLayoutEffect(() => {
    if (!props.under) return
    const el = ref.current
    if (!el) return
    const lada = el.getBoundingClientRect()
    setAtVanster(lada.right > window.innerWidth - 8)
    const utanfor = lada.bottom - (window.innerHeight - 8)
    if (utanfor > 0) setLyft(Math.min(utanfor, Math.max(0, lada.top - 8)))
  }, [props.under])

  return (
    <div
      class={`meny${props.under ? ' meny--under' : ''}${atVanster ? ' meny--vanster' : ''}${
        props.extraKlass ? ` ${props.extraKlass}` : ''
      }`}
      ref={ref}
      style={lyft > 0 ? { ...props.style, top: `${-5 - lyft}px` } : props.style}
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

  /*
   * Menyn hålls innanför fönstret genom att den *mäts*, inte gissas.
   *
   * Tidigare räknades höjden som ”antal poster gånger 30 pixlar”. Den siffran
   * höll bara så länge varje post var en rad text; sedan posterna fick sitt
   * skäl på andra raden stämde den inte längre, och en meny som växte med en
   * post till kunde lägga sina sista val utanför skärmen — synliga i DOM:en,
   * omöjliga att klicka på. Det är den sortens fel som inte syns förrän
   * menyn råkar bli en post längre.
   *
   * `useLayoutEffect` körs efter att DOM:en skrivits men före ritningen, så
   * rättelsen hinner in utan att menyn syns hoppa. `.meny` har dessutom ett
   * tak för höjden och egen rullning, för en meny som är högre än fönstret
   * går inte att flytta in — den måste gå att rulla i.
   */
  const [plats, setPlats] = useState({ left: props.x, top: props.y, rullar: false })

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.meny')
    if (!el) return
    /*
     * `scrollHeight` och inte `getBoundingClientRect` för beslutet att rulla:
     * så fort taket satts är den mätta höjden lika med taket, och ett beslut
     * som läser den skulle slå av sig självt varje varv.
     */
    const tak = window.innerHeight - 16
    const rullar = el.scrollHeight > tak
    const { width, height } = el.getBoundingClientRect()
    setPlats({
      left: Math.max(8, Math.min(props.x, window.innerWidth - width - 8)),
      top: rullar ? 8 : Math.max(8, Math.min(props.y, window.innerHeight - height - 8)),
      rullar,
    })
  }, [props.x, props.y, props.poster.length])

  return (
    <div ref={ref} class="meny__rot">
      <Niva
        poster={props.poster}
        onStang={props.onStang}
        extraKlass={plats.rullar ? 'meny--rullar' : undefined}
        style={{ left: `${plats.left}px`, top: `${plats.top}px` }}
      />
    </div>
  )
}

/**
 * Felgränsen runt en hel vy.
 *
 * Ett kastat fel i en komponent utan gräns tar hela Preact-trädet med sig, och
 * då är sessionen borta — filerna, historiken, allt — för ett fel i en vy.
 * Gränsen kostar vyn och inget mer: det som står kvar är ett meddelande och
 * en knapp tillbaka. En klasskomponent, eftersom bara sådana kan fånga.
 */
export class Felgrans extends Component<
  { children: ComponentChildren; onStang: () => void },
  { fel: string | null }
> {
  override state = { fel: null as string | null }

  static getDerivedStateFromError(fel: unknown): { fel: string } {
    return { fel: fel instanceof Error ? fel.message : String(fel) }
  }

  override componentDidCatch(fel: unknown): void {
    console.error(fel)
  }

  override render() {
    if (this.state.fel === null) return this.props.children
    return (
      <div class="felgrans">
        <Notis ton="fara">{tf('Något gick fel i vyn: {0}', this.state.fel)}</Notis>
        <button
          class="knapp knapp--primar"
          onClick={() => {
            this.setState({ fel: null })
            this.props.onStang()
          }}
        >
          {t('Stäng vyn')}
        </button>
      </div>
    )
  }
}

export function Toastar() {
  return (
    <div class="toastar" aria-live="polite">
      {toasts.value.map((t) => (
        <div class={`toast toast--${t.ton}`} key={t.id}>
          <span>{t.message}</span>
          {(Array.isArray(t.atgard) ? t.atgard : t.atgard ? [t.atgard] : []).map((a) => (
            <button
              key={a.etikett}
              class="toast__atgard"
              onClick={() => {
                a.kor()
                dismiss(t.id)
              }}
            >
              {a.etikett}
            </button>
          ))}
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

/**
 * `valt: null` betyder att inget är valt — en fråga som ännu inte besvarats.
 *
 * **Etiketterna översätts här och inte i tabellerna de kommer ur.** De flesta
 * av dem bor i `src/core/ops/` — `FLERTRAFF`, `OMFATTNING`, datumformaten,
 * talformaten — och kärnan ska inte behöva veta att gränssnittet har ett
 * språkval. Den skriver svenska; uppslagningen sker på vägen ut. Ett `t()`
 * här räcker för samtliga anropsställen, och en tabell som läggs till senare
 * blir översättningsbar utan att någon behöver komma ihåg det.
 */
export function Val<T extends string>(props: {
  varden: readonly { varde: T; etikett: string; titel?: string; inaktiv?: string }[]
  valt: T | null
  onValj: (v: T) => void
  /** Gruppens namn för skärmläsaren — det ord som står som rubrik bredvid. */
  etikett?: string
}) {
  return (
    <div class="val" role="radiogroup" aria-label={props.etikett}>
      {props.varden.map((v) => (
        <button
          key={v.varde}
          class={`val__knapp${v.varde === props.valt ? ' val__knapp--vald' : ''}${v.inaktiv !== undefined ? ' val__knapp--inaktiv' : ''}`}
          role="radio"
          aria-checked={v.varde === props.valt}
          // Ett avstängt val säger sitt skäl. `aria-disabled` i stället för
          // `disabled`, så att knappen går att nå med tangentbordet och skälet
          // går att läsa — en knapp som bara inte går att klicka på lär ingen
          // något. Samma val som menyposterna gör.
          aria-disabled={v.inaktiv !== undefined}
          aria-label={v.inaktiv === undefined ? undefined : `${t(v.etikett)} — ${v.inaktiv}`}
          title={v.inaktiv ?? (v.titel === undefined ? undefined : t(v.titel))}
          onClick={() => {
            if (v.inaktiv !== undefined) return
            props.onValj(v.varde)
          }}
        >
          {t(v.etikett)}
        </button>
      ))}
    </div>
  )
}
