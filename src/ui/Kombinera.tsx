import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Flag, type Frame } from '../core/types.js'
import { getCell } from '../core/frame/column.js'
import { findColumn, identityView, visibleColumns } from '../core/frame/frame.js'
import {
  kallnamn,
  malformAvKallor,
  malformAvMall,
  medBevaradeBeslut,
  obeslutade,
  ofylldaFore,
  provvarde,
  slaIhopMal,
  stapla,
  type Hamtning,
  type Kalla,
  type Malkolumn,
  type Staplingsresultat,
} from '../core/ops/stapla.js'
import { tabs, type Tab } from '../state/store.js'
import { begarMall, mallTabId, stangKombinera, vantarPaMall } from '../state/kombinera.js'
import { formatCount, kolumner as kolumnerText, rader as raderText } from '../core/locale/sv.js'
import { Notis, Val } from './parts.js'
import { Aliaskarta, type Prov } from './Aliaskarta.js'

/**
 * Så många förhandsrader alla filer delar på.
 *
 * Budgeten är total och inte per fil. Tre rader per fil ger femton rader med
 * fem filer och trettiosex med tolv — i en ruta som inte växer. Det som ska
 * bevisas är att varje fils värden hamnar under rätt rubrik, och det bevisas av
 * en rad per fil, inte av tre rader ur den första.
 */
const FORHANDSRADER_TOTALT = 8

