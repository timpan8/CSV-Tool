import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Column, ColumnId, Frame } from '../core/types.js'
import { findColumn, visibleColumns } from '../core/frame/frame.js'
import {
  byggNycklar,
  cellText,
  MATCHNINGSTYPER,
  slaIhop,
  type Matchningspar,
  type Matchningstyp,
} from '../core/ops/match.js'
import { foreslaLuddigaPar, type Forslagsresultat } from '../core/ops/likhet.js'
import {
  arAvvisat,
  avvisaForslag,
  flikarna,
  fullmatchning,
  grundmatchning,
  korRunda,
  laggExtrapar,
  restlistor,
  saknadeKolumner,
  skrivAv,
  skrivAvAlla,
  kastaVerkstad,
  lamnaVerkstad,
  ogjortArbete,
  synkaVerkstad,
  taBortExtrapar,
  verkstad,
} from '../state/matchning.js'
import { redigeraCellFysisk } from '../state/edits.js'
import { EXCEL_FRIENDLY, encodeExport, urvalTillCsv } from '../core/csv/stringify.js'
import { notify, undo } from '../state/store.js'
import { formatCount } from '../core/locale/sv.js'
import { Notis } from './parts.js'
import { Restlista, type Restsort } from './Restlista.js'
import { Jamforelse } from './Jamforelse.js'
import { Forslagslista } from './Forslagslista.js'
import { rader as raderText, t, tf } from './sprak.js'

/**
 * Verkstadens jämförelser: matchningens ekvivalenstyper plus den luddiga.
 *
 * `MATCHNINGSTYPER` lämnas orörd med flit. Luddig likhet får aldrig bli ett
 * val i dialogen — den kostar O(n·m) och hör hemma bara här, på en kort lista
 * där varje förslag ändå granskas för hand.
 */
type Verkstadstyp = Matchningstyp | 'luddig'

const VERKSTADSTYPER: { typ: Verkstadstyp; etikett: string; beskrivning: string }[] = [
  ...MATCHNINGSTYPER,
  {
    typ: 'luddig',
    etikett: 'Luddig',
    beskrivning:
      'Letar efter rader som liknar varandra. Ger förslag att godkänna, inte färdiga par — en gissning som ser rimlig ut är farligare än ingen gissning.',
  },
]

/**
 * Matchningsverkstaden.
 *
 * Etapp 5 svarade på frågan ”hör de här filerna ihop?”. Den här vyn svarar på
 * den som kommer efteråt och som är den svåra: *vad gör jag med raderna som
 * blev över?* De ligger här som två listor att beta av, och det finns fyra
 * vägar ut ur dem — en ny runda på en annan kolumn, ett par gjort för hand,
 * ett värde som rättas så att raden matchar av sig själv, och att skriva av
 * raden när ingen partner finns.
 *
 * Varje körning lägger resultatet i en **ny** flik, och sessionen lever vidare
 * så att man kan fortsätta beta av resten efteråt. Att i stället fylla på ett
 * färdigt resultat i efterhand hade ändrat resultatfliken under händerna på
 * den som tittade på den.
 */
