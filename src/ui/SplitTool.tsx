import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { codeCounts } from '../core/frame/column.js'
import {
  DELNINGSSATT,
  STANDARDDELNING,
  delaVarde,
  inventeraDelning,
  type Delning,
  type Delningssatt,
} from '../core/ops/columns.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

const AVGRANSARE = [
  { varde: ' ', etikett: 'Mellanslag' },
  { varde: ',', etikett: 'Komma' },
  { varde: ';', etikett: 'Semikolon' },
  { varde: '-', etikett: 'Bindestreck' },
  { varde: 'eget', etikett: 'Eget…' },
] as const

/**
 * Delar en kolumn i flera.
 *
 * De nya kolumnerna visas som spökkolumner intill källan, en per målkolumn,
 * så att antalet och fördelningen syns innan något skapas. Källkolumnen står
 * kvar: det är originalet, och delningen är en tolkning.
 */
export function SplitTool(props: {
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}) {
  const { col } = props
  const [satt, setSatt] = useState<Delningssatt>(STANDARDDELNING.satt)
  const [avgransarval, setAvgransarval] = useState<(typeof AVGRANSARE)[number]['varde']>(' ')
  const [egen, setEgen] = useState('|')
  const [position, setPosition] = useState(3)
  const [antal, setAntal] = useState(2)
  const [namn, setNamn] = useState<string[]>([`${col.name} 1`, `${col.name} 2`])

  const avgransare = avgransarval === 'eget' ? egen : avgransarval
  const inst: Delning = { satt, avgransare, position, antal, trimma: true }

  const koder = useMemo(() => codeCounts(col), [col, props.dataRevision])
  const inv = useMemo(
    () => inventeraDelning(col.dict, inst, koder),
    [col, props.dataRevision, koder, satt, avgransare, position, antal],
  )

  const malnamn = useMemo(
    () => Array.from({ length: antal }, (_, i) => namn[i] ?? `${col.name} ${i + 1}`),
    [antal, namn, col.name],
  )

  const forh = useMemo(
    () =>
      beraknaForhandsvisning(col, {
        etikett: `Delade ”${col.name}” i ${formatCount(antal)} kolumner`,
        kind: 'split',
        profil: { typ: 'dela', kolumn: col.name, delning: inst, namn: malnamn },
        delar: (v) => delaVarde(v, inst),
        arProblem: (v) => delaVarde(v, inst).filter((d) => d !== '').length < 2,
        nyaKolumner: malnamn,
      }),
    [col, props.dataRevision, satt, avgransare, position, antal, malnamn],
  )

  useEffect(() => {
    props.onForhandsvisning(forh)
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  // Namnlistan utgår från de synliga namnen, inte från det som råkar ligga i
  // läget: har antalet kolumner just höjts finns det ännu inget sparat namn
  // för de nya platserna.
  const sattNamn = (i: number, v: string) => {
    const kopia = [...malnamn]
    kopia[i] = v
    setNamn(kopia)
  }

  return (
    <Verktygspanel
      titel="Dela kolumn"
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0}
            title={forh.andrade === 0 ? 'Delningen ger inga värden.' : undefined}
            onClick={() => props.onTillampa(forh)}
          >
            Skapa {formatCount(antal)} kolumner
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Dela</span>
        <Val
          varden={DELNINGSSATT.map((d) => ({ varde: d.varde, etikett: d.etikett, titel: d.titel }))}
          valt={satt}
          onValj={setSatt}
        />
      </div>

      {satt === 'position' ? (
        <div class="falt">
          <span class="falt__etikett">Efter hur många tecken</span>
          <input
            type="number"
            min={1}
            value={position}
            onInput={(e) =>
              setPosition(Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 1))
            }
          />
        </div>
      ) : (
        <div class="falt">
          <span class="falt__etikett">Vid vilket tecken</span>
          <Val varden={AVGRANSARE} valt={avgransarval} onValj={setAvgransarval} />
          {avgransarval === 'eget' && (
            <input
              value={egen}
              onInput={(e) => setEgen((e.currentTarget as HTMLInputElement).value)}
            />
          )}
        </div>
      )}

      <div class="falt">
        <span class="falt__etikett">Antal nya kolumner</span>
        <Val
          varden={[2, 3, 4, 5].map((n) => ({ varde: String(n), etikett: String(n) }))}
          valt={String(antal)}
          onValj={(v) => setAntal(Number(v))}
        />
        {inv.flest > antal && (
          <Notis ton="varning">
            Något värde delas i {formatCount(inv.flest)} delar. Överskottet hamnar i den sista
            kolumnen i stället för att försvinna — höj antalet om du vill ha det för sig.
          </Notis>
        )}
      </div>

      <div class="falt">
        <span class="falt__etikett">Namn på de nya kolumnerna</span>
        {malnamn.map((n, i) => (
          <input
            key={i}
            value={n}
            onInput={(e) => sattNamn(i, (e.currentTarget as HTMLInputElement).value)}
          />
        ))}
      </div>

      {inv.exempel && (
        <p class="verktyg__sammanfattning">
          <code>{inv.exempel.fore}</code> blir{' '}
          {inv.exempel.efter.map((d, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <strong>{d === '' ? '(tomt)' : d}</strong>
            </span>
          ))}
        </p>
      )}

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={forh.problem}
        etikettAndrade="Bara ifyllda"
        etikettProblem="Bara odelade"
      >
        <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} ger värden
        {inv.utanAvgransare > 0 && (
          <>
            {' · '}
            <strong class="verktyg__problem">{formatCount(inv.utanAvgransare)}</strong> saknar
            avgränsare
          </>
        )}
        .
      </Resultat>
    </Verktygspanel>
  )
}
