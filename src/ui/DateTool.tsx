import { useEffect, useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { samladOrdbok } from '../core/frame/column.js'
import {
  FORMATNAMN,
  MALFORMAT,
  datumTransform,
  inventera,
  tolkaDatum,
  type Feltillstand,
  type Malformat,
} from '../core/ops/dates.js'
import { beraknaForhandsvisning, sammanfatta, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'
import { kolumnrubrik } from './verktyg.js'

const FELTILLSTAND: { varde: Feltillstand; etikett: string; titel: string }[] = [
  {
    varde: 'behall',
    etikett: 'Låt stå',
    titel: 'Värdet lämnas precis som det är. Du ser själv vilka rader som behöver ses över.',
  },
  { varde: 'markera', etikett: 'Skriv OGILTIGT', titel: 'Gör raderna lätta att filtrera fram efteråt.' },
  { varde: 'tom', etikett: 'Töm cellen', titel: 'Tar bort värdet helt.' },
]

/**
 * Datumverktyget.
 *
 * Ordningen på panelen följer vad användaren faktiskt behöver veta: först
 * *vad som finns i kolumnen* (inventeringen), sedan den enda fråga datat inte
 * kan besvara själv (dag eller månad först), och först därefter vad det ska
 * bli. Att fråga om målformat innan man visat vad som hittats vore att be om
 * ett svar utan att ha ställt frågan.
 */
export function DateTool(props: {
  kolumner: Column[]
  /**
   * Flikens `dataRevision`, inte den globala `revision`.
   *
   * Att räkna om förslaget när *vad som helst* ritats om vore en slinga:
   * förslaget skrivs till fliken → fliken ritas om → förslaget räknas om.
   */
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}) {
  const { kolumner } = props
  /*
   * Kolumnlistan är en ny array vid varje omritning, medan kolumnobjekten
   * är desamma. Att beroendeställa på arrayen skulle räkna om
   * förhandsvisningen varje gång, och effekten som skriver den till fliken
   * skulle rita om — en slinga. Nyckeln är identiteterna, inte arrayen.
   */
  const nyckel = kolumner.map((c) => c.id).join(',')
  const [mal, setMal] = useState<Malformat>('datum')
  const [onError, setOnError] = useState<Feltillstand>('behall')
  const [excelSerie, setExcelSerie] = useState(false)
  // null betyder "inte besvarad än" — skiljt från att ha valt dag först.
  const [svar, setSvar] = useState<boolean | null>(null)

  // Räknat på ordböckerna med cellantal som vikt: varje unikt värde tolkas en
  // gång, men siffrorna som visas är celler — och över alla valda kolumner,
  // eftersom det är dem Tillämpa kommer att röra.
  const { varden, vikter } = useMemo(
    () => samladOrdbok(kolumner),
    [nyckel, props.dataRevision],
  )
  const grundinventering = useMemo(
    () => inventera(varden, { dagForst: true, excelSerie }, vikter),
    [varden, vikter, excelSerie],
  )

  const bevisSvar = grundinventering.bevis !== null ? grundinventering.bevisSagerDagForst : null
  const dagForst = svar ?? bevisSvar ?? true
  const maasteSvara = grundinventering.tvetydig && svar === null

  const inst = { dagForst, excelSerie, mal, onError }

  const forhLista = useMemo(
    () =>
      kolumner.map((col) =>
        beraknaForhandsvisning(col, {
          etikett: `Datum i ”${col.name}” → ${MALFORMAT.find((m) => m.varde === mal)!.etikett}`,
          kind: 'dates',
          profil: { typ: 'datum', kolumn: col.name, inst },
          fn: datumTransform(inst),
          arProblem: (v) => tolkaDatum(v, inst).datum === null,
          // Bara ett rent datum gör kolumnen till en datumkolumn. ÅÅÅÅ-MM och
          // ÅÅÅÅ är sammanfattningar, inte datum, och ska inte typas som sådana.
          nyTyp: mal === 'datum' ? 'date' : undefined,
        }),
      ),
    [nyckel, props.dataRevision, dagForst, excelSerie, mal, onError],
  )
  const forh = sammanfatta(forhLista)

  // Förhandsvisningen är levande: panelen ligger bredvid tabellen, inte över
  // den, så det finns ingen anledning att göra det till ett extra klick.
  useEffect(() => {
    props.onForhandsvisning(forhLista)
  }, [forhLista])

  useEffect(() => {
    return () => props.onForhandsvisning(null)
  }, [])

  const exempelTvetydigt =
    grundinventering.poster.find((p) => p.format === 'punkt-eller-snedstreck')?.exempel[0] ??
    '03/04/2026'

  return (
    <Verktygspanel
      titel="Datum"
      underrubrik={kolumnrubrik(kolumner)}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0 || maasteSvara}
            title={
              maasteSvara
                ? 'Svara först på om dagen eller månaden står först.'
                : forh.andrade === 0
                  ? 'Ingenting skulle ändras.'
                  : undefined
            }
            onClick={() => props.onTillampa(forhLista)}
          >
            {kolumner.length > 1 ? `Tillämpa på ${kolumner.length} kolumner` : 'Tillämpa'}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Det här finns i kolumnen</span>
        <table class="inventering">
          <tbody>
            {grundinventering.poster.map((post) => (
              <tr key={post.format} class={post.format === 'okant' ? 'inventering--okant' : ''}>
                <td class="inventering__antal">{formatCount(post.antal)}</td>
                <td>{FORMATNAMN[post.format]}</td>
                <td class="inventering__exempel">{post.exempel.join('  ')}</td>
              </tr>
            ))}
            {grundinventering.poster.length === 0 && (
              <tr>
                <td colSpan={3} class="inventering__exempel">
                  Kolumnen är tom.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grundinventering.bevis !== null && (
        <Notis ton="lyckat">
          Kolumnen svarar själv: <code>{grundinventering.bevis}</code> kan bara läsas{' '}
          {grundinventering.bevisSagerDagForst ? 'med dagen först' : 'med månaden först'}, eftersom
          det ena talet är större än 12. Samma ordning används för hela kolumnen.
        </Notis>
      )}

      {grundinventering.tvetydig && (
        <div class="falt">
          <span class="falt__etikett">
            Står dagen eller månaden först i <code>{exempelTvetydigt}</code>?
          </span>
          <Val
            varden={[
              { varde: 'dag' as const, etikett: 'Dagen först', titel: 'Svensk och europeisk ordning.' },
              { varde: 'manad' as const, etikett: 'Månaden först', titel: 'Amerikansk ordning.' },
            ]}
            valt={svar === null ? null : svar ? 'dag' : 'manad'}
            onValj={(v) => setSvar(v === 'dag')}
          />
          {maasteSvara && (
            <Notis ton="varning">
              Inget värde i kolumnen avgör saken — alla dag- och månadstal är 12 eller lägre. Att
              gissa här skulle flytta datum flera månader utan att det syns, så frågan måste
              besvaras.
            </Notis>
          )}
        </div>
      )}

      {grundinventering.mojligaExcelSerier > 0 && (
        <label class="kryss">
          <input
            type="checkbox"
            checked={excelSerie}
            onChange={(e) => setExcelSerie((e.currentTarget as HTMLInputElement).checked)}
          />
          Tolka de {formatCount(grundinventering.mojligaExcelSerier)} rena talen som Exceldatum
        </label>
      )}

      <div class="falt">
        <span class="falt__etikett">Skriv om till</span>
        <Val
          varden={MALFORMAT.map((m) => ({ varde: m.varde, etikett: m.etikett, titel: m.exempel }))}
          valt={mal}
          onValj={setMal}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Värden som inte går att tolka</span>
        <Val varden={FELTILLSTAND} valt={onError} onValj={setOnError} />
      </div>

      <div class="falt">
        <span class="falt__etikett">Vad som händer</span>
        <p class="verktyg__sammanfattning verktyg__resultat">
          <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} skrivs om
          {forh.problem > 0 && (
            <>
              {' · '}
              <strong class="verktyg__problem">{formatCount(forh.problem)}</strong> går inte att
              tolka
            </>
          )}
          .
        </p>
        <div class="val" role="radiogroup">
          <button
            class={`val__knapp${props.visaBara === undefined ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === undefined}
            onClick={() => props.onVisaBara(undefined)}
          >
            Alla rader
          </button>
          <button
            class={`val__knapp${props.visaBara === 'andrade' ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === 'andrade'}
            disabled={forh.andrade === 0}
            onClick={() => props.onVisaBara('andrade')}
          >
            Bara ändrade
          </button>
          <button
            class={`val__knapp${props.visaBara === 'problem' ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === 'problem'}
            disabled={forh.problem === 0}
            onClick={() => props.onVisaBara('problem')}
          >
            Bara problem
          </button>
        </div>
      </div>

      <Notis ton="info">
        Tabellen visar <span class="forhand__fore">före</span>{' '}
        <span class="forhand__pil">→</span> <span class="forhand__efter">efter</span> i kolumnen.
        Ingenting är ändrat förrän du klickar Tillämpa, och Ctrl+Z tar tillbaka det efteråt.
      </Notis>
    </Verktygspanel>
  )
}
