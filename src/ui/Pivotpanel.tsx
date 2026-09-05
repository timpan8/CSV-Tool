import { useMemo, useRef, useState } from 'preact/hooks'
import { Meny, type MenyPost } from './parts.js'
import { Vardelista } from './Vardelista.js'
import { arFildrag, startaDrag } from './drag.js'
import { utanEgenRegel } from './filterrader.js'
import { matvardenamn } from './matvarde.js'
import type { Column, ColumnId, Frame } from '../core/types.js'
import { findColumn, identityView, visibleColumns } from '../core/frame/frame.js'
import { TYPE_LABELS } from '../core/infer.js'
import { nyRegelId, type Filterregel } from '../core/ops/filter.js'
import { berakningspost, type Berakning, type Berakningstyp } from '../core/ops/gruppera.js'
import { nyttMatvardeId, pivotberakningar, type Pivotplan } from '../core/ops/pivot.js'
import { formatCount } from '../core/locale/sv.js'
import { t, tf } from './sprak.js'

/**
 * Pivotens fältpanel.
 *
 * Fyra rutor — Filter, Kolumner, Rader, Värden — och en lista att dra fält
 * ifrån. Det är Excels arbetssätt, och skälet att härma det är inte att härma:
 * det är att *var* ett fält ligger är hela frågan man ställer, och fyra rutor
 * visar den frågan i ett ögonkast där fyra rullgardiner bara visade sina egna
 * svar.
 *
 * **Dra och släpp är webbläsarens eget**, med husets mönster: `draggable`,
 * tillståndet i komponenten, `--slappmal` som ritar accentlinjen. Två saker
 * skiljer sig från de äldre dragytorna, och båda är lärdomar. Chipen är
 * **komponenter på modulnivå**, inte funktioner inuti renderingen — en
 * funktion som skapas om vid varje rendering är en ny komponenttyp för Preact,
 * som då river och bygger om varje chip vid varje `dragover`, och en
 * dragkälla som försvinner ur dokumentet mitt i dragningen är en dragning som
 * aldrig kommer fram. Och `dragstart` skriver i `dataTransfer`, för utan det
 * startar Firefox ingen dragning alls.
 *
 * **Och varje chip har en meny som gör samma sak utan mus.** Det är inte en
 * artighet: verktygets äldre dragytor har ingen tangentbordsväg alls, och det
 * hålet ska inte ärvas av en till. Menyn är dessutom det som gör panelen
 * testbar — ett klick går att skriva i ett e2e-test, en dragrörelse sämre.
 */

export type Ruta = 'filter' | 'kolumner' | 'rader' | 'varden'

/** Rutorna, i den ordning Excel har dem. Exporterad så att ordboksvakten når orden. */
export const RUTOR: { ruta: Ruta; namn: string; hjalp: string }[] = [
  { ruta: 'filter', namn: 'Filter', hjalp: 'Vad som räknas med. Utan valda värden gäller alla.' },
  { ruta: 'kolumner', namn: 'Kolumner', hjalp: 'Fälten i sidled. Flera fält nästlas utifrån och in.' },
  { ruta: 'rader', namn: 'Rader', hjalp: 'Fälten på höjden. Flera fält ger nivåer med delsummor.' },
  { ruta: 'varden', namn: 'Värden', hjalp: 'Vad som räknas i varje cell.' },
]

const rutnamn = (ruta: Ruta): string => t(RUTOR.find((r) => r.ruta === ruta)!.namn)

/** Varifrån något dras: fältlistan, eller en plats i en ruta. */
export type Grepp = { kalla: 'falt'; colId: ColumnId } | { kalla: Ruta; index: number }

/** Var det skulle hamna: före plats `index` i en ruta, eller ut ur pivoten. */
type Mal = { ruta: Ruta; index: number } | { ruta: 'bort' }

/**
 * Varför en flytt inte går.
 *
 * Tre skäl, och alla tre ska stå i klartext på menyposten. En post som ser
 * klickbar ut och gör ingenting lär ingen något.
 */
export type Flyttsvar =
  | { plan: Partial<Pivotplan> }
  | { fel: 'finnsRedan'; ruta: Ruta }
  | { fel: 'saknarKolumn' | 'borttagen' }

