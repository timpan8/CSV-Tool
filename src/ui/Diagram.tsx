import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { formatSum } from '../core/locale/sv.js'
import type { Diagramdata, Diagramplan, Diagramserie } from '../core/ops/diagram.js'
import type { Diagramvisning } from '../core/ops/diagram.js'
import { t, tf } from './sprak.js'

/**
 * Diagrammet.
 *
 * Handskriven inline-SVG, som ikonerna — ett diagrambibliotek hade blivit ett
 * sjätte beroende för fyra former som är rektanglar, en polyline och några
 * cirkelbågar.
 *
 * **Ritas i riktiga pixlar, inte i en skalande `viewBox`.** En `viewBox` som
 * sträcks ut skalar texten med sig: axeletiketterna blir jättelika i en bred
 * ruta och oläsliga i en smal. Måtten kommer därför ur en `ResizeObserver`,
 * samma mönster som rutnätet redan använder.
 *
 * **Märkspecifikationen är fast** — stapelns tjocklek, den rundade datänden,
 * linjens bredd, mellanrummet mellan segment. Det är den som gör att fyra
 * olika former ser ut som ett system och inte som fyra påfund.
 */

/** Stapelns största tjocklek. Blir bandet bredare får luften växa i stället. */
const STAPELTJOCKLEK = 24
/** Mellanrummet i ytfärgen som skiljer två märken åt. Aldrig en ram. */
const MELLANRUM = 2
/** Punktens radie. Åtta pixler i diameter är minsta som går att sikta på. */
const PUNKT = 4
const RUNDNING = 4
// Linjens bredd och punktens ring står i `pivot.css` bland de andra
// märkspecifikationerna — de behövs bara som stil, aldrig som räknetal.

const MARGINAL = { topp: 14, hoger: 16, botten: 34, vanster: 56 }
/** Axeletikettens plats i det liggande läget, där namnen står till vänster. */
const LIGGANDE_VANSTER = 116

export interface Punktinfo {
  /** Skärmpunkt för inforutan. */
  x: number
  y: number
  kategori: string
  /** En rad per serie som ska stå i rutan. Värdet först, namnet efter. */
  rader: { etikett: string; varde: string; slot: number }[]
}

export function Diagram(props: {
  data: Diagramdata
  plan: Diagramplan
  visning: Diagramvisning
  /** Vad diagrammet handlar om, för skärmläsaren och för rubriken. */
  rubrik: string
  onPeka: (info: Punktinfo | null) => void
}) {
  const { data, plan } = props
  const ruta = useRef<HTMLDivElement>(null)
  const [matt, setMatt] = useState({ bredd: 0, hojd: 0 })

  useLayoutEffect(() => {
    const el = ruta.current
    if (!el) return
    const las = () => setMatt({ bredd: el.clientWidth, hojd: el.clientHeight })
    const observer = new ResizeObserver(las)
    observer.observe(el)
    las()
    return () => observer.disconnect()
  }, [])

  const tom = data.kategorier.length === 0 || data.serier.length === 0

  return (
    <div class="diagram" ref={ruta}>
      {tom ? (
        <p class="diagram__tomt">{t('Det finns inget att rita med de här valen.')}</p>
      ) : matt.bredd > 0 && matt.hojd > 0 ? (
        <svg
          class="diagram__duk"
          width={matt.bredd}
          height={matt.hojd}
          role="img"
          aria-label={props.rubrik}
          onPointerLeave={() => props.onPeka(null)}
        >
          {plan.typ === 'cirkel' ? (
            <Cirkel data={data} matt={matt} visning={props.visning} onPeka={props.onPeka} />
          ) : plan.typ === 'linje' ? (
            <Linje data={data} matt={matt} visning={props.visning} onPeka={props.onPeka} />
          ) : (
            <Staplar
              data={data}
              plan={plan}
              matt={matt}
              visning={props.visning}
              onPeka={props.onPeka}
            />
          )}
        </svg>
      ) : null}
    </div>
  )
}

interface Matt {
  bredd: number
  hojd: number
}

/** Talet så som det ska läsas — samma avrundning som tabellen använder. */
function visa(varde: number, visning: Diagramvisning): string {
  if (visning === 'tal') return formatSum(varde)
  return varde.toLocaleString('sv-SE', { style: 'percent', maximumFractionDigits: 1 })
}

/**
 * Axelns steg, rundade till jämna tal.
 *
 * En axel som säger 0 / 3 333 / 6 667 är svårare att läsa än en som säger
 * 0 / 2 500 / 5 000, även när den senare sträcker sig lite längre än datat.
 */
