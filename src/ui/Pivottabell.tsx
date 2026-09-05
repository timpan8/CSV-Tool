import { useMemo } from 'preact/hooks'
import type { Frame } from '../core/types.js'
import { findColumn } from '../core/frame/frame.js'
import { formatCount, formatSum, sortCollator } from '../core/locale/sv.js'
import { berakningspost } from '../core/ops/gruppera.js'
import type { Berakning } from '../core/ops/gruppera.js'
import type { Pivotplan, Pivotresultat, Pivotrubrik } from '../core/ops/pivot.js'
import { t, tf } from './sprak.js'

/** Hur cellernas tal visas. Andelen är en avläsning, inte en annan beräkning. */
export type Visning = 'tal' | 'andelRad' | 'andelKolumn'

export interface Sortering {
  /** Kolumnindex i matrisen; `bredd - 1` är Totalt. */
  kol: number
  /** Vilket mätvärde inom kolumnen, när de är flera. */
  m: number
  ned: boolean
}

/**
 * Pivotens tabell.
 *
 * En vanlig `<table>` i en rullande ruta, inte rutnätets virtualisering.
 * Skälet är taken i `pivot.ts`: matrisen är som mest några tusen celler, och
 * en `<table>` ger sticky rubriker, radhöjder som anpassar sig och markering
 * med musen gratis. Virtualiseringen finns för filer med hundratusen rader —
 * en pivot med hundratusen rader vore inte en överblick.
 *
 * Rubrikraden har två våningar när mätvärdena är flera: kolumnvärdet överst
 * och mätvärdena under. Med ett enda mätvärde vore den andra våningen en rad
 * som upprepade samma ord, så den ritas inte.
 */