function utan<T>(lista: readonly T[], i: number): T[] {
  return lista.filter((_, j) => j !== i)
}

function iSats<T>(lista: readonly T[], i: number, x: T): T[] {
  const ny = [...lista]
  ny.splice(Math.max(0, Math.min(i, ny.length)), 0, x)
  return ny
}

/**
 * Ett nytt mätvärde av ett fält.
 *
 * Ett tal summeras, allt annat räknas. Det är gissningen Excel gör, och den
 * är rätt nästan alltid — men den syns i chipet och går att ändra på ett klick,
 * vilket är skillnaden mellan att gissa och att gissa tyst.
 */
function nyttMatvarde(col: Column): Berakning {
  const typ: Berakningstyp = col.type === 'number' ? 'summa' : 'ifyllda'
  return { id: nyttMatvardeId(), typ, colId: col.id, namn: '' }
}

/** Mätvärdet *Antal rader*: det enda som inte behöver en kolumn. */
function antalRader(): Berakning {
  return { id: nyttMatvardeId(), typ: 'antal', colId: null, namn: '' }
}

/**
 * Byt beräkning på ett mätvärde, och håll kolumnen i takt.
 *
 * *Antal rader* har ingen kolumn att räkna på, och allt annat måste ha en.
 * Utan den här kopplingen kunde ett mätvärde stå som *Summa* utan kolumn och
 * ge tomma celler utan att säga varför. Saknas kolumn tas en talkolumn i
 * första hand — en summa av ett ortnamn är ingen summa.
 */
function bytBerakning(m: Berakning, typ: Berakningstyp, synliga: readonly Column[]): Berakning {
  const post = berakningspost(typ)
  if (!post.behoverKolumn) return { ...m, typ, colId: null }
  const forsta = synliga.find((c) => c.type === 'number')?.id ?? synliga[0]?.id ?? null
  return { ...m, typ, colId: m.colId ?? forsta }
}

/**
 * En ny filterregel: *är något av*, utan valda värden — alltså allt.
 *
 * Skiftlägeskänslig när pivoten är det. Grupperingen skiljer på `Malmö` och
 * `malmö` som förval, och ett filter som slog ihop dem hade kryssat i en rad
 * man inte kunde se.
 */
function nyRegel(colId: ColumnId, plan: Pivotplan): Filterregel {
  return {
    id: nyRegelId(),
    colId,
    operator: 'iLista',
    varde: '',
    varden: [],
    versalkanslig: !plan.strunta.skiftlage,
    av: false,
  }
}

function kolumnFor(plan: Pivotplan, grepp: Grepp): ColumnId | null {
  switch (grepp.kalla) {
    case 'falt':
      return grepp.colId
    case 'rader':
      return plan.rader[grepp.index] ?? null
    case 'kolumner':
      return plan.kolumner[grepp.index] ?? null
    case 'filter':
      return plan.filter.regler[grepp.index]?.colId ?? null
    case 'varden':
      return plan.matvarden[grepp.index]?.colId ?? null
  }
}

/**
 * Flytta ett fält till en plats i en ruta, och räkna ut hela planen på nytt.
 *
 * Rutorna bär olika saker — en kolumn, en regel, ett mätvärde — så en flytt
 * mellan två av dem är en översättning och inte en förflyttning. Tre regler
 * styr översättningen:
 *
 * **Rader och Kolumner delar på fälten.** Samma fält i båda ger en diagonal av
 * tomma celler, så ett fält som läggs i den ena tas ur den andra — det är en
 * flytt, som i Excel, inte ett nej.
 *
 * **Filter tar ett fält en gång.** Två regler på samma kolumn hade filtrerat
 * mot varandra utan att någon såg det.
 *
 * **Värden tar samma fält flera gånger.** Summa Belopp bredvid Snitt Belopp
 * är en vanlig fråga.
 *
 * Omordning inom en ruta behöver ingen kolumn alls — *Antal rader* saknar en
 * och ska ändå gå att flytta upp och ned.
 */
