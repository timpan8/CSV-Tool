import { useMemo } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Frame } from '../core/types.js'
import { findColumn } from '../core/frame/frame.js'
import { formatCount, formatSum } from '../core/locale/sv.js'
import type { Kolumnlov, Pivotplan, Pivotresultat, Pivotrubrik } from '../core/ops/pivot.js'
import { matvardenamn } from './matvarde.js'
import { dold, ordnaRader, type Sortering } from './pivotordning.js'
import { sprak, t, tf } from './sprak.js'

/** Hur cellernas tal visas. Andelen är en avläsning, inte en annan beräkning. */
export type Visning = 'tal' | 'andelRad' | 'andelKolumn'

/**
 * Hur radfälten ritas när de är flera.
 *
 * **Indragen** är en lista med nivåer och delsummor — bäst när man vill borra
 * sig ned. **Kolumner** ger varje radfält en egen spalt, som en vanlig tabell
 * man kan läsa i sidled. **Block** lägger det översta radfältets värden bredvid
 * varandra, var och en med sin egen lista: samma uppgifter, men jämförelsen
 * mellan grupperna sker med ögat i stället för med fingret på skärmen.
 */
export type Radlayout = 'indragen' | 'kolumner' | 'block'

export type { Sortering }

/**
 * Rubrikvåningens höjd i pixlar.
 *
 * `position: sticky` behöver sitt `top` i pixlar, och med nästlade kolumnfält
 * kan våningarna bli tre eller fyra. Stilen ger därför varje rubrikcell en
 * fast radhöjd — `line-height` plus dess egen inramning — just för att talet
 * ska gå att räkna ut i stället för att skrivas in en gång och sedan bli fel.
 */
const RUBRIKHOJD = 30

/**
 * Pivotens tabell.
 *
 * En vanlig `<table>` i en rullande ruta, inte rutnätets virtualisering.
 * Skälet är taken i `pivot.ts`: matrisen är som mest några tusen celler, och
 * en `<table>` ger sticky rubriker, radhöjder som anpassar sig och markering
 * med musen gratis. Virtualiseringen finns för filer med hundratusen rader —
 * en pivot med hundratusen rader vore inte en överblick.
 *
 * Rubriken har en våning per kolumnfält, och en till när mätvärdena är flera.
 * Med ett enda kolumnfält och ett enda mätvärde blir det den enda raden.
 */