export function Pivottabell(props: {
  frame: Frame
  plan: Pivotplan
  resultat: Pivotresultat
  visning: Visning
  sortering: Sortering | null
  onSortera: (kol: number, m: number) => void
  hopfallda: Set<string>
  onVaxlaNod: (stig: string) => void
}) {
  const { resultat, plan } = props
  const steg = Math.max(1, plan.matvarden.length)
  const flera = plan.matvarden.length > 1
  const totalrad = resultat.rader.length
  const totalkol = resultat.bredd - 1
  const raddim = plan.rader
    .map((id) => findColumn(props.frame, id))
    .filter((c) => c !== undefined)

  /*
   * Radernas ordning.
   *
   * Sorteringen gäller syskon inom sin förälder, aldrig hela listan. Att
   * sortera platt hade slitit isär trädet: en ort hade hamnat under en annan
   * orts rubrik och delsumman hade stått över rader den inte gällde.
   */
  const ordnade = useMemo(() => {
    const barn = new Map<string, number[]>()
    resultat.rader.forEach((rad, i) => {
      const delar = rad.stig.split('/')
      const foralder = delar.slice(0, -1).join('/')
      const lista = barn.get(foralder)
      if (lista) lista.push(i)
      else barn.set(foralder, [i])
    })

    const sort = props.sortering
    if (sort) {
      const plats = (i: number) => (i * resultat.bredd + sort.kol) * steg + sort.m
      const tal = (i: number) => resultat.tal[plats(i)]!
      const text = (i: number) => resultat.text[plats(i)] ?? ''
      for (const lista of barn.values()) {
        lista.sort((a, b) => {
          const ta = tal(a)
          const tb = tal(b)
          const atom = Number.isNaN(ta)
          const btom = Number.isNaN(tb)
          // Tomma celler ligger sist åt båda hållen. En tom cell är okänd, och
          // det okända hör inte hemma i toppen bara för att man vände på pilen.
          if (atom && btom) return sortCollator.compare(text(a), text(b))
          if (atom) return 1
          if (btom) return -1
          return sort.ned ? tb - ta : ta - tb
        })
      }
    }

    const ut: number[] = []
    const ga = (foralder: string) => {
      for (const i of barn.get(foralder) ?? []) {
        ut.push(i)
        ga(resultat.rader[i]!.stig)
      }
    }
    ga('')
    return ut
  }, [resultat, props.sortering, steg])

  const dold = (stig: string): boolean => {
    const delar = stig.split('/')
    for (let i = 1; i < delar.length; i++) {
      if (props.hopfallda.has(delar.slice(0, i).join('/'))) return true
    }
    return false
  }

  /**
   * Har raden barn under sig?
   *
   * Läses ur den ordnade listan, inte ur trädet: i visningsordning står en
   * nods första barn alltid direkt efter den. Att i stället söka upp raden
   * med `indexOf` hade gjort ritningen kvadratisk i antalet rader.
   */
  const harBarn = (plats: number): boolean => {
    const rad = resultat.rader[ordnade[plats]!]!
    const nasta = resultat.rader[ordnade[plats + 1] ?? -1]
    return nasta !== undefined && nasta.niva > rad.niva
  }

  /** Cellens text, med andelen uträknad mot rätt helhet. */
  const cell = (rad: number, kol: number, m: number): string => {
    const i = (rad * resultat.bredd + kol) * steg + m
    const tal = resultat.tal[i]!
    const text = resultat.text[i]
    if (props.visning === 'tal' || Number.isNaN(tal)) return text ?? ''
    const helhet =
      props.visning === 'andelRad'
        ? resultat.tal[(rad * resultat.bredd + totalkol) * steg + m]!
        : resultat.tal[(totalrad * resultat.bredd + kol) * steg + m]!
    if (Number.isNaN(helhet) || helhet === 0) return ''
    return (tal / helhet).toLocaleString('sv-SE', {
      style: 'percent',
      maximumFractionDigits: 1,
    })
  }

  const rubriktext = (rubrik: Pivotrubrik): string => {
    if (rubrik.ovriga) return t('Övriga')
    if (rubrik.tom) return t('(tomt)')
    return rubrik.etikett
  }

  const sorterbar = (kol: number, m: number, namn: string) => (
    <button
      class="pivottab__sortera"
      aria-label={tf('Sortera raderna efter {0}', namn)}
      onClick={() => props.onSortera(kol, m)}
    >
      {props.sortering?.kol === kol && props.sortering.m === m
        ? props.sortering.ned
          ? '↓'
          : '↑'
        : '↕'}
    </button>
  )

  function kolumnnamn(kol: number): string {
    const rubrik = resultat.kolumner[kol]
    return rubrik === undefined ? t('Totalt') : rubriktext(rubrik)
  }

  const cellrader = (rad: number, klass: string) =>
    Array.from({ length: resultat.bredd }, (_, kol) =>
      plan.matvarden.map((m, mi) => (
        <td
          key={`${kol}-${m.id}`}
          class={`pivottab__tal${kol === totalkol ? ' pivottab__tal--total' : ''}${klass}`}
        >
          {visaTal(cell(rad, kol, mi), props.visning)}
        </td>
      )),
    )

  return (
    <div class="pivottab__omslag">
      <table class="pivottab">
        <thead>
          <tr>
            <th class="pivottab__horn" rowSpan={flera ? 2 : 1} colSpan={Math.max(1, raddim.length)}>
              {raddim.map((c) => c.name).join(' › ')}
            </th>
            {resultat.kolumner.map((rubrik, kol) => (
              <th key={kol} class="pivottab__kolrubrik" colSpan={steg}>
                <span class="pivottab__rubriktext" title={rubriktext(rubrik)}>
                  {rubriktext(rubrik)}
                </span>
                {rubrik.ovriga && (
                  <span class="pivottab__ovriga">
                    {tf('{0} värden', formatCount(rubrik.varden))}
                  </span>
                )}
                {!flera && sorterbar(kol, 0, kolumnnamn(kol))}
              </th>
            ))}
            <th class="pivottab__kolrubrik pivottab__kolrubrik--total" colSpan={steg}>
              {t('Totalt')}
              {!flera && sorterbar(totalkol, 0, t('Totalt'))}
            </th>
          </tr>
          {flera && (
            <tr>
              {Array.from({ length: resultat.bredd }, (_, kol) =>
                plan.matvarden.map((m, mi) => (
                  <th key={`${kol}-${m.id}`} class="pivottab__matvarde">
                    {matvardenamn(m, props.frame)}
                    {sorterbar(kol, mi, `${kolumnnamn(kol)} · ${matvardenamn(m, props.frame)}`)}
                  </th>
                )),
              )}
            </tr>
          )}
        </thead>

        <tbody>
          {ordnade.map((i, plats) => {
            const rad = resultat.rader[i]!
            if (dold(rad.stig)) return null
            const fallbar = harBarn(plats)
            const hopfalld = props.hopfallda.has(rad.stig)
            const etikett = rad.ovriga
              ? t('Övriga')
              : rad.tom
                ? t('(tomt)')
                : (rad.etiketter[rad.niva] ?? '')
            return (
              <tr key={rad.stig} class={rad.niva > 0 ? 'pivottab__rad--barn' : undefined}>
                <th
                  class="pivottab__radrubrik"
                  colSpan={Math.max(1, raddim.length)}
                  style={{ paddingLeft: 9 + rad.niva * 16 }}
                >
                  {fallbar && (
                    <button
                      class="pivottab__falla"
                      aria-expanded={!hopfalld}
                      aria-label={tf('Visa eller dölj raderna under {0}', etikett)}
                      onClick={() => props.onVaxlaNod(rad.stig)}
                    >
                      {hopfalld ? '▸' : '▾'}
                    </button>
                  )}
                  <span class="pivottab__rubriktext" title={etikett}>
                    {etikett}
                  </span>
                  <span class="pivottab__radantal">{formatCount(rad.antal)}</span>
                </th>
                {cellrader(i, '')}
              </tr>
            )
          })}
        </tbody>

        <tfoot>
          <tr>
            <th class="pivottab__radrubrik" colSpan={Math.max(1, raddim.length)}>
              {t('Totalt')}
              <span class="pivottab__radantal">{formatCount(resultat.antalKallrader)}</span>
            </th>
            {cellrader(totalrad, ' pivottab__tal--total')}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * Talet så som det ska läsas på skärmen.
 *
 * Kärnan bär full precision, eftersom dess text går vidare till en flik och
 * en avrundning där vore en tyst ändring av data. På skärmen är motsatsen
 * sann: `116,66666666666667` i en cell är ingen läsbar siffra. `formatSum`
 * gör samma avvägning som statusradens snabbsumma redan gör.
 */
function visaTal(text: string, visning: Visning): string {
  if (text === '' || visning !== 'tal') return text
  const tal = Number(text.replace(',', '.'))
  return Number.isNaN(tal) ? text : formatSum(tal)
}

/**
 * Mätvärdets rubrik.
 *
 * Beräkningens ord översätts, kolumnnamnet aldrig — det är data ur filen och
 * ska stå som det står. Samma regel som resten av gränssnittet följer.
 */
function matvardenamn(matvarde: Berakning, frame: Frame): string {
  if (matvarde.namn.trim() !== '') return matvarde.namn.trim()
  const ord = t(berakningspost(matvarde.typ).etikett)
  const col = matvarde.colId === null ? undefined : findColumn(frame, matvarde.colId)
  return col ? `${ord} ${col.name}` : ord
}