/** Aldrig fler än så här ur en och samma fil, hur få filerna än är. */
const FORHANDSRADER_PER_FIL = 3

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
  const malformRef = useRef<HTMLSelectElement>(null)
  const kartaRef = useRef<HTMLDivElement>(null)

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

  // Svaren bevaras över en omräkning; se `medBevaradeBeslut` för vad som
  // bevaras och varför resten räknas om.
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
   * Massbesluten verkar på varje rad verktyget frågade om — inte bara på de
   * obesvarade. Då ångrar knapparna varandra: har man tryckt *Ta med alla* i
   * misstag är *Hoppa över alla* och *Fråga igen* ett klick bort, i stället för
   * tolv klick nedåt i kartan.
   */
  const massbeslut = (med: boolean | null) =>
    andra(kolumner.map((k) => (k.fraga === true ? { ...k, med } : k)))

  const sammanfoga = (behall: number, slopa: number) => andra(slaIhopMal(kolumner, behall, slopa))

  /**
   * Delar upp en handgjord hopslagning igen.
   *
   * De absorberade raderna hämtas tillbaka ur förslaget, och överlevaren får
   * sina egna hämtningar. Bara den här radens arbete räknas om — att köra hela
   * kartan genom `medBevaradeBeslut` hade tagit alla andra rader med sig.
   */
  const delaUpp = (rad: number) => {
    const k = kolumner[rad]
    const ider = k?.sammanslagna ?? []
    if (!k || ider.length === 0) return
    const ur = (id: string) => foreslagna.find((f) => f.forslagsnamn === id)
    const ater = ider.map(ur).filter((f): f is Malkolumn => f !== undefined)
    andra([
      ...kolumner.slice(0, rad),
      { ...k, sammanslagna: undefined, hamtning: ur(k.forslagsnamn)?.hamtning ?? k.hamtning },
      ...ater,
      ...kolumner.slice(rad + 1),
    ])
  }

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
  const fragor = kolumner.filter((k) => k.fraga === true)
  const medKolumner = kolumner.filter((k) => k.med === true)
  const namn = resultatnamn(kallflikar, mallFlik)

  /*
   * Ett prov per målkolumn och källa, räknat en gång i stället för i kartans
   * renderfunktion. Kartan ritas om vid varje tecken man skriver i ett namnfält,
   * och ett svep per cell hade betalat filens pris för en ledtråd.
   */
  const prov = useMemo<Prov[][]>(
    () =>
      kolumner.map((kol) =>
        kallor.map((kalla, j) => {
          // En fil utan rader säger ingenting om kolumnens innehåll.
          if (kalla.rader.length === 0) return null
          const h = kol.hamtning[j]
          if (!h || h.fran !== 'kolumn') return null
          const kall = findColumn(kalla.frame, h.colId)
          if (!kall) return null
          const varde = provvarde(kalla, kall)
          return varde === '' ? 'tom' : { varde }
        }),
      ),
    [kolumner, radsignatur],
  )

  /*
   * Vilka kolumner som blir tomma — sagt före körningen, inte i statusraden
   * efteråt när fliken redan finns. Svaret gäller varje rad i kartan, även de
   * obeslutade: att en kolumn blir tom är själva skälet att svara nej på den.
   */
  const blirTomma = useMemo(() => ofylldaFore(kallor, kolumner), [kolumner, radsignatur])
  const tommaMed = kolumner.filter((k, i) => k.med === true && blirTomma[i])

  /*
   * Förhandsplanen har *samma längd och ordning* som kartan, med de obeslutade
   * provisoriskt med. Att i stället filtrera bort dem vore två fel i ett:
   * `stapla` sållar ändå på `med === true`, så filtret hade inte gjort någon
   * skillnad — och `ursprung` pekar in i den lista som skickas, så en kortare
   * lista hade märkt fel rad som obeslutad.
   */
  const forhandsplan = useMemo(
    () => kolumner.map((k) => (k.med === null ? { ...k, med: true } : k)),
    [kolumner],
  )
  const forhand = useMemo<Staplingsresultat | null>(() => {
    if (kallor.length === 0 || !kolumner.some((k) => k.med !== false)) return null
    const budget = Math.max(
      1,
      Math.min(FORHANDSRADER_PER_FIL, Math.floor(FORHANDSRADER_TOTALT / kallor.length)),
    )
    const kappade: Kalla[] = kallor.map((k) => ({
      frame: k.frame,
      rader: Array.from({ length: Math.min(budget, k.rader.length) }, (_, i) => k.rader[i]!),
    }))
    return stapla(kappade, {
      kolumner: forhandsplan,
      kallkolumn: kallkolumn ? 'Källa' : null,
      namn,
    })
  }, [forhandsplan, kallkolumn, radsignatur, namn])

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

  /** Skrollar fram den första raden som spärrar körningen och tar fokus dit. */
  const tillForstaFragan = () => {
    const rad = kartaRef.current?.querySelector<HTMLElement>('.aliasrad--obeslutad')
    if (!rad) return
    rad.scrollIntoView({ block: 'nearest' })
    rad.querySelector<HTMLButtonElement>('.aliaskarta__beslut button')?.focus()
  }

  const oppnaMallfil = () => {
    vantarPaMall.value = true
    filinput.current?.click()
  }

  /*
   * Kom man hit via *Fyll en mall med data…* är målformen ärendet, inte en
   * inställning bland andra. Då tar väljaren fokus, så att man landar på den
   * fråga man kom för.
   */
  useEffect(() => {
    if (!begarMall.value) return
    begarMall.value = false
    malformRef.current?.focus()
  }, [])

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
        <div class="vytal">
          <span>
            <strong>{formatCount(totalRader)}</strong> rader ur {formatCount(kallor.length)} filer
          </span>
          <span>
            <strong>{formatCount(medKolumner.length)}</strong> kolumner i resultatet
          </span>
          {kvar.length > 0 && (
            <span class="vytal--okant">
              {/*
               * Talet är en knapp. Kartan skrollar, och en räknare som säger
               * att en kolumn spärrar körningen utan att peka ut vilken är
               * inte till mycket hjälp när raden ligger utanför bild.
               */}
              <button class="vytal__lank" onClick={tillForstaFragan}>
                <strong>{formatCount(kvar.length)}</strong> väntar på beslut
              </button>
            </span>
          )}
          {tommaMed.length > 0 && (
            <span class="vytal--okant" title={tommaMed.map((k) => k.namn).join(', ')}>
              <strong>{formatCount(tommaMed.length)}</strong> blir tomma
            </span>
          )}
        </div>
      </div>

      <div class="kombinera__kropp">
        <div class="panel">
          <div class="panel__rubrik">
            {mallFlik ? 'Filer att hämta data ur' : 'Filer att stapla'}
            <span class="panel__rubrik__antal">{formatCount(kallflikar.length)}</span>
          </div>
          <div class="panel__innehall">
            <div class="falt">
              <span class="falt__etikett">Målform</span>
              <select
                class="nivarad__kolumn"
                aria-label="Målform"
                ref={malformRef}
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
                // Avbruten filväljare avfyrar ingen change-händelse, bara
                // cancel. Utan den här stod flaggan kvar, och nästa fil som
                // öppnades — hur som helst — blev tyst mall.
                onCancel={() => {
                  vantarPaMall.value = false
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

        <div class="kombinera__rutor">
          <div class="ruta">
            <div class="ruta__rubrik">
              Så här kopplas kolumnerna
              <span class="panel__rubrik__antal">{kolumnerText(kolumner.length)}</span>
            </div>
            {fragor.length > 0 && (
              <div class="kombinera__massbeslut">
                {kvar.length > 0 && (
                  <span class="kombinera__massbeslut__skal">
                    {kolumnerText(kvar.length)} finns bara i vissa av filerna. Tas de med blir de
                    tomma för de andra; hoppas de över försvinner värden som fanns. Båda kan vara
                    rätt — därför frågar verktyget i stället för att gissa.
                  </span>
                )}
                <div class="faltrad">
                  <button class="knapp knapp--liten" onClick={() => massbeslut(true)}>
                    Ta med alla
                  </button>
                  <button class="knapp knapp--liten" onClick={() => massbeslut(false)}>
                    Hoppa över alla
                  </button>
                  <button
                    class="knapp knapp--liten knapp--tyst"
                    disabled={kvar.length === fragor.length}
                    onClick={() => massbeslut(null)}
                  >
                    Fråga igen
                  </button>
                </div>
              </div>
            )}
            <div class="ruta__kropp ruta__kropp--tabell" ref={kartaRef}>
              {kallflikar.length === 0 ? (
                <Notis ton="info">Välj minst en fil att stapla.</Notis>
              ) : (
                <Aliaskarta
                  kallor={kallflikar.map((t, i) => ({
                    id: t.id,
                    frame: t.frame,
                    radantal: kallor[i]?.rader.length ?? 0,
                  }))}
                  kolumner={kolumner}
                  prov={prov}
                  blirTomma={blirTomma}
                  namnLast={mallFlik !== null}
                  onHamtning={(rad, kalla, hamtning) => {
                    const nya = kolumner[rad]!.hamtning.map((h, j) =>
                      j === kalla ? hamtning : h,
                    ) as Hamtning[]
                    andraRad(rad, { hamtning: nya })
                  }}
                  onNamn={(rad, nyttNamn) => andraRad(rad, { namn: nyttNamn })}
                  onBeslut={(rad, med) => andraRad(rad, { med })}
                  onStandard={(rad, standard) => andraRad(rad, { standard })}
                  onSammanfoga={sammanfoga}
                  onDelaUpp={delaUpp}
                />
              )}
            </div>
          </div>

          {/*
           * Rutan står kvar även när den är tom. Skulle den monteras av och på
           * skulle hela ytan hoppa i höjd precis när det första beslutet
           * fattas — och det är just då man tittar på den.
           */}
          <div class="ruta">
            <div class="ruta__rubrik">
              Så här börjar resultatet
              {forhand && (
                <span class="panel__rubrik__antal">
                  {raderText(forhand.frame.rowCount)} av {formatCount(totalRader)}
                </span>
              )}
            </div>
            <div class="ruta__kropp ruta__kropp--tabell">
              {forhand ? (
                <Forhandsvisning resultat={forhand} kolumner={kolumner} />
              ) : (
                <p class="restlista__tom">
                  {kallflikar.length === 0
                    ? 'Välj minst en fil, så visas resultatet här.'
                    : 'Inga kolumner är med i resultatet.'}
                </p>
              )}
            </div>
          </div>
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
 * De första raderna ur det staplade resultatet, byggda på riktigt.
 *
 * Två saker måste synas här som inte syns i värdet självt.
 *
 * **Obeslutade kolumner är med, märkta.** Annars visar rutan allt utom det man
 * ombeds besluta om, och beslutet fattas i blindo. Vilken resultatspalt som hör
 * till vilken rad i kartan svarar `ursprung` på — namnet duger inte, eftersom
 * två målkolumner som heter `Namn` blir `Namn` och `Namn (2)`.
 *
 * **En cell som filen inte gav syns som sådan.** Skillnaden mellan en tom cell
 * och en cell som aldrig fanns är hela skälet att fråga per kolumn, och det
 * vore egendomligt att kasta bort den just i den ruta där man tittar. Samma
 * strimma som rutnätet och systervyn redan använder.
 */
function Forhandsvisning(props: { resultat: Staplingsresultat; kolumner: readonly Malkolumn[] }) {
  const { frame, ursprung } = props.resultat
  return (
    <div class="fortab__omslag">
      <table class="fortab">
        <thead>
          <tr>
            {frame.columns.map((c, i) => {
              const plats = ursprung[i] ?? -1
              const obeslutad = plats >= 0 && props.kolumner[plats]?.med === null
              return (
                <th key={c.id} class={obeslutad ? 'fortab__obeslutad' : undefined}>
                  {c.name}
                  {obeslutad && <span class="fortab__marke"> ej beslutad</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: frame.rowCount }, (_, r) => (
            <tr key={r}>
              {frame.columns.map((c) => {
                const utfylld = ((c.flags[r] ?? 0) & Flag.Padded) !== 0
                return (
                  <td
                    key={c.id}
                    class={utfylld ? 'fortab__utan' : undefined}
                    title={utfylld ? 'Stod inte i filen' : undefined}
                  >
                    {getCell(c, r)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
