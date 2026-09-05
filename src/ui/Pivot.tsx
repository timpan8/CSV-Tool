import { useMemo, useState } from 'preact/hooks'
import type { Frame } from '../core/types.js'
import { formatCount } from '../core/locale/sv.js'
import { findColumn } from '../core/frame/frame.js'
import { hamtaPlan, sparaPlan } from '../state/pivot.js'
import { matvardenamn } from './matvarde.js'
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
  KOLUMNTAK_VAL,
  pivotera,
  pivotnamn,
  pivotTillFrame,
  type Pivotplan,
} from '../core/ops/pivot.js'
import { Notis, Val } from './parts.js'
import { Pivotpanel } from './Pivotpanel.js'
import { Pivottabell, type Radlayout, type Sortering, type Visning } from './Pivottabell.js'
import { rader as raderText, t, tf } from './sprak.js'

/** Vilken av de två läsningarna som visas. Samma tal, två former. */
type Yta = 'tabell' | 'diagram'

/** Exporterad så att ordboksvakten når orden — de går genom `t()` som variabler. */
export const RADLAYOUTER: { varde: Radlayout; etikett: string; hjalp: string }[] = [
  { varde: 'indragen', etikett: 'Indragen', hjalp: 'En lista med nivåer och delsummor att fälla ihop.' },
  { varde: 'kolumner', etikett: 'Egna spalter', hjalp: 'Ett radfält per spalt, med hela vägen på varje rad.' },
  { varde: 'block', etikett: 'Block', hjalp: 'Det översta radfältets värden bredvid varandra, var och en med sin egen lista.' },
]