function axelsteg(max: number, min: number): number[] {
  const topp = Math.max(max, 0)
  const botten = Math.min(min, 0)
  const spann = topp - botten
  if (spann === 0) return [0]
  const grovt = spann / 4
  const tiopotens = Math.pow(10, Math.floor(Math.log10(grovt)))
  const kandidater = [1, 2, 2.5, 5, 10].map((f) => f * tiopotens)
  const steg = kandidater.find((k) => k >= grovt) ?? tiopotens * 10
  const ut: number[] = []
  for (let v = Math.ceil(botten / steg) * steg; v <= topp + steg / 1000; v += steg) {
    ut.push(Math.abs(v) < steg / 1000 ? 0 : v)
  }
  return ut
}

/**
 * Ska värdet stå vid varje stapel?
 *
 * Bara när de blir få nog att läsas. Direktetiketter fungerar *därför att* de
 * är sparsamma — femton orter gånger tre statusar ger fyrtiofem tal utspridda
 * över bilden, och då läser man inget av dem. Över gränsen bär inforutan och
 * tabellen värdena i stället, och båda finns ett handgrepp bort.
 */
function direktetiketter(serier: readonly Diagramserie[], kategorier: number): boolean {
  return serier.length <= 4 && serier.length * kategorier <= 24
}

/* ---------- Staplar, stående och liggande ---------- */

function Staplar(props: {
  data: Diagramdata
  plan: Diagramplan
  matt: Matt
  visning: Diagramvisning
  onPeka: (info: Punktinfo | null) => void
}) {
  const { data, plan, matt } = props
  const liggande = plan.typ === 'liggande'
  const staplade = plan.stapellage === 'staplade' && data.serier.length > 1

  const vanster = liggande ? LIGGANDE_VANSTER : MARGINAL.vanster
  const rityta = {
    x: vanster,
    y: MARGINAL.topp,
    bredd: Math.max(10, matt.bredd - vanster - MARGINAL.hoger),
    hojd: Math.max(10, matt.hojd - MARGINAL.topp - MARGINAL.botten),
  }

  const steg = axelsteg(data.max, data.min)
  const skalMax = Math.max(steg[steg.length - 1] ?? 0, data.max, 0)
  const skalMin = Math.min(steg[0] ?? 0, data.min, 0)
  const spann = skalMax - skalMin || 1

  /** Värde → plats längs värdeaxeln, i pixlar från rityans början. */
  const langd = (v: number) => (Math.abs(v) / spann) * (liggande ? rityta.bredd : rityta.hojd)
  const nollplats = liggande
    ? rityta.x + ((0 - skalMin) / spann) * rityta.bredd
    : rityta.y + ((skalMax - 0) / spann) * rityta.hojd

  const antalKat = data.kategorier.length
  const bandtjocklek = (liggande ? rityta.hojd : rityta.bredd) / antalKat
  const perSerie = staplade ? bandtjocklek : bandtjocklek / data.serier.length
  const tjocklek = Math.max(1, Math.min(STAPELTJOCKLEK, perSerie - MELLANRUM))

  const etiketter = direktetiketter(data.serier, antalKat)

  return (
    <>
      <Rutnat
        steg={steg}
        rityta={rityta}
        liggande={liggande}
        skalMax={skalMax}
        spann={spann}
        visning={props.visning}
      />

      {data.kategorier.map((kategori, k) => {
        const bandstart = (liggande ? rityta.y : rityta.x) + k * bandtjocklek
        let staplatUpp = 0
        let staplatNed = 0

        return (
          <g key={kategori}>
            {!liggande && (
              <text
                class="diagram__kategori"
                x={bandstart + bandtjocklek / 2}
                y={rityta.y + rityta.hojd + 16}
                text-anchor="middle"
              >
                {kappa(kategori, bandtjocklek)}
              </text>
            )}
            {liggande && (
              <text
                class="diagram__kategori"
                x={rityta.x - 8}
                y={bandstart + bandtjocklek / 2 + 4}
                text-anchor="end"
              >
                {kappa(kategori, LIGGANDE_VANSTER - 12, 7)}
              </text>
            )}

            {data.serier.map((serie, s) => {
              const varde = serie.varden[k]
              if (varde === null || varde === undefined) return null
              const langden = langd(varde)
              const positiv = varde >= 0

              // Var stapeln börjar tvärs banden.
              const tvars = staplade
                ? bandstart + (bandtjocklek - tjocklek) / 2
                : bandstart + s * perSerie + (perSerie - tjocklek) / 2

              // Var den börjar längs värdeaxeln.
              let bas: number
              if (staplade) {
                const staplat = positiv ? staplatUpp : staplatNed
                bas = liggande ? nollplats + staplat : nollplats - staplat
                if (positiv) staplatUpp += langden
                else staplatNed += langden
              } else {
                bas = nollplats
              }

              const x = liggande ? (positiv ? bas : bas - langden) : tvars
              const y = liggande ? tvars : positiv ? bas - langden : bas
              const b = liggande ? Math.max(0, langden - (staplade ? MELLANRUM : 0)) : tjocklek
              const h = liggande ? tjocklek : Math.max(0, langden - (staplade ? MELLANRUM : 0))

              const info = () =>
                props.onPeka({
                  x: liggande ? x + b : x + b / 2,
                  y: liggande ? y + h / 2 : y,
                  kategori,
                  rader: [
                    {
                      etikett: serie.etikett,
                      varde: visa(varde, props.visning),
                      slot: serie.slot,
                    },
                  ],
                })

              return (
                <rect
                  key={serie.etikett}
                  class="diagram__stapel"
                  x={x}
                  y={y}
                  width={b}
                  height={h}
                  rx={RUNDNING}
                  fill={`var(--serie-${serie.slot + 1})`}
                  tabIndex={0}
                  data-serie={serie.etikett}
                  data-kategori={kategori}
                  data-varde={varde}
                  onPointerMove={info}
                  onFocus={info}
                  onBlur={() => props.onPeka(null)}
                />
              )
            })}

            {etiketter && !staplade && (
              <Stapeletiketter
                data={data}
                k={k}
                bandstart={bandstart}
                perSerie={perSerie}
                liggande={liggande}
                nollplats={nollplats}
                langd={langd}
                visning={props.visning}
              />
            )}
          </g>
        )
      })}
    </>
  )
}

