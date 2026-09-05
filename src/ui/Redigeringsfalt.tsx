import type { ComponentChildren, JSX } from 'preact'
import { formatCount } from '../core/locale/sv.js'
import type { Verktygsfalt } from '../state/store.js'
import {
  IkonAngra,
  IkonDubbletter,
  IkonFilter,
  IkonFleraFiler,
  IkonGorOm,
  IkonPivot,
  IkonSammanfatta,
  IkonSortera,
  IkonStada,
} from './ikoner.jsx'
import { t } from './sprak.js'

/**
 * Redigeringsfältet: knapparna som verkar på det öppna dokumentet.
 *
 * De låg förut i samma rad som *Öppna* och *Exportera*, och raden var full.
 * Här står de för sig, i tre grupper: historiken, det som ändrar vyn, och
 * det som skapar eller ändrar data. Öppna, profiler och export är filens
 * ärenden och ligger kvar i app-raden. Fältet finns bara när rutnätet syns:
 * ingen fil, ingen rad — och flerfilsvyerna, som ersätter rutnätet, har
 * sina egna knappar.
 *
 * **Placeringen är användarens val.** `lage` styr om fältet ligger som en rad
 * under flikarna eller som en spalt till vänster om kolumnpanelen. Markupen
 * är densamma i båda; bara CSS:en byter riktning. Det är därför knapparna
 * behåller sin text även lodrätt — en ikon utan ord är ett memoryspel, och
 * texten är dessutom det namn tester och skärmläsare känner igen knappen på.
 */
export interface RedigeringsfaltProps {
  lage: Verktygsfalt
  angra: { kan: boolean; antal: number; kor: () => void }
  goraOm: { kan: boolean; kor: () => void }
  /** Antal aktiva nivåer/regler/grupper; 0 eller null när verktyget är av. */
  sortera: { antal: number; kor: () => void }
  filter: { antal: number; kor: () => void }
  dubbletter: { antal: number | null; kor: () => void }
  /** Menyerna öppnas av appen, vid den punkt knappen anger. */
  stada: (x: number, y: number) => void
  fleraFiler: (x: number, y: number) => void
  sammanfatta: () => void
  pivot: () => void
}

export function Redigeringsfalt(props: RedigeringsfaltProps) {
  return (
    <div
      class={`redigeringsfalt redigeringsfalt--${props.lage}`}
      role="toolbar"
      aria-label={t('Redigering')}
      aria-orientation={props.lage === 'lodrat' ? 'vertical' : 'horizontal'}
    >
      <div class="redigeringsfalt__grupp">
        <Verktygsknapp
          ikon={<IkonAngra />}
          etikett={t('Ångra')}
          antal={props.angra.antal > 0 ? props.angra.antal : undefined}
          disabled={!props.angra.kan}
          title={t('Ångra (Ctrl+Z)')}
          onClick={props.angra.kor}
        />
        <Verktygsknapp
          ikon={<IkonGorOm />}
          etikett={t('Gör om')}
          disabled={!props.goraOm.kan}
          title={t('Gör om (Ctrl+Y)')}
          onClick={props.goraOm.kor}
        />
      </div>

      <span class="redigeringsfalt__avdelare" aria-hidden="true" />

      <div class="redigeringsfalt__grupp">
        <Verktygsknapp
          ikon={<IkonSortera />}
          etikett={t('Sortera')}
          antal={props.sortera.antal > 0 ? props.sortera.antal : undefined}
          aktiv={props.sortera.antal > 0}
          title={t('Flernivåsortering med svensk bokstavsordning. Ändrar bara ordningen, aldrig värdena.')}
          onClick={props.sortera.kor}
        />
        <Verktygsknapp
          ikon={<IkonFilter />}
          etikett={t('Filter')}
          antal={props.filter.antal > 0 ? props.filter.antal : undefined}
          aktiv={props.filter.antal > 0}
          title={t('Visa bara de rader som stämmer med dina regler. Raderna finns kvar.')}
          onClick={props.filter.kor}
        />
        <Verktygsknapp
          ikon={<IkonDubbletter />}
          etikett={t('Dubbletter')}
          antal={props.dubbletter.antal ?? undefined}
          aktiv={props.dubbletter.antal !== null}
          title={t('Hitta rader som är lika i de kolumner du väljer, och visa dem grupperade.')}
          onClick={props.dubbletter.kor}
        />
      </div>

      <span class="redigeringsfalt__avdelare" aria-hidden="true" />

      <div class="redigeringsfalt__grupp">
        <Verktygsknapp
          ikon={<IkonStada />}
          etikett={t('Städa')}
          meny
          title={t('Trimma blanksteg, ändra skiftläge och städa bort det osynliga i markeringen.')}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            props.stada(...menyplats(r, props.lage))
          }}
        />
        <Verktygsknapp
          ikon={<IkonSammanfatta />}
          etikett={t('Sammanfatta…')}
          title={t('En rad per grupp: summa Belopp per Ort, antal ordrar per kund. Resultatet blir en ny flik.')}
          onClick={props.sammanfatta}
        />
        <Verktygsknapp
          ikon={<IkonPivot />}
          etikett="Pivot"
          title={t(
            'Dra fält mellan Filter, Kolumner, Rader och Värden i en egen vy, och se summorna direkt. Datat rörs inte.',
          )}
          onClick={props.pivot}
        />
        <Verktygsknapp
          ikon={<IkonFleraFiler />}
          etikett={t('Flera filer')}
          meny
          title={t('Sätt ihop data ur flera filer — bredvid varandra, ovanpå varandra, eller in i en mall.')}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            props.fleraFiler(...menyplats(r, props.lage))
          }}
        />
      </div>
    </div>
  )
}