export const DIAGRAMTYPER: { typ: Diagramtyp; etikett: string; hjalp: string }[] = [
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
 * **Fyra rutor i en panel till höger** säger vad tabellen är: fälten i Rader
 * och Kolumner delar upp, fälten i Värden räknas, fälten i Filter avgör vad
 * som räknas med. Det ersatte en lägesväxel mellan *korstabell* och
 * *nivålista* — en nivålista *är* flera fält i Rader utan fält i Kolumner, och
 * två ställen som styr samma sak är ett för mycket.
 */
export function Pivot(props: {
  frame: Frame
  /** Flikens id: nyckeln planen sparas under, så att den överlever att vyn stängs. */
  tabId: string
  revision: number
  onNyFlik: (resultat: Frame, text: string) => void
  onStang: () => void
}) {
  const { frame } = props

  const [plan, setPlan] = useState<Pivotplan>(() => hamtaPlan(props.tabId))
  const [layout, setLayout] = useState<Radlayout>('indragen')
  /** Panelen går att fälla in: en bred korstabell ska kunna få hela fönstret. */
  const [panel, setPanel] = useState(true)
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

  /** Radfälten som faktiskt finns i filen — ett borttaget fält står kvar i planen men inte i tabellen. */
  const radfalt = plan.rader.filter((id) => findColumn(frame, id) !== undefined).length

  const andra = (delta: Partial<Pivotplan>) => {
    const ny = { ...plan, ...delta }
    setPlan(ny)
    sparaPlan(props.tabId, ny)
    // En ändrad plan är en ny tabell. Att behålla sorteringen på ett
    // kolumnindex som nu betyder en annan kolumn vore värre än att släppa den.
    setSortering(null)
    if (delta.rader !== undefined || delta.kolumner !== undefined) {
      // Hopfällningen är stigar av index — "0/2" — och pekar på andra rader
      // så fort fälten byts. Samma sak med punkten under pekaren.
      setHopfallda(new Set())
      setPunkt(null)
    }
    // Block behöver två radfält. Faller de under två visar tabellen den
    // indragna listan, och då ska valet säga det också.
    const nyaRadfalt = ny.rader.filter((id) => findColumn(frame, id) !== undefined).length
    if (layout === 'block' && nyaRadfalt < 2) setLayout('indragen')
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
  /** Varför andelarna inte går att välja just nu — eller `undefined` när de går. */
  const andelskal =
    plan.matvarden.length === 0
      ? t('Lägg ett fält i Värden först.')
      : additiv
        ? undefined
        : t('Andel går bara att räkna på mätvärden som kan läggas ihop.')
  const filtrerat = frame.view.length !== frame.rowCount

  /*
   * Byt håll: hela Rader mot hela Kolumner.
   *
   * Med ett fält i vardera är det samma sak som förut. Med flera är det den
   * enda vändning som betyder något — att vända fält för fält vore en annan
   * tabell, inte samma tabell sedd från andra hållet.
   */
  const bytHall = () => andra({ rader: plan.kolumner, kolumner: plan.rader })

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

  /** Sant när fliken hade blivit tom: varken rader att skriva eller tal att skriva i dem. */
  const ingetAttTaMed = radfalt === 0 && plan.matvarden.length === 0

  const gorFlik = () => {
    const namn = pivotnamn(frame, plan, { per: t('per'), pivot: t('pivot') })
    const ut = pivotTillFrame(resultat, plan, frame, namn, {
      totalt: t('Totalt'),
      tomt: t('(tomt)'),
      ovriga: t('Övriga'),
      matnamn: (m) => matvardenamn(m, frame),
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
    () =>
      diagramdata(resultat, plan, diagramplan, ordnade, additiv ? visning : 'tal', {
        tomt: t('(tomt)'),
        ovriga: t('Övriga'),
      }),
    [resultat, plan, diagramplan, ordnade, additiv, visning],
  )
  const hindrad = diagram.hinder[diagramplan.typ]
  /*
   * Utan kolumndimension har den enda serien inget eget namn — den *är* hela
   * svaret. Att kalla den "(tomt)" vore fel: det är inget tomt värde, det är
   * frånvaron av en uppdelning. Mätvärdets namn säger vad man tittar på.
   */
  const valtMatvarde = plan.matvarden[diagramplan.matvarde] ?? plan.matvarden[0]
  const matnamn = valtMatvarde ? matvardenamn(valtMatvarde, frame) : ''
  const serienamn = (etikett: string) => (etikett === '' ? matnamn : etikett)
  const diagramrubrik = tf(
    '{0} per {1}',
    matnamn,
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
          <Val<Yta>
            etikett={t('Tabell eller diagram')}
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
          <button
            class="knapp"
            aria-pressed={panel}
            title={t('Visa eller dölj fältpanelen')}
            onClick={() => setPanel(!panel)}
          >
            {t('Fält')}
          </button>
        </div>
      </div>

      <div class="pivot__band">
        <button
          class="knapp pivot__byt"
          title={t('Byt plats på rader och kolumner')}
          aria-label={t('Byt plats på rader och kolumner')}
          onClick={bytHall}
        >
          ⇄
        </button>

        <div class="pivot__falt">
          <span class="falt__etikett">{t('Radfälten')}</span>
          <Val<Radlayout>
            etikett={t('Radfälten')}
            varden={RADLAYOUTER.map((r) => ({
              varde: r.varde,
              etikett: r.etikett,
              titel: r.hjalp,
              // Block delar upp på det översta radfältet och listar resten
              // under det. Med ett enda fält finns inget att lista.
              inaktiv:
                r.varde === 'block' && radfalt < 2
                  ? t('Block behöver minst två fält i Rader.')
                  : undefined,
            }))}
            valt={layout}
            onValj={setLayout}
          />
        </div>

        <div class="pivot__falt">
          <span class="falt__etikett">{t('Visa')}</span>
          <Val<Visning>
            etikett={t('Visa')}
            varden={[
              { varde: 'tal', etikett: 'Tal' },
              {
                varde: 'andelRad',
                etikett: '% av rad',
                titel: 'Cellens del av radens Totalt.',
                inaktiv: andelskal,
              },
              {
                varde: 'andelKolumn',
                etikett: '% av kolumn',
                titel: 'Cellens del av kolumnens Totalt.',
                inaktiv: andelskal,
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
                'Bara de {0} av {1} som visas nu',
                formatCount(frame.view.length),
                formatCount(frame.rowCount),
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
                etikett={t('Staplarna')}
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
                    {matvardenamn(m, frame)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div class={`pivot__kropp${panel ? ' pivot__kropp--panel' : ''}`}>
        <div class="pivot__yta">
        {plan.rader.length === 0 && plan.kolumner.length === 0 && plan.matvarden.length === 0 ? (
          <div class="pivot__tomt">
            <p>{t('Dra ett fält till Rader, Kolumner eller Värden, så räknar pivoten resten.')}</p>
            {!panel && (
              <button class="knapp" onClick={() => setPanel(true)}>
                {t('Visa fältpanelen')}
              </button>
            )}
          </div>
        ) : yta === 'tabell' ? (
          <Pivottabell
            frame={frame}
            plan={plan}
            resultat={resultat}
            visning={additiv ? visning : 'tal'}
            layout={layout}
            sortering={sortering}
            onSortera={sortera}
            hopfallda={hopfallda}
            onVaxlaNod={vaxlaNod}
          />
        ) : plan.matvarden.length === 0 ? (
          <p class="pivot__tomt">{t('Dra ett fält till Värden, så finns det något att rita.')}</p>
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
        {panel && (
          <Pivotpanel frame={frame} plan={plan} onPlan={andra} onStang={() => setPanel(false)} />
        )}
      </div>

      <div class="pivot__fot">
        <div class="pivot__notiser">
          {plan.matvarden.length === 0 && (plan.rader.length > 0 || plan.kolumner.length > 0) && (
            <Notis ton="info">
              {t('Inget mätvärde än. Dra ett fält till Värden, eller välj ＋ Antal rader.')}
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
          {resultat.doldaKolumnlov > 0 && (
            <Notis ton="info">
              {tf(
                '{0} kolumnkombinationer fick inte plats och ligger i Övriga. Färre fält i Kolumner ger fler egna spalter.',
                formatCount(resultat.doldaKolumnlov),
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
          <button
            class="knapp"
            disabled={ingetAttTaMed}
            title={ingetAttTaMed ? t('Lägg ett fält i Rader eller Värden först.') : undefined}
            onClick={gorFlik}
          >
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