export function Verkstad(props: {
  onSlaIhop: (frame: Frame, text: string) => void
  onStang: () => void
}) {
  const s = verkstad.value
  const f = flikarna()

  const [valdVanster, setValdVanster] = useState<number | null>(null)
  const [valdHoger, setValdHoger] = useState<number | null>(null)
  const [forslag, setForslag] = useState<Forslagsresultat | null>(null)
  const [forslagskolumner, setForslagskolumner] = useState<{ v: ColumnId; h: ColumnId } | null>(
    null,
  )

  // Kontrollen skriver till signalen och får därför inte köras under ritning.
  useEffect(() => {
    const svar = synkaVerkstad()
    if (svar === 'omnumrerad') {
      notify(
        'Rader har lagts till eller tagits bort, så verkstadens par pekade inte längre på rätt rader. De har kastats.',
        { ton: 'varning' },
      )
    } else if (svar === 'stangd') {
      // Utan den här grenen försvann hela sessionen och ytan blev tom, utan
      // ett ord — och foten hade just lovat att arbetet ligger kvar.
      notify(
        'En av filerna i sammanslagningen stängdes, så verkstaden gick inte att hålla öppen. Arbetet är borta.',
        { ton: 'varning' },
      )
    }
  })

  const bas = useMemo(
    () => (f && s ? grundmatchning(f, s) : null),
    [s?.par, f?.vanster.dataRevision, f?.hoger.dataRevision],
  )
  const full = useMemo(
    () => (f && s && bas ? fullmatchning(f, s, bas) : null),
    [bas, s?.extra],
  )

  /*
   * Nycklarna per rad, för att kunna säga *varför* en rad ligger i listan.
   *
   * En tom nyckel kan aldrig matcha, och ingen ny runda i världen hjälper —
   * det är ett annat problem än att partnern saknas, och rätt åtgärd är att
   * fylla i värdet. `byggNycklar` svarar för hela filen i ett svep över
   * ordboken, samma anrop som matchningen själv gör.
   */
  const nycklar = useMemo(
    () =>
      f && s && s.par.length > 0
        ? {
            vanster: byggNycklar(f.vanster.frame, s.par, 'vanster'),
            hoger: byggNycklar(f.hoger.frame, s.par, 'hoger'),
          }
        : null,
    [s?.par, f?.vanster.dataRevision, f?.hoger.dataRevision],
  )

  if (!s || !f || !bas || !full) return null

  const vanster = f.vanster.frame
  const hoger = f.hoger.frame
  const rest = restlistor(s, full)
  const saknade = saknadeKolumner(f, s)
  const avskrivna = s.avskrivnaVanster.size + s.avskrivnaHoger.size

  const ratta = (sida: 'vanster' | 'hoger', rad: number) => (col: Column, varde: string) => {
    const tab = sida === 'vanster' ? f.vanster : f.hoger
    if (redigeraCellFysisk(tab, col, rad, varde)) {
      notify(`Rättade ${col.name} i ${tab.frame.name}.`, {
        atgard: { etikett: 'Ångra', kor: () => undo(tab) },
      })
    }
  }

  /*
   * Förslagen räknas fram på begäran och filtreras sedan vid ritning, aldrig
   * om. Ett godkänt förslag ändrar restlistorna, och skulle listan räknas om
   * på den ändringen kostade varje klick en full indexombyggnad.
   */
  const restVanster = new Set(rest.vanster)
  const restHoger = new Set(rest.hoger)

  /*
   * Visningslistan tar med de osäkra raderna; sökningen efter partner gör det
   * inte. En rad med tre träffar behöver ett val, inte en fjärde träff — så
   * `rest.vanster` går vidare orörd till rundorna och de luddiga förslagen.
   */
  const osakra = new Set(rest.osakra)
  const vansterLista = [...rest.vanster, ...rest.osakra].sort((a, b) => a - b)
  const sortFor = (sida: 'vanster' | 'hoger') => (rad: number): Restsort => {
    if (sida === 'vanster' && osakra.has(rad)) return 'flera'
    const n = nycklar?.[sida]?.[rad]
    return n === '' ? 'tom' : 'utan'
  }
  const synligaForslag = (forslag?.forslag ?? [])
    .filter((x) => restVanster.has(x.v) && restHoger.has(x.h) && !arAvvisat(s, x.v, x.h))
    .slice(0, 12)

  const korSteg = (vansterColId: ColumnId, hogerColId: ColumnId, typ: Verkstadstyp) => {
    if (typ === 'luddig') {
      const vc = findColumn(vanster, vansterColId)
      const hc = findColumn(hoger, hogerColId)
      if (!vc || !hc) return
      setForslagskolumner({ v: vansterColId, h: hogerColId })
      setForslag(foreslaLuddigaPar(vc, rest.vanster, hc, rest.hoger))
      return
    }
    const traffar = korRunda([{ vansterColId, hogerColId, typ }])
    setForslag(null)
    setForslagskolumner(null)
    notify(
      traffar === 0
        ? 'Rundan hittade inga nya par. Prova en annan kolumn eller en annan jämförelse.'
        : `Rundan parade ihop ${raderText(traffar)}.`,
    )
  }

  /*
   * En osäker rad går inte att para för hand. Den har redan flera träffar,
   * och ett extrapar hade bara blivit en till: under *Lämna tom* hade paret
   * noll verkan, under *Ta den första* hade autoparet vunnit över det
   * handvalda. Ett val som tyst ignoreras är värre än ett som stoppas med
   * förklaring — raden behöver ett val bland sina träffar, inte ett par till.
   */
  const valdArOsaker = valdVanster !== null && osakra.has(valdVanster)
  const paraIhop = () => {
    if (valdVanster === null || valdHoger === null || valdArOsaker) return
    laggExtrapar(valdVanster, valdHoger, 'hand', t('för hand'))
    setValdVanster(null)
    setValdHoger(null)
  }

  const kvarEfterat = vansterLista.length + rest.hoger.length

  /*
   * Högerraderna som följer med, när sammanslagningen valdes med *Alla rader
   * ur båda filerna*.
   *
   * Restlistan och inte `full.hogerUtan`: den är redan rensad från de rader
   * användaren skrivit av. Att skriva av betyder alltså fortfarande precis
   * vad notisen längre ned lovar — raden är avklarad — och kärnan slipper
   * känna till att avskrivningar finns.
   */
  const hogerRester = s.sammanslagning.omfattning === 'bada' ? rest.hoger : undefined

  const kor = () => {
    const omgang = s.omgangar + 1
    const { frame, fyllda } = slaIhop(
      vanster,
      hoger,
      full,
      s.sammanslagning,
      undefined,
      hogerRester,
    )
    // Varje omgång blir en egen flik. Namnet säger vilken, så att man ser
    // vilken som är den senaste när man kört flera gånger.
    if (omgang > 1) frame.name = `${frame.name} (omgång ${omgang})`
    lamnaVerkstad()
    const rest = kvarEfterat > 0 ? ` ${raderText(kvarEfterat)} ligger kvar att beta av.` : ''
    // Namnet tas ur ramen och byggs inte om ur delarna — annars säger notisen
    // en sak och fliken en annan så fort omgången numreras.
    props.onSlaIhop(
      frame,
      `${frame.name} — ${formatCount(fyllda)} av ${raderText(frame.rowCount)} fick värden.${rest}`,
    )
  }

  return (
    <div class="verkstad">
      <div class="verkstad__topp">
        <div class="verkstad__rubrik">
          <h2>{t('Matchningsverkstaden')}</h2>
          <span class="verkstad__underrubrik">
            {vanster.name} ↔ {hoger.name} · {beskrivPar(vanster, hoger, s.par)}
          </span>
        </div>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(full.vansterMatchade)}</td>
              <td>
                {tf(
                  'av {0} rader i {1} har en partner',
                  formatCount(vanster.rowCount),
                  vanster.name,
                )}
              </td>
            </tr>
            <tr class={vansterLista.length + rest.hoger.length > 0 ? 'inventering--okant' : ''}>
              <td class="inventering__antal">
                {formatCount(vansterLista.length + rest.hoger.length)}
              </td>
              <td>{t('kvar att titta på')}</td>
            </tr>
            {rest.osakra.length > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(rest.osakra.length)}</td>
                <td>
                  {t(
                    s.sammanslagning.flertraff === 'lamna'
                      ? 'matchar flera rader och får därför inga värden'
                      : 'matchar flera rader — regeln valde åt dig',
                  )}
                </td>
              </tr>
            )}
            {s.extra.length > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(s.extra.length)}</td>
                <td>{t('par gjorda här')}</td>
              </tr>
            )}
            {avskrivna > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(avskrivna)}</td>
                <td>{t('avskrivna — de följer med i resultatet precis som förut')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {saknade.length > 0 && (
        <div class="verkstad__larm">
          <Notis ton="fara">
            {t(
              'En kolumn som matchningen bygger på finns inte längre. Varje rad ser därför ut att sakna partner. Stäng verkstaden och ställ in matchningen på nytt.',
            )}
          </Notis>
        </div>
      )}

      <div class="verkstad__listor">
        <Restlista
          titel={t('Kvar i stommen (vänsterfilen)')}
          filnamn={vanster.name}
          frame={vanster}
          rader={vansterLista}
          kolumner={listkolumner(vanster, s.par.map((p) => p.vansterColId))}
          vald={valdVanster}
          avskrivna={s.avskrivnaVanster.size}
          sort={sortFor('vanster')}
          onValj={setValdVanster}
          onSkrivAv={(rad) => {
            skrivAv('vanster', rad)
            if (valdVanster === rad) setValdVanster(null)
          }}
        />

        <div class="panel verkstad__mitt">
          <div class="panel__rubrik">{t('Arbetsbänk')}</div>
          <div class="panel__innehall">
            <Jamforelse
              key={`${valdVanster}:${valdHoger}`}
              vanster={vanster}
              hoger={hoger}
              vansterRad={valdVanster}
              hogerRad={valdHoger}
              par={s.par}
              onRatta={(sida, col, varde) => {
                const rad = sida === 'vanster' ? valdVanster : valdHoger
                if (rad !== null) ratta(sida, rad)(col, varde)
              }}
            />

            <button
              class="knapp knapp--primar verkstad__para"
              disabled={valdVanster === null || valdHoger === null || valdArOsaker}
              title={
                valdArOsaker
                  ? t(
                      'Raden matchar redan flera rader och behöver ett val bland sina träffar — ett par till hade gjort den mer tvetydig, inte mindre.',
                    )
                  : valdVanster === null || valdHoger === null
                    ? t('Markera en rad i varje lista först.')
                    : undefined
              }
              onClick={paraIhop}
            >
              {t('Para ihop')}
            </button>

            <Nastasteg
              vanster={vanster}
              hoger={hoger}
              rundor={s.rundor.length}
              onKor={korSteg}
            />

            {forslag && forslagskolumner && (
              <Forslagslista
                forslag={synligaForslag}
                hinder={forslag.hinder}
                avkortat={forslag.avkortat}
                vanster={vanster}
                hoger={hoger}
                vansterKolumner={[forslagskolumner.v]}
                hogerKolumner={[forslagskolumner.h]}
                restVanster={rest.vanster.length}
                restHoger={rest.hoger.length}
                onGodkann={(x) =>
                  laggExtrapar(
                    x.v,
                    x.h,
                    'forslag',
                    tf('{0} % lika', Math.round(x.poang.poang * 100)),
                  )
                }
                onAvvisa={(x) => avvisaForslag(x.v, x.h)}
              />
            )}

            {s.extra.length > 0 && (
              <div class="falt">
                <span class="falt__etikett">{t('Par gjorda här')}</span>
                <div class="vardelista__poster">
                  {s.extra.map((p) => (
                    <div class="verkstad__par" key={`${p.v}:${p.h}`}>
                      <span class="verkstad__par__text">
                        {kortText(vanster, s.par.map((x) => x.vansterColId), p.v)}
                        {' ↔ '}
                        {kortText(hoger, s.par.map((x) => x.hogerColId), p.h)}
                      </span>
                      <span class="verkstad__par__notis">{t(p.notis)}</span>
                      <button
                        class="restrad__skriv"
                        aria-label={t('Ta bort paret')}
                        onClick={() => taBortExtrapar(p.v, p.h)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vansterLista.length + rest.hoger.length > 0 && (
              <button
                class="knapp knapp--tyst verkstad__skrivalla"
                onClick={() => {
                  skrivAvAlla(vansterLista, rest.hoger)
                  setValdVanster(null)
                  setValdHoger(null)
                }}
              >
                {t('Skriv av allt som är kvar')}
              </button>
            )}

            <Notis ton="info">
              {tf(
                'Att skriva av en rad tar bort den ur listan — inget annat. Rader ur {0} utan partner följer ändå med i resultatet, med tomma celler.',
                vanster.name,
              )}{' '}
              {hogerRester
                ? tf(
                    'Rader ur {0} utan partner följer också med, sist i resultatet — utom de du skrivit av.',
                    hoger.name,
                  )
                : tf('Rader ur {0} utan partner blir kvar i sin egen flik.', hoger.name)}
            </Notis>
          </div>
        </div>

        <Restlista
          titel={t('Kvar i högerfilen')}
          filnamn={hoger.name}
          frame={hoger}
          rader={rest.hoger}
          kolumner={listkolumner(hoger, s.par.map((p) => p.hogerColId))}
          vald={valdHoger}
          avskrivna={s.avskrivnaHoger.size}
          sort={sortFor('hoger')}
          onValj={setValdHoger}
          onSkrivAv={(rad) => {
            skrivAv('hoger', rad)
            if (valdHoger === rad) setValdHoger(null)
          }}
        />
      </div>

      <div class="verkstad__fot">
        <span class="verkstad__fot__text">
          {s.omgangar > 0
            ? tf(
                'Omgång {0} ligger i en egen flik. En ny körning skapar en till — den gamla rörs aldrig.',
                s.omgangar,
              )
            : t('Arbetet ligger kvar när du stänger. Du hittar tillbaka under Flera filer.')}
        </span>
        <button
          class="knapp"
          disabled={vansterLista.length + rest.hoger.length === 0}
          title={t('Skriver de kvarvarande raderna ur vardera filen som var sin CSV.')}
          onClick={() => {
            exporteraRest(vanster, vansterLista)
            exporteraRest(hoger, rest.hoger)
          }}
        >
          {t('Exportera restlistorna')}
        </button>
        {/*
          * Att lämna och att kasta är två olika saker, och de har två olika
          * knappar. Förut var de samma: Escape, Avbryt och Slå ihop nollade
          * alla sessionen, så trettio handgjorda par kunde försvinna utan att
          * någon frågat.
          */}
        <button
          class="knapp knapp--fara"
          title={t('Paren, avvisningarna och avskrivningarna finns bara här och går inte att ångra.')}
          onClick={() => {
            const gjort = ogjortArbete(s)
            if (
              gjort > 0 &&
              !window.confirm(tf('Kasta arbetet i verkstaden? {0} beslut försvinner.', gjort))
            ) {
              return
            }
            kastaVerkstad()
          }}
        >
          {t('Kasta arbetet')}
        </button>
        <button class="knapp" onClick={props.onStang}>
          {t('Stäng')}
        </button>
        <button class="knapp knapp--primar" onClick={kor}>
          {t(s.omgangar > 0 ? 'Slå ihop igen' : 'Slå ihop')}
        </button>
      </div>
    </div>
  )
}

/**
 * Skriver de kvarvarande raderna ur en fil som en egen CSV.
 *
 * Raderna som blev över är ofta det man behöver skicka vidare — till den som
 * kan svara på varför de inte finns i det andra systemet. Filen får samma
 * Excel-vänliga format som den vanliga exporten, och ramens synliga kolumner:
 * det som ska granskas är raden, inte nyckeln — men det man själv dolt ska
 * inte smyga med i en fil som skickas vidare.
 */
function exporteraRest(frame: Frame, rader: readonly number[]): void {
  if (rader.length === 0) return
  const text = urvalTillCsv(
    frame.columns.filter((c) => !c.hidden),
    rader,
    EXCEL_FRIENDLY.delimiter,
    EXCEL_FRIENDLY.newline,
  )
  const { bytes } = encodeExport(text, EXCEL_FRIENDLY)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${frame.name.replace(/\.[^.]+$/, '')}${t(' — kvar')}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Nästa steg på restlistan: samma kontroll för båda sätten att komma vidare.
 *
 * En ny runda och ett luddigt förslag ställer identiskt samma fråga — vilka
 * två kolumner ska jämföras, och hur? Skillnaden ligger i vad svaret får göra.
 * En ekvivalenstyp ger par som läggs till direkt, eftersom de är samma sorts
 * svar som grundmatchningens, bara ställt om en annan kolumn. Luddig likhet
 * ger förslag att godkänna ett i taget.
 */
function Nastasteg(props: {
  vanster: Frame
  hoger: Frame
  rundor: number
  onKor: (vansterColId: ColumnId, hogerColId: ColumnId, typ: Verkstadstyp) => void
}) {
  const v = visibleColumns(props.vanster)
  const h = visibleColumns(props.hoger)
  const [vansterColId, setVansterColId] = useState(v[0]?.id ?? '')
  const [hogerColId, setHogerColId] = useState(h[0]?.id ?? '')
  const [typ, setTyp] = useState<Verkstadstyp>('oberoende')

  if (v.length === 0 || h.length === 0) return null
  const post = VERKSTADSTYPER.find((v) => v.typ === typ)

  return (
    <div class="falt">
      <span class="falt__etikett">{t('Nytt försök på en annan kolumn')}</span>
      <div class="regel">
        <select
          class="nivarad__kolumn"
          aria-label={t('Kolumn i vänsterfilen')}
          value={vansterColId}
          onChange={(e) => setVansterColId((e.currentTarget as HTMLSelectElement).value)}
        >
          {v.map((c) => (
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
          aria-label={t('Kolumn i högerfilen')}
          value={hogerColId}
          onChange={(e) => setHogerColId((e.currentTarget as HTMLSelectElement).value)}
        >
          {h.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          class="nivarad__kolumn"
          aria-label={t('Så här jämförs värdena')}
          value={typ}
          onChange={(e) => setTyp((e.currentTarget as HTMLSelectElement).value as Verkstadstyp)}
        >
          {VERKSTADSTYPER.map((v) => (
            <option key={v.typ} value={v.typ} title={t(v.beskrivning)}>
              {t(v.etikett)}
            </option>
          ))}
        </select>
      </div>
      <p class="verktyg__sammanfattning">{t(post?.beskrivning ?? '')}</p>
      <button class="knapp" onClick={() => props.onKor(vansterColId, hogerColId, typ)}>
        {t(typ === 'luddig' ? 'Visa liknande rader' : 'Kör runda')}
        {typ !== 'luddig' && props.rundor > 0 ? ` ${tf('({0} körda)', props.rundor)}` : ''}
      </button>
    </div>
  )
}

/** Kolumner att visa i restlistan: nyckelkolumnerna först, sedan några till. */
function listkolumner(frame: Frame, nycklar: readonly ColumnId[]): ColumnId[] {
  const synliga = visibleColumns(frame)
  const ut: ColumnId[] = []
  for (const id of nycklar) {
    if (!ut.includes(id) && synliga.some((c) => c.id === id)) ut.push(id)
  }
  for (const c of synliga) {
    if (ut.length >= 4) break
    if (!ut.includes(c.id)) ut.push(c.id)
  }
  return ut
}

/** Radens första nyckelvärde, för parlistan. */
function kortText(frame: Frame, nycklar: readonly ColumnId[], rad: number): string {
  for (const id of nycklar) {
    const text = cellText(frame, id, rad)
    if (text !== '') return text
  }
  return tf('rad {0}', frame.sourceRow[rad] || rad + 1)
}

function beskrivPar(vanster: Frame, hoger: Frame, par: readonly Matchningspar[]): string {
  if (par.length === 0) return t('inga kolumnpar')
  return par
    .map((p) => {
      const v = findColumn(vanster, p.vansterColId)?.name ?? '?'
      const h = findColumn(hoger, p.hogerColId)?.name ?? '?'
      const h2 = p.hogerColId2 ? findColumn(hoger, p.hogerColId2)?.name : undefined
      return `${v} ↔ ${h2 ? `${h} + ${h2}` : h}`
    })
    .join(', ')
}
