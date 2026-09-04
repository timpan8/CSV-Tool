import { useState } from 'preact/hooks'
import { Flag, type Column, type Frame } from '../core/types.js'
import { getCell, hasFlag } from '../core/frame/column.js'
import { findColumn, visibleColumns } from '../core/frame/frame.js'
import {
  nyckelavvikelse,
  nyckelForRad,
  type Matchningspar,
  type Nyckeldel,
} from '../core/ops/match.js'
import { rubriknyckel } from '../core/ops/rubriker.js'
import { t, tf } from './sprak.js'

/**
 * Två rader ställda mot varandra, fält för fält.
 *
 * Restlistan svarar på *att* raderna blev över. Den här svarar på *varför*:
 * vilket fält som skiljer sig, och vad jämförelsen faktiskt gjorde med värdet
 * innan den jämförde. Verkstaden var fram till nu den enda platsen i verktyget
 * där man inte kunde se att `Öberg` blir `oberg` — trots att det är precis där
 * man sitter och undrar varför två rader inte hörde ihop.
 *
 * Fälten paras ihop, aldrig positionellt. Först kolumnparen användaren själv
 * ställt in — de enda kopplingar verktyget faktiskt känner. Sedan kolumner vars
 * rubriker normaliserat heter samma sak, och de märks som gissningar. Resten
 * står för sig, under sin egen fil.
 *
 * Bänken fungerar med bara en rad vald. Det är det vanligaste läget: man har
 * markerat en rad och letar efter dess partner, och då ska fälten synas ändå.
 */