export function flytta(
  plan: Pivotplan,
  frame: Frame,
  grepp: Grepp,
  till: Ruta,
  index: number,
): Flyttsvar {
  let rader = plan.rader
  let kolumner = plan.kolumner
  let matvarden: readonly Berakning[] = plan.matvarden
  let regler = plan.filter.regler

  if (grepp.kalla === till) {
    // Målplatsen glider ett steg när det som flyttas plockats bort framför den.
    const i = grepp.index < index ? index - 1 : index
    const flyttaInom = <T,>(lista: readonly T[]): T[] =>
      iSats(utan(lista, grepp.index), i, lista[grepp.index]!)
    switch (till) {
      case 'rader':
        return { plan: { rader: flyttaInom(rader) } }
      case 'kolumner':
        return { plan: { kolumner: flyttaInom(kolumner) } }
      case 'varden':
        return { plan: { matvarden: flyttaInom(matvarden) } }
      case 'filter':
        return { plan: { filter: { ...plan.filter, regler: flyttaInom(regler) } } }
    }
  }

  const colId = kolumnFor(plan, grepp)
  if (colId === null) return { fel: 'saknarKolumn' }
  const col = findColumn(frame, colId)
  if (!col) return { fel: 'borttagen' }

  if (grepp.kalla === 'rader') rader = utan(rader, grepp.index)
  if (grepp.kalla === 'kolumner') kolumner = utan(kolumner, grepp.index)
  if (grepp.kalla === 'varden') matvarden = utan(matvarden, grepp.index)
  if (grepp.kalla === 'filter') regler = utan(regler, grepp.index)

  switch (till) {
    case 'rader':
      if (rader.includes(colId)) return { fel: 'finnsRedan', ruta: 'rader' }
      kolumner = kolumner.filter((id) => id !== colId)
      rader = iSats(rader, index, colId)
      break
    case 'kolumner':
      if (kolumner.includes(colId)) return { fel: 'finnsRedan', ruta: 'kolumner' }
      rader = rader.filter((id) => id !== colId)
      kolumner = iSats(kolumner, index, colId)
      break
    case 'varden':
      matvarden = iSats(matvarden, index, nyttMatvarde(col))
      break
    case 'filter':
      if (regler.some((r) => r.colId === colId)) return { fel: 'finnsRedan', ruta: 'filter' }
      regler = iSats(regler, index, nyRegel(colId, plan))
      break
  }

  return { plan: { rader, kolumner, matvarden, filter: { ...plan.filter, regler } } }
}

/** Skälet i klartext, för menyposten som inte går att välja. */
function felText(svar: Flyttsvar): string | undefined {
  if ('plan' in svar) return undefined
  switch (svar.fel) {
    case 'saknarKolumn':
      return t('Fältet har ingen kolumn att gruppera på.')
    case 'finnsRedan':
      return tf('Fältet ligger redan i {0}.', rutnamn(svar.ruta))
    case 'borttagen':
      return t('Kolumnen finns inte längre.')
  }
}

/** Ta bort det som ligger på en plats i en ruta. */
export function taBort(plan: Pivotplan, ruta: Ruta, index: number): Partial<Pivotplan> {
  switch (ruta) {
    case 'rader':
      return { rader: utan(plan.rader, index) }
    case 'kolumner':
      return { kolumner: utan(plan.kolumner, index) }
    case 'varden':
      return { matvarden: utan(plan.matvarden, index) }
    case 'filter':
      return { filter: { ...plan.filter, regler: utan(plan.filter.regler, index) } }
  }
}

/** Hur många chips en ruta innehåller. */
function langd(plan: Pivotplan, ruta: Ruta): number {
  if (ruta === 'rader') return plan.rader.length
  if (ruta === 'kolumner') return plan.kolumner.length
  if (ruta === 'varden') return plan.matvarden.length
  return plan.filter.regler.length
}

/** Rutorna ett fält ligger i, för märkningen i fältlistan. */
function anvandsI(plan: Pivotplan, colId: ColumnId): Ruta[] {
  const ut: Ruta[] = []
  if (plan.filter.regler.some((r) => r.colId === colId)) ut.push('filter')
  if (plan.kolumner.includes(colId)) ut.push('kolumner')
  if (plan.rader.includes(colId)) ut.push('rader')
  if (plan.matvarden.some((m) => m.colId === colId)) ut.push('varden')
  return ut
}

