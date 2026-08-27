import { useMemo, useState } from 'preact/hooks'
import type { Frame } from '../core/types.js'
import { getCell } from '../core/frame/column.js'
import { identityView, visibleColumns } from '../core/frame/frame.js'
import {
  kallnamn,
  malformAvKallor,
  obeslutade,
  stapla,
  type Hamtning,
  type Kalla,
  type Malkolumn,
} from '../core/ops/stapla.js'
import { tabs, type Tab } from '../state/store.js'
import { stangKombinera } from '../state/kombinera.js'
import { formatCount, kolumner as kolumnerText, rader as raderText } from '../core/locale/sv.js'
import { Notis, Val } from './parts.js'
import { Aliaskarta } from './Aliaskarta.js'

/** Så många rader per fil förhandsvisningen bygger. */
const FORHANDSRADER = 3

/**
 * Kombinera flera filer till en, staplade på varandra.
 *
 * Egen vy och inte en modal, av samma skäl som matchningsverkstaden: kartan
 * över vilken kolumn i vilken fil som hör till vilken målkolumn är en tabell
 * som växer i bredd med antalet filer, och den går inte att läsa i ett
 * överlägg.
 *
 * **Kolumner som bara finns i vissa filer beslutas en och en.** Att ta med dem
 * ger tomma celler för de andra filerna; att hoppa över dem tappar data. Båda
 * kan vara rätt, och verktyget vet inte vilket — så det frågar, före körningen
 * och inte efter.
 */