/**
 * Värdet vid stapelns spets.
 *
 * Bara utanför stapeln, aldrig inuti: en etikett inuti en kort stapel klipps,
 * och en klippt siffra är värre än ingen siffra. Ryms den inte utanför heller
 * bär inforutan värdet i stället.
 */
function Stapeletiketter(props: {
  data: Diagramdata
  k: number
  bandstart: number
  perSerie: number
  liggande: boolean
  nollplats: number
  langd: (v: number) => number
  visning: Diagramvisning
}) {
  return (
    <>
      {props.data.serier.map((serie, s) => {
        const varde = serie.varden[props.k]
        if (varde === null || varde === undefined) return null
        const langden = props.langd(varde)
        const positiv = varde >= 0
        const mitt = props.bandstart + s * props.perSerie + props.perSerie / 2
        const spets = props.liggande
          ? positiv
            ? props.nollplats + langden
            : props.nollplats - langden
          : positiv
            ? props.nollplats - langden
            : props.nollplats + langden

        return (
          <text
            key={serie.etikett}
            class="diagram__varde"
            x={props.liggande ? spets + (positiv ? 5 : -5) : mitt}
            y={props.liggande ? mitt + 4 : spets + (positiv ? -5 : 13)}
            text-anchor={props.liggande ? (positiv ? 'start' : 'end') : 'middle'}
          >
            {visa(varde, props.visning)}
          </text>
        )
      })}
    </>
  )
}

/* ---------- Rutnät och värdeaxel ---------- */

function Rutnat(props: {
  steg: number[]
  rityta: { x: number; y: number; bredd: number; hojd: number }
  liggande: boolean
  skalMax: number
  spann: number
  visning: Diagramvisning
}) {
  const { rityta } = props
  return (
    <>
      {props.steg.map((v) => {
        const andel = (props.skalMax - v) / props.spann
        const x = props.liggande ? rityta.x + (1 - andel) * rityta.bredd : rityta.x
        const y = props.liggande ? rityta.y : rityta.y + andel * rityta.hojd
        return (
          <g key={v}>
            <line
              class="diagram__rutlinje"
              x1={x}
              y1={y}
              x2={props.liggande ? x : rityta.x + rityta.bredd}
              y2={props.liggande ? rityta.y + rityta.hojd : y}
            />
            <text
              class="diagram__axeltal"
              x={props.liggande ? x : rityta.x - 8}
              y={props.liggande ? rityta.y + rityta.hojd + 16 : y + 4}
              text-anchor={props.liggande ? 'middle' : 'end'}
            >
              {visa(v, props.visning)}
            </text>
          </g>
        )
      })}
    </>
  )
}

/* ---------- Linje ---------- */

