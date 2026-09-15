import { useEffect, useMemo, useState } from 'preact/hooks'
import { Notis, Val } from './parts.js'
import type { Column, ColumnId, Frame } from '../core/types.js'
import { findColumn, visibleColumns } from '../core/frame/frame.js'
import { getCell } from '../core/frame/column.js'
import { cellfarg } from '../core/frame/farg.js'
import { rubriknyckel } from '../core/ops/rubriker.js'
import { normalisera, nyckelavvikelse, type Matchningstyp } from '../core/ops/match.js'
import {
  JAMFORTYPER,
  UTFALLSFARG,
  UTFALLSTEXT,
  Utfall,
  jamfor,
  utfallskolumn,
  type Jamforlage,
  type Jamforpar,
  type Jamfortyp,
  type Parresultat,
  type Sidoresultat,
  type Utfallskod,
} from '../core/ops/jamfor.js'
import { formatCount } from '../core/locale/sv.js'
import { stangJamfor } from '../state/jamfor.js'
import { fargaPerRad } from '../state/farg.js'
import { infogaKolumner } from '../state/edits.js'
import { activeTabId, undo, type Tab } from '../state/store.js'
import { rader as raderText, t, tf, tj } from './sprak.js'

/**
 * Jämför två tabeller.
 *
 * Sammanslagningen bygger en ny fil; det här verktyget skriver i de filer
 * man redan har. Man väljer två flikar — eller samma flik två gånger, för
 * att ställa kolumn A mot kolumn C — ett eller flera kolumnpar, och hur
 * svaret ska se ut: färg i cellerna, en resultatkolumn per par, eller båda.
 * Räknarna och rutorna räknas om medan man ställer in, av samma funktion
 * som knappen kör.
 *
 * Två lägen. **Rad mot rad** går på det man ser, så att en sortering av
 * båda flikarna på samma nyckel gör att rätt rader möts. **Finns någonstans**
 * letar upp varje värde var som helst i den andra kolumnen.
 */

/** Så många rader varje filruta visar. */
const PROVRADER = 6

/** Så många rader skillnadsrutan visar. */
const SKILLNADSRADER = 12

type Kolumnval = 'vanster' | 'bada'

