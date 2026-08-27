import { useMemo, useRef, useState } from 'preact/hooks'
import type { Frame } from '../core/types.js'
import { getCell } from '../core/frame/column.js'
import { identityView, visibleColumns } from '../core/frame/frame.js'
import {
  antalKallor,
  kallnamn,
  malformAvKallor,
  malformAvMall,
  obeslutade,
  stapla,
  type Hamtning,
  type Kalla,
  type Malkolumn,
} from '../core/ops/stapla.js'
import { tabs, type Tab } from '../state/store.js'
import { mallTabId, stangKombinera, vantarPaMall } from '../state/kombinera.js'
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
 *
 * Målformen kommer antingen ur filernas egna kolumner eller ur en **mallfil**:
 * ett dokument som bara innehåller rubriker, eventuellt med några exempelrader.
 * Mallen bestämmer då vilka kolumner resultatet har, vad de heter och i vilken
 * ordning de kommer.
 */
export function Kombinera(props: {
  onKlar: (frame: Frame, text: string) => void
  onFiler: (files: File[]) => void
  onExempelmall: () => void
}) {
  const oppna = tabs.value
  const mallId = mallTabId.value
  const mallFlik = mallId ? (oppna.find((t) => t.id === mallId) ?? null) : null

  const [valda, setValda] = useState<string[]>(() => oppna.map((t) => t.id))
  const [kallkolumn, setKallkolumn] = useState(true)
  const [radval, setRadval] = useState<'alla' | 'vy'>('alla')
  const [egnaKolumner, setEgnaKolumner] = useState<Malkolumn[] | null>(null)
  const [signaturVidRedigering, setSignaturVidRedigering] = useState('')
  const filinput = useRef<HTMLInputElement>(null)

  // Flikar kan stängas medan vyn är öppen, och mallen är aldrig sin egen källa.
  const kallflikar = valda
    .map((id) => oppna.find((t) => t.id === id))
    .filter((t): t is Tab => t !== undefined && t.id !== mallId)

  /*
   * Kartan räknas om när *kolumnuppsättningen* ändras — filer väljs till eller
   * bort, mallen byts, en kolumn döljs eller tas bort. Inte när en cell
   * redigeras: då är kartan fortfarande giltig, och att kasta användarens
   * beslut för en rättad cell vore obegripligt.
   */
  const kolumnsignatur = (t: Tab) =>
    `${t.id}:${visibleColumns(t.frame).map((c) => c.id).join('|')}`
  const formsignatur = `${mallFlik ? kolumnsignatur(mallFlik) : '-'}»${kallflikar.map(kolumnsignatur).join('#')}`

  const foreslagna = useMemo(() => {
    const ramar = kallflikar.map((t) => t.frame)
    return mallFlik ? malformAvMall(mallFlik.frame, ramar) : malformAvKallor(ramar)
  }, [formsignatur])

  // Besluten bevaras på målkolumnens namn. Det är det användaren svarade om —
  // inte en position i en lista som ändras när en fil kryssas av.
  const kolumner = useMemo(
    () =>
      egnaKolumner && signaturVidRedigering === formsignatur
        ? egnaKolumner
        : egnaKolumner
          ? medBevaradeBeslut(foreslagna, egnaKolumner)
          : foreslagna,
    [foreslagna, egnaKolumner, signaturVidRedigering, formsignatur],
  )

  const andra = (nya: Malkolumn[]) => {
    setSignaturVidRedigering(formsignatur)
    setEgnaKolumner(nya)
  }
  const andraRad = (rad: number, delta: Partial<Malkolumn>) =>
    andra(kolumner.map((k, i) => (i === rad ? { ...k, ...delta } : k)))

  /*
   * "Alla rader" följer den frusna sorteringen, inte filens ordning. Det är
   * samma beslut som exporten redan fattat (`selectForExport`): den som
   * sorterat och sedan tar med allt ska inte få tillbaka osorterat.
   */
  const radsignatur = `${radval}|${kallflikar
    .map((t) => `${t.id}:${t.dataRevision}:${t.frame.view.length}:${t.ordning?.signatur ?? 0}`)
    .join('#')}`
  const kallor = useMemo<Kalla[]>(
    () =>
      kallflikar.map((t) => ({
        frame: t.frame,
        rader:
          radval === 'vy' ? t.frame.view : (t.ordning?.rader ?? identityView(t.frame.rowCount)),
      })),
    [radsignatur],
  )

  const totalRader = kallor.reduce((n, k) => n + k.rader.length, 0)
  const kvar = obeslutade(kolumner)
  const medKolumner = kolumner.filter((k) => k.med === true)
  const utanKalla = medKolumner.filter((k) => antalKallor(k.hamtning) === 0)
  const namn = resultatnamn(kallflikar, mallFlik)

  const forhand = useMemo(() => {
    if (kallor.length === 0 || medKolumner.length === 0) return null
    const kappade: Kalla[] = kallor.map((k) => ({
      frame: k.frame,
      rader: Array.from({ length: Math.min(FORHANDSRADER, k.rader.length) }, (_, i) => k.rader[i]!),
    }))
    return stapla(kappade, { kolumner, kallkolumn: kallkolumn ? 'Källa' : null, namn }).frame
  }, [kolumner, kallkolumn, radsignatur, namn])

  const kor = () => {
    const { frame, perKalla, ofyllda } = stapla(kallor, {
      kolumner,
      kallkolumn: kallkolumn ? 'Källa' : null,
      namn,
    })
    stangKombinera()
    const tomma = ofyllda.length > 0 ? ` ${kolumnerText(ofyllda.length)} blev tomma.` : ''
    props.onKlar(
      frame,
      `${raderText(frame.rowCount)} ur ${formatCount(perKalla.length)} filer.${tomma}`,
    )
  }

  const oppnaMallfil = () => {
    vantarPaMall.value = true
    filinput.current?.click()
  }

  return (
    <div class="kombinera">
      <div class="kombinera__topp">
        <div>
          <h2>Kombinera filer</h2>
          <span class="kombinera__underrubrik">
            {mallFlik
              ? `Fyller ${mallFlik.frame.name} med data ur de valda filerna.`
              : 'Lägger filerna på varandra. Kolumner som betyder samma sak hamnar i samma spalt.'}
          </span>
        </div>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(totalRader)}</td>
              <td>
                rader ur {formatCount(kallor.length)} filer, i {kolumnerText(medKolumner.length)}
              </td>
            </tr>
            {kvar.length > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(kvar.length)}</td>
                <td>kolumner väntar på ett beslut</td>
              </tr>
            )}
            {utanKalla.length > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(utanKalla.length)}</td>
                <td>kolumner fylls inte av någon fil</td>
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
                      disabled={t.id === mallId}
                      checked={valda.includes(t.id) && t.id !== mallId}
                      onChange={(e) =>
                        setValda(
                          (e.currentTarget as HTMLInputElement).checked
                            ? [...valda, t.id]
                            : valda.filter((x) => x !== t.id),
                        )
                      }
                    />
                    {t.frame.name}
                    <span class="verktyg__sammanfattning">
                      {' '}
                      {t.id === mallId
                        ? 'mall'
                        : `${formatCount(t.frame.rowCount)}${
                            begransad ? ` · ${formatCount(t.frame.view.length)} visas` : ''
                          }`}
                    </span>
                  </label>
                )
              })}
            </div>

            <div class="falt">
              <span class="falt__etikett">Målform</span>
              <select
                class="nivarad__kolumn"
                aria-label="Målform"
                value={mallId ?? ''}
                onChange={(e) => {
                  const varde = (e.currentTarget as HTMLSelectElement).value
                  mallTabId.value = varde === '' ? null : varde
                  setEgnaKolumner(null)
                }}
              >
                <option value="">Filernas egna kolumner</option>
                {oppna.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.frame.name} som mall
                  </option>
                ))}
              </select>
              <div class="faltrad">
                <button class="knapp" onClick={oppnaMallfil}>
                  Öppna mallfil…
                </button>
                <button class="knapp knapp--tyst" onClick={props.onExempelmall}>
                  Exempelmall
                </button>
              </div>
              <input
                ref={filinput}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const filer = Array.from((e.currentTarget as HTMLInputElement).files ?? [])
                  if (filer.length > 0) props.onFiler(filer)
                  else vantarPaMall.value = false
                  ;(e.currentTarget as HTMLInputElement).value = ''
                }}
              />
              <p class="verktyg__sammanfattning">
                {mallFlik
                  ? mallFlik.frame.rowCount > 0
                    ? `Mallens ${raderText(mallFlik.frame.rowCount)} är exempel och tas inte med i resultatet.`
                    : 'Mallen bestämmer kolumnerna, deras namn och deras ordning.'
                  : 'En mall är en fil med bara rubriker. Den bestämmer resultatets form.'}
              </p>
            </div>

            <div class="falt">
              <span class="falt__etikett">Rader att ta med</span>
              <Val
                varden={[
                  {
                    varde: 'alla' as const,
                    etikett: 'Alla rader',
                    titel: 'Hela filen, i den ordning du sorterat den.',
                  },
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
                kallor={kallflikar.map((t, i) => ({
                  id: t.id,
                  frame: t.frame,
                  radantal: kallor[i]?.rader.length ?? 0,
                }))}
                kolumner={kolumner}
                namnLast={mallFlik !== null}
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
                  <strong>{kvar.slice(0, 8).map((k) => k.namn).join(', ')}</strong>
                  {kvar.length > 8 ? ' …' : ''}. Tas de med blir de tomma för de andra filerna;
                  hoppas de över försvinner de värden som fanns. Båda kan vara rätt — därför
                  frågar verktyget i stället för att gissa.
                </Notis>
              )}

              {utanKalla.length > 0 && (
                <Notis ton="info">
                  <strong>{utanKalla.map((k) => k.namn).join(', ')}</strong> fylls inte av någon
                  fil och blir {utanKalla.length === 1 ? 'en tom kolumn' : 'tomma kolumner'}. Med
                  en mall är det ofta rätt — formen ska stämma även när uppgiften saknas.
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
          disabled={kvar.length > 0 || medKolumner.length === 0 || kallor.length === 0}
          title={
            kvar.length > 0
              ? 'Besluta om kolumnerna som bara finns i vissa filer först.'
              : medKolumner.length === 0
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

/**
 * Behåller besluten över en omräkning.
 *
 * Nyckeln är målkolumnens namn — det är det användaren svarade om, inte en
 * position i en lista. Utan det skulle ett avkryssat filval kasta tolv svar.
 */
function medBevaradeBeslut(nya: Malkolumn[], gamla: readonly Malkolumn[]): Malkolumn[] {
  const forr = new Map(gamla.map((k) => [k.namn, k.med]))
  return nya.map((k) => {
    const tidigare = forr.get(k.namn)
    return tidigare === undefined || tidigare === null ? k : { ...k, med: tidigare }
  })
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
function resultatnamn(flikar: readonly Tab[], mall: Tab | null): string {
  if (mall) return `${mall.frame.name} (ifylld)`
  const namnen = kallnamn(flikar.map((t) => ({ frame: t.frame })))
  if (namnen.length === 0) return 'Kombinerad'
  if (namnen.length <= 2) return namnen.join(' + ')
  return `${namnen[0]} + ${namnen.length - 1} till`
}