function Linje(props: {
  data: Diagramdata
  matt: Matt
  visning: Diagramvisning
  onPeka: (info: Punktinfo | null) => void
}) {
  const { data, matt } = props
  const rityta = {
    x: MARGINAL.vanster,
    y: MARGINAL.topp,
    bredd: Math.max(10, matt.bredd - MARGINAL.vanster - MARGINAL.hoger),
    hojd: Math.max(10, matt.hojd - MARGINAL.topp - MARGINAL.botten),
  }
  const steg = axelsteg(data.max, data.min)
  const skalMax = Math.max(steg[steg.length - 1] ?? 0, data.max, 0)
  const skalMin = Math.min(steg[0] ?? 0, data.min, 0)
  const spann = skalMax - skalMin || 1

  const antal = data.kategorier.length
  const bandbredd = rityta.bredd / Math.max(1, antal)
  const xFor = (k: number) => rityta.x + bandbredd * (k + 0.5)
  const yFor = (v: number) => rityta.y + ((skalMax - v) / spann) * rityta.hojd

  const [harkors, setHarkors] = useState<number | null>(null)

  /*
   * Hårkorset fäster vid närmaste kategori och visar alla serier där.
   * Pekaren ska aldrig behöva träffa en två pixlar bred linje — man siktar på
   * ett datum, inte på en kurva.
   */
  const sikta = (e: { offsetX: number }) => {
    const k = Math.round((e.offsetX - rityta.x) / bandbredd - 0.5)
    const nara = Math.max(0, Math.min(antal - 1, k))
    setHarkors(nara)
    props.onPeka({
      x: xFor(nara),
      y: rityta.y,
      kategori: data.kategorier[nara] ?? '',
      rader: data.serier
        .map((serie) => ({
          etikett: serie.etikett,
          varde: serie.varden[nara] === null ? '' : visa(serie.varden[nara]!, props.visning),
          slot: serie.slot,
        }))
        .filter((r) => r.varde !== ''),
    })
  }

  return (
    <>
      <Rutnat
        steg={steg}
        rityta={rityta}
        liggande={false}
        skalMax={skalMax}
        spann={spann}
        visning={props.visning}
      />

      {data.kategorier.map((kategori, k) => (
        <text
          key={kategori}
          class="diagram__kategori"
          x={xFor(k)}
          y={rityta.y + rityta.hojd + 16}
          text-anchor="middle"
        >
          {kappa(kategori, bandbredd)}
        </text>
      ))}

      {harkors !== null && (
        <line
          class="diagram__harkors"
          x1={xFor(harkors)}
          y1={rityta.y}
          x2={xFor(harkors)}
          y2={rityta.y + rityta.hojd}
        />
      )}

      {data.serier.map((serie) => {
        const punkter = serie.varden
          .map((v, k) => (v === null ? null : `${xFor(k)},${yFor(v)}`))
          .filter((p): p is string => p !== null)
        return (
          <g key={serie.etikett} data-serie={serie.etikett}>
            {punkter.length > 1 && (
              <polyline
                class="diagram__linje"
                points={punkter.join(' ')}
                stroke={`var(--serie-${serie.slot + 1})`}
              />
            )}
            {serie.varden.map((v, k) =>
              v === null ? null : (
                <circle
                  key={k}
                  class="diagram__punkt"
                  cx={xFor(k)}
                  cy={yFor(v)}
                  r={PUNKT}
                  fill={`var(--serie-${serie.slot + 1})`}
                  data-serie={serie.etikett}
                  data-kategori={data.kategorier[k]}
                  data-varde={v}
                />
              ),
            )}
          </g>
        )
      })}

      {/* Träffytan ligger över allt annat och täcker hela ritytan, så att
          pekaren bara behöver vara närmast — inte träffa. */}
      <rect
        class="diagram__traffyta"
        x={rityta.x}
        y={rityta.y}
        width={rityta.bredd}
        height={rityta.hojd}
        tabIndex={0}
        onPointerMove={sikta}
        onFocus={() => sikta({ offsetX: xFor(0) })}
        onBlur={() => {
          setHarkors(null)
          props.onPeka(null)
        }}
      />
    </>
  )
}

/* ---------- Cirkel ---------- */