export function Jamfor(props: {
  flikar: { id: string; frame: Frame; tab: Tab }[]
  /** Fliken man stod i när vyn öppnades, som förval för vänstersidan. */
  aktivId: string | null
  onKlar: (text: string, angra: (() => void) | null) => void
}) {
  const flikar = props.flikar
  const [vansterId, setVansterId] = useState(() => props.aktivId ?? flikar[0]?.id ?? '')
  const [hogerId, setHogerId] = useState(
    () => flikar.find((f) => f.id !== (props.aktivId ?? flikar[0]?.id))?.id ?? flikar[0]?.id ?? '',
  )
  const vansterFlik = flikar.find((f) => f.id === vansterId) ?? null
  const hogerFlik = flikar.find((f) => f.id === hogerId) ?? null
  const vanster = vansterFlik?.frame ?? null
  const hoger = hogerFlik?.frame ?? null
  const sammaFlik = vansterId === hogerId

  const [lage, setLage] = useState<Jamforlage>('radMotRad')
  const [par, setPar] = useState<Jamforpar[]>([])
  // Sant tills användaren rört paren själv; då slutar förslaget skriva över.
  const [egnaPar, setEgnaPar] = useState(false)
  const [farga, setFarga] = useState(true)
  const [fargaVilka, setFargaVilka] = useState<Record<'skiljer' | 'saknas' | 'lika', boolean>>({
    skiljer: true,
    saknas: true,
    lika: false,
  })
  const [kolumn, setKolumn] = useState(true)
  const [kolumnVar, setKolumnVar] = useState<Kolumnval>('vanster')
  const [visa, setVisa] = useState<'alla' | 'skillnader'>('skillnader')

  /* Håller de två valen på flikar som faktiskt finns. */
  const fliksignatur = flikar.map((f) => f.id).join(',')
  useEffect(() => {
    const nyV = flikar.some((f) => f.id === vansterId) ? vansterId : (flikar[0]?.id ?? '')
    const nyH = flikar.some((f) => f.id === hogerId) ? hogerId : nyV
    if (nyV === vansterId && nyH === hogerId) return
    setVansterId(nyV)
    setHogerId(nyH)
    setEgnaPar(false)
  }, [fliksignatur])

  /**
   * Förslaget: kolumner med samma rubrik, i vänsterfilens ordning. Finns
   * inga sådana blir det första kolumnen mot första — en rad att ställa in
   * på är bättre än ingen. Samma flik på båda sidor får två olika kolumner,
   * för samma kolumn mot sig själv är alltid lika.
   */
  const forslag = useMemo((): Jamforpar[] => {
    if (!vanster || !hoger) return []
    const vk = visibleColumns(vanster)
    const hk = visibleColumns(hoger)
    if (vk.length === 0 || hk.length === 0) return []
    if (vanster === hoger) {
      return [{ vansterColId: vk[0]!.id, hogerColId: (hk[1] ?? hk[0])!.id, typ: 'oberoende' }]
    }
    const lika: Jamforpar[] = []
    for (const c of vk) {
      const partner = hk.find((h) => rubriknyckel(h.name) === rubriknyckel(c.name))
      if (partner) lika.push({ vansterColId: c.id, hogerColId: partner.id, typ: 'oberoende' })
    }
    if (lika.length > 0) return lika.slice(0, 1)
    return [{ vansterColId: vk[0]!.id, hogerColId: hk[0]!.id, typ: 'oberoende' }]
  }, [vanster, hoger])
  const aktivaPar = egnaPar ? par : forslag

  const resultat = useMemo(
    () => (vanster && hoger ? jamfor(vanster, hoger, aktivaPar, lage) : []),
    [vanster, hoger, aktivaPar, lage, vansterFlik?.tab.dataRevision, hogerFlik?.tab.dataRevision],
  )

  const vansterKolumner = vanster ? visibleColumns(vanster) : []
  const hogerKolumner = hoger ? visibleColumns(hoger) : []

  /* ---------- Handtag ---------- */

  const andraPar = (i: number, delta: Partial<Jamforpar>) => {
    const nya = aktivaPar.map((p) => ({ ...p }))
    nya[i] = { ...nya[i]!, ...delta }
    setEgnaPar(true)
    setPar(nya)
  }

  const laggPar = () => {
    const v = vansterKolumner.find((c) => !aktivaPar.some((p) => p.vansterColId === c.id)) ?? vansterKolumner[0]
    const h =
      (v && hoger && vanster !== hoger
        ? hogerKolumner.find((c) => rubriknyckel(c.name) === rubriknyckel(v.name))
        : undefined) ??
      hogerKolumner.find((c) => !aktivaPar.some((p) => p.hogerColId === c.id)) ??
      hogerKolumner[0]
    if (!v || !h) return
    setEgnaPar(true)
    setPar([...aktivaPar.map((p) => ({ ...p })), { vansterColId: v.id, hogerColId: h.id, typ: 'oberoende' }])
  }

  const taBortPar = (i: number) => {
    setEgnaPar(true)
    setPar(aktivaPar.filter((_, j) => j !== i).map((p) => ({ ...p })))
  }

  const byt = () => {
    setVansterId(hogerId)
    setHogerId(vansterId)
    setEgnaPar(false)
  }

  /** Par som färgar samma kolumn — det sista vinner, och det ska sägas. */
  const dubbelfargade = useMemo(() => {
    if (!farga) return 0
    const sedda = new Set<string>()
    let n = 0
    for (const p of aktivaPar) {
      for (const nyckel of [`v${p.vansterColId}`, `h${p.hogerColId}`]) {
        if (sedda.has(nyckel)) n += 1
        sedda.add(nyckel)
      }
    }
    return n
  }, [aktivaPar, farga])

  const utfallFarg = (kod: Utfallskod): number | null => {
    if (kod === Utfall.ejJamford) return null
    const vill =
      kod === Utfall.skiljer
        ? fargaVilka.skiljer
        : kod === Utfall.saknas || kod === Utfall.tom
          ? fargaVilka.saknas
          : fargaVilka.lika
    if (!vill) return null
    return UTFALLSFARG[kod] ?? 0
  }

  const kor = () => {
    if (!vanster || !hoger || !vansterFlik || !hogerFlik || resultat.length === 0) return
    /*
     * Ett steg per flik och sak: kolumnerna som ett, färgen som ett. Är
     * båda sidor samma flik slås jobben ihop, så att Ctrl+Z backar hela
     * körningen och inte halva.
     */
    const perFlik = new Map<Tab, { kolumner: { col: Column; efter: ColumnId }[]; farg: { col: Column; farg: (r: number) => number | null }[] }>()
    const hamta = (tab: Tab) => {
      let post = perFlik.get(tab)
      if (!post) {
        post = { kolumner: [], farg: [] }
        perFlik.set(tab, post)
      }
      return post
    }
    for (const r of resultat) {
      const colV = findColumn(vanster, r.par.vansterColId)!
      const colH = findColumn(hoger, r.par.hogerColId)!
      const sidor: { tab: Tab; frame: Frame; col: Column; sida: Sidoresultat; motsatt: Column }[] = [
        { tab: vansterFlik.tab, frame: vanster, col: colV, sida: r.vanster, motsatt: colH },
      ]
      if (!sammaFlik && kolumnVar === 'bada') {
        sidor.push({ tab: hogerFlik.tab, frame: hoger, col: colH, sida: r.hoger, motsatt: colV })
      }
      if (kolumn) {
        for (const s of sidor) {
          const namn = tf('Jämförelse {0} ↔ {1}', s.col.name, s.motsatt.name)
          hamta(s.tab).kolumner.push({ col: utfallskolumn(namn, s.sida, lage === 'finnsNagonstans'), efter: s.col.id })
        }
      }
      if (farga) {
        hamta(vansterFlik.tab).farg.push({ col: colV, farg: (rad) => utfallFarg(r.vanster.utfall[rad] as Utfallskod) })
        if (!sammaFlik) {
          hamta(hogerFlik.tab).farg.push({ col: colH, farg: (rad) => utfallFarg(r.hoger.utfall[rad] as Utfallskod) })
        }
      }
    }

    const steg: { tab: Tab; antal: number }[] = []
    for (const [tab, post] of perFlik) {
      let antal = 0
      // Kolumnerna infogas bakifrån, så att varje hamnar direkt efter sin källa.
      for (const k of [...post.kolumner].reverse()) {
        const index = tab.frame.columns.findIndex((c) => c.id === k.efter) + 1
        infogaKolumner(tab, [k.col], index, tf('Jämförde {0}', k.col.name), 'jamfor')
        antal += 1
      }
      if (post.farg.length > 0) {
        const n = fargaPerRad(tab, tf('Färgade jämförelsen i {0}', tab.frame.name), post.farg)
        if (n > 0) antal += 1
      }
      if (antal > 0) steg.push({ tab, antal })
    }

    const text = tf(
      '{0} lika, {1} skiljer sig, {2} saknas.',
      formatCount(resultat.reduce((s, r) => s + r.vanster.antal[Utfall.lika], 0)),
      formatCount(resultat.reduce((s, r) => s + r.vanster.antal[Utfall.skiljer], 0)),
      formatCount(resultat.reduce((s, r) => s + r.vanster.antal[Utfall.saknas] + r.vanster.antal[Utfall.tom], 0)),
    )
    activeTabId.value = vansterFlik.id
    stangJamfor()
    const angra =
      steg.length === 0
        ? null
        : () => {
            for (const s of steg) for (let i = 0; i < s.antal; i++) undo(s.tab)
          }
    props.onKlar(steg.length === 0 ? `${text} ${t('Inget skrevs — inget att färga eller ingen kolumn vald.')}` : text, angra)
  }

  /* ---------- Tomt läge ---------- */

  if (flikar.length === 0 || !vanster || !hoger) {
    return (
      <div class="jamfor jamfor--tomt">
        <div class="jamfor__topp">
          <h2>{t('Jämför två tabeller')}</h2>
        </div>
        <div class="jamfor__tomtkropp">
          <p class="tomt__rubrik">{t('Öppna en fil först')}</p>
          <p class="tomt__underrubrik">
            {t('Jämförelsen behöver minst en öppen flik — två för att ställa filer mot varandra, eller en för att ställa två kolumner i samma fil mot varandra.')}
          </p>
        </div>
        <div class="jamfor__fot">
          <span class="jamfor__fot__text" />
          <button class="knapp" onClick={stangJamfor}>
            {t('Avbryt')}
          </button>
        </div>
      </div>
    )
  }

  const skriverNagot = (farga && aktivaPar.length > 0) || (kolumn && aktivaPar.length > 0)

  return (
    <div class="jamfor">
      <div class="jamfor__topp">
        <h2>{t('Jämför två tabeller')}</h2>
        <div class="falt">
          <span class="falt__etikett">{t('Vänster')}</span>
          <Val
            varden={flikar.map((f) => ({ varde: f.id, etikett: `${f.frame.name} (${formatCount(f.frame.rowCount)})` }))}
            valt={vansterId}
            onValj={(v) => {
              setVansterId(v)
              setEgnaPar(false)
            }}
          />
        </div>
        <div class="jamfor__byt">
          <button class="knapp knapp--tyst" title={t('Byt håll: vänster blir höger.')} onClick={byt}>
            {t('⇄ Byt håll')}
          </button>
        </div>
        <div class="falt">
          <span class="falt__etikett">{t('Höger')}</span>
          {/* Samma flik får stå på båda sidor: kolumn A mot kolumn C i en fil. */}
          <Val
            varden={flikar.map((f) => ({ varde: f.id, etikett: `${f.frame.name} (${formatCount(f.frame.rowCount)})` }))}
            valt={hogerId}
            onValj={(v) => {
              setHogerId(v)
              setEgnaPar(false)
            }}
          />
        </div>
        {resultat.length > 0 && (
          <div class="vytal">
            {resultat.map((r) => (
              <Raknare key={`${r.par.vansterColId}-${r.par.hogerColId}`} r={r} vanster={vanster} hoger={hoger} lage={lage} />
            ))}
          </div>
        )}
      </div>

      <div class="jamfor__installningar">
        <div class="falt">
          <span class="falt__etikett">{t('Så jämförs raderna')}</span>
          <Val
            varden={[
              { varde: 'radMotRad' as Jamforlage, etikett: 'Rad mot rad' },
              { varde: 'finnsNagonstans' as Jamforlage, etikett: 'Finns någonstans' },
            ]}
            valt={lage}
            onValj={setLage}
          />
          <p class="verktyg__sammanfattning jamfor__lagetext">
            {t(
              lage === 'radMotRad'
                ? 'Rad 1 mot rad 1, rad 2 mot rad 2 — i den ordning du ser raderna. Sortera båda flikarna på samma sak först, så möts rätt rader.'
                : 'Varje värde i vänsterkolumnen letas upp var som helst i högerkolumnen, och tvärtom. Att det finns räcker; antalet visas.',
            )}
          </p>
        </div>

        <div class="falt">
          <span class="falt__etikett">{t('Kolumner att jämföra')}</span>
          {aktivaPar.map((p, i) => (
            <div class="jamfor__par" key={i}>
              <div class="regel">
                <select
                  class="nivarad__kolumn"
                  aria-label={tf('Vänsterkolumn i par {0}', i + 1)}
                  value={p.vansterColId}
                  onChange={(e) => andraPar(i, { vansterColId: (e.currentTarget as HTMLSelectElement).value })}
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
                  aria-label={tf('Högerkolumn i par {0}', i + 1)}
                  value={p.hogerColId}
                  onChange={(e) => andraPar(i, { hogerColId: (e.currentTarget as HTMLSelectElement).value })}
                >
                  {hogerKolumner.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  class="nivarad__kolumn"
                  aria-label={tf('Jämförelse i par {0}', i + 1)}
                  value={p.typ}
                  onChange={(e) => andraPar(i, { typ: (e.currentTarget as HTMLSelectElement).value as Jamfortyp })}
                >
                  {JAMFORTYPER.map((m) => (
                    <option key={m.typ} value={m.typ}>
                      {t(m.etikett)}
                    </option>
                  ))}
                </select>
                <button class="kolrad__oga" aria-label={t('Ta bort kolumnparet')} onClick={() => taBortPar(i)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          {aktivaPar.length === 0 && (
            <p class="verktyg__sammanfattning">{t('Inga kolumnpar valda. Lägg till minst ett.')}</p>
          )}
          <div class="faltrad">
            <button class="knapp" onClick={laggPar}>
              {t('＋ Lägg till par')}
            </button>
          </div>
        </div>

        <div class="falt">
          <span class="falt__etikett">{t('Så visas svaret')}</span>
          <label class="kryss">
            <input type="checkbox" checked={farga} onChange={(e) => setFarga((e.currentTarget as HTMLInputElement).checked)} />
            {t('Färga cellerna')}
          </label>
          {farga && (
            <div class="jamfor__underval">
              {(
                [
                  ['skiljer', 'skiljer sig — röd'],
                  ['saknas', 'saknas — orange'],
                  ['lika', 'lika — grön'],
                ] as const
              ).map(([nyckel, etikett]) => (
                <label class="kryss" key={nyckel}>
                  <input
                    type="checkbox"
                    checked={fargaVilka[nyckel]}
                    onChange={(e) => setFargaVilka({ ...fargaVilka, [nyckel]: (e.currentTarget as HTMLInputElement).checked })}
                  />
                  {t(etikett)}
                </label>
              ))}
            </div>
          )}
          <label class="kryss">
            <input type="checkbox" checked={kolumn} onChange={(e) => setKolumn((e.currentTarget as HTMLInputElement).checked)} />
            {t('Resultatkolumn per par')}
          </label>
          {kolumn && !sammaFlik && (
            <div class="jamfor__underval">
              <Val
                varden={[
                  { varde: 'vanster' as Kolumnval, etikett: 'I vänsterfliken' },
                  { varde: 'bada' as Kolumnval, etikett: 'I båda' },
                ]}
                valt={kolumnVar}
                onValj={setKolumnVar}
              />
            </div>
          )}
        </div>

        {dubbelfargade > 0 && (
          <Notis ton="varning">{t('Två par färgar samma kolumn — det sista paret vinner.')}</Notis>
        )}
      </div>

      <div class="jamfor__rutor">
        <Prov frame={vanster} kolumner={aktivaPar.map((p) => p.vansterColId)} sidor={resultat.map((r) => r.vanster)} />
        <Prov frame={hoger} kolumner={aktivaPar.map((p) => p.hogerColId)} sidor={resultat.map((r) => r.hoger)} />
        <Skillnader vanster={vanster} hoger={hoger} resultat={resultat} lage={lage} visa={visa} onVisa={setVisa} />
      </div>

      <div class="jamfor__fot">
        <span class="jamfor__fot__text">
          {t('Ingenting ändras förrän du trycker Jämför. Svaret skrivs i flikarna du valt, och Ctrl+Z tar tillbaka det där.')}
        </span>
        <button class="knapp" onClick={stangJamfor}>
          {t('Avbryt')}
        </button>
        <button
          class="knapp knapp--primar"
          disabled={!skriverNagot}
          title={!skriverNagot ? t('Välj minst ett kolumnpar och ett sätt att visa svaret.') : undefined}
          onClick={kor}
        >
          {t('Jämför')}
        </button>
      </div>
    </div>
  )
}

/** Räknarna för ett par, som en remsa. */
function Raknare(props: { r: Parresultat; vanster: Frame; hoger: Frame; lage: Jamforlage }) {
  const { r } = props
  const a = r.vanster.antal
  const namnV = findColumn(props.vanster, r.par.vansterColId)?.name ?? ''
  const namnH = findColumn(props.hoger, r.par.hogerColId)?.name ?? ''
  return (
    <>
      <span>
        <strong>
          {namnV} ↔ {namnH}
        </strong>
      </span>
      <span>{tj('{0} lika', <strong>{formatCount(a[Utfall.lika])}</strong>)}</span>
      {props.lage === 'radMotRad' && <span>{tj('{0} skiljer sig', <strong>{formatCount(a[Utfall.skiljer])}</strong>)}</span>}
      <span>{tj('{0} saknas', <strong>{formatCount(a[Utfall.saknas] + r.hoger.antal[Utfall.saknas] * (props.lage === 'radMotRad' ? 1 : 0))}</strong>)}</span>
      {a[Utfall.badaTomma] > 0 && <span>{tj('{0} båda tomma', <strong>{formatCount(a[Utfall.badaTomma])}</strong>)}</span>}
      {a[Utfall.tom] > 0 && <span>{tj('{0} tomma', <strong>{formatCount(a[Utfall.tom])}</strong>)}</span>}
    </>
  )
}

const UTFALLSKLASS: Record<number, string> = {
  [Utfall.lika]: 'fortab__u-lika',
  [Utfall.skiljer]: 'fortab__u-skiljer',
  [Utfall.saknas]: 'fortab__u-saknas',
  [Utfall.badaTomma]: 'fortab__u-lika',
  [Utfall.tom]: 'fortab__u-saknas',
}

/**
 * De första raderna ur en fil, med de jämförda kolumnerna först och
 * utfallet som ton i cellen — samma färger som körningen lägger i rutnätet.
 */
function Prov(props: { frame: Frame; kolumner: readonly ColumnId[]; sidor: readonly Sidoresultat[] }) {
  const { frame } = props
  const jamforda = props.kolumner
    .map((id, i) => ({ col: findColumn(frame, id), sida: props.sidor[i] }))
    .filter((x): x is { col: Column; sida: Sidoresultat | undefined } => x.col !== undefined)
  const jamfordaSet = new Set(jamforda.map((x) => x.col.id))
  const ordnade: { col: Column; sida: Sidoresultat | undefined; jamford: boolean }[] = [
    ...jamforda.map((x) => ({ ...x, jamford: true })),
    ...visibleColumns(frame)
      .filter((c) => !jamfordaSet.has(c.id))
      .map((c) => ({ col: c, sida: undefined, jamford: false })),
  ]
  const antal = Math.min(PROVRADER, frame.view.length)
  return (
    <div class="ruta">
      <div class="ruta__rubrik">
        {frame.name}
        <span class="panel__rubrik__antal">
          {antal === frame.view.length ? raderText(frame.view.length) : tf('{0} av {1}', formatCount(antal), raderText(frame.view.length))}
        </span>
      </div>
      <div class="ruta__kropp ruta__kropp--tabell">
        <div class="fortab__omslag">
          <table class="fortab">
            <thead>
              <tr>
                {ordnade.map(({ col, jamford }) => (
                  <th key={col.id} class={jamford ? 'fortab__nyckel' : undefined}>
                    {col.name}
                    {jamford && <span class="fortab__nyckelmark"> {t('jämförs')}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: antal }, (_, i) => {
                const r = frame.view[i]!
                return (
                  <tr key={r}>
                    {ordnade.map(({ col, sida }) => {
                      const kod = sida ? sida.utfall[r]! : 0
                      const egen = cellfarg(col.flags[r]!)
                      return (
                        <td
                          key={col.id}
                          class={kod !== 0 ? UTFALLSKLASS[kod] : egen !== 0 ? `fortab__farg-${egen}` : undefined}
                          title={kod !== 0 ? UTFALLSTEXT[kod as Utfallskod] : undefined}
                        >
                          {getCell(col, r)}
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

/**
 * Skillnaderna, rad för rad: vänstervärdet, högervärdet och utfallet, med
 * de tecken som skiljer markerade. Det är rutan man tittar på när räknarna
 * säger "tre skiljer sig" och man vill veta vilka.
 */
function Skillnader(props: {
  vanster: Frame
  hoger: Frame
  resultat: readonly Parresultat[]
  lage: Jamforlage
  visa: 'alla' | 'skillnader'
  onVisa: (v: 'alla' | 'skillnader') => void
}) {
  const { vanster, hoger, resultat, lage } = props
  const bara = props.visa === 'skillnader'
  const arSkillnad = (kod: number) => kod === Utfall.skiljer || kod === Utfall.saknas || kod === Utfall.tom

  type Rad = { par: Parresultat; v: number | null; h: number | null; kod: Utfallskod; traffar: number | null }
  const rader: Rad[] = []
  const tak = SKILLNADSRADER
  let fler = 0
  for (const r of resultat) {
    if (lage === 'radMotRad') {
      const n = Math.max(vanster.view.length, hoger.view.length)
      for (let i = 0; i < n; i++) {
        const v = vanster.view[i] ?? null
        const h = hoger.view[i] ?? null
        const kod = (v !== null ? r.vanster.utfall[v]! : r.hoger.utfall[h!]!) as Utfallskod
        if (bara && !arSkillnad(kod)) continue
        if (rader.length >= tak) {
          fler += 1
          continue
        }
        rader.push({ par: r, v, h, kod, traffar: null })
      }
    } else {
      for (let i = 0; i < vanster.view.length; i++) {
        const v = vanster.view[i]!
        const kod = r.vanster.utfall[v]! as Utfallskod
        if (bara && !arSkillnad(kod)) continue
        if (rader.length >= tak) {
          fler += 1
          continue
        }
        rader.push({ par: r, v, h: null, kod, traffar: r.vanster.traffar![v]! })
      }
    }
  }

  return (
    <div class="ruta">
      <div class="ruta__rubrik">
        {t('Skillnaderna')}
        <span class="jamfor__visa">
          <Val
            varden={[
              { varde: 'skillnader' as const, etikett: 'Bara skillnader' },
              { varde: 'alla' as const, etikett: 'Alla rader' },
            ]}
            valt={props.visa}
            onValj={props.onVisa}
          />
        </span>
      </div>
      <div class="ruta__kropp ruta__kropp--tabell">
        {resultat.length === 0 ? (
          <p class="restlista__tom">{t('Välj ett kolumnpar, så visas skillnaderna här.')}</p>
        ) : rader.length === 0 ? (
          <p class="restlista__tom">{t(bara ? 'Inga skillnader.' : 'Inga rader att visa.')}</p>
        ) : (
          <div class="fortab__omslag">
            <table class="fortab">
              <thead>
                <tr>
                  <th>{t('Rad')}</th>
                  <th>{vanster.name}</th>
                  <th>{hoger.name}</th>
                  {lage === 'radMotRad' && <th>{t('Rad')}</th>}
                  <th>{t('Utfall')}</th>
                </tr>
              </thead>
              <tbody>
                {rader.map((rad, i) => {
                  const colV = findColumn(vanster, rad.par.par.vansterColId)!
                  const colH = findColumn(hoger, rad.par.par.hogerColId)!
                  const vText = rad.v === null ? '' : getCell(colV, rad.v)
                  const hText = rad.h === null ? '' : getCell(colH, rad.h)
                  const typ = rad.par.par.typ as Matchningstyp
                  const avvikelse =
                    rad.kod === Utfall.skiljer ? nyckelavvikelse(normalisera(vText, typ), normalisera(hText, typ)) : null
                  return (
                    <tr key={i}>
                      <td class="fortab__rad">{rad.v === null ? '—' : radnummer(vanster, rad.v)}</td>
                      <td class={UTFALLSKLASS[rad.kod]}>
                        {rad.v === null ? <em>{t('ingen rad')}</em> : markera(vText, normalisera(vText, typ), avvikelse?.v ?? null)}
                      </td>
                      <td class={UTFALLSKLASS[rad.kod]}>
                        {lage === 'finnsNagonstans'
                          ? rad.traffar === 0
                            ? <em>{t('finns inte')}</em>
                            : tf('finns {0} gånger', formatCount(rad.traffar ?? 0))
                          : rad.h === null
                            ? <em>{t('ingen rad')}</em>
                            : markera(hText, normalisera(hText, typ), avvikelse?.h ?? null)}
                      </td>
                      {lage === 'radMotRad' && <td class="fortab__rad">{rad.h === null ? '—' : radnummer(hoger, rad.h)}</td>}
                      <td>{UTFALLSTEXT[rad.kod]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {fler > 0 && (
              <p class="verktyg__sammanfattning">{tf('och {0} till', raderText(fler))}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Radens nummer i källfilen, eller vy-platsen för en tillagd rad. */
function radnummer(frame: Frame, rad: number): string {
  const s = frame.sourceRow[rad] ?? 0
  return s === 0 ? `+${rad + 1}` : String(s)
}

/**
 * Värdet med de tecken som skiljer markerade.
 *
 * Avvikelsen räknas på de normaliserade formerna, som är det jämförelsen
 * såg. Är råtexten en annan (`Öberg` mot `oberg`) visas råtexten och
 * markeringen får gälla ungefär — den pekar ut var, inte exakt vilka tecken.
 */
function markera(rå: string, norm: string, span: [number, number] | null) {
  if (!span || rå.length !== norm.length) return rå
  const [a, b] = span
  return (
    <>
      {rå.slice(0, a)}
      <mark>{rå.slice(a, b)}</mark>
      {rå.slice(b)}
    </>
  )
}
