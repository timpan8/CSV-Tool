import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { codeCounts } from '../core/frame/column.js'
import {
  DELNINGSSATT,
  STANDARDDELNING,
  byggDelare,
  delaMall,
  inventeraDelning,
  inventeraMonster,
  monsterfel,
  monsterkolumner,
  type Delning,
  type Delningssatt,
} from '../core/ops/columns.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { anvandeMall, mallarAvSort } from '../state/mallar.js'
import { formatCount } from '../core/locale/sv.js'
import { celler, sprak, t, tf, tj } from './sprak.js'

const AVGRANSARE = [
  { varde: ' ', etikett: 'Mellanslag' },
  { varde: ',', etikett: 'Komma' },
  { varde: ';', etikett: 'Semikolon' },
  { varde: '-', etikett: 'Bindestreck' },
  { varde: 'eget', etikett: 'Eget…' },
] as const

/**
 * Delar en kolumn i flera.
 *
 * De nya kolumnerna visas som spökkolumner intill källan, en per målkolumn,
 * så att antalet och fördelningen syns innan något skapas. Källkolumnen står
 * kvar: det är originalet, och delningen är en tolkning.
 */
export function SplitTool(props: {
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}) {
  const { col } = props
  const [satt, setSatt] = useState<Delningssatt>(STANDARDDELNING.satt)
  const [avgransarval, setAvgransarval] = useState<(typeof AVGRANSARE)[number]['varde']>(' ')
  const [egen, setEgen] = useState('|')
  const [position, setPosition] = useState(3)
  const [antal, setAntal] = useState(2)
  const [namn, setNamn] = useState<(string | undefined)[]>([])
  // Ett mönster nämner kolumner som *ska skapas*, inte som måste finnas, så
  // det går alltid att fylla i — till skillnad från mallen i MergeTool.
  const [monster, setMonster] = useState(mallarAvSort('monster')[0]?.text ?? '{Namn} <{E-post}>')

  const armonster = satt === 'monster'
  const avgransare = avgransarval === 'eget' ? egen : avgransarval

  /*
   * Mönstrets klamrar bestämmer både antalet kolumner och deras namn.
   *
   * Att fråga om antalet igen vore att fråga om något som redan står i
   * mönstret, och att döpa dem `Namn 1` och `Namn 2` vore att kasta bort de
   * namn användaren just skrivit.
   */
  const monsterdelar = useMemo(() => delaMall(monster), [monster])
  const monsternamn = useMemo(() => monsterkolumner(monsterdelar), [monsterdelar])
  const fel = armonster ? monsterfel(monsterdelar) : null
  const monsterforslag = armonster
    ? mallarAvSort('monster').filter((m) => m.text !== monster)
    : []

  const faktisktAntal = armonster ? Math.max(1, monsternamn.length) : antal
  const inst: Delning = {
    satt,
    avgransare,
    position,
    antal: faktisktAntal,
    trimma: true,
    monster,
  }

  const koder = useMemo(() => codeCounts(col), [col, props.dataRevision])
  const inv = useMemo(
    () => inventeraDelning(col.dict, inst, koder),
    [col, props.dataRevision, koder, satt, avgransare, position, faktisktAntal],
  )
  const monsterinv = useMemo(
    () => (armonster ? inventeraMonster(col.dict, inst, koder) : null),
    [col, props.dataRevision, koder, armonster, monster],
  )

  /*
   * Namnen är standard tills användaren skriver ett eget.
   *
   * Läget bär bara det som skrivits in, inte de synliga namnen. Ett förvalt
   * `Namn 1` som sparats i läget hade annars vunnit över klammerns namn så
   * fort man bytte till mönsterläget, och det namn användaren just skrev i
   * mönstret hade tappats bort.
   */
  const exempel = armonster ? (monsterinv?.exempel ?? null) : inv.exempel

  const malnamn = useMemo(
    () =>
      Array.from(
        { length: faktisktAntal },
        (_, i) => namn[i] ?? (armonster ? monsternamn[i] : undefined) ?? `${col.name} ${i + 1}`,
      ),
    [armonster, monsternamn, faktisktAntal, namn, col.name],
  )

  const forh = useMemo(() => {
    // Delaren byggs en gång, inte en gång per unikt värde: mönstret ska
    // tolkas en gång även när kolumnen har hundratusen olika adresser.
    const dela = byggDelare(inst)
    const tomma = new Array<string>(faktisktAntal).fill('')
    return beraknaForhandsvisning(col, {
      etikett: armonster
        ? tf('Plockade ur ”{0}” med ett mönster', col.name)
        : tf('Delade ”{0}” i {1} kolumner', col.name, formatCount(faktisktAntal)),
      kind: 'split',
      profil: { typ: 'dela', kolumn: col.name, delning: inst, namn: malnamn },
      delar: (v) => dela(v) ?? tomma,
      arProblem: armonster
        ? (v) => dela(v) === null
        : (v) => (dela(v) ?? []).filter((d) => d !== '').length < 2,
      nyaKolumner: malnamn,
    })
  }, [
    col,
    props.dataRevision,
    satt,
    avgransare,
    position,
    faktisktAntal,
    monster,
    malnamn,
    sprak.value,
  ])

  useEffect(() => {
    props.onForhandsvisning([forh])
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  const sattNamn = (i: number, v: string) => {
    const kopia = [...namn]
    kopia[i] = v
    setNamn(kopia)
  }

  return (
    <Verktygspanel
      titel={t('Dela kolumn')}
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            {t('Avbryt')}
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0 || fel !== null}
            title={
              fel !== null
                ? t(fel)
                : forh.andrade === 0
                  ? t('Delningen ger inga värden.')
                  : undefined
            }
            onClick={() => {
              if (armonster) anvandeMall({ sort: 'monster', text: monster })
              props.onTillampa([forh])
            }}
          >
            {tf('Skapa {0} kolumner', formatCount(faktisktAntal))}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">{t('Dela')}</span>
        <Val
          varden={DELNINGSSATT.map((d) => ({ varde: d.varde, etikett: d.etikett, titel: d.titel }))}
          valt={satt}
          onValj={setSatt}
        />
      </div>

      {armonster ? (
        <>
          <div class="falt">
            <span class="falt__etikett">{t('Mönster')}</span>
            <input
              value={monster}
              onInput={(e) => setMonster((e.currentTarget as HTMLInputElement).value)}
            />
            <p class="verktyg__sammanfattning">
              {tj(
                'Skriv värdet som det ser ut och sätt {0} runt det du vill plocka ut. Texten emellan är avgränsarna, och varje klammer blir en kolumn.',
                <code>{'{Namn}'}</code>,
              )}
            </p>
            {fel !== null && <Notis ton="fara">{t(fel)}</Notis>}
          </div>

          {/* Samma rad och samma etikett som i mallverktyget — det är samma
              sorts text, och två paneler som gör samma sak ska se likadana ut. */}
          {monsterforslag.length > 0 && (
            <div class="falt">
              <span class="falt__etikett">{t('Senast använda')}</span>
              <div class="val" role="group">
                {monsterforslag.map((m, i) => (
                  <button
                    key={i}
                    class="val__knapp"
                    title={m.text}
                    onClick={() => setMonster(m.text)}
                  >
                    {kort(m.text)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : satt === 'position' ? (
        <div class="falt">
          <span class="falt__etikett">{t('Efter hur många tecken')}</span>
          <input
            type="number"
            min={1}
            value={position}
            onInput={(e) =>
              setPosition(Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 1))
            }
          />
        </div>
      ) : (
        <div class="falt">
          <span class="falt__etikett">{t('Vid vilket tecken')}</span>
          <Val varden={AVGRANSARE} valt={avgransarval} onValj={setAvgransarval} />
          {avgransarval === 'eget' && (
            <input
              value={egen}
              onInput={(e) => setEgen((e.currentTarget as HTMLInputElement).value)}
            />
          )}
        </div>
      )}

      {!armonster && (
      <div class="falt">
        <span class="falt__etikett">{t('Antal nya kolumner')}</span>
        <Val
          varden={[2, 3, 4, 5].map((n) => ({ varde: String(n), etikett: String(n) }))}
          valt={String(antal)}
          onValj={(v) => setAntal(Number(v))}
        />
        {inv.flest > antal && (
          <Notis ton="varning">
            {tf(
              'Något värde delas i {0} delar. Överskottet hamnar i den sista kolumnen i stället för att försvinna — höj antalet om du vill ha det för sig.',
              formatCount(inv.flest),
            )}
          </Notis>
        )}
      </div>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Namn på de nya kolumnerna')}</span>
        {malnamn.map((n, i) => (
          <input
            key={i}
            value={n}
            onInput={(e) => sattNamn(i, (e.currentTarget as HTMLInputElement).value)}
          />
        ))}
      </div>

      {exempel && (
        <p class="verktyg__sammanfattning">
          {tj(
            '{0} blir {1}',
            <code>{exempel.fore}</code>,
            <>
              {exempel.efter.map((d, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <strong>{d === '' ? t('(tomt)') : d}</strong>
                </span>
              ))}
            </>,
          )}
        </p>
      )}

      {/*
        Räknarna säger olika saker i de två lägena, eftersom orden betyder
        olika saker: en delning som inte hittar sin avgränsare ger ändå ett
        värde i första kolumnen, medan ett värde som inte matchar mönstret inte
        ger något alls. Att låna den ena meningen till det andra fallet hade
        varit att påstå något som inte stämde.
      */}
      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={forh.problem}
        etikettAndrade="Bara ifyllda"
        etikettProblem={armonster ? 'Bara omatchade' : 'Bara odelade'}
      >
        {tj(
          '{0} av {1} ger värden',
          <strong>{formatCount(forh.andrade)}</strong>,
          celler(forh.ifyllda),
        )}
        {armonster
          ? monsterinv !== null &&
            monsterinv.omatchade > 0 &&
            tj(
              ' · {0} matchar inte mönstret och får tomma celler',
              <strong class="verktyg__problem">{formatCount(monsterinv.omatchade)}</strong>,
            )
          : inv.utanAvgransare > 0 &&
            tj(
              ' · {0} saknar avgränsare',
              <strong class="verktyg__problem">{formatCount(inv.utanAvgransare)}</strong>,
            )}
        .
      </Resultat>

      {armonster && (
        <Notis ton="info">
          {t(
            'Källkolumnen står kvar orörd. Ett värde som inte matchar tappas alltså aldrig — det ligger kvar där det stod.',
          )}
        </Notis>
      )}
    </Verktygspanel>
  )
}

/** Kortar ett mönster så att chipset inte blir bredare än panelen. */
function kort(text: string): string {
  return text.length > 28 ? `${text.slice(0, 27)}…` : text
}