export function Kombinera(props: {
  onKlar: (frame: Frame, text: string) => void
}) {
  const oppna = tabs.value
  const [valda, setValda] = useState<string[]>(() => oppna.map((t) => t.id))
  const [kallkolumn, setKallkolumn] = useState(true)
  const [radval, setRadval] = useState<'alla' | 'vy'>('alla')
  const [egnaKolumner, setEgnaKolumner] = useState<Malkolumn[] | null>(null)

  // Flikar kan stängas medan vyn är öppen; kartan ritas ur `tabs.value`.
  const kallflikar = valda
    .map((id) => oppna.find((t) => t.id === id))
    .filter((t): t is Tab => t !== undefined)

  /*
   * Kartan räknas om när *kolumnuppsättningen* ändras — filer väljs till eller
   * bort, en kolumn döljs eller tas bort. Inte när en cell redigeras: då är
   * kartan fortfarande giltig, och att kasta användarens beslut för en rättad
   * cell vore obegripligt.
   */
  const formsignatur = kallflikar
    .map((t) => `${t.id}:${visibleColumns(t.frame).map((c) => c.id).join('|')}`)
    .join('#')
  const foreslagna = useMemo(
    () => malformAvKallor(kallflikar.map((t) => t.frame)),
    [formsignatur],
  )
  const [signaturVidRedigering, setSignaturVidRedigering] = useState('')
  const kolumner = egnaKolumner && signaturVidRedigering === formsignatur ? egnaKolumner : foreslagna

  const andra = (nya: Malkolumn[]) => {
    setSignaturVidRedigering(formsignatur)
    setEgnaKolumner(nya)
  }
  const andraRad = (rad: number, delta: Partial<Malkolumn>) =>
    andra(kolumner.map((k, i) => (i === rad ? { ...k, ...delta } : k)))

  const kallor: Kalla[] = kallflikar.map((t) => ({
    frame: t.frame,
    rader: radval === 'vy' ? t.frame.view : identityView(t.frame.rowCount),
  }))
  const totalRader = kallor.reduce((n, k) => n + k.rader.length, 0)
  const kvar = obeslutade(kolumner)
  const medAntal = kolumner.filter((k) => k.med === true).length
  const namn = resultatnamn(kallflikar)

  const forhand = useMemo(() => {
    if (kallor.length === 0 || medAntal === 0) return null
    const kappade: Kalla[] = kallor.map((k) => ({
      frame: k.frame,
      rader: Array.from(
        { length: Math.min(FORHANDSRADER, k.rader.length) },
        (_, i) => k.rader[i]!,
      ),
    }))
    return stapla(kappade, {
      kolumner,
      kallkolumn: kallkolumn ? 'Källa' : null,
      namn,
    }).frame
  }, [kolumner, kallkolumn, radval, formsignatur, medAntal])

  const kor = () => {
    const { frame, perKalla, ofyllda } = stapla(kallor, {
      kolumner,
      kallkolumn: kallkolumn ? 'Källa' : null,
      namn,
    })
    stangKombinera()
    const tomma =
      ofyllda.length > 0 ? ` ${kolumnerText(ofyllda.length)} fylls inte av någon fil.` : ''
    props.onKlar(
      frame,
      `${raderText(frame.rowCount)} ur ${formatCount(perKalla.length)} filer.${tomma}`,
    )
  }

  const vaxlaFil = (id: string, pa: boolean) =>
    setValda(pa ? [...valda, id] : valda.filter((x) => x !== id))

  return (
    <div class="kombinera">
      <div class="kombinera__topp">
        <div>
          <h2>Kombinera filer</h2>
          <span class="kombinera__underrubrik">
            Lägger filerna på varandra. Kolumner som betyder samma sak hamnar i samma spalt.
          </span>
        </div>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(totalRader)}</td>
              <td>
                rader ur {formatCount(kallor.length)} filer, i {kolumnerText(medAntal)}
              </td>
            </tr>
            {kvar.length > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(kvar.length)}</td>
                <td>kolumner väntar på ett beslut</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div class="kombinera__kropp">
        <div class="panel">
          <div class="panel__rubrik">
            Filer att stapla
            <span class="panel__rubrik__antal">{formatCount(kallflikar.length)}</span>
          </div>
          <div class="panel__innehall">
            <div class="kollista kollista--kryss">
              {oppna.map((t) => {
                const begransad = t.frame.view.length < t.frame.rowCount
                return (
                  <label class="kryss" key={t.id}>
                    <input
                      type="checkbox"
                      checked={valda.includes(t.id)}
                      onChange={(e) => vaxlaFil(t.id, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    {t.frame.name}
                    <span class="verktyg__sammanfattning">
                      {' '}
                      {formatCount(t.frame.rowCount)}
                      {begransad ? ` · ${formatCount(t.frame.view.length)} visas` : ''}
                    </span>
                  </label>
                )
              })}
            </div>

            <div class="falt">
              <span class="falt__etikett">Rader att ta med</span>
              <Val
                varden={[
                  { varde: 'alla' as const, etikett: 'Alla rader', titel: 'Hela filen, i filens ordning.' },
                  {
                    varde: 'vy' as const,
                    etikett: 'Bara de som visas nu',
                    titel: 'Följer filtret och sorteringen i varje flik.',
                  },
                ]}
                valt={radval}
                onValj={setRadval}
              />
            </div>

            <label class="kryss">
              <input
                type="checkbox"
                checked={kallkolumn}
                onChange={(e) => setKallkolumn((e.currentTarget as HTMLInputElement).checked)}
              />
              Kolumn med källfilens namn
            </label>
            <p class="verktyg__sammanfattning">
              Radnumret börjar om för varje fil, så utan den går rad 12 ur två filer inte att
              skilja åt.
            </p>
          </div>
        </div>

        <div class="kombinera__karta">
          {kallflikar.length === 0 ? (
            <Notis ton="info">Välj minst en fil att stapla.</Notis>
          ) : (
            <>
              <Aliaskarta
                kallor={kallflikar.map((t) => ({ id: t.id, frame: t.frame }))}
                kolumner={kolumner}
                namnLast={false}
                onHamtning={(rad, kalla, hamtning) => {
                  const nya = kolumner[rad]!.hamtning.map((h, j) =>
                    j === kalla ? hamtning : h,
                  ) as Hamtning[]
                  andraRad(rad, { hamtning: nya })
                }}
                onNamn={(rad, nyttNamn) => andraRad(rad, { namn: nyttNamn })}
                onBeslut={(rad, med) => andraRad(rad, { med })}
              />

              {kvar.length > 0 && (
                <Notis ton="varning">
                  {kolumnerText(kvar.length)} finns bara i vissa av filerna:{' '}
                  <strong>{kvar.map((k) => k.namn).join(', ')}</strong>. Tas de med blir de tomma
                  för de andra filerna; hoppas de över försvinner de värden som fanns. Båda kan
                  vara rätt — därför frågar verktyget i stället för att gissa.
                </Notis>
              )}

              {forhand && <Forhandsvisning frame={forhand} />}
            </>
          )}
        </div>
      </div>

      <div class="kombinera__fot">
        <span class="kombinera__fot__text">
          {kvar.length > 0
            ? `${kolumnerText(kvar.length)} behöver ett beslut.`
            : 'Resultatet blir en ny flik. Källfilerna rörs inte.'}
        </span>
        <button class="knapp" onClick={stangKombinera}>
          Avbryt
        </button>
        <button
          class="knapp knapp--primar"
          disabled={kvar.length > 0 || medAntal === 0 || kallor.length === 0}
          title={
            kvar.length > 0
              ? 'Besluta om kolumnerna som bara finns i vissa filer först.'
              : medAntal === 0
                ? 'Inga kolumner är med i resultatet.'
                : undefined
          }
          onClick={kor}
        >
          Kombinera
        </button>
      </div>
    </div>
  )
}

/** De första raderna ur det staplade resultatet, byggda på riktigt. */
function Forhandsvisning(props: { frame: Frame }) {
  const kolumner = props.frame.columns
  return (
    <div class="falt">
      <span class="falt__etikett">Så här börjar resultatet</span>
      <div class="fortab__omslag">
        <table class="fortab">
          <thead>
            <tr>
              {kolumner.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: props.frame.rowCount }, (_, r) => (
              <tr key={r}>
                {kolumner.map((c) => (
                  <td key={c.id}>{getCell(c, r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Namn på resultatfliken. Alla filnamn blir oläsligt vid fler än två. */
function resultatnamn(flikar: readonly Tab[]): string {
  const namnen = kallnamn(flikar.map((t) => ({ frame: t.frame })))
  if (namnen.length === 0) return 'Kombinerad'
  if (namnen.length <= 2) return namnen.join(' + ')
  return `${namnen[0]} + ${namnen.length - 1} till`
}