export function Pivottabell(props: {
  frame: Frame
  plan: Pivotplan
  resultat: Pivotresultat
  visning: Visning
  layout: Radlayout
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
  const rubrikvaningar = Math.max(1, resultat.kolumnnivaer)

  const ordnade = useMemo(
    () => ordnaRader(resultat, props.sortering, steg),
    [resultat, props.sortering, steg],
  )

  const rubriktext = (rubrik: Pivotrubrik | undefined): string => {
    if (rubrik === undefined) return ''
    if (rubrik.ovriga) return t('Övriga')
    if (rubrik.tom) return t('(tomt)')
    return rubrik.etikett
  }

  const radetikett = (rad: { ovriga: boolean; tom: boolean; etiketter: string[]; niva: number }) =>
    rad.ovriga ? t('Övriga') : rad.tom ? t('(tomt)') : (rad.etiketter[rad.niva] ?? '')

  /**
   * Varje rads hela väg, nivå för nivå.
   *
   * Behövs bara i spaltlayouten, där en lövrad bär hela sin väg och inte bara
   * sitt eget värde. Vägen kan inte läsas ur `etiketter` ensamt: en förälder
   * som är Övriga eller tom står som tom sträng där, och `(tomt)` och
   * ”ingenting” är två olika svar. Ordningen är visningsordningen, så
   * föräldern har alltid passerat innan sitt barn.
   */
  const sprakNu = sprak.value
  const vagar = useMemo(() => {
    const senaste: string[] = []
    return ordnade.map((i) => {
      const rad = resultat.rader[i]!
      senaste.length = rad.niva
      senaste[rad.niva] = radetikett(rad)
      return [...senaste]
    })
    // `radetikett` skriver *(tomt)* och *Övriga* på det språk som gäller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordnade, resultat, sprakNu])

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

  /** Kolumnens namn i klartext — hela vägen, för skärmläsaren och titeln. */
  const kolumnnamn = (kol: number): string => {
    const lov = resultat.kolumner[kol]
    if (lov === undefined) return t('Totalt')
    if (lov.ovriga) return t('Övriga')
    return lov.nivaer.map(rubriktext).join(' › ')
  }

  /** Sorteringens riktning på en kolumn, som `aria-sort` vill ha den. */
  const sortlage = (kol: number, m: number): 'ascending' | 'descending' | 'none' =>
    props.sortering?.kol === kol && props.sortering.m === m
      ? props.sortering.ned
        ? 'descending'
        : 'ascending'
      : 'none'

  const sorterbar = (kol: number, m: number, namn: string) => {
    const lage = sortlage(kol, m)
    return (
      <button
        class="pivottab__sortera"
        aria-label={
          lage === 'none'
            ? tf('Sortera raderna efter {0}', namn)
            : lage === 'descending'
              ? tf('Sortera raderna efter {0}, nu fallande', namn)
              : tf('Sortera raderna efter {0}, nu stigande', namn)
        }
        onClick={() => props.onSortera(kol, m)}
      >
        <span aria-hidden="true">{lage === 'none' ? '↕' : lage === 'descending' ? '↓' : '↑'}</span>
      </button>
    )
  }

  /** Två löv delar väg ned till och med våning `n`. */
  const sammaVag = (a: Kolumnlov, b: Kolumnlov, n: number): boolean => {
    if (a.ovriga || b.ovriga) return false
    for (let i = 0; i <= n; i++) if (a.stig[i] !== b.stig[i]) return false
    return true
  }

  /**
   * Rubrikvåningarna.
   *
   * En `<tr>` per kolumnfält. Löv som delar väg ned till våningen slås ihop
   * till en cell — det är den sammanslagningen som gör en nästlad rubrik läsbar,
   * och den enda i tabellen: **cellerna** slås aldrig ihop, eftersom en
   * sammanslagen datacell ser prydlig ut och gör tabellen omöjlig att sortera
   * och kopiera ur.
   */
  const rubrikrader = (horn: JSX.Element[], basTop: number): JSX.Element[] => {
    const rader: JSX.Element[] = []
    const hornSpann = rubrikvaningar + (flera ? 1 : 0)

    for (let n = 0; n < rubrikvaningar; n++) {
      const topp = basTop + n * RUBRIKHOJD
      const celler: JSX.Element[] = []
      if (n === 0) {
        for (const h of horn) {
          celler.push(
            <th
              key={`horn-${celler.length}`}
              class="pivottab__horn"
              scope="col"
              rowSpan={hornSpann}
              style={{ top: basTop }}
            >
              {h}
            </th>,
          )
        }
      }

      let k = 0
      while (k < resultat.kolumner.length) {
        const lov = resultat.kolumner[k]!
        if (lov.ovriga) {
          // Övriga är många vägar, inte en. Rubriken spänner alla våningar.
          if (n === 0) {
            celler.push(
              <th
                key={`ovriga-${k}`}
                class="pivottab__kolrubrik"
                scope={flera ? 'colgroup' : 'col'}
                aria-sort={flera ? undefined : sortlage(k, 0)}
                rowSpan={rubrikvaningar}
                colSpan={steg}
                style={{ top: basTop }}
              >
                <span class="pivottab__rubriktext">{t('Övriga')}</span>
                <span class="pivottab__ovriga">
                  {tf('{0} kombinationer', formatCount(resultat.doldaKolumnlov))}
                </span>
                {!flera && sorterbar(k, 0, t('Övriga'))}
              </th>,
            )
          }
          k += 1
          continue
        }
        let j = k + 1
        while (j < resultat.kolumner.length && sammaVag(resultat.kolumner[j]!, lov, n)) j += 1
        const rubrik = lov.nivaer[n]
        const text = rubriktext(rubrik)
        const innerst = n === rubrikvaningar - 1
        celler.push(
          <th
            key={`k${n}-${k}`}
            class="pivottab__kolrubrik"
            scope={innerst && !flera ? 'col' : 'colgroup'}
            aria-sort={innerst && !flera ? sortlage(k, 0) : undefined}
            colSpan={(j - k) * steg}
            style={{ top: topp }}
          >
            <span class="pivottab__rubriktext" title={text}>
              {text}
            </span>
            {rubrik?.ovriga && (
              <span class="pivottab__ovriga">{tf('{0} värden', formatCount(rubrik.varden))}</span>
            )}
            {innerst && !flera && sorterbar(k, 0, kolumnnamn(k))}
          </th>,
        )
        k = j
      }

      if (n === 0) {
        celler.push(
          <th
            key="totalt"
            class="pivottab__kolrubrik pivottab__kolrubrik--total"
            scope={flera ? 'colgroup' : 'col'}
            aria-sort={flera ? undefined : sortlage(totalkol, 0)}
            rowSpan={rubrikvaningar}
            colSpan={steg}
            style={{ top: basTop }}
          >
            {t('Totalt')}
            {!flera && sorterbar(totalkol, 0, t('Totalt'))}
          </th>,
        )
      }
      rader.push(<tr key={`v${n}`}>{celler}</tr>)
    }

    if (flera) {
      const topp = basTop + rubrikvaningar * RUBRIKHOJD
      rader.push(
        <tr key="matvarden">
          {Array.from({ length: resultat.bredd }, (_, kol) =>
            plan.matvarden.map((m, mi) => (
              <th
                key={`${kol}-${m.id}`}
                class="pivottab__matvarde"
                scope="col"
                aria-sort={sortlage(kol, mi)}
                style={{ top: topp }}
              >
                {matvardenamn(m, props.frame)}
                {sorterbar(kol, mi, `${kolumnnamn(kol)} · ${matvardenamn(m, props.frame)}`)}
              </th>
            )),
          )}
        </tr>,
      )
    }
    return rader
  }

  /*
   * Utan mätvärde finns inga tal, men rubrikerna spänner ändå en spalt var.
   * En tom cell per spalt håller tabellen i form tills något dragits till
   * Värden; en rad utan celler hade fått rubrikerna att stå över ingenting.
   */
  const cellrader = (rad: number, klass: string) =>
    Array.from({ length: resultat.bredd }, (_, kol) =>
      plan.matvarden.length === 0
        ? [
            <td
              key={`${kol}-tom`}
              class={`pivottab__tal${kol === totalkol ? ' pivottab__tal--total' : ''}${klass}`}
            />,
          ]
        : plan.matvarden.map((m, mi) => (
            <td
              key={`${kol}-${m.id}`}
              class={`pivottab__tal${kol === totalkol ? ' pivottab__tal--total' : ''}${klass}`}
            >
              {visaTal(cell(rad, kol, mi), props.visning)}
            </td>
          )),
    )

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

  const fallknapp = (plats: number, stig: string, etikett: string) =>
    harBarn(plats) ? (
      <button
        class="pivottab__falla"
        aria-expanded={!props.hopfallda.has(stig)}
        aria-label={tf('Visa eller dölj raderna under {0}', etikett)}
        onClick={() => props.onVaxlaNod(stig)}
      >
        {props.hopfallda.has(stig) ? '▸' : '▾'}
      </button>
    ) : null

  /** En rad i den indragna listan: ett radrubrikfält med indrag per nivå. */
  const indragenRad = (plats: number, indragFran = 0) => {
    const i = ordnade[plats]!
    const rad = resultat.rader[i]!
    const etikett = radetikett(rad)
    return (
      <tr key={rad.stig} class={rad.niva > indragFran ? 'pivottab__rad--barn' : undefined}>
        <th
          class="pivottab__radrubrik"
          scope="row"
          style={{ paddingLeft: 9 + (rad.niva - indragFran) * 16 }}
        >
          {fallknapp(plats, rad.stig, etikett)}
          <span class="pivottab__rubriktext" title={etikett}>
            {etikett}
          </span>
          <span class="pivottab__radantal">{formatCount(rad.antal)}</span>
        </th>
        {cellrader(i, '')}
      </tr>
    )
  }

  /** En rad i spaltlayouten: ett `<th>` per radfält, med hela vägen utskriven. */
  const spaltRad = (plats: number) => {
    const i = ordnade[plats]!
    const rad = resultat.rader[i]!
    const vag = vagar[plats] ?? []
    const etikett = radetikett(rad)
    return (
      <tr key={rad.stig} class={rad.niva < raddim.length - 1 ? 'pivottab__rad--delsumma' : undefined}>
        {raddim.map((_, n) => (
          <th key={n} class="pivottab__radrubrik" scope={n === rad.niva ? 'row' : undefined}>
            {n === rad.niva && fallknapp(plats, rad.stig, etikett)}
            {n <= rad.niva && (
              <span class="pivottab__rubriktext" title={vag[n] ?? ''}>
                {vag[n] ?? ''}
              </span>
            )}
            {n === rad.niva && <span class="pivottab__radantal">{formatCount(rad.antal)}</span>}
          </th>
        ))}
        {cellrader(i, '')}
      </tr>
    )
  }

  const totalfot = (hornSpan: number) => (
    <tfoot>
      <tr>
        <th class="pivottab__radrubrik" scope="row" colSpan={hornSpan}>
          {t('Totalt')}
          <span class="pivottab__radantal">{formatCount(resultat.antalKallrader)}</span>
        </th>
        {cellrader(totalrad, ' pivottab__tal--total')}
      </tr>
    </tfoot>
  )

  /*
   * Blocklayouten: det översta radfältets värden bredvid varandra.
   *
   * Varje block är en egen tabell med egna kolumnrubriker och egen delsumma i
   * foten, och de rullar i sidled tillsammans. Ett enda radfält har inget att
   * dela upp i block, och då är valet detsamma som den indragna listan.
   */
  const blockgrupper = useMemo(() => {
    const ut: { topp: number; barn: number[] }[] = []
    ordnade.forEach((i, plats) => {
      const rad = resultat.rader[i]!
      if (rad.niva === 0) ut.push({ topp: plats, barn: [] })
      else ut[ut.length - 1]?.barn.push(plats)
    })
    return ut
  }, [ordnade, resultat])

  if (props.layout === 'block' && raddim.length > 1) {
    return (
      <div class="pivottab__omslag pivottab__omslag--block">
        {blockgrupper.map((grupp) => {
          const rad = resultat.rader[ordnade[grupp.topp]!]!
          const etikett = radetikett(rad)
          return (
            <div class="pivottab__block" key={rad.stig}>
              <h4 class="pivottab__blockrubrik" title={etikett}>
                {etikett}
                <span class="pivottab__radantal">{formatCount(rad.antal)}</span>
              </h4>
              <table class="pivottab">
                <thead>
                  {rubrikrader([<>{raddim.slice(1).map((c) => c.name).join(' › ')}</>], RUBRIKHOJD)}
                </thead>
                <tbody>
                  {grupp.barn.map((plats) => {
                    const barn = resultat.rader[ordnade[plats]!]!
                    if (dold(barn.stig, props.hopfallda)) return null
                    return indragenRad(plats, 1)
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th class="pivottab__radrubrik" scope="row">
                      {t('Totalt')}
                      <span class="pivottab__radantal">{formatCount(rad.antal)}</span>
                    </th>
                    {cellrader(ordnade[grupp.topp]!, ' pivottab__tal--total')}
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}
        {blockgrupper.length === 0 && (
          <p class="pivot__tomt">{t('Inga rader att visa.')}</p>
        )}
      </div>
    )
  }

  const spalter = props.layout === 'kolumner' && raddim.length > 0
  const horn = spalter
    ? raddim.map((c) => <>{c.name}</>)
    : [<>{raddim.map((c) => c.name).join(' › ')}</>]

  return (
    <div class="pivottab__omslag">
      <table class={`pivottab${spalter ? ' pivottab--spalter' : ''}`}>
        <thead>{rubrikrader(horn, 0)}</thead>
        <tbody>
          {ordnade.map((i, plats) => {
            const rad = resultat.rader[i]!
            if (dold(rad.stig, props.hopfallda)) return null
            return spalter ? spaltRad(plats) : indragenRad(plats)
          })}
        </tbody>
        {totalfot(horn.length)}
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