/**
 * Ett chip i en ruta: greppet, namnet och menyknappen.
 *
 * Släppet landar *före* chipet när pekaren är i dess övre halva och *efter*
 * när den är i den nedre — annars går det inte att lägga något direkt under
 * det sista chipet, och inte heller att flytta ett chip ett steg nedåt.
 */
function Chip(props: {
  index: number
  etikett: string
  bikst?: string
  /** `undefined` när chipet inte har något att fälla ut. */
  oppen?: boolean
  panelId?: string
  slappmal: boolean
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent, efter: boolean) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
  onOppna?: () => void
  onMeny: (e: MouseEvent) => void
}) {
  const klasser = ['pivotruta__chip']
  if (props.slappmal) klasser.push('pivotruta__chip--slappmal')
  return (
    <div
      class={klasser.join(' ')}
      draggable
      onDragStart={props.onDragStart}
      onDragOver={(e) => {
        const matt = (e.currentTarget as HTMLElement).getBoundingClientRect()
        props.onDragOver(e, e.clientY > matt.top + matt.height / 2)
      }}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
    >
      <span class="kolrad__grepp" aria-hidden="true">
        ⠿
      </span>
      {props.oppen !== undefined ? (
        <button
          class="pivotruta__namn"
          aria-expanded={props.oppen}
          aria-controls={props.panelId}
          onClick={props.onOppna}
        >
          <span class="pivotruta__pil" aria-hidden="true">
            {props.oppen ? '▾' : '▸'}
          </span>
          {props.etikett}
          {props.bikst !== undefined && <span class="pivotruta__bikst">{props.bikst}</span>}
        </button>
      ) : (
        <span class="pivotruta__namn">{props.etikett}</span>
      )}
      <button
        class="pivotruta__meny"
        aria-haspopup="menu"
        aria-label={tf('Åtgärder för {0}', props.etikett)}
        title={tf('Åtgärder för {0}', props.etikett)}
        onClick={props.onMeny}
      >
        ⋯
      </button>
    </div>
  )
}

/**
 * Rutans botten: det som säger *dra hit* när rutan är tom, och det som tar
 * emot ett släpp efter sista chipet. Streckad bara när den behövs — en tom
 * ruta, eller en pågående dragning — så att fyllda rutor inte ser ut att ha
 * en extra tom plats.
 */
function Botten(props: {
  tom: boolean
  drar: boolean
  slappmal: boolean
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}) {
  const klasser = ['pivotruta__botten']
  if (props.tom || props.drar) klasser.push('pivotruta__botten--synlig')
  if (props.slappmal) klasser.push('pivotruta__botten--slappmal')
  return (
    <div class={klasser.join(' ')} onDragOver={props.onDragOver} onDrop={props.onDrop}>
      {props.tom && <span class="pivotruta__tom">{t('Dra hit ett fält')}</span>}
    </div>
  )
}

/**
 * Ett mätvärdes två val: vad som räknas, och på vilken kolumn.
 *
 * *Antal rader* har ingen kolumn att räkna på och säger det i stället för att
 * visa en rullgardin som inte betyder något.
 */
