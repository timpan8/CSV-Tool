import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis } from './parts.js'
import type { Column, Frame } from '../core/types.js'
import { korMall, tolkaMall } from '../core/ops/columns.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

/**
 * Slår ihop flera kolumner till en, styrt av en mall.
 *
 * Till skillnad från de andra verktygen beror resultatet på hela raden och
 * inte på ett enda värde, så förhandsvisningen räknas per rad. Det är dyrare
 * och kan inte undvikas — men det står i `perRad` i stället för att döljas.
 */
export function MergeTool(props: {
  col: Column
  frame: Frame
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}) {
  const { col, frame } = props
  const [mall, setMall] = useState(`{${col.name}} `)
  const [namn, setNamn] = useState('Sammanslagen')
  const [stadaLuckor, setStadaLuckor] = useState(true)

  const tolkning = useMemo(
    () => tolkaMall(mall, frame),
    [mall, frame, props.dataRevision],
  )

  const forh = useMemo(
    () =>
      beraknaForhandsvisning(
        col,
        {
          etikett: `Slog ihop till ”${namn.trim() || 'Sammanslagen'}”`,
          kind: 'merge',
          rad: (f, row) => [korMall(f, row, tolkning.delar, { stadaLuckor })],
          nyaKolumner: [namn.trim() === '' ? 'Sammanslagen' : namn.trim()],
        },
        frame,
      ),
    [col, frame, props.dataRevision, tolkning, namn, stadaLuckor],
  )

  useEffect(() => {
    props.onForhandsvisning(forh)
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  const infoga = (kolumnnamn: string) => setMall((m) => `${m}{${kolumnnamn}}`)

  return (
    <Verktygspanel
      titel="Slå ihop kolumner"
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0 || tolkning.okanda.length > 0}
            title={
              tolkning.okanda.length > 0
                ? 'Mallen pekar på kolumner som inte finns.'
                : forh.andrade === 0
                  ? 'Kolumnen skulle bli tom.'
                  : undefined
            }
            onClick={() => props.onTillampa(forh)}
          >
            Skapa kolumnen
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Mall</span>
        <input
          value={mall}
          onInput={(e) => setMall((e.currentTarget as HTMLInputElement).value)}
        />
        <p class="verktyg__sammanfattning">
          Skriv <code>{'{Kolumnnamn}'}</code> där ett värde ska in. Allt annat kommer med som det
          står.
        </p>
      </div>

      <div class="falt">
        <span class="falt__etikett">Lägg till kolumn</span>
        <div class="val" role="group">
          {frame.columns
            .filter((c) => !c.hidden)
            .map((c) => (
              <button key={c.id} class="val__knapp" onClick={() => infoga(c.name)}>
                {c.name}
              </button>
            ))}
        </div>
      </div>

      {tolkning.okanda.length > 0 && (
        <Notis ton="fara">
          Mallen pekar på {tolkning.okanda.length === 1 ? 'en kolumn' : 'kolumner'} som inte finns:{' '}
          <strong>{tolkning.okanda.join(', ')}</strong>. Ett stavfel ger annars en kolumn full av
          halva värden.
        </Notis>
      )}

      <label class="kryss">
        <input
          type="checkbox"
          checked={stadaLuckor}
          onChange={(e) => setStadaLuckor((e.currentTarget as HTMLInputElement).checked)}
        />
        Städa bort luckor efter tomma värden
      </label>

      <div class="falt">
        <span class="falt__etikett">Namn på den nya kolumnen</span>
        <input
          value={namn}
          onInput={(e) => setNamn((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={0}
        etikettAndrade="Bara ifyllda"
      >
        <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} ger ett värde.
      </Resultat>

      <Notis ton="info">
        Värdet räknas ut rad för rad, eftersom det beror på flera kolumner. På riktigt stora filer
        märks det som en kort fördröjning när du skriver i mallen.
      </Notis>
    </Verktygspanel>
  )
}
