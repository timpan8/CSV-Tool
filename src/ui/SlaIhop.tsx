import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Notis, Val } from './parts.js'
import type { Column, ColumnId, Frame } from '../core/types.js'
import { findColumn, visibleColumns } from '../core/frame/frame.js'
import { rubriknyckel, synonymgrupp } from '../core/ops/rubriker.js'
import type { Planpost } from '../core/ops/match.js'
import {
  FLERTRAFF,
  MATCHNINGSTYPER,
  NYCKELAVSKILJARE,
  byggNycklar,
  byggPlan,
  cellText,
  forhandsurval,
  kraverTvaHoger,
  matcha,
  slaIhop,
  type Flertraff,
  type Matchning,
  type Matchningspar,
  type Matchningstyp,
  type Sammanslagning,
} from '../core/ops/match.js'
import { getCell } from '../core/frame/column.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'
import { stangSlaIhop } from '../state/slaihop.js'

/**
 * Slå ihop två filer.
 *
 * Vyn är byggd kring en enda insikt: **de nio besluten går inte att fatta på
 * siffror.** Att åtta av sexton rader hittar en träff säger ingenting om
 * huruvida det är rätt åtta. Därför visar vyn fyra saker samtidigt — de två
 * källfilerna, hur raderna faktiskt paras ihop, och hur resultatet blir — och
 * räknar om allihop medan man ställer in.
 *
 * Ingenting av det är nya beräkningar. Träffarna har alltid legat färdiga i
 * `matchning.par`, och `slaIhop` har alltid kunnat bygga ramen. Det som
 * saknades var att visa dem.
 *
 * **Förhandsvisningarna kör de skarpa funktionerna på ett kapat urval**, inte
 * egna approximationer — samma val som kombineringen och sammanfattningen
 * gör. En förhandsvisning som räknats på ett annat sätt än knappen är förr
 * eller senare oense med den, och då är den värre än ingen.
 */

/** Så många rader varje källfilsruta visar. */
const FILPROVSRADER = 6

/** Så många resultatrader förhandsvisningen bygger. */
const FORHANDSRADER = 12

