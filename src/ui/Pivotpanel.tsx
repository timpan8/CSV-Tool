import { useState } from 'preact/hooks'
import { Meny, type MenyPost } from './parts.js'
import { Vardelista } from './Vardelista.js'
import type { Column, ColumnId, Frame } from '../core/types.js'
import { findColumn, identityView, visibleColumns } from '../core/frame/frame.js'
import { nyRegelId, tillampaFilter, type Filterregel } from '../core/ops/filter.js'
import {
  berakningsnamn,
  berakningspost,
  type Berakning,
  type Berakningstyp,
} from '../core/ops/gruppera.js'
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
 * **Dra och släpp är webbläsarens eget**, med husets befintliga mönster —
 * `draggable`, tillstånd i komponenten, ingen `dataTransfer`, och
 * `--slappmal` som ritar accentlinjen. Inget nytt beroende för att flytta ett
 * chip.
 *
 * **Och varje chip har en meny som gör samma sak utan mus.** Det är inte en
 * artighet: verktygets fyra äldre dragytor har ingen tangentbordsväg alls, och
 * det hålet ska inte ärvas av en femte. Menyn är dessutom det som gör panelen
 * testbar — ett klick går att skriva i ett e2e-test, en dragrörelse sämre.
 */

export type Ruta = 'filter' | 'kolumner' | 'rader' | 'varden'

const RUTOR: { ruta: Ruta; namn: string; hjalp: string }[] = [
  { ruta: 'filter', namn: 'Filter', hjalp: 'Vad som räknas med. Utan valda värden gäller alla.' },
  { ruta: 'kolumner', namn: 'Kolumner', hjalp: 'Fälten i sidled. Flera fält nästlas utifrån och in.' },
  { ruta: 'rader', namn: 'Rader', hjalp: 'Fälten på höjden. Flera fält ger nivåer med delsummor.' },
  { ruta: 'varden', namn: 'Värden', hjalp: 'Vad som räknas i varje cell.' },
]

/** Varifrån något drogs: fältlistan, eller en plats i en ruta. */
type Grepp = { kalla: 'falt'; colId: ColumnId } | { kalla: Ruta; index: number }

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

/**
 * Byt beräkning på ett mätvärde, och håll kolumnen i takt.
 *
 * *Antal rader* har ingen kolumn att räkna på, och allt annat måste ha en.
 * Utan den här kopplingen kunde ett mätvärde stå som *Summa* utan kolumn och
 * ge tomma celler utan att säga varför.
 */
function bytBerakning(m: Berakning, typ: Berakningstyp, forsta: ColumnId | null): Berakning {
  const post = berakningspost(typ)
  if (!post.behoverKolumn) return { ...m, typ, colId: null }
  return { ...m, typ, colId: m.colId ?? forsta }
}

