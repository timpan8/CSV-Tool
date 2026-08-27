import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column, Frame } from '../core/types.js'
import { FUNKTIONSHJALP, formelTransform, tolkaFormel } from '../core/ops/formel.js'
import { TALFORMAT, skrivTal, type Talformat } from '../core/ops/numbers.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

const DECIMALVAL = [
  { varde: 'som-det-blir' as const, etikett: 'Så många som behövs' },
  { varde: '0' as const, etikett: '0' },
  { varde: '2' as const, etikett: '2' },
]

/**
 * Beräknad kolumn.
 *
 * Resultatet beror på hela raden och inte på ett enda värde, så
 * förhandsvisningen räknas per rad — samma oundvikliga kostnad som mallen
 * bär, och den står i `perRad` i stället för att döljas.
 *
 * Felet i formeln visas medan man skriver, precis som i sök & ersätt och i
 * filtrets reguljära uttryck. En halvskriven formel ska se ut som en
 * halvskriven formel, inte som en kolumn som blev tom.
 */
export function CalcTool(props: {
  col: Column
  frame: Frame
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}) {
  const { col, frame } = props
  const [uttryck, setUttryck] = useState('')
  const [namn, setNamn] = useState('Beräknad')
  const [format, setFormat] = useState<Talformat>('komma')
  const [decimalval, setDecimalval] = useState<(typeof DECIMALVAL)[number]['varde']>('som-det-blir')

  const decimaler = decimalval === 'som-det-blir' ? null : Number(decimalval)
  const tolkning = useMemo(
    () => tolkaFormel(uttryck, frame),
    [uttryck, frame, props.dataRevision],
  )
  const rent = namn.trim() === '' ? 'Beräknad' : namn.trim()

  const forh = useMemo(() => {
    const rot = tolkning.rot
    const rakna = rot ? formelTransform(rot, (n) => skrivTal(n, format, decimaler)) : null
    return beraknaForhandsvisning(
      col,
      {
        etikett: `Beräknade ”${rent}”`,
        kind: 'formel',
        profil: { typ: 'formel', uttryck, namn: rent, format, decimaler },
        rad: (f, row) => [rakna ? rakna(f, row) : ''],
        nyaKolumner: [rent],
      },
      frame,
    )
  }, [col, frame, props.dataRevision, tolkning, rent, format, decimaler])

  useEffect(() => {
    props.onForhandsvisning([forh])
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  const infoga = (text: string) => setUttryck((u) => (u === '' ? text : `${u} ${text}`))
  const kanKoras = tolkning.rot !== null && forh.andrade > 0

  return (
    <Verktygspanel
      titel="Räkna"
      underrubrik={rent}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={!kanKoras}
            title={
              tolkning.rot === null
                ? 'Skriv en formel som går att räkna.'
                : forh.andrade === 0
                  ? 'Ingen rad gav ett värde.'
                  : undefined
            }
            onClick={() => props.onTillampa([forh])}
          >
            Skapa kolumnen
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Formel</span>
        <input
          class="formel__falt"
          value={uttryck}
          placeholder="{Antal} * {Pris}"
          aria-label="Formel"
          onInput={(e) => setUttryck((e.currentTarget as HTMLInputElement).value)}
        />
        {tolkning.fel !== null && <div class="regel__fel">{tolkning.fel}</div>}
        <p class="verktyg__sammanfattning">
          Fyra räknesätt och parenteser. Skriv <code>{'{Kolumnnamn}'}</code> för ett värde ur
          raden. Tal skrivs som i filen: <code>1 240,50</code> eller <code>1240.5</code>.
        </p>
      </div>

      <div class="falt">
        <span class="falt__etikett">Lägg till kolumn</span>
        <div class="val" role="group">
          {frame.columns
            .filter((c) => !c.hidden)
            .map((c) => (
              <button
                key={c.id}
                class="val__knapp"
                title={c.type === 'date' ? 'Datum räknas som antal dagar.' : undefined}
                onClick={() => infoga(`{${c.name}}`)}
              >
                {c.name}
              </button>
            ))}
        </div>
      </div>

      <div class="falt">
        <span class="falt__etikett">Funktioner</span>
        <div class="val" role="group">
          {FUNKTIONSHJALP.map((f) => (
            <button
              key={f.namn}
              class="val__knapp"
              title={f.hjalp}
              onClick={() => infoga(`${f.namn.slice(0, f.namn.indexOf('('))}(`)}
            >
              {f.namn.slice(0, f.namn.indexOf('('))}
            </button>
          ))}
        </div>
      </div>

      {tolkning.anvanda.some((n) => frame.columns.find((c) => c.name === n)?.type === 'date') && (
        <Notis ton="info">
          En datumkolumn räknas som antal dagar, så <code>{'{Slut} - {Start}'}</code> ger
          skillnaden i dagar. Resultatet är alltid ett tal — verktyget gissar aldrig att du ville
          ha ett datum tillbaka.
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">Decimaler</span>
        <Val varden={DECIMALVAL} valt={decimalval} onValj={setDecimalval} />
      </div>

      <div class="falt">
        <span class="falt__etikett">Decimaltecken</span>
        <Val
          varden={TALFORMAT.map((f) => ({ varde: f.varde, etikett: f.etikett, titel: f.exempel }))}
          valt={format}
          onValj={setFormat}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Namn på den nya kolumnen</span>
        <input value={namn} onInput={(e) => setNamn((e.currentTarget as HTMLInputElement).value)} />
      </div>

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={forh.problem}
      >
        <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} får ett värde
        {forh.andrade < forh.ifyllda && tolkning.rot !== null && (
          <>
            {' · '}
            <strong class="verktyg__problem">
              {formatCount(forh.ifyllda - forh.andrade)}
            </strong>{' '}
            blir tomma, eftersom något värde saknas eller inte är ett tal
          </>
        )}
      </Resultat>
    </Verktygspanel>
  )
}