function Cirkel(props: {
  data: Diagramdata
  matt: Matt
  visning: Diagramvisning
  onPeka: (info: Punktinfo | null) => void
}) {
  const { data, matt } = props
  const serie = data.serier[0]
  if (!serie) return null

  const summa = serie.varden.reduce((s: number, v) => s + Math.max(0, v ?? 0), 0)
  if (summa <= 0) return null

  const mitt = { x: matt.bredd / 2, y: matt.hojd / 2 }
  const radie = Math.max(20, Math.min(matt.bredd, matt.hojd) / 2 - 42)

  let vinkel = -Math.PI / 2
  return (
    <>
      {data.kategorier.map((kategori, k) => {
        const varde = Math.max(0, serie.varden[k] ?? 0)
        if (varde <= 0) return null
        const del = varde / summa
        const start = vinkel
        const slut = vinkel + del * Math.PI * 2
        vinkel = slut

        const mittvinkel = (start + slut) / 2
        const info = () =>
          props.onPeka({
            x: mitt.x + Math.cos(mittvinkel) * radie * 0.7,
            y: mitt.y + Math.sin(mittvinkel) * radie * 0.7,
            kategori,
            rader: [
              {
                etikett: kategori,
                varde: `${visa(varde, props.visning)} · ${del.toLocaleString('sv-SE', {
                  style: 'percent',
                  maximumFractionDigits: 1,
                })}`,
                slot: k % 8,
              },
            ],
          })

        return (
          <g key={kategori}>
            <path
              class="diagram__tarta"
              d={tartbit(mitt, radie, start, slut)}
              fill={`var(--serie-${(k % 8) + 1})`}
              tabIndex={0}
              data-serie={kategori}
              data-kategori={kategori}
              data-varde={varde}
              onPointerMove={info}
              onFocus={info}
              onBlur={() => props.onPeka(null)}
            />
            {del > 0.05 && (
              <text
                class="diagram__varde"
                x={mitt.x + Math.cos(mittvinkel) * (radie + 18)}
                y={mitt.y + Math.sin(mittvinkel) * (radie + 18) + 4}
                text-anchor={Math.cos(mittvinkel) < -0.1 ? 'end' : Math.cos(mittvinkel) > 0.1 ? 'start' : 'middle'}
              >
                {kategori}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}

/**
 * En tårtbit som en sluten bana.
 *
 * Bågen ritas alltid med `large-arc` när delen är över halva cirkeln —
 * `A`-kommandot kan annars inte veta vilken av de två möjliga bågarna som
 * menas, och en majoritetsandel blir då ritad som sin egen minoritet.
 */
function tartbit(
  mitt: { x: number; y: number },
  radie: number,
  start: number,
  slut: number,
): string {
  // En hel cirkel har ingen båge att rita — två halvor får göra jobbet.
  if (slut - start >= Math.PI * 2 - 0.0001) {
    return [
      `M ${mitt.x} ${mitt.y - radie}`,
      `A ${radie} ${radie} 0 1 1 ${mitt.x - 0.01} ${mitt.y - radie}`,
      'Z',
    ].join(' ')
  }
  const x1 = mitt.x + Math.cos(start) * radie
  const y1 = mitt.y + Math.sin(start) * radie
  const x2 = mitt.x + Math.cos(slut) * radie
  const y2 = mitt.y + Math.sin(slut) * radie
  const stor = slut - start > Math.PI ? 1 : 0
  return `M ${mitt.x} ${mitt.y} L ${x1} ${y1} A ${radie} ${radie} 0 ${stor} 1 ${x2} ${y2} Z`
}

/**
 * Kapar en etikett som inte får plats.
 *
 * Hellre `Karlst…` än en text som växer in i grannens. Måttet är grovt — en
 * bokstav räknas som `bredd` pixlar — men det behöver bara vara ungefär rätt,
 * eftersom hela namnet står i inforutan och i tabellen.
 */
function kappa(text: string, plats: number, bredd = 6.5): string {
  const rymmer = Math.floor(plats / bredd)
  if (text.length <= rymmer) return text
  if (rymmer <= 1) return ''
  return `${text.slice(0, rymmer - 1)}…`
}

/* ---------- Förklaringen ---------- */

/**
 * Förklaringen.
 *
 * Alltid med när serierna är två eller fler: identitet får aldrig hänga på
 * färgen ensam. Vid en enda serie säger rubriken redan vad som ritas, och en
 * ruta med en enda färgklick hade bara upprepat den.
 */
export function Diagramforklaring(props: { data: Diagramdata }) {
  if (props.data.serier.length < 2) return null
  return (
    <ul class="diagram__forklaring">
      {props.data.serier.map((serie) => (
        <li key={serie.etikett}>
          <span
            class="diagram__prick"
            style={{ background: `var(--serie-${serie.slot + 1})` }}
            aria-hidden="true"
          />
          {serie.etikett === '' ? t('(tomt)') : serie.etikett}
        </li>
      ))}
      {props.data.utelamnadeSerier > 0 && (
        <li class="diagram__utelamnade">
          {tf('och {0} till som inte fick plats', String(props.data.utelamnadeSerier))}
        </li>
      )}
    </ul>
  )
}
