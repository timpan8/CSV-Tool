import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { codeCounts } from '../core/frame/column.js'
import {
  TELEFONFORMAT,
  inventeraTelefon,
  telefonTransform,
  tolkaTelefon,
  type Telefonformat,
} from '../core/ops/phone.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

type Feltillstand = 'behall' | 'tom' | 'markera'

const FELTILLSTAND: { varde: Feltillstand; etikett: string; titel: string }[] = [
  { varde: 'behall', etikett: 'Låt stå', titel: 'Värdet lämnas som det är.' },
  { varde: 'markera', etikett: 'Skriv OGILTIGT', titel: 'Gör raderna lätta att filtrera fram.' },
  { varde: 'tom', etikett: 'Töm cellen', titel: 'Tar bort värdet helt.' },
]

const LANDSNUMMER = [
  { varde: '46', etikett: 'Sverige +46' },
  { varde: '47', etikett: 'Norge +47' },
  { varde: '45', etikett: 'Danmark +45' },
  { varde: '358', etikett: 'Finland +358' },
] as const

export function PhoneTool(props: {
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}) {
  const { col } = props
  const [format, setFormat] = useState<Telefonformat>('e164')
  const [land, setLand] = useState<(typeof LANDSNUMMER)[number]['varde']>('46')
  const [onError, setOnError] = useState<Feltillstand>('behall')

  const inst = { landsnummer: Number(land), format, onError }

  const antal = useMemo(() => codeCounts(col), [col, props.dataRevision])
  const inv = useMemo(
    () => inventeraTelefon(col.dict, inst, antal),
    [col, props.dataRevision, antal, land, format],
  )

  const forh = useMemo(
    () =>
      beraknaForhandsvisning(col, {
        etikett: `Normaliserade telefonnummer i ”${col.name}”`,
        kind: 'phone',
        profil: { typ: 'telefon', kolumn: col.name, inst },
        fn: telefonTransform(inst),
        arProblem: (v) => tolkaTelefon(v, inst).siffror === null,
      }),
    [col, props.dataRevision, land, format, onError],
  )

  useEffect(() => {
    props.onForhandsvisning(forh)
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  return (
    <Verktygspanel
      titel="Telefon"
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
            title={forh.andrade === 0 ? 'Ingenting skulle ändras.' : undefined}
            onClick={() => props.onTillampa(forh)}
          >
            Tillämpa
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Det här finns i kolumnen</span>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(inv.nummer)}</td>
              <td>telefonnummer</td>
              <td class="inventering__exempel">
                {inv.exempel ? `${inv.exempel.fore} → ${inv.exempel.efter}` : ''}
              </td>
            </tr>
            {inv.ejNummer > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(inv.ejNummer)}</td>
                <td>går inte att tolka</td>
                <td class="inventering__exempel">{inv.exempelOgiltigt ?? ''}</td>
              </tr>
            )}
            <tr>
              <td class="inventering__antal">{formatCount(inv.medLandskod)}</td>
              <td>har redan landskod</td>
              <td class="inventering__exempel" />
            </tr>
            {inv.utlandska > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(inv.utlandska)}</td>
                <td>är utländska</td>
                <td class="inventering__exempel" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div class="falt">
        <span class="falt__etikett">Nummer utan landskod tillhör</span>
        <Val varden={LANDSNUMMER} valt={land} onValj={setLand} />
      </div>

      <div class="falt">
        <span class="falt__etikett">Skriv om till</span>
        <Val
          varden={TELEFONFORMAT.map((f) => ({ varde: f.varde, etikett: f.etikett }))}
          valt={format}
          onValj={setFormat}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Värden som inte är telefonnummer</span>
        <Val varden={FELTILLSTAND} valt={onError} onValj={setOnError} />
      </div>

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={forh.problem}
        etikettProblem="Bara problem"
      >
        <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} skrivs om
        {forh.problem > 0 && (
          <>
            {' · '}
            <strong class="verktyg__problem">{formatCount(forh.problem)}</strong> går inte att
            tolka
          </>
        )}
        .
      </Resultat>

      <Notis ton="info">
        Numret skrivs utan mellanrum. Att gruppera <code>+46 70 123 45 67</code> kräver att man vet
        hur långt riktnumret är, och det är två till fyra siffror beroende på ort — en gissning som
        blir fel ser fortfarande rimlig ut.
      </Notis>
    </Verktygspanel>
  )
}