export function Jamforelse(props: {
  vanster: Frame
  hoger: Frame
  vansterRad: number | null
  hogerRad: number | null
  par: readonly Matchningspar[]
  onRatta: (sida: 'vanster' | 'hoger', col: Column, varde: string) => void
}) {
  const rader = byggRader(props)
  if (props.vansterRad === null && props.hogerRad === null) {
    return (
      <div class="jamforelse jamforelse--tom">
        <p class="restlista__tom">
          {t(
            'Markera en rad i någon av listorna, så visas dess fält här. Med en rad vald i vardera listan ställs de mot varandra.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div class="jamforelse">
      <div class="jamforelse__topp">
        <span class="jamforelse__fil">
          {props.vansterRad === null ? <em>{t('ingen rad vald')}</em> : props.vanster.name}
        </span>
        <span class="jamforelse__fil">
          {props.hogerRad === null ? <em>{t('ingen rad vald')}</em> : props.hoger.name}
        </span>
      </div>
      <div class="jamforelse__falt">
        {rader.map((rad) => (
          <Faltrad key={rad.id} rad={rad} onRatta={props.onRatta} />
        ))}
      </div>
    </div>
  )
}

/** En fältrad: etikett i mitten, ett värde per sida. */
interface Rad {
  id: string
  etikett: string
  /** Sant för de kolumner matchningen faktiskt jämför. */
  nyckel: boolean
  /** Sant när kopplingen är gissad ur rubriknamnen och inte vald. */
  gissad: boolean
  vanster: Sida | null
  hoger: Sida | null
  /** Nyckeldelarnas dom, för nyckelrader med båda sidorna valda. */
  utfall: Utfall | null
}

type Utfall = 'lika' | 'skiljer' | 'tom'

interface Sida {
  sida: 'vanster' | 'hoger'
  col: Column
  rad: number
  varde: string
  /** Värdet saknades i filen — inte samma sak som tomt. */
  saknat: boolean
  /** Den normaliserade nyckeln, när den skiljer sig från värdet. */
  norm: string | null
  /** Tecknen som skiljer sig från andra sidans nyckel: [från, till). */
  avvikelse: [number, number] | null
}

function byggRader(props: {
  vanster: Frame
  hoger: Frame
  vansterRad: number | null
  hogerRad: number | null
  par: readonly Matchningspar[]
}): Rad[] {
  const { vanster, hoger, vansterRad, hogerRad, par } = props
  const vDelar = vansterRad === null ? [] : nyckelForRad(vanster, par, 'vanster', vansterRad)
  const hDelar = hogerRad === null ? [] : nyckelForRad(hoger, par, 'hoger', hogerRad)

  const ut: Rad[] = []
  const tagnaV = new Set<string>()
  const tagnaH = new Set<string>()

  // 1. Kolumnparen. Det är de enda kopplingar verktyget känner, och de enda
  //    fält vars olikhet faktiskt förklarar varför raderna inte matchade.
  par.forEach((p, i) => {
    const vCol = findColumn(vanster, p.vansterColId)
    const hCol = findColumn(hoger, p.hogerColId)
    const hCol2 = p.hogerColId2 === undefined ? undefined : findColumn(hoger, p.hogerColId2)
    if (vCol) tagnaV.add(vCol.id)
    if (hCol) tagnaH.add(hCol.id)
    if (hCol2) tagnaH.add(hCol2.id)

    const vDel = vDelar[i]
    const hDel = hDelar[i]
    const kant =
      vDel && hDel && vDel.nyckel !== '' && hDel.nyckel !== ''
        ? nyckelavvikelse(vDel.nyckel, hDel.nyckel)
        : null
    ut.push({
      id: `par${i}`,
      etikett: etikett(vCol, hCol, hCol2),
      nyckel: true,
      gissad: false,
      vanster: sidan('vanster', vCol, vansterRad, vDel, kant?.v ?? null),
      hoger: sidan('hoger', hCol, hogerRad, hDel, kant?.h ?? null, hCol2),
      utfall: utfallet(vDel, hDel, vansterRad, hogerRad),
    })
  })

  // 2. Kolumner vars rubriker betyder samma sak. Märks som gissning: verktyget
  //    jämför dem inte, det bara ställer dem bredvid varandra.
  const hKvar = visibleColumns(hoger).filter((c) => !tagnaH.has(c.id))
  const hPerNamn = new Map(hKvar.map((c) => [rubriknyckel(c.name), c]))
  for (const vCol of visibleColumns(vanster)) {
    if (tagnaV.has(vCol.id)) continue
    const hCol = hPerNamn.get(rubriknyckel(vCol.name))
    if (!hCol || tagnaH.has(hCol.id)) continue
    tagnaV.add(vCol.id)
    tagnaH.add(hCol.id)
    ut.push({
      id: `gissad${vCol.id}`,
      etikett: etikett(vCol, hCol),
      nyckel: false,
      gissad: true,
      vanster: sidan('vanster', vCol, vansterRad, undefined, null),
      hoger: sidan('hoger', hCol, hogerRad, undefined, null),
      utfall: null,
    })
  }

  // 3. Resten står för sig. Att para ihop dem på position vore en gissning
  //    verktyget inte har täckning för.
  for (const vCol of visibleColumns(vanster)) {
    if (tagnaV.has(vCol.id)) continue
    ut.push({
      id: `v${vCol.id}`,
      etikett: vCol.name,
      nyckel: false,
      gissad: false,
      vanster: sidan('vanster', vCol, vansterRad, undefined, null),
      hoger: null,
      utfall: null,
    })
  }
  for (const hCol of visibleColumns(hoger)) {
    if (tagnaH.has(hCol.id)) continue
    ut.push({
      id: `h${hCol.id}`,
      etikett: hCol.name,
      nyckel: false,
      gissad: false,
      vanster: null,
      hoger: sidan('hoger', hCol, hogerRad, undefined, null),
      utfall: null,
    })
  }
  return ut
}

function sidan(
  sida: 'vanster' | 'hoger',
  col: Column | undefined,
  rad: number | null,
  del: Nyckeldel | undefined,
  avvikelse: [number, number] | null,
  col2?: Column,
): Sida | null {
  if (!col || rad === null) return null
  const varde = del ? del.varde : getCell(col, rad)
  const norm = del && del.nyckel !== '' && del.nyckel !== varde ? del.nyckel : null
  return {
    sida,
    col,
    rad,
    varde,
    // Läses ur den kolumn som faktiskt bär värdet. Ett par som läser två
    // kolumner har inget enda ursprung, och då är frågan inte meningsfull.
    saknat: col2 === undefined && hasFlag(col, rad, Flag.Padded),
    norm,
    avvikelse: norm === null ? null : avvikelse,
  }
}

function utfallet(
  vDel: Nyckeldel | undefined,
  hDel: Nyckeldel | undefined,
  vansterRad: number | null,
  hogerRad: number | null,
): Utfall | null {
  if (vansterRad === null || hogerRad === null || !vDel || !hDel) return null
  if (vDel.nyckel === '' || hDel.nyckel === '') return 'tom'
  return vDel.nyckel === hDel.nyckel ? 'lika' : 'skiljer'
}

function etikett(v?: Column, h?: Column, h2?: Column): string {
  const hNamn = h2 ? `${h?.name ?? '—'} + ${h2.name}` : (h?.name ?? '—')
  if (!v) return hNamn
  if (!h) return v.name
  return v.name === hNamn ? v.name : `${v.name} ↔ ${hNamn}`
}

function Faltrad(props: {
  rad: Rad
  onRatta: (sida: 'vanster' | 'hoger', col: Column, varde: string) => void
}) {
  const { rad } = props
  const klass = [
    'jamforelse__rad',
    rad.nyckel ? 'jamforelse__rad--nyckel' : '',
    rad.utfall ? `jamforelse__rad--${rad.utfall}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div class={klass} data-falt={rad.etikett}>
      <div class="jamforelse__etikett">
        <span>{rad.etikett}</span>
        {rad.nyckel && <span class="jamforelse__marke">{t('nyckel')}</span>}
        {rad.gissad && (
          <span
            class="jamforelse__marke jamforelse__marke--gissad"
            title={t('Kopplad på rubriknamnet, inte av matchningen.')}
          >
            {t('gissad')}
          </span>
        )}
        {rad.utfall === 'tom' && (
          <span class="jamforelse__utfall">{t('tom nyckel — kan aldrig matcha')}</span>
        )}
        {rad.utfall === 'skiljer' && <span class="jamforelse__utfall">{t('skiljer sig')}</span>}
      </div>
      <Cell sida={rad.vanster} onRatta={props.onRatta} />
      <Cell sida={rad.hoger} onRatta={props.onRatta} />
    </div>
  )
}

/** Ett värde, redigerbart på plats. Rättningen går till källfliken. */
function Cell(props: {
  sida: Sida | null
  onRatta: (sida: 'vanster' | 'hoger', col: Column, varde: string) => void
}) {
  const [utkast, setUtkast] = useState<string | null>(null)
  const s = props.sida
  if (!s) return <div class="jamforelse__cell jamforelse__cell--saknas">—</div>

  if (utkast !== null) {
    return (
      <div class="jamforelse__cell">
        <input
          class="jamforelse__input"
          value={utkast}
          autoFocus
          aria-label={tf(
            '{0} i {1}',
            s.col.name,
            t(s.sida === 'vanster' ? 'vänsterfilen' : 'högerfilen'),
          )}
          onInput={(e) => setUtkast((e.currentTarget as HTMLInputElement).value)}
          onBlur={() => {
            props.onRatta(s.sida, s.col, utkast)
            setUtkast(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              props.onRatta(s.sida, s.col, utkast)
              setUtkast(null)
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setUtkast(null)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div class="jamforelse__cell">
      <button
        class="jamforelse__varde"
        title={t('Klicka för att rätta värdet i källfilen')}
        onClick={() => setUtkast(s.varde)}
      >
        {s.varde === '' ? (
          <em class="restrad__tomt">{t(s.saknat ? 'saknades' : 'tomt')}</em>
        ) : (
          s.varde
        )}
      </button>
      {s.norm !== null && (
        <span class="jamforelse__norm">
          {/*
           * Avvikelsen målas bara där det finns något att måla. Har den ena
           * sidan bara *mindre* text är dess intervall tomt, och en tom `mark`
           * vore osynlig markup som ändå påstår att här finns en skillnad.
           */}
          {s.avvikelse === null || s.avvikelse[0] === s.avvikelse[1] ? (
            s.norm
          ) : (
            <>
              {s.norm.slice(0, s.avvikelse[0])}
              <mark>{s.norm.slice(s.avvikelse[0], s.avvikelse[1])}</mark>
              {s.norm.slice(s.avvikelse[1])}
            </>
          )}
        </span>
      )}
    </div>
  )
}