export function SlaIhop(props: {
  flikar: { id: string; frame: Frame }[]
  /** Fliken man stod i när vyn öppnades, som förval för vänstersidan. */
  aktivId: string | null
  onFiler: (files: File[]) => void
  onExempelpar: () => void
  onSlaIhop: (frame: Frame, text: string) => void
  onVerkstad: (
    vansterTabId: string,
    hogerTabId: string,
    par: Matchningspar[],
    val: Sammanslagning,
  ) => void
}) {
  const flikar = props.flikar
  const [vansterId, setVansterId] = useState(() => props.aktivId ?? flikar[0]?.id ?? '')
  const [hogerId, setHogerId] = useState(
    () => flikar.find((t) => t.id !== (props.aktivId ?? flikar[0]?.id))?.id ?? '',
  )

  const vanster = flikar.find((t) => t.id === vansterId)?.frame ?? null
  const hoger = flikar.find((t) => t.id === hogerId)?.frame ?? null

  const [par, setPar] = useState<Matchningspar[]>([])
  const [flertraff, setFlertraff] = useState<Flertraff>('forsta')
  const [prefix, setPrefix] = useState('')
  /*
   * Prefixet fördröjs innan förhandsvisningen byggs om.
   *
   * `slaIhop` kopierar varje kolumns *ordbok* — `dict.slice()` och
   * `new Map(dictIndex)` i `kopieraColumn` — och den kostnaden följer antalet
   * unika värden, inte antalet rader. Ett kapat bygge är alltså inte gratis:
   * uppmätt till 160 ms på två filer med 100 000 respektive 80 000 rader. Ett
   * bygge per tangenttryck gör fältet ryckigt precis när man skriver i det.
   *
   * Samma 120 ms som sökrutan använder (`SearchBar.tsx`), och av samma skäl.
   */
  const [prefixdrojt, setPrefixdrojt] = useState('')
  const [valdaKolumner, setValdaKolumner] = useState<ColumnId[] | null>(null)
  // Sant tills användaren rört paren själv; då slutar förslaget skriva över.
  const [egnaPar, setEgnaPar] = useState(false)
  const [over, setOver] = useState(false)

  useEffect(() => {
    if (prefix === prefixdrojt) return
    const timer = setTimeout(() => setPrefixdrojt(prefix), 120)
    return () => clearTimeout(timer)
  }, [prefix])

  // Escape stänger vyn, som i varje modal och verktygspanel. Att en helskärmsvy
  // vore undantaget är precis den sortens inkonsekvens som gör muskelminnet
  // opålitligt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mal = e.target as HTMLElement | null
      if (e.key !== 'Escape' || mal?.tagName === 'INPUT' || mal?.tagName === 'SELECT') return
      e.preventDefault()
      stangSlaIhop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /*
   * Håller de två valen på flikar som faktiskt finns.
   *
   * Man kan stänga en flik medan vyn är öppen, och man kan öppna den andra
   * filen härifrån. Utan det här skulle vyn i det ena fallet peka på
   * ingenting, och i det andra fortsätta säga att det bara finns en fil.
   */
  const fliksignatur = flikar.map((t) => t.id).join(',')
  useEffect(() => {
    const nyVanster = flikar.some((t) => t.id === vansterId) ? vansterId : (flikar[0]?.id ?? '')
    if (nyVanster !== vansterId) setVansterId(nyVanster)
    if (!flikar.some((t) => t.id === hogerId) || hogerId === nyVanster) {
      setHogerId(flikar.find((t) => t.id !== nyVanster)?.id ?? '')
    }
  }, [fliksignatur])

  const foreslagna = useMemo(
    () => (vanster && hoger ? foreslaPar(vanster, hoger) : []),
    [vanster, hoger],
  )
  const aktivaPar = egnaPar ? par : foreslagna

  /**
   * Par som väntar på sin andra högerkolumn.
   *
   * De körs inte, och det sägs rakt ut. En matchning som tyst ger noll
   * träffar ser ut som att filerna inte hör ihop.
   */
  const ofardigaPar = aktivaPar.filter(
    (p) => kraverTvaHoger(p.typ) && p.hogerColId2 === undefined,
  ).length

  const matchning = useMemo(
    () =>
      vanster && hoger && aktivaPar.length > 0 && ofardigaPar === 0
        ? matcha(vanster, hoger, aktivaPar)
        : null,
    [vanster, hoger, aktivaPar, ofardigaPar],
  )

  const vansterKolumner = vanster ? visibleColumns(vanster) : []
  const hogerKolumner = hoger ? visibleColumns(hoger) : []
  const nyckelkolumner = new Set(aktivaPar.map((p) => p.hogerColId))
  const valda =
    valdaKolumner ?? hogerKolumner.filter((c) => !nyckelkolumner.has(c.id)).map((c) => c.id)

  const sammanslagning: Sammanslagning = { hogerKolumner: valda, flertraff, prefix }

  /* ---------- De fyra rutorna ---------- */

  // Nycklarna per rad, för att kunna visa den normaliserade formen under
  // värdet. `byggNycklar` räknar per unikt värde, inte per rad.
  const nyckelsignatur = JSON.stringify(aktivaPar)
  const vansterNycklar = useMemo(
    () => (vanster && aktivaPar.length > 0 ? byggNycklar(vanster, aktivaPar, 'vanster') : null),
    [vanster, nyckelsignatur],
  )
  const hogerNycklar = useMemo(
    () => (hoger && aktivaPar.length > 0 ? byggNycklar(hoger, aktivaPar, 'hoger') : null),
    [hoger, nyckelsignatur],
  )

  const urval = useMemo(
    () => (matchning ? forhandsurval(matchning, FORHANDSRADER) : []),
    [matchning],
  )

  /*
   * Resultatet räknas med den skarpa `slaIhop` på ett kapat urval.
   *
   * `prefix` ingår med flit inte i matchningsmemot ovan — det skrivs per
   * tangenttryck — men det ingår här, eftersom rubrikerna är just vad rutan
   * ska visa. Kostnaden är `FORHANDSRADER` rader, inte filen.
   */
  /** Planen bakom förhandsvisningen, så rutan vet vilka rader som blev utan partner. */
  const forhandsplan = useMemo(
    () =>
      matchning && vanster ? byggPlan(matchning, flertraff, vanster.rowCount, urval) : [],
    [matchning, flertraff, vanster, urval],
  )

  const forhand = useMemo(() => {
    if (!vanster || !hoger || !matchning || urval.length === 0) return null
    return slaIhop(
      vanster,
      hoger,
      matchning,
      { ...sammanslagning, prefix: prefixdrojt },
      urval,
    ).frame
  }, [vanster, hoger, matchning, urval, valda.join(','), flertraff, prefixdrojt])

  /* ---------- Handtag ---------- */

  const andraPar = (i: number, delta: Partial<Matchningspar>) => {
    const nya = aktivaPar.map((p) => ({ ...p }))
    nya[i] = { ...nya[i]!, ...delta }
    setEgnaPar(true)
    setPar(nya)
  }

  const laggPar = () => {
    const v = vansterKolumner[0]
    const h = hogerKolumner[0]
    if (!v || !h) return
    setEgnaPar(true)
    setPar([
      ...aktivaPar.map((p) => ({ ...p })),
      { vansterColId: v.id, hogerColId: h.id, typ: 'oberoende' },
    ])
  }

  const taBortPar = (i: number) => {
    setEgnaPar(true)
    setPar(aktivaPar.filter((_, j) => j !== i).map((p) => ({ ...p })))
  }

  /** Byter håll. Stommen blir den andra filen, och allt val nollställs. */
  const byt = () => {
    setVansterId(hogerId)
    setHogerId(vansterId)
    setEgnaPar(false)
    setValdaKolumner(null)
  }

  const kor = () => {
    if (!vanster || !hoger || !matchning) return
    const { frame, fyllda } = slaIhop(vanster, hoger, matchning, sammanslagning)
    stangSlaIhop()
    props.onSlaIhop(
      frame,
      `${vanster.name} + ${hoger.name} — ${formatCount(fyllda)} av ${raderText(frame.rowCount)} fick värden.`,
    )
  }

  const tillVerkstaden = () => {
    if (!vanster || !hoger) return
    props.onVerkstad(
      vansterId,
      hogerId,
      aktivaPar.map((p) => ({ ...p })),
      { ...sammanslagning, hogerKolumner: [...valda] },
    )
  }

  const rester = matchning ? matchning.vansterUtan.length + matchning.hogerUtan.length : 0
  const traffprocent =
    matchning && vanster && vanster.rowCount > 0
      ? Math.round((matchning.vansterMatchade / vanster.rowCount) * 100)
      : 0

  /* ---------- Tomt läge ---------- */

  if (flikar.length < 2) {
    return (
      <div class="slaihop slaihop--tomt">
        <div class="slaihop__topp">
          <div>
            <h2>Slå ihop filer</h2>
            <span class="slaihop__underrubrik">
              Rader som hör ihop läggs sida vid sida, matchat på en nyckel.
            </span>
          </div>
        </div>
        <div class="slaihop__tomtkropp">
          {/*
            Det gamla tomma läget var en ruta med texten "öppna den andra
            filen först" och `Stäng` som enda knapp — man skickades ut ur
            verktyget för att göra något man lika gärna kunde göra här.
          */}
          <div
            class={`tomt__zon${over ? ' tomt__zon--over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const filer = Array.from(e.dataTransfer?.files ?? [])
              if (filer.length > 0) props.onFiler(filer)
            }}
          >
            <p class="tomt__rubrik">
              {flikar.length === 1
                ? 'Öppna filen du vill slå ihop med'
                : 'Öppna de två filer du vill slå ihop'}
            </p>
            <p class="tomt__underrubrik">
              {flikar.length === 1
                ? `${flikar[0]!.frame.name} är redan öppen. Släpp den andra här, eller välj den nedan — den blir en egen flik.`
                : 'Släpp dem här, eller välj dem nedan. Varje fil blir en egen flik.'}
            </p>
            <Filknappar onFiler={props.onFiler} onExempelpar={props.onExempelpar} visaExempel />
          </div>
        </div>
        <div class="slaihop__fot">
          <span class="slaihop__fot__text">Filerna blir egna flikar och rörs inte av det här.</span>
          <button class="knapp" onClick={stangSlaIhop}>
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div class="slaihop">
      <div class="slaihop__topp">
        <div>
          <h2>Slå ihop filer</h2>
          <span class="slaihop__underrubrik">
            {vanster?.name} ↔ {hoger?.name} — alla rader ur {vanster?.name} följer med, även de
            utan träff.
          </span>
        </div>
        {matchning && vanster && hoger && (
          <table class="inventering">
            <tbody>
              <tr>
                <td class="inventering__antal">{formatCount(matchning.vansterMatchade)}</td>
                <td>
                  av {formatCount(vanster.rowCount)} rader i {vanster.name} hittar en träff (
                  {traffprocent} %)
                </td>
              </tr>
              <tr class={matchning.vansterUtan.length > 0 ? 'inventering--okant' : ''}>
                <td class="inventering__antal">{formatCount(matchning.vansterUtan.length)}</td>
                <td>hittar ingen träff</td>
              </tr>
              <tr>
                <td class="inventering__antal">{formatCount(matchning.hogerUtan.length)}</td>
                <td>rader i {hoger.name} blir över</td>
              </tr>
              {matchning.vansterFlera > 0 && (
                <tr class="inventering--okant">
                  <td class="inventering__antal">{formatCount(matchning.vansterFlera)}</td>
                  <td>matchar mer än en rad (som mest {formatCount(matchning.storstaTraff)})</td>
                </tr>
              )}
              {matchning.hogerFlera > 0 && (
                <tr>
                  <td class="inventering__antal">{formatCount(matchning.hogerFlera)}</td>
                  <td>rader i {hoger.name} används av flera</td>
                </tr>
              )}
              {(matchning.tommaVanster > 0 || matchning.tommaHoger > 0) && (
                <tr>
                  <td class="inventering__antal">
                    {formatCount(matchning.tommaVanster + matchning.tommaHoger)}
                  </td>
                  <td>har tom nyckel och kan aldrig matcha</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div class="slaihop__kropp">
        <div class="panel">
          <div class="panel__rubrik">Filerna</div>
          <div class="panel__innehall">
            <div class="falt">
              <span class="falt__etikett">Stommen — alla rader följer med</span>
              <Val
                varden={flikar.map((t) => ({
                  varde: t.id,
                  etikett: `${t.frame.name} (${formatCount(t.frame.rowCount)})`,
                }))}
                valt={vansterId}
                onValj={(v) => {
                  if (v === hogerId) setHogerId(vansterId)
                  setVansterId(v)
                  setEgnaPar(false)
                  setValdaKolumner(null)
                }}
              />
            </div>

            <div class="slaihop__byt">
              <button
                class="knapp knapp--tyst"
                title="Byt håll: den andra filen blir stommen."
                onClick={byt}
              >
                ⇄ Byt håll
              </button>
            </div>

            <div class="falt">
              <span class="falt__etikett">Hämta uppgifter ur</span>
              <Val
                varden={flikar
                  .filter((t) => t.id !== vansterId)
                  .map((t) => ({
                    varde: t.id,
                    etikett: `${t.frame.name} (${formatCount(t.frame.rowCount)})`,
                  }))}
                valt={hogerId}
                onValj={(v) => {
                  setHogerId(v)
                  setEgnaPar(false)
                  setValdaKolumner(null)
                }}
              />
              <Filknappar onFiler={props.onFiler} />
            </div>

            <div class="falt">
              <span class="falt__etikett">Rader hör ihop när de stämmer i</span>
              {aktivaPar.map((p, i) => (
                <div class="slaihop__par" key={i}>
                  <div class="regel">
                    <select
                      class="nivarad__kolumn"
                      aria-label={`Vänsterkolumn i par ${i + 1}`}
                      value={p.vansterColId}
                      onChange={(e) =>
                        andraPar(i, { vansterColId: (e.currentTarget as HTMLSelectElement).value })
                      }
                    >
                      {vansterKolumner.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span class="parpil" aria-hidden="true">
                      ↔
                    </span>
                    <select
                      class="nivarad__kolumn"
                      aria-label={`Högerkolumn i par ${i + 1}`}
                      value={p.hogerColId}
                      onChange={(e) =>
                        andraPar(i, { hogerColId: (e.currentTarget as HTMLSelectElement).value })
                      }
                    >
                      {hogerKolumner.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      class="kolrad__oga"
                      aria-label="Ta bort kolumnparet"
                      onClick={() => taBortPar(i)}
                    >
                      ✕
                    </button>
                  </div>
                  {kraverTvaHoger(p.typ) && (
                    <div class="regel">
                      <span class="slaihop__parnot">och</span>
                      <select
                        class="nivarad__kolumn"
                        value={p.hogerColId2 ?? ''}
                        aria-label="Andra högerkolumnen"
                        onChange={(e) =>
                          andraPar(i, {
                            hogerColId2: (e.currentTarget as HTMLSelectElement).value || undefined,
                          })
                        }
                      >
                        <option value="">Välj kolumn…</option>
                        {hogerKolumner.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <select
                    class="nivarad__kolumn"
                    aria-label={`Jämförelse i par ${i + 1}`}
                    value={p.typ}
                    onChange={(e) =>
                      andraPar(i, {
                        typ: (e.currentTarget as HTMLSelectElement).value as Matchningstyp,
                      })
                    }
                  >
                    {MATCHNINGSTYPER.map((t) => (
                      <option key={t.typ} value={t.typ}>
                        {t.etikett}
                      </option>
                    ))}
                  </select>
                  {/*
                    Beskrivningen står som text och inte bara som `title`.
                    Skillnaden mellan matchningstyperna är hela valet, och ett
                    val som bara går att förstå med musen är inget val.
                  */}
                  <p class="slaihop__typtext">
                    {MATCHNINGSTYPER.find((t) => t.typ === p.typ)?.beskrivning}
                  </p>
                </div>
              ))}
              {aktivaPar.length === 0 && (
                <p class="verktyg__sammanfattning">
                  Inga kolumnpar valda. Lägg till minst ett för att kunna matcha.
                </p>
              )}
              <div class="faltrad">
                <button class="knapp" onClick={laggPar}>
                  ＋ Lägg till kolumnpar
                </button>
              </div>
              {!egnaPar && foreslagna.length > 0 && (
                <p class="verktyg__sammanfattning">
                  Föreslaget utifrån kolumnernas namn. Ändra fritt.
                </p>
              )}
            </div>

            {ofardigaPar > 0 && (
              <Notis ton="varning">
                {ofardigaPar === 1
                  ? 'Ett kolumnpar saknar sin andra högerkolumn'
                  : `${ofardigaPar} kolumnpar saknar sin andra högerkolumn`}
                . Matchningen kan inte köras förrän den är vald — utan den finns ingen nyckel att
                jämföra med.
              </Notis>
            )}

            {matchning && traffprocent < 20 && matchning.vansterMatchade > 0 && (
              <Notis ton="varning">
                Bara {traffprocent} % av raderna matchar. Så låg andel beror oftast på fel
                kolumnpar eller på att värdena är skrivna på olika sätt — prova en annan
                jämförelse, eller städa kolumnerna först.
              </Notis>
            )}

            {matchning && matchning.vansterFlera > 0 && (
              <div class="falt">
                <span class="falt__etikett">
                  När en rad matchar flera ({formatCount(matchning.vansterFlera)} gör det)
                </span>
                <Val
                  varden={FLERTRAFF.map((f) => ({
                    varde: f.varde,
                    etikett: f.etikett,
                    titel: f.beskrivning,
                  }))}
                  valt={flertraff}
                  onValj={setFlertraff}
                />
              </div>
            )}

            <div class="falt">
              <span class="falt__etikett">
                Kolumner att hämta
                <span class="panel__rubrik__antal"> {formatCount(valda.length)}</span>
              </span>
              <div class="kollista kollista--kryss">
                {hogerKolumner.map((c) => (
                  <label class="kryss" key={c.id}>
                    <input
                      type="checkbox"
                      checked={valda.includes(c.id)}
                      onChange={(e) =>
                        setValdaKolumner(
                          (e.currentTarget as HTMLInputElement).checked
                            ? [...valda, c.id]
                            : valda.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.name}
                    {nyckelkolumner.has(c.id) && (
                      <span class="verktyg__sammanfattning"> — matchningsnyckel</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div class="falt">
              <span class="falt__etikett">Namnprefix på de hämtade kolumnerna</span>
              <input
                value={prefix}
                placeholder={hoger ? `t.ex. ${hoger.name} – ` : ''}
                onInput={(e) => setPrefix((e.currentTarget as HTMLInputElement).value)}
              />
            </div>
          </div>
        </div>

        <div class="slaihop__rutor">
          {vanster && (
            <Filprov
              frame={vanster}
              nycklar={vansterNycklar}
              nyckelkolumner={aktivaPar.map((p) => p.vansterColId)}
            />
          )}
          {hoger && (
            <Filprov
              frame={hoger}
              nycklar={hogerNycklar}
              nyckelkolumner={aktivaPar.map((p) => p.hogerColId)}
            />
          )}
          <Paren
            vanster={vanster}
            hoger={hoger}
            matchning={matchning}
            urval={urval}
            aktivaPar={aktivaPar}
          />
          <Resultatet
            forhand={forhand}
            plan={forhandsplan}
            matchning={matchning}
            vansterRader={vanster?.rowCount ?? 0}
            vansterKolumner={vanster?.columns.length ?? 0}
            flertraff={flertraff}
            nyckelnamn={
              vanster ? aktivaPar.map((p) => findColumn(vanster, p.vansterColId)?.name ?? '') : []
            }
          />
        </div>
      </div>

      <div class="slaihop__fot">
        <span class="slaihop__fot__text">
          Resultatet blir en ny flik. Källfilerna rörs inte.
          {rester > 0 && ` ${formatCount(rester)} rader hittar ingen partner.`}
        </span>
        <button class="knapp" onClick={stangSlaIhop}>
          Avbryt
        </button>
        <button
          class="knapp"
          disabled={!matchning || rester === 0}
          title={
            !matchning
              ? 'Välj minst ett kolumnpar först.'
              : rester === 0
                ? 'Ingen rad blev över — det finns inget att beta av.'
                : 'Gå igenom raderna som inte matchade innan filerna slås ihop.'
          }
          onClick={tillVerkstaden}
        >
          Beta av resten…
        </button>
        <button
          class="knapp knapp--primar"
          disabled={!matchning || matchning.vansterMatchade === 0}
          title={
            !matchning
              ? 'Välj minst ett kolumnpar att matcha på.'
              : matchning.vansterMatchade === 0
                ? 'Inga rader matchar med de här kolumnerna.'
                : undefined
          }
          onClick={kor}
        >
          Slå ihop
        </button>
      </div>
    </div>
  )
}

/* ---------- Rutorna ---------- */

/**
 * De första raderna ur en fil, med nyckeln främst.
 *
 * Nyckelkolumnen läggs först och märks. På en fil med tjugo kolumner ligger
 * den man matchar på annars utanför bild, och då säger provet ingenting om
 * det man faktiskt håller på med.
 *
 * Under varje nyckelvärde står den **normaliserade** formen när den skiljer
 * sig — `Öberg` blir `oberg`. Det är den enda platsen i verktyget där man kan
 * se vad en matchningstyp faktiskt gör, och den ersätter en beskrivning som
 * ändå måste tros på.
 */
function Filprov(props: {
  frame: Frame
  nycklar: string[] | null
  nyckelkolumner: readonly ColumnId[]
}) {
  const { frame } = props
  // Nyckeldelen hör till *parets* plats i listan, inte till kolumnens plats i
  // tabellen. Saknas ett pars kolumn i den här filen skulle en positionell
  // koppling annars visa fel nyckel under rätt värde.
  const nycklarna = props.nyckelkolumner
    .map((id, parIndex) => ({ col: findColumn(frame, id), parIndex }))
    .filter((x): x is { col: Column; parIndex: number } => x.col !== undefined)
  const nyckelSet = new Set(nycklarna.map((x) => x.col.id))
  const ordnade: { col: Column; parIndex: number | null }[] = [
    ...nycklarna.map((x) => ({ col: x.col, parIndex: x.parIndex })),
    ...visibleColumns(frame)
      .filter((c) => !nyckelSet.has(c.id))
      .map((c) => ({ col: c, parIndex: null })),
  ]
  const antal = Math.min(FILPROVSRADER, frame.rowCount)

  return (
    <div class="slaihop__ruta">
      <div class="slaihop__ruta__rubrik">
        {frame.name}
        <span class="panel__rubrik__antal">
          {antal === frame.rowCount
            ? raderText(frame.rowCount)
            : `${formatCount(antal)} av ${raderText(frame.rowCount)}`}
        </span>
      </div>
      <div class="slaihop__ruta__kropp">
        <div class="fortab__omslag">
          <table class="fortab">
            <thead>
              <tr>
                {ordnade.map(({ col, parIndex }) => (
                  <th key={col.id} class={parIndex !== null ? 'fortab__nyckel' : undefined}>
                    {col.name}
                    {parIndex !== null && <span class="fortab__nyckelmark"> nyckel</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: antal }, (_, r) => {
                const delar = props.nycklar ? (props.nycklar[r] ?? '').split(NYCKELAVSKILJARE) : []
                return (
                  <tr key={r}>
                    {ordnade.map(({ col, parIndex }) => {
                      const rått = getCell(col, r)
                      const nyckel = parIndex === null ? undefined : delar[parIndex]
                      return (
                        <td key={col.id} class={parIndex !== null ? 'fortab__nyckel' : undefined}>
                          {rått}
                          {nyckel !== undefined && nyckel !== '' && nyckel !== rått && (
                            <span class="fortab__norm">{nyckel}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** Radens värden i nyckelkolumnerna plus de första övriga, för en kort text. */
function radtext(frame: Frame, nycklar: readonly ColumnId[], rad: number): string {
  const ider = [
    ...nycklar.filter((id) => findColumn(frame, id) !== undefined),
    ...visibleColumns(frame)
      .filter((c) => !nycklar.includes(c.id))
      .slice(0, 2)
      .map((c) => c.id),
  ]
  const delar = ider.map((id) => cellText(frame, id, rad)).filter((t) => t !== '')
  return delar.length > 0 ? delar.join(' · ') : `rad ${frame.sourceRow[rad] ?? rad + 1}`
}

/**
 * Hur raderna paras ihop.
 *
 * Det här är rutan som svarar på frågan siffrorna aldrig kan svara på: *är
 * det rätt rader som hittade varandra?* Åtta träffar av sexton kan lika gärna
 * vara åtta rätta som åtta slumpmässiga, och skillnaden syns bara när man ser
 * paren.
 *
 * Raderna kommer ur `forhandsurval`, som blandar träffar och icke-träffar i
 * den proportion de faktiskt har. Att bara visa de första tio vore att låta
 * slumpen bestämma om rutan ser lugnande eller alarmerande ut.
 */
function Paren(props: {
  vanster: Frame | null
  hoger: Frame | null
  matchning: Matchning | null
  urval: readonly number[]
  aktivaPar: readonly Matchningspar[]
}) {
  const { vanster, hoger, matchning } = props

  const partner = useMemo(() => {
    const karta = new Map<number, number[]>()
    if (!matchning) return karta
    for (const { v, h } of matchning.par) {
      const lista = karta.get(v)
      if (lista) lista.push(h)
      else karta.set(v, [h])
    }
    return karta
  }, [matchning])

  return (
    <div class="slaihop__ruta">
      <div class="slaihop__ruta__rubrik">Så här paras de</div>
      <div class="slaihop__ruta__kropp">
        {!vanster || !hoger || !matchning ? (
          <p class="restlista__tom">Välj ett kolumnpar, så visas de första paren här.</p>
        ) : props.urval.length === 0 ? (
          <p class="restlista__tom">Inga rader att visa.</p>
        ) : (
          props.urval.map((v) => {
            const traffar = partner.get(v) ?? []
            return (
              <div class={`slaihop__paret${traffar.length === 0 ? ' slaihop__paret--utan' : ''}`} key={v}>
                <div class="forslag__rad">
                  {radtext(
                    vanster,
                    props.aktivaPar.map((p) => p.vansterColId),
                    v,
                  )}
                </div>
                {traffar.length === 0 ? (
                  <div class="forslag__rad slaihop__ingen">✕ ingen partner</div>
                ) : (
                  <div class="forslag__rad">
                    ↔{' '}
                    {radtext(
                      hoger,
                      props.aktivaPar.map((p) => p.hogerColId),
                      traffar[0]!,
                    )}
                    {traffar.length > 1 && (
                      <span class="slaihop__flera"> +{formatCount(traffar.length - 1)} till</span>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * Hur resultatet blir.
 *
 * Rutan visar **sömmen först**: nyckelkolumnen och de hämtade kolumnerna
 * direkt efter den. En sammanslagen fil har lätt tretton kolumner och ryms
 * inte i en ruta, men frågan man ställer är aldrig "hur ser hela filen ut"
 * utan "kom rätt värden över?". Resten nås genom att skrolla i sidled.
 */
function Resultatet(props: {
  forhand: Frame | null
  /** En post per rad i `forhand`; `h === null` betyder att raden blev utan partner. */
  plan: readonly Planpost[]
  matchning: Matchning | null
  vansterRader: number
  /** Antal kolumner vänsterfilen bidrar med — allt efter dem är hämtat. */
  vansterKolumner: number
  flertraff: Flertraff
  nyckelnamn: readonly string[]
}) {
  const { forhand, matchning } = props

  /*
   * Hur många rader resultatet får i sin helhet.
   *
   * Vid *En rad per träff* blir filen längre än vänsterfilen, och det talet
   * står idag ingenstans — man ser att en rad matchar tre, men aldrig vad det
   * gör med filen. Planen i `slaIhop` ger en post per par plus en per rad utan
   * träff, så talet går att räkna utan att bygga ramen.
   */
  const totaltAntal =
    matchning === null
      ? null
      : props.flertraff === 'duplicera'
        ? matchning.par.length + matchning.vansterUtan.length
        : props.vansterRader

  /*
   * Sömmen först: nyckeln, sedan de hämtade kolumnerna.
   *
   * Gränsen räknas ur vänsterfilens kolumnantal och inte ur hur många man
   * kryssat i — `slaIhop` kopierar alltid alla vänsterkolumner och lägger de
   * hämtade efter dem, så det är den enda gräns som inte kan glida.
   */
  const ordnade = useMemo(() => {
    if (!forhand) return []
    const kvar = forhand.columns.slice(0, props.vansterKolumner)
    const hamtade = forhand.columns.slice(props.vansterKolumner)
    const nycklar = kvar.filter((c) => props.nyckelnamn.includes(c.name))
    const ovriga = kvar.filter((c) => !props.nyckelnamn.includes(c.name))
    return [
      ...nycklar.map((col) => ({ col, hamtad: false })),
      ...hamtade.map((col) => ({ col, hamtad: true })),
      ...ovriga.map((col) => ({ col, hamtad: false })),
    ]
  }, [forhand, props.vansterKolumner, props.nyckelnamn.join('|')])

  return (
    <div class="slaihop__ruta">
      <div class="slaihop__ruta__rubrik">
        Så här blir resultatet
        {forhand && totaltAntal !== null && (
          <span class="panel__rubrik__antal">
            {formatCount(forhand.rowCount)} av {raderText(totaltAntal)}, valda ur hela filen
          </span>
        )}
      </div>
      <div class="slaihop__ruta__kropp">
        {!forhand ? (
          <p class="restlista__tom">Välj ett kolumnpar, så visas resultatet här.</p>
        ) : (
          <div class="fortab__omslag">
            <table class="fortab">
              <thead>
                <tr>
                  {ordnade.map(({ col }) => (
                    <th key={col.id}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: forhand.rowCount }, (_, r) => {
                  // Utan partner är hela den hämtade halvan frånvarande, inte
                  // tom. Ett tomt värde ur en rad som *hade* en partner är
                  // något helt annat — det är ett värde som saknades i filen —
                  // och att måla dem lika vore att påstå att de betyder samma
                  // sak.
                  const utanPartner = props.plan[r]?.h === null
                  return (
                    <tr key={r}>
                      {ordnade.map(({ col, hamtad }) => {
                        const v = getCell(col, r)
                        return (
                          <td
                            key={col.id}
                            class={hamtad && utanPartner ? 'fortab__utan' : undefined}
                            title={hamtad && utanPartner ? 'Raden hittade ingen partner' : undefined}
                          >
                            {v}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Filväljaren, som i kombineringsvyn. Vyn ska aldrig vara en återvändsgränd. */
function Filknappar(props: {
  onFiler: (files: File[]) => void
  onExempelpar?: () => void
  visaExempel?: boolean
}) {
  const filinput = useRef<HTMLInputElement>(null)
  return (
    <div class="faltrad">
      <button class="knapp" onClick={() => filinput.current?.click()}>
        Öppna fil…
      </button>
      {props.visaExempel && props.onExempelpar && (
        <button class="knapp knapp--tyst" onClick={props.onExempelpar}>
          Öppna exempelparet
        </button>
      )}
      <input
        ref={filinput}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from((e.currentTarget as HTMLInputElement).files ?? [])
          if (files.length > 0) props.onFiler(files)
          ;(e.currentTarget as HTMLInputElement).value = ''
        }}
      />
    </div>
  )
}

/**
 * Gissar kolumnpar utifrån rubrikernas namn.
 *
 * Bara ett förslag, och bara ett par: att gissa ihop flera kolumner åt gången
 * ger lätt en nyckel som är för sträng, och en matchning som ger noll träffar
 * ser ut som att filerna inte hör ihop.
 */
export function foreslaPar(vanster: Frame, hoger: Frame): Matchningspar[] {
  const v = visibleColumns(vanster)
  const h = visibleColumns(hoger)

  for (const vc of v) {
    const vn = rubriknyckel(vc.name)
    const traff = h.find((hc) => rubriknyckel(hc.name) === vn)
    if (traff) return [{ vansterColId: vc.id, hogerColId: traff.id, typ: 'oberoende' }]
  }

  for (const vc of v) {
    const grupp = synonymgrupp(rubriknyckel(vc.name))
    if (grupp === -1) continue
    const traff = h.find((hc) => synonymgrupp(rubriknyckel(hc.name)) === grupp)
    if (traff) return [{ vansterColId: vc.id, hogerColId: traff.id, typ: 'oberoende' }]
  }

  return []
}
