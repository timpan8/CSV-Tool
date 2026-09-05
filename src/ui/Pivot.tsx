import { useMemo, useState } from 'preact/hooks'
import type { ColumnId, Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'
import { berakningsnamn, berakningspost } from '../core/ops/gruppera.js'
import type { Berakning, Berakningstyp } from '../core/ops/gruppera.js'
import {
  diagramdata,
  linjeArTveksam,
  type Diagramplan,
  type Diagramtyp,
  type Stapellage,
} from '../core/ops/diagram.js'
import { Diagram, Diagramforklaring, type Punktinfo } from './Diagram.js'
import { ordnaRader } from './pivotordning.js'
import {
  arAdditiv,
  foreslagenPlan,
  KOLUMNTAK_VAL,
  nyttMatvardeId,
  pivotberakningar,
  pivotera,
  pivotnamn,
  pivotTillFrame,
  type Pivotplan,
} from '../core/ops/pivot.js'
import { Notis, Val } from './parts.js'
import { Pivottabell, type Sortering, type Visning } from './Pivottabell.js'
import { t, tf } from './sprak.js'

type Lage = 'korstabell' | 'nivalista'
/** Vilken av de två läsningarna som visas. Samma tal, två former. */
type Yta = 'tabell' | 'diagram'

const DIAGRAMTYPER: { typ: Diagramtyp; etikett: string; hjalp: string }[] = [
  { typ: 'staplar', etikett: 'Staplar', hjalp: 'En stapel per rad, stående.' },
  {
    typ: 'liggande',
    etikett: 'Liggande',
    hjalp: 'Staplar på sidan — plats för långa namn bredvid stapeln i stället för under.',
  },
  {
    typ: 'linje',
    etikett: 'Linje',
    hjalp: 'En linje per serie. Rätt när raddimensionen har en naturlig ordning, som ett datum.',
  },
  { typ: 'cirkel', etikett: 'Cirkel', hjalp: 'Delar av en helhet, en serie i taget.' },
]

/**
 * Pivotvyn.
 *
 * En egen vy, inte en panel bredvid rutnätet, och det är hela idén: pivoten
 * svarar på en annan sorts fråga än den man ställer med markören i en cell.
 * Den **ändrar aldrig något** — den läser filen och ritar en tabell. Vill man
 * ta med sig svaret finns *Gör till ny flik*, och därifrån går export, filter
 * och sortering som för vilken fil som helst.
 *
 * Två uppställningar av samma beräkning. **Korstabellen** delar upp åt två
 * håll och är förvalet, eftersom det är där mönstret syns. **Nivålistan**
 * delar upp åt ett håll i flera nivåer, med delsummor man kan fälla ihop —
 * samma svar, men ordnat för den som vill borra sig ned i stället för att
 * jämföra i sidled.
 */
export function Pivot(props: {
  frame: Frame
  revision: number
  onNyFlik: (resultat: Frame, text: string) => void
  onStang: () => void
}) {
  const { frame } = props
  const synliga = visibleColumns(frame)

  const [plan, setPlan] = useState<Pivotplan>(() => foreslagenPlan(frame))
  const [lage, setLage] = useState<Lage>('korstabell')
  /** Kolumndimensionen som nivålistan lade undan, så att den kommer tillbaka. */
  const [sparadKolumn, setSparadKolumn] = useState<ColumnId | null>(null)
  const [visning, setVisning] = useState<Visning>('tal')
  const [sortering, setSortering] = useState<Sortering | null>(null)
  const [hopfallda, setHopfallda] = useState<Set<string>>(new Set())
  const [yta, setYta] = useState<Yta>('tabell')
  const [diagramplan, setDiagramplan] = useState<Diagramplan>({
    typ: 'staplar',
    stapellage: 'grupperade',
    matvarde: 0,
  })
  const [punkt, setPunkt] = useState<Punktinfo | null>(null)

  const andra = (delta: Partial<Pivotplan>) => {
    setPlan({ ...plan, ...delta })
    // En ändrad plan är en ny tabell. Att behålla sorteringen på ett
    // kolumnindex som nu betyder en annan kolumn vore värre än att släppa den.
    setSortering(null)
  }

  /*
   * Beräkningen körs om när planen ändras — och när vyn ändras, fast planen
   * står still. `frame.view.length` är med i nyckeln just därför: ett filter
   * i rutnätet byter underlag utan att röra en enda inställning här.
   */
  const plannyckel = JSON.stringify(plan)
  const resultat = useMemo(
    () => pivotera(frame, plan),
    [frame, props.revision, plannyckel, frame.view.length],
  )

  const additiv = plan.matvarden.length > 0 && plan.matvarden.every(arAdditiv)
  const filtrerat = frame.view.length !== frame.rowCount

  const byggMatvarde = (typ: Berakningstyp): Berakning => {
    const post = berakningspost(typ)
    // En kolumn som redan delar upp tabellen är sällan den man vill summera:
    // *summa Ort per Ort* är kolumnens eget värde skrivet en gång till.
    const upptagna = new Set([...plan.rader, plan.kolumn])
    const ledig = synliga.filter((c) => !upptagna.has(c.id))
    const tal = ledig.find((c) => c.type === 'number') ?? ledig[0]
    return {
      id: nyttMatvardeId(),
      typ,
      colId: post.behoverKolumn ? (tal?.id ?? synliga[0]?.id ?? null) : null,
      namn: '',
    }
  }

  const andraMatvarde = (id: string, delta: Partial<Berakning>) =>
    andra({
      matvarden: plan.matvarden.map((m) => {
        if (m.id !== id) return m
        const ny = { ...m, ...delta }
        // Byter man till *Antal rader* finns ingen kolumn att räkna på, och
        // byter man därifrån måste det finnas en.
        const post = berakningspost(ny.typ)
        if (!post.behoverKolumn) ny.colId = null
        else if (ny.colId === null) ny.colId = synliga[0]?.id ?? null
        return ny
      }),
    })

  const vaxlaNiva = (id: ColumnId) => {
    const i = plan.rader.indexOf(id)
    andra({ rader: i >= 0 ? plan.rader.filter((x) => x !== id) : [...plan.rader, id] })
  }

  const bytLage = (nytt: Lage) => {
    setLage(nytt)
    setSortering(null)
    setHopfallda(new Set())
    if (nytt === 'nivalista') {
      setSparadKolumn(plan.kolumn)
      setPlan({ ...plan, kolumn: null })
    } else {
      // Korstabellen har en raddimension och en kolumndimension. Har man byggt
      // tre nivåer behålls den första — resten hade blivit delsummerader i en
      // matris, och en matris med delsummor är inte längre en matris.
      setPlan({
        ...plan,
        rader: plan.rader.slice(0, 1),
        kolumn: sparadKolumn ?? plan.kolumn,
      })
    }
  }

  const bytHall = () => {
    const forsta = plan.rader[0] ?? null
    andra({ rader: plan.kolumn === null ? [] : [plan.kolumn], kolumn: forsta })
  }

  const sortera = (kol: number, m: number) =>
    setSortering((f) =>
      f && f.kol === kol && f.m === m ? (f.ned ? { kol, m, ned: false } : null) : { kol, m, ned: true },
    )

  const vaxlaNod = (stig: string) =>
    setHopfallda((f) => {
      const ny = new Set(f)
      if (ny.has(stig)) ny.delete(stig)
      else ny.add(stig)
      return ny
    })

  const gorFlik = () => {
    const namn = pivotnamn(frame, plan)
    const ut = pivotTillFrame(resultat, plan, frame, namn, {
      totalt: t('Totalt'),
      tomt: t('(tomt)'),
      ovriga: t('Övriga'),
    })
    props.onNyFlik(ut, tf('{0} ur {1}', raderText(ut.rowCount), frame.name))
  }

  const otolkbara = resultat.lasbarhet.filter((l) => l.ifyllda > 0 && l.lasta < l.ifyllda)

  /*
   * Diagrammet läser samma resultat som tabellen, i samma ordning.
   *
   * Det är därför de aldrig kan säga olika saker — och därför en sortering man
   * klickat fram i tabellen står kvar när man byter till staplar.
   */
  const ordnade = useMemo(
    () => ordnaRader(resultat, sortering, Math.max(1, plan.matvarden.length)),
    [resultat, sortering, plan.matvarden.length],
  )
  const diagram = useMemo(
    () => diagramdata(resultat, plan, diagramplan, ordnade, additiv ? visning : 'tal'),
    [resultat, plan, diagramplan, ordnade, additiv, visning],
  )
  const hindrad = diagram.hinder[diagramplan.typ]
  /*
   * Utan kolumndimension har den enda serien inget eget namn — den *är* hela
   * svaret. Att kalla den "(tomt)" vore fel: det är inget tomt värde, det är
   * frånvaron av en uppdelning. Mätvärdets namn säger vad man tittar på.
   */
  const matvardenamn = berakningsnamn(plan.matvarden[diagramplan.matvarde] ?? plan.matvarden[0]!, frame)
  const serienamn = (etikett: string) => (etikett === '' ? matvardenamn : etikett)
  const diagramrubrik = tf(
    '{0} per {1}',
    matvardenamn,
    plan.rader
      .map((id) => frame.columns.find((c) => c.id === id)?.name)
      .filter((n): n is string => n !== undefined)
      .join(', ') || frame.name,
  )

  return (
    <div class="pivot">
      <div class="pivot__topp">
        <div>
          <h2>Pivot</h2>
          <span class="pivot__underrubrik">
            {frame.name} · {raderText(resultat.antalKallrader)}
            {resultat.utanNyckel > 0 &&
              ` · ${tf('{0} utan värde står utanför', raderText(resultat.utanNyckel))}`}
          </span>
        </div>
        <div class="pivot__vaxlar">
          <Val<Lage>
            varden={[
              {
                varde: 'korstabell',
                etikett: 'Korstabell',
                titel: 'Två håll samtidigt: en dimension som rader, en som kolumner.',
              },
              {
                varde: 'nivalista',
                etikett: 'Nivålista',
                titel: 'Ett håll i flera nivåer, med delsummor som går att fälla ihop.',
              },
            ]}
            valt={lage}
            onValj={bytLage}
          />
          <Val<Yta>
            varden={[
              { varde: 'tabell', etikett: 'Tabell', titel: 'Talen, rad för rad.' },
              {
                varde: 'diagram',
                etikett: 'Diagram',
                titel: 'Samma tal som form. Tabellen är alltid ett klick bort.',
              },
            ]}
            valt={yta}
            onValj={(v) => {
              setYta(v)
              setPunkt(null)
            }}
          />
        </div>
      </div>

      <div class="pivot__band">
        {lage === 'korstabell' ? (
          <>
            <label class="pivot__falt">
              <span class="falt__etikett">{t('Rader')}</span>
              <select
                value={plan.rader[0] ?? ''}
                onChange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value
                  andra({ rader: v === '' ? [] : [v] })
                }}
              >
                <option value="">{t('ingen')}</option>
                {synliga.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              class="knapp pivot__byt"
              title={t('Byt plats på rader och kolumner')}
              aria-label={t('Byt plats på rader och kolumner')}
              onClick={bytHall}
            >
              ⇄
            </button>

            <label class="pivot__falt">
              <span class="falt__etikett">{t('Kolumner')}</span>
              <select
                value={plan.kolumn ?? ''}
                onChange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value
                  andra({ kolumn: v === '' ? null : v })
                }}
              >
                <option value="">{t('ingen')}</option>
                {synliga.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <div class="pivot__falt pivot__falt--brett">
            <span class="falt__etikett">{t('Nivåer')}</span>
            <div class="val" role="group">
              {synliga.map((c) => {
                const i = plan.rader.indexOf(c.id)
                return (
                  <button
                    key={c.id}
                    class={`val__knapp${i >= 0 ? ' val__knapp--vald' : ''}`}
                    aria-pressed={i >= 0}
                    onClick={() => vaxlaNiva(c.id)}
                  >
                    {i >= 0 && plan.rader.length > 1 && (
                      <span class="gruppera__ordning">{i + 1}</span>
                    )}
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div class="pivot__falt pivot__falt--brett">
          <span class="falt__etikett">{t('Mätvärden')}</span>
          <div class="pivot__matvarden">
            {plan.matvarden.map((m) => {
              const post = berakningspost(m.typ)
              return (
                <div key={m.id} class="pivot__matvarde">
                  <select
                    aria-label={t('Beräkning')}
                    value={m.typ}
                    title={t(post.hjalp)}
                    onChange={(e) =>
                      andraMatvarde(m.id, {
                        typ: (e.currentTarget as HTMLSelectElement).value as Berakningstyp,
                      })
                    }
                  >
                    {pivotberakningar().map((b) => (
                      <option key={b.typ} value={b.typ}>
                        {t(b.etikett)}
                      </option>
                    ))}
                  </select>
                  {post.behoverKolumn ? (
                    <select
                      aria-label={t('Kolumn att räkna på')}
                      value={m.colId ?? ''}
                      onChange={(e) =>
                        andraMatvarde(m.id, {
                          colId: (e.currentTarget as HTMLSelectElement).value,
                        })
                      }
                    >
                      {synliga.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span class="pivot__allarader">{t('alla rader')}</span>
                  )}
                  {plan.matvarden.length > 1 && (
                    <button
                      class="kolrad__oga"
                      aria-label={t('Ta bort mätvärdet')}
                      title={t('Ta bort mätvärdet')}
                      onClick={() =>
                        andra({ matvarden: plan.matvarden.filter((x) => x.id !== m.id) })
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
            <button
              class="knapp knapp--tyst"
              onClick={() => andra({ matvarden: [...plan.matvarden, byggMatvarde('summa')] })}
            >
              {t('＋ Lägg till mätvärde')}
            </button>
          </div>
        </div>

        <div class="pivot__falt">
          <span class="falt__etikett">{t('Visa')}</span>
          <Val<Visning>
            varden={[
              { varde: 'tal', etikett: 'Tal' },
              {
                varde: 'andelRad',
                etikett: '% av rad',
                titel: 'Cellens del av radens Totalt.',
              },
              {
                varde: 'andelKolumn',
                etikett: '% av kolumn',
                titel: 'Cellens del av kolumnens Totalt.',
              },
            ]}
            valt={additiv ? visning : 'tal'}
            onValj={(v) => additiv && setVisning(v)}
          />
        </div>

        <div class="pivot__falt pivot__falt--kryss">
          {filtrerat && (
            <label class="kryss">
              <input
                type="checkbox"
                checked={plan.underlag === 'vyn'}
                onChange={(e) =>
                  andra({
                    underlag: (e.currentTarget as HTMLInputElement).checked ? 'vyn' : 'hela',
                  })
                }
              />
              {tf(
                'Bara de {0} som visas nu',
                `${formatCount(frame.view.length)} av ${formatCount(frame.rowCount)}`,
              )}
            </label>
          )}
          <label class="kryss">
            <input
              type="checkbox"
              checked={plan.tommaMed}
              onChange={(e) =>
                andra({ tommaMed: (e.currentTarget as HTMLInputElement).checked })
              }
            />
            {t('Ta med rader utan värde')}
          </label>
        </div>
      </div>

      {/*
        Diagrammets eget band, bara när diagrammet syns. Typen och stapelläget
        är inget tabellen har någon användning för, och ett band som visar
        kontroller utan verkan är värre än ett som byter innehåll.
      */}
      {yta === 'diagram' && (
        <div class="pivot__band pivot__band--diagram">
          <div class="pivot__falt">
            <span class="falt__etikett">{t('Form')}</span>
            <div class="val" role="radiogroup" aria-label={t('Form')}>
              {DIAGRAMTYPER.map((d) => {
                const skal = diagram.hinder[d.typ]
                return (
                  <button
                    key={d.typ}
                    class={`val__knapp${diagramplan.typ === d.typ ? ' val__knapp--vald' : ''}`}
                    role="radio"
                    aria-checked={diagramplan.typ === d.typ}
                    disabled={skal !== undefined}
                    title={skal ?? t(d.hjalp)}
                    onClick={() => setDiagramplan({ ...diagramplan, typ: d.typ })}
                  >
                    {t(d.etikett)}
                  </button>
                )
              })}
            </div>
          </div>

          {diagramplan.typ !== 'cirkel' && diagramplan.typ !== 'linje' && diagram.serier.length > 1 && (
            <div class="pivot__falt">
              <span class="falt__etikett">{t('Staplarna')}</span>
              <Val<Stapellage>
                varden={[
                  { varde: 'grupperade', etikett: 'Bredvid varandra' },
                  { varde: 'staplade', etikett: 'På varandra' },
                ]}
                valt={diagramplan.stapellage}
                onValj={(v) => setDiagramplan({ ...diagramplan, stapellage: v })}
              />
            </div>
          )}

          {plan.matvarden.length > 1 && (
            <label class="pivot__falt">
              <span class="falt__etikett">{t('Rita')}</span>
              <select
                value={String(diagramplan.matvarde)}
                onChange={(e) =>
                  setDiagramplan({
                    ...diagramplan,
                    matvarde: Number((e.currentTarget as HTMLSelectElement).value),
                  })
                }
              >
                {plan.matvarden.map((m, i) => (
                  <option key={m.id} value={String(i)}>
                    {berakningsnamn(m, frame)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div class="pivot__kropp">
        {plan.rader.length === 0 && plan.kolumn === null ? (
          <p class="pivot__tomt">
            {t('Välj en kolumn att dela upp på, så räknar pivoten resten.')}
          </p>
        ) : yta === 'tabell' ? (
          <Pivottabell
            frame={frame}
            plan={plan}
            resultat={resultat}
            visning={additiv ? visning : 'tal'}
            sortering={sortering}
            onSortera={sortera}
            hopfallda={hopfallda}
            onVaxlaNod={vaxlaNod}
          />
        ) : hindrad !== undefined ? (
          /*
           * Formen kan bli omöjlig medan man tittar på den — lägger man till
           * en kolumndimension med cirkeln uppe finns det plötsligt två
           * serier att dela upp. Då står skälet där bilden skulle ha stått,
           * i stället för att en tårta ritas av det första bästa.
           */
          <p class="pivot__tomt">{hindrad}</p>
        ) : (
          <div class="pivot__diagramyta">
            <Diagram
              data={diagram}
              plan={diagramplan}
              visning={additiv ? visning : 'tal'}
              rubrik={diagramrubrik}
              onPeka={setPunkt}
            />
            <Diagramforklaring data={diagram} />
            {punkt && (
              /*
               * Rutan hamnar under märket när det inte finns plats ovanför.
               * Ytan klipper det som sticker utanför — en inforuta med
               * avskuren överkant är sämre än en som byter sida.
               */
              <div
                class={`diagram__inforuta${punkt.y < 64 ? ' diagram__inforuta--under' : ''}`}
                style={{ left: punkt.x, top: punkt.y }}
                role="status"
              >
                <div class="diagram__inforuta__kategori">
                  {punkt.kategori === '' ? t('(tomt)') : punkt.kategori}
                </div>
                {punkt.rader.map((r) => (
                  <div class="diagram__inforuta__rad" key={r.etikett}>
                    <span
                      class="diagram__streck"
                      style={{ background: `var(--serie-${r.slot + 1})` }}
                      aria-hidden="true"
                    />
                    <strong>{r.varde}</strong>
                    <span>{serienamn(r.etikett)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div class="pivot__fot">
        <div class="pivot__notiser">
          {!additiv && visning !== 'tal' && (
            <Notis ton="info">
              {t(
                'Andel går bara att räkna på mätvärden som kan läggas ihop. Ett snitt är ingen del av ett annat snitt, och unika värden i en cell är inga delar av de unika i raden.',
              )}
            </Notis>
          )}
          {yta === 'diagram' && diagramplan.typ === 'linje' && linjeArTveksam(frame, plan) && (
            <Notis ton="info">
              {t(
                'En linje antyder att det finns värden mellan punkterna, och mellan två orter finns inga. Staplar säger samma sak utan att lova det.',
              )}
            </Notis>
          )}
          {yta === 'diagram' && diagram.utelamnadeKategorier > 0 && (
            <Notis ton="info">
              {tf(
                'Diagrammet visar de {0} första raderna. Tabellen har allihop.',
                formatCount(diagram.kategorier.length),
              )}
            </Notis>
          )}
          {resultat.doldaKolumnvarden > 0 && (
            <Notis ton="info">
              {tf(
                'Kolumnen har fler värden än som får plats. De {0} vanligaste har egna spalter, resten ligger i Övriga — summorna stämmer fortfarande.',
                formatCount(plan.kolumntak),
              )}
            </Notis>
          )}
          {resultat.doldaRadvarden > 0 && (
            <Notis ton="info">
              {tf(
                '{0} radvärden fick inte plats och ligger i Övriga.',
                formatCount(resultat.doldaRadvarden),
              )}
            </Notis>
          )}
          {resultat.kapat && (
            <Notis ton="varning">
              {tf(
                'Tabellen visar de första {0} raderna. Gör en flik för att få med allihop.',
                formatCount(resultat.rader.length),
              )}
            </Notis>
          )}
          {otolkbara.map((l) => (
            <Notis ton="varning" key={l.id}>
              {tf(
                '{0} av {1} värden gick att läsa som tal. Resten räknas inte med.',
                formatCount(l.lasta),
                formatCount(l.ifyllda),
              )}
            </Notis>
          ))}
        </div>
        <div class="pivot__knappar">
          {resultat.doldaKolumnvarden > 0 && (
            <label class="pivot__falt">
              <span class="falt__etikett">{t('Spalter')}</span>
              <select
                value={String(plan.kolumntak)}
                onChange={(e) =>
                  andra({ kolumntak: Number((e.currentTarget as HTMLSelectElement).value) })
                }
              >
                {KOLUMNTAK_VAL.map((n) => (
                  <option key={n} value={String(n)}>
                    {formatCount(n)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button class="knapp" onClick={gorFlik}>
            {t('Gör till ny flik')}
          </button>
          <button class="knapp knapp--primar" onClick={props.onStang}>
            {t('Stäng pivoten')}
          </button>
        </div>
      </div>
    </div>
  )
}