function Matvardeinstallningar(props: {
  id: string
  etikett: string
  matvarde: Berakning
  synliga: readonly Column[]
  onAndra: (delta: Partial<Berakning>) => void
}) {
  const post = berakningspost(props.matvarde.typ)
  return (
    <div
      id={props.id}
      class="pivotruta__inst"
      role="group"
      aria-label={tf('Inställningar för {0}', props.etikett)}
    >
      <label class="falt">
        <span class="falt__etikett">{t('Beräkning')}</span>
        <select
          value={props.matvarde.typ}
          title={t(post.hjalp)}
          onChange={(e) =>
            props.onAndra(
              bytBerakning(
                props.matvarde,
                (e.currentTarget as HTMLSelectElement).value as Berakningstyp,
                props.synliga,
              ),
            )
          }
        >
          {pivotberakningar().map((b) => (
            <option key={b.typ} value={b.typ}>
              {t(b.etikett)}
            </option>
          ))}
        </select>
      </label>
      {post.behoverKolumn ? (
        <label class="falt">
          <span class="falt__etikett">{t('Kolumn att räkna på')}</span>
          <select
            value={props.matvarde.colId ?? ''}
            onChange={(e) =>
              props.onAndra({ colId: (e.currentTarget as HTMLSelectElement).value })
            }
          >
            {props.synliga.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span class="pivot__allarader">{t('alla rader')}</span>
      )}
    </div>
  )
}

export function Pivotpanel(props: {
  frame: Frame
  plan: Pivotplan
  onPlan: (delta: Partial<Pivotplan>) => void
  onStang: () => void
}) {
  const { frame, plan } = props
  const synliga = visibleColumns(frame)
  const [sok, setSok] = useState('')
  const [drar, setDrar] = useState<Grepp | null>(null)
  const [mal, setMal] = useState<Mal | null>(null)
  const [oppen, setOppen] = useState<string | null>(null)
  const [meny, setMeny] = useState<{ x: number; y: number; poster: (MenyPost | 'avdelare')[] } | null>(
    null,
  )
  /** Knappen som öppnade menyn, så att fokus kan komma tillbaka dit. */
  const oppnare = useRef<HTMLElement | null>(null)
  const sektioner = useRef<Partial<Record<Ruta, HTMLElement | null>>>({})

  /**
   * Flytta fokus till chipet på en plats i en ruta, när det ritats.
   *
   * Ett chip som byter ruta är ett nytt element, och knappen man tryckte på
   * finns inte kvar. Utan det här hade fokus fallit till sidans början efter
   * varje *Flytta till* — tangentbordsvägen hade slutat där den behövdes mest.
   */
  const fokuseraChip = (ruta: Ruta, index: number) => {
    setTimeout(() => {
      const knappar = sektioner.current[ruta]?.querySelectorAll<HTMLElement>('.pivotruta__meny')
      knappar?.[index]?.focus()
    }, 0)
  }

  const namn = (id: ColumnId): string => findColumn(frame, id)?.name ?? t('(borttagen kolumn)')

  const andraMatvarde = (id: string, delta: Partial<Berakning>) =>
    props.onPlan({
      matvarden: plan.matvarden.map((m) => (m.id === id ? { ...m, ...delta } : m)),
    })

  const andraRegel = (id: string, delta: Partial<Filterregel>) =>
    props.onPlan({
      filter: {
        ...plan.filter,
        regler: plan.filter.regler.map((r) => (r.id === id ? { ...r, ...delta } : r)),
      },
    })

  /*
   * Målet sätts bara när det ändras. `dragover` eldar många gånger i
   * sekunden, och ett nytt objekt varje gång hade ritat om panelen lika
   * ofta — utan att något syntes annorlunda.
   */
  const sattMal = (nytt: Mal) =>
    setMal((nu) => {
      if (nu === null) return nytt
      if (nu.ruta === 'bort' || nytt.ruta === 'bort') return nu.ruta === nytt.ruta ? nu : nytt
      return nu.ruta === nytt.ruta && nu.index === nytt.index ? nu : nytt
    })

  const borjaDra = (e: DragEvent, grepp: Grepp) => {
    startaDrag(e)
    setDrar(grepp)
  }

  const slutaDra = () => {
    setDrar(null)
    setMal(null)
  }

  /** Släpp i en ruta: på den plats målet pekar ut, annars sist. */
  const slapp = (e: DragEvent, ruta: Ruta) => {
    if (!drar) return
    e.preventDefault()
    e.stopPropagation()
    const index = mal && mal.ruta === ruta ? mal.index : langd(plan, ruta)
    const svar = flytta(plan, frame, drar, ruta, index)
    if ('plan' in svar) props.onPlan(svar.plan)
    slutaDra()
  }

  /** Ett pågående drag av ett av panelens egna chip — aldrig en fil. */
  const egetDrag = (e: DragEvent): boolean => drar !== null && !arFildrag(e)

  const overRuta = (e: DragEvent, ruta: Ruta, index: number) => {
    if (!egetDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    sattMal({ ruta, index })
  }

  const oppnaMeny = (e: MouseEvent, poster: (MenyPost | 'avdelare')[]) => {
    const knapp = e.currentTarget as HTMLElement
    oppnare.current = knapp
    const matt = knapp.getBoundingClientRect()
    setMeny({ x: matt.left, y: matt.bottom + 4, poster })
  }

  const stangMeny = () => {
    setMeny(null)
    // Tillbaka till knappen som öppnade menyn. Är den borta — chipet togs
    // bort — får fokus ingenstans att gå, och det är rätt: det finns inget
    // att peka på längre.
    const el = oppnare.current
    if (el?.isConnected) el.focus()
    oppnare.current = null
  }

  /**
   * Kör flytten och lämna fokus på chipet där det hamnade.
   *
   * Utan `plats` är det sist i målrutan, dit menyn alltid flyttar. En omordning
   * inom rutan skickar in sin egen plats, eftersom chipet då hamnar mitt i
   * listan och inte i slutet av den.
   */
  const korOchFokusera = (svar: Flyttsvar, till: Ruta, plats?: number) => {
    if (!('plan' in svar)) return
    props.onPlan(svar.plan)
    fokuseraChip(till, plats ?? langd({ ...plan, ...svar.plan }, till) - 1)
  }

  /** Menyn på ett chip i en ruta. */
  const chipmeny = (e: MouseEvent, ruta: Ruta, index: number) => {
    const grepp: Grepp = { kalla: ruta, index }
    const poster: (MenyPost | 'avdelare')[] = RUTOR.map((r) => {
      const svar = flytta(plan, frame, grepp, r.ruta, langd(plan, r.ruta))
      return {
        etikett: tf('Flytta till {0}', t(r.namn)),
        aktiv: r.ruta === ruta,
        inaktiv: r.ruta === ruta ? t('Ligger redan här.') : felText(svar),
        kor: () => korOchFokusera(svar, r.ruta),
      }
    })
    const upp = flytta(plan, frame, grepp, ruta, index - 1)
    const ned = flytta(plan, frame, grepp, ruta, index + 2)
    poster.push('avdelare')
    poster.push({
      etikett: t('Flytta upp'),
      inaktiv: index === 0 ? t('Ligger redan först.') : felText(upp),
      // Fokus följer chipet till dess nya plats, inte till rutans slut.
      kor: () => korOchFokusera(upp, ruta, index - 1),
    })
    poster.push({
      etikett: t('Flytta ned'),
      inaktiv: index >= langd(plan, ruta) - 1 ? t('Ligger redan sist.') : felText(ned),
      kor: () => korOchFokusera(ned, ruta, index + 1),
    })
    poster.push('avdelare')
    poster.push({
      etikett: t('Ta bort ur pivoten'),
      fara: true,
      kor: () => {
        props.onPlan(taBort(plan, ruta, index))
        // Chipet man stod på finns inte längre. Fokus går till det som tog
        // dess plats, eller till det sista som blev kvar — aldrig till
        // sidans början, dit `stangMeny` annars hade lämnat det.
        fokuseraChip(ruta, Math.min(index, langd(plan, ruta) - 2))
      },
    })
    oppnaMeny(e, poster)
  }

  /** Menyn på ett fält i listan: lägg i någon av rutorna. */
  const faltmeny = (e: MouseEvent, col: Column) => {
    const grepp: Grepp = { kalla: 'falt', colId: col.id }
    oppnaMeny(
      e,
      RUTOR.map((r) => {
        const svar = flytta(plan, frame, grepp, r.ruta, langd(plan, r.ruta))
        return {
          etikett: tf('Lägg i {0}', t(r.namn)),
          inaktiv: felText(svar),
          kor: () => korOchFokusera(svar, r.ruta),
        }
      }),
    )
  }

  const chiphandtag = (ruta: Ruta, index: number) => ({
    onDragStart: (e: DragEvent) => borjaDra(e, { kalla: ruta, index }),
    onDragOver: (e: DragEvent, efter: boolean) => overRuta(e, ruta, efter ? index + 1 : index),
    onDrop: (e: DragEvent) => slapp(e, ruta),
    onDragEnd: slutaDra,
    onMeny: (e: MouseEvent) => chipmeny(e, ruta, index),
    slappmal: mal !== null && mal.ruta === ruta && mal.index === index,
  })

  /*
   * Underlaget en öppen filterrutas värdelista räknar på: pivotens rader utan
   * den egna regeln — samma funktion som filterbyggaren använder, så att de två
   * listorna aldrig kan visa olika antal. Ett svep per öppnad lista, inte ett
   * per dragover i panelen.
   */
  const oppenRegel = oppen?.startsWith('filter:') ? oppen.slice('filter:'.length) : null
  const filternyckel = JSON.stringify(plan.filter)
  const listrader = useMemo(
    () =>
      oppenRegel === null
        ? null
        : utanEgenRegel(
            frame,
            plan.filter,
            oppenRegel,
            plan.underlag === 'vyn' ? frame.view : identityView(frame.rowCount),
          ),
    // `filternyckel` står för `plan.filter` — ett nytt objekt varje ändring.
    [frame, filternyckel, plan.underlag, oppenRegel],
  )

  const filtrerade = synliga.filter((c) => c.name.toLowerCase().includes(sok.toLowerCase()))

  const rutinnehall = (r: (typeof RUTOR)[number]) => {
    switch (r.ruta) {
      case 'filter':
        return plan.filter.regler.map((regel, i) => {
          const col = findColumn(frame, regel.colId)
          const valda = regel.varden ?? []
          const nyckel = `filter:${regel.id}`
          const panelId = `pivot-${nyckel}`
          return (
            <div role="listitem" key={nyckel}>
              <Chip
                index={i}
                etikett={namn(regel.colId)}
                bikst={valda.length === 0 ? t('alla') : tf('{0} valda', formatCount(valda.length))}
                // Utan kolumn finns ingen värdelista att fälla ut, och då ska
                // chipet inte se ut som en knapp som gör något.
                oppen={col ? oppen === nyckel : undefined}
                panelId={panelId}
                onOppna={() => setOppen(oppen === nyckel ? null : nyckel)}
                {...chiphandtag('filter', i)}
              />
              {oppen === nyckel && col && listrader && (
                <div
                  id={panelId}
                  class="pivotruta__inst"
                  role="group"
                  aria-label={tf('Inställningar för {0}', col.name)}
                >
                  <Vardelista
                    frame={frame}
                    col={col}
                    rader={listrader}
                    valda={valda}
                    onValda={(varden) => andraRegel(regel.id, { varden })}
                  />
                </div>
              )}
            </div>
          )
        })

      case 'kolumner':
      case 'rader': {
        const lista = r.ruta === 'kolumner' ? plan.kolumner : plan.rader
        return lista.map((id, i) => (
          <div role="listitem" key={`${r.ruta}:${id}`}>
            <Chip
              index={i}
              etikett={namn(id)}
              {...chiphandtag(r.ruta, i)}
            />
          </div>
        ))
      }

      case 'varden':
        return plan.matvarden.map((m, i) => {
          const nyckel = `mat:${m.id}`
          const panelId = `pivot-${nyckel}`
          const etikett = matvardenamn(m, frame)
          return (
            <div role="listitem" key={nyckel}>
              <Chip
                index={i}
                etikett={etikett}
                oppen={oppen === nyckel}
                panelId={panelId}
                onOppna={() => setOppen(oppen === nyckel ? null : nyckel)}
                {...chiphandtag('varden', i)}
              />
              {oppen === nyckel && (
                <Matvardeinstallningar
                  id={panelId}
                  etikett={etikett}
                  matvarde={m}
                  synliga={synliga}
                  onAndra={(delta) => andraMatvarde(m.id, delta)}
                />
              )}
            </div>
          )
        })
    }
  }

  return (
    <aside class="panel pivotpanel" aria-label={t('Pivotens fält')}>
      <div class="panel__rubrik">
        <span>{t('Fält')}</span>
        <span class="panel__rubrik__antal">{formatCount(synliga.length)}</span>
        <button
          class="kolrad__oga pivotpanel__stang"
          aria-label={t('Dölj fältpanelen')}
          title={t('Dölj fältpanelen')}
          onClick={props.onStang}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '0 8px 8px' }}>
        <input
          type="search"
          aria-label={t('Sök fält…')}
          placeholder={t('Sök fält…')}
          value={sok}
          style={{ width: '100%' }}
          onInput={(e) => setSok((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      {/*
        Fältlistan är också vägen ut: ett chip som dras hit tas bort ur
        pivoten. Det är samma gest som i Excel, och den enda som inte kräver
        att man siktar på en meny.
      */}
      <div
        class={`pivotpanel__falt${mal?.ruta === 'bort' ? ' pivotpanel__falt--slappmal' : ''}`}
        onDragOver={(e) => {
          if (!egetDrag(e) || drar?.kalla === 'falt') return
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
          sattMal({ ruta: 'bort' })
        }}
        onDrop={(e) => {
          if (!drar || drar.kalla === 'falt') return
          e.preventDefault()
          props.onPlan(taBort(plan, drar.kalla, drar.index))
          slutaDra()
        }}
      >
        {filtrerade.map((col) => {
          const i = anvandsI(plan, col.id)
          return (
            <div
              key={col.id}
              class={`pivotruta__chip pivotruta__chip--kalla${i.length > 0 ? ' pivotruta__chip--anvand' : ''}`}
              draggable
              title={
                i.length > 0
                  ? `${col.name} — ${t(TYPE_LABELS[col.type])} · ${i.map(rutnamn).join(', ')}`
                  : `${col.name} — ${t(TYPE_LABELS[col.type])}`
              }
              onDragStart={(e) => borjaDra(e, { kalla: 'falt', colId: col.id })}
              onDragEnd={slutaDra}
            >
              <span class="kolrad__grepp" aria-hidden="true">
                ⠿
              </span>
              <span class="pivotruta__namn">{col.name}</span>
              <button
                class="pivotruta__meny"
                aria-haspopup="menu"
                aria-label={
                  i.length === 0
                    ? tf('Lägg till {0}', col.name)
                    : tf('Lägg till {0}, ligger redan i {1}', col.name, i.map(rutnamn).join(', '))
                }
                title={tf('Lägg till {0}', col.name)}
                onClick={(e) => faltmeny(e, col)}
              >
                ＋
              </button>
            </div>
          )
        })}
        {filtrerade.length === 0 && (
          <p class="verktyg__sammanfattning">{t('Inget fält matchar sökningen.')}</p>
        )}
      </div>

      <div class="panel__innehall pivotpanel__rutor">
        {RUTOR.map((r) => {
          const antal = langd(plan, r.ruta)
          return (
            /*
             * Hela rutan är släppzon, inte bara chipen: rubriken, gapen mellan
             * chipen och ytan under dem. Chipen förfinar bara *var* i rutan.
             */
            <section
              key={r.ruta}
              ref={(el) => {
                sektioner.current[r.ruta] = el
              }}
              class="pivotruta"
              aria-labelledby={`pivotruta-${r.ruta}`}
              title={t(r.hjalp)}
              onDragOver={(e) => overRuta(e, r.ruta, antal)}
              onDrop={(e) => slapp(e, r.ruta)}
              onDragLeave={(e) => {
                const kvar = e.relatedTarget as Node | null
                if (kvar && (e.currentTarget as HTMLElement).contains(kvar)) return
                setMal(null)
              }}
            >
              <h3 class="pivotruta__rubrik" id={`pivotruta-${r.ruta}`}>
                {t(r.namn)}
              </h3>
              <div role="list" class="pivotruta__lista">
                {rutinnehall(r)}
              </div>
              {r.ruta === 'varden' && (
                <button
                  class="knapp knapp--tyst pivotruta__antal"
                  onClick={() => props.onPlan({ matvarden: [...plan.matvarden, antalRader()] })}
                >
                  ＋ {t('Antal rader')}
                </button>
              )}
              <Botten
                tom={antal === 0}
                drar={drar !== null}
                slappmal={mal !== null && mal.ruta === r.ruta && mal.index >= antal}
                onDragOver={(e) => overRuta(e, r.ruta, antal)}
                onDrop={(e) => slapp(e, r.ruta)}
              />
            </section>
          )
        })}
      </div>

      {meny && <Meny x={meny.x} y={meny.y} poster={meny.poster} onStang={stangMeny} />}
    </aside>
  )
}