/** En ny filterregel: *är något av*, utan valda värden — alltså allt. */
function nyRegel(colId: ColumnId): Filterregel {
  return { id: nyRegelId(), colId, operator: 'iLista', varde: '', varden: [], av: false }
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
 * Flytta ett fält till en ruta, och räkna ut hela planen på nytt.
 *
 * Rutorna bär olika saker — en kolumn, en regel, ett mätvärde — så en flytt
 * mellan två av dem är en översättning och inte en förflyttning. `Antal rader`
 * har ingen kolumn alls och kan därför inte bli en dimension; det svaret är
 * `null`, och menyn gråar posten i stället för att göra ingenting.
 */
export function flytta(
  plan: Pivotplan,
  frame: Frame,
  grepp: Grepp,
  till: Ruta,
  index: number,
): Partial<Pivotplan> | null {
  const colId = kolumnFor(plan, grepp)
  if (colId === null) return null
  const col = findColumn(frame, colId)
  if (!col) return null

  // Samma fält två gånger i samma dimensionsruta vore en nivå nästlad under
  // sig själv: ett barn per förälder, och inget nytt att se. Omordning inom
  // rutan är undantaget — där *är* fältet redan där, och det är hela poängen.
  const redan = till === 'rader' ? plan.rader : till === 'kolumner' ? plan.kolumner : []
  if (grepp.kalla !== till && redan.includes(colId)) return null

  let rader = plan.rader
  let kolumner = plan.kolumner
  let matvarden: readonly Berakning[] = plan.matvarden
  let regler = plan.filter.regler
  if (grepp.kalla === 'rader') rader = utan(rader, grepp.index)
  if (grepp.kalla === 'kolumner') kolumner = utan(kolumner, grepp.index)
  if (grepp.kalla === 'varden') matvarden = utan(matvarden, grepp.index)
  if (grepp.kalla === 'filter') regler = utan(regler, grepp.index)

  // Målplatsen glider ett steg när något plockats bort framför den.
  const i = grepp.kalla === till && grepp.index < index ? index - 1 : index

  switch (till) {
    case 'rader':
      rader = iSats(rader, i, colId)
      break
    case 'kolumner':
      kolumner = iSats(kolumner, i, colId)
      break
    case 'varden':
      matvarden = iSats(
        matvarden,
        i,
        grepp.kalla === 'varden' ? plan.matvarden[grepp.index]! : nyttMatvarde(col),
      )
      break
    case 'filter':
      regler = iSats(
        regler,
        i,
        grepp.kalla === 'filter' ? plan.filter.regler[grepp.index]! : nyRegel(colId),
      )
      break
  }

  return { rader, kolumner, matvarden, filter: { ...plan.filter, regler } }
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
  const [mal, setMal] = useState<{ ruta: Ruta; index: number } | null>(null)
  const [oppen, setOppen] = useState<string | null>(null)
  const [meny, setMeny] = useState<{ x: number; y: number; poster: (MenyPost | 'avdelare')[] } | null>(
    null,
  )

  const namn = (id: ColumnId): string => findColumn(frame, id)?.name ?? t('(borttagen kolumn)')

  const slapp = (ruta: Ruta, index: number) => {
    if (!drar) return
    const delta = flytta(plan, frame, drar, ruta, index)
    if (delta) props.onPlan(delta)
    setDrar(null)
    setMal(null)
  }

  const chipmeny = (e: MouseEvent, ruta: Ruta, index: number) => {
    const knapp = e.currentTarget as HTMLElement
    const ruteMatt = knapp.getBoundingClientRect()
    const gar = flytta(plan, frame, { kalla: ruta, index }, 'rader', 0) !== null
    const poster: (MenyPost | 'avdelare')[] = RUTOR.map((r) => ({
      etikett: tf('Flytta till {0}', t(r.namn)),
      aktiv: r.ruta === ruta,
      inaktiv: gar || r.ruta === 'filter' || r.ruta === 'varden' ? undefined : t('Fältet har ingen kolumn att gruppera på.'),
      kor: () => {
        const delta = flytta(plan, frame, { kalla: ruta, index }, r.ruta, langd(plan, r.ruta))
        if (delta) props.onPlan(delta)
      },
    }))
    poster.push('avdelare')
    poster.push({
      etikett: t('Flytta upp'),
      inaktiv: index === 0 ? t('Ligger redan först.') : undefined,
      kor: () => {
        const delta = flytta(plan, frame, { kalla: ruta, index }, ruta, index - 1)
        if (delta) props.onPlan(delta)
      },
    })
    poster.push({
      etikett: t('Flytta ned'),
      inaktiv: index >= langd(plan, ruta) - 1 ? t('Ligger redan sist.') : undefined,
      kor: () => {
        const delta = flytta(plan, frame, { kalla: ruta, index }, ruta, index + 2)
        if (delta) props.onPlan(delta)
      },
    })
    poster.push('avdelare')
    poster.push({
      etikett: t('Ta bort ur pivoten'),
      fara: true,
      kor: () => props.onPlan(taBort(plan, ruta, index)),
    })
    setMeny({ x: ruteMatt.left, y: ruteMatt.bottom + 4, poster })
  }

  /** Ett chip: greppet, menyknappen och släppzonen — lika i alla fyra rutor. */
  const Chip = (c: {
    ruta: Ruta
    index: number
    nyckel: string
    etikett: string
    bikst?: string
    oppnar?: boolean
  }) => {
    const klasser = ['pivotruta__chip']
    if (mal && mal.ruta === c.ruta && mal.index === c.index) klasser.push('pivotruta__chip--slappmal')
    return (
      <div
        key={c.nyckel}
        class={klasser.join(' ')}
        draggable
        onDragStart={() => setDrar({ kalla: c.ruta, index: c.index })}
        onDragOver={(e) => {
          e.preventDefault()
          setMal({ ruta: c.ruta, index: c.index })
        }}
        onDrop={(e) => {
          e.preventDefault()
          slapp(c.ruta, c.index)
        }}
        onDragEnd={() => {
          setDrar(null)
          setMal(null)
        }}
      >
        <span class="kolrad__grepp" aria-hidden="true">
          ⠿
        </span>
        {c.oppnar ? (
          <button
            class="pivotruta__namn"
            aria-expanded={oppen === c.nyckel}
            onClick={() => setOppen(oppen === c.nyckel ? null : c.nyckel)}
          >
            {c.etikett}
            {c.bikst !== undefined && <span class="pivotruta__bikst">{c.bikst}</span>}
          </button>
        ) : (
          <span class="pivotruta__namn">{c.etikett}</span>
        )}
        <button
          class="pivotruta__meny"
          aria-label={tf('Åtgärder för {0}', c.etikett)}
          title={tf('Åtgärder för {0}', c.etikett)}
          onClick={(e) => chipmeny(e, c.ruta, c.index)}
        >
          ⋯
        </button>
      </div>
    )
  }

  /** Rutans tomma yta: det som tar emot ett släpp längst ned i listan. */
  const Botten = (b: { ruta: Ruta }) => {
    const antal = langd(plan, b.ruta)
    const traff = mal !== null && mal.ruta === b.ruta && mal.index >= antal
    return (
      <div
        class={`pivotruta__botten${traff ? ' pivotruta__botten--slappmal' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setMal({ ruta: b.ruta, index: antal })
        }}
        onDrop={(e) => {
          e.preventDefault()
          slapp(b.ruta, antal)
        }}
      >
        {antal === 0 && <span class="pivotruta__tom">{t('Dra hit ett fält')}</span>}
      </div>
    )
  }

  const filtrerade = synliga.filter((c) => c.name.toLowerCase().includes(sok.toLowerCase()))

  return (
    <aside class="panel pivotpanel" aria-label={t('Pivotens fält')}>
      <div class="panel__rubrik">
        <span>{t('Fält')}</span>
        <button
          class="kolrad__oga"
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
          placeholder={t('Sök fält…')}
          value={sok}
          style={{ width: '100%' }}
          onInput={(e) => setSok((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <div class="pivotpanel__falt">
        {filtrerade.map((col) => (
          <div
            key={col.id}
            class="pivotruta__chip pivotruta__chip--kalla"
            draggable
            onDragStart={() => setDrar({ kalla: 'falt', colId: col.id })}
            onDragEnd={() => {
              setDrar(null)
              setMal(null)
            }}
          >
            <span class="kolrad__grepp" aria-hidden="true">
              ⠿
            </span>
            <span class="pivotruta__namn">{col.name}</span>
            <button
              class="pivotruta__meny"
              aria-label={tf('Lägg till {0}', col.name)}
              title={tf('Lägg till {0}', col.name)}
              onClick={(e) => {
                const matt = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setMeny({
                  x: matt.left,
                  y: matt.bottom + 4,
                  poster: RUTOR.map((r) => ({
                    etikett: tf('Lägg i {0}', t(r.namn)),
                    kor: () => {
                      const delta = flytta(
                        plan,
                        frame,
                        { kalla: 'falt', colId: col.id },
                        r.ruta,
                        langd(plan, r.ruta),
                      )
                      if (delta) props.onPlan(delta)
                    },
                  })),
                })
              }}
            >
              ＋
            </button>
          </div>
        ))}
        {filtrerade.length === 0 && (
          <p class="verktyg__sammanfattning">{t('Inget fält matchar sökningen.')}</p>
        )}
      </div>

      <div class="panel__innehall pivotpanel__rutor">
        {RUTOR.map((r) => (
          <section key={r.ruta} class="pivotruta" title={t(r.hjalp)}>
            <h3 class="pivotruta__rubrik">{t(r.namn)}</h3>

            {r.ruta === 'filter' &&
              plan.filter.regler.map((regel, i) => {
                const col = findColumn(frame, regel.colId)
                const valda = regel.varden ?? []
                const nyckel = `filter:${regel.id}`
                return (
                  <div key={nyckel}>
                    <Chip
                      ruta="filter"
                      index={i}
                      nyckel={nyckel}
                      etikett={namn(regel.colId)}
                      bikst={
                        valda.length === 0 ? t('alla') : tf('{0} valda', formatCount(valda.length))
                      }
                      oppnar
                    />
                    {oppen === nyckel && col && (
                      <Vardelista
                        frame={frame}
                        col={col}
                        rader={underlagUtan(frame, plan, regel.id)}
                        valda={valda}
                        onValda={(varden) =>
                          props.onPlan({
                            filter: {
                              ...plan.filter,
                              regler: plan.filter.regler.map((x) =>
                                x.id === regel.id ? { ...x, varden } : x,
                              ),
                            },
                          })
                        }
                      />
                    )}
                  </div>
                )
              })}

            {r.ruta === 'kolumner' &&
              plan.kolumner.map((id, i) => (
                <Chip
                  key={`kol:${id}:${i}`}
                  ruta="kolumner"
                  index={i}
                  nyckel={`kol:${id}:${i}`}
                  etikett={namn(id)}
                />
              ))}

            {r.ruta === 'rader' &&
              plan.rader.map((id, i) => (
                <Chip
                  key={`rad:${id}:${i}`}
                  ruta="rader"
                  index={i}
                  nyckel={`rad:${id}:${i}`}
                  etikett={namn(id)}
                />
              ))}

            {r.ruta === 'varden' &&
              plan.matvarden.map((m, i) => {
                const nyckel = `mat:${m.id}`
                const post = berakningspost(m.typ)
                return (
                  <div key={nyckel}>
                    <Chip
                      ruta="varden"
                      index={i}
                      nyckel={nyckel}
                      etikett={berakningsnamn(m, frame)}
                      oppnar
                    />
                    {oppen === nyckel && (
                      <div class="pivotruta__inst">
                        <label class="falt">
                          <span class="falt__etikett">{t('Beräkning')}</span>
                          <select
                            value={m.typ}
                            title={t(post.hjalp)}
                            onChange={(e) =>
                              props.onPlan({
                                matvarden: plan.matvarden.map((x) =>
                                  x.id === m.id
                                    ? bytBerakning(
                                        x,
                                        (e.currentTarget as HTMLSelectElement)
                                          .value as Berakningstyp,
                                        synliga[0]?.id ?? null,
                                      )
                                    : x,
                                ),
                              })
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
                              value={m.colId ?? ''}
                              onChange={(e) =>
                                props.onPlan({
                                  matvarden: plan.matvarden.map((x) =>
                                    x.id === m.id
                                      ? { ...x, colId: (e.currentTarget as HTMLSelectElement).value }
                                      : x,
                                  ),
                                })
                              }
                            >
                              {synliga.map((c) => (
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
                    )}
                  </div>
                )
              })}

            <Botten ruta={r.ruta} />
          </section>
        ))}
      </div>

      {meny && (
        <Meny x={meny.x} y={meny.y} poster={meny.poster} onStang={() => setMeny(null)} />
      )}
    </aside>
  )
}

/**
 * Raderna en filterrutas värdelista räknar på: pivotens underlag utan den
 * egna regeln. Samma regel som filterbyggaren följer, och av samma skäl —
 * kryssar man i *Malmö* får inte *Lund* försvinna i samma ögonblick.
 */
function underlagUtan(frame: Frame, plan: Pivotplan, regelId: string): Uint32Array {
  const utgangslage = plan.underlag === 'vyn' ? frame.view : identityView(frame.rowCount)
  const utan = { ...plan.filter, regler: plan.filter.regler.filter((r) => r.id !== regelId) }
  return tillampaFilter(frame, utan, utgangslage).rader
}