/** Menyn fälls ut under knappen i radläget, till höger om den i spaltläget. */
function menyplats(r: DOMRect, lage: Verktygsfalt): [number, number] {
  return lage === 'lodrat' ? [r.right + 4, r.top] : [r.left, r.bottom + 4]
}

/**
 * En knapp i fältet: ikon, text, och en liten siffra när verktyget är på.
 *
 * Texten är alltid med — se komponentens kommentar. `▾` står i texten på de
 * knappar som öppnar en meny, så att det syns *innan* man klickar att inget
 * händer direkt.
 *
 * Det tillgängliga namnet sätts uttryckligen, som `Sortera (1)` och
 * `Flera filer ▾` — samma namn knapparna hade när de var vanliga textknappar.
 * Pillen med siffran och pilen är bara utseende; utan `aria-label` skulle
 * namnet bli `Sortera1`, och sjuttiosex tester och varje skärmläsare som lärt
 * sig knapparna skulle behöva lära om.
 */
function Verktygsknapp(props: {
  ikon: ComponentChildren
  etikett: string
  antal?: number
  aktiv?: boolean
  meny?: boolean
  disabled?: boolean
  title?: string
  onClick: (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => void
}) {
  const namn =
    props.etikett +
    (props.antal !== undefined ? ` (${formatCount(props.antal)})` : '') +
    (props.meny ? ' ▾' : '')
  return (
    <button
      class={`verktygsknapp${props.aktiv ? ' verktygsknapp--aktiv' : ''}`}
      disabled={props.disabled}
      title={props.title}
      aria-label={namn}
      aria-pressed={props.aktiv === undefined ? undefined : props.aktiv}
      onClick={props.onClick}
    >
      <span class="verktygsknapp__ikon">{props.ikon}</span>
      <span class="verktygsknapp__text">
        {props.etikett}
        {props.antal !== undefined && (
          <>
            {/* Blanksteget syns inte i en flexbehållare, men det håller
                textinnehållet läsbart: "Ångra 1", inte "Ångra1". */}
            {' '}
            <span class="verktygsknapp__antal">{formatCount(props.antal)}</span>
          </>
        )}
        {props.meny && <span class="verktygsknapp__pil" aria-hidden="true"> ▾</span>}
      </span>
    </button>
  )
}
