import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Column, ColumnId, Frame } from '../core/types.js'
import { findColumn, visibleColumns } from '../core/frame/frame.js'
import {
  cellText,
  MATCHNINGSTYPER,
  slaIhop,
  type Matchningspar,
  type Matchningstyp,
} from '../core/ops/match.js'
import {
  flikarna,
  fullmatchning,
  grundmatchning,
  korRunda,
  laggExtrapar,
  restlistor,
  saknadeKolumner,
  skrivAv,
  skrivAvAlla,
  stangVerkstad,
  synkaVerkstad,
  taBortExtrapar,
  verkstad,
} from '../state/matchning.js'
import { redigeraCellFysisk } from '../state/edits.js'
import { notify, undo } from '../state/store.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'
import { Notis } from './parts.js'
import { Restlista } from './Restlista.js'
import { Raddetalj } from './Raddetalj.js'

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
 * Sammanslagningen sker först när man är nöjd, och bara en gång. Att i stället
 * fylla på ett färdigt resultat i efterhand hade ändrat resultatfliken under
 * händerna på den som tittade på den.
 */
export function Verkstad(props: {
  onSlaIhop: (frame: Frame, text: string) => void
  onStang: () => void
}) {
  const s = verkstad.value
  const f = flikarna()

  const [valdVanster, setValdVanster] = useState<number | null>(null)
  const [valdHoger, setValdHoger] = useState<number | null>(null)

  // Kontrollen skriver till signalen och får därför inte köras under ritning.
  useEffect(() => {
    if (synkaVerkstad() === 'omnumrerad') {
      notify(
        'Rader har lagts till eller tagits bort, så verkstadens par pekade inte längre på rätt rader. De har kastats.',
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

  const paraIhop = () => {
    if (valdVanster === null || valdHoger === null) return
    laggExtrapar(valdVanster, valdHoger, 'hand', 'för hand')
    setValdVanster(null)
    setValdHoger(null)
  }

  const kor = () => {
    const { frame, fyllda } = slaIhop(vanster, hoger, full, s.sammanslagning)
    stangVerkstad()
    props.onSlaIhop(
      frame,
      `${vanster.name} + ${hoger.name} — ${formatCount(fyllda)} av ${raderText(frame.rowCount)} fick värden.`,
    )
  }

  return (
    <div class="verkstad">
      <div class="verkstad__topp">
        <div class="verkstad__rubrik">
          <h2>Matchningsverkstaden</h2>
          <span class="verkstad__underrubrik">
            {vanster.name} ↔ {hoger.name} · {beskrivPar(vanster, hoger, s.par)}
          </span>
        </div>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(full.vansterMatchade)}</td>
              <td>
                av {formatCount(vanster.rowCount)} rader i {vanster.name} har en partner
              </td>
            </tr>
            <tr class={rest.vanster.length + rest.hoger.length > 0 ? 'inventering--okant' : ''}>
              <td class="inventering__antal">
                {formatCount(rest.vanster.length + rest.hoger.length)}
              </td>
              <td>kvar att titta på</td>
            </tr>
            {s.extra.length > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(s.extra.length)}</td>
                <td>par gjorda här</td>
              </tr>
            )}
            {avskrivna > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(avskrivna)}</td>
                <td>avskrivna — de följer med i resultatet precis som förut</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {saknade.length > 0 && (
        <div class="verkstad__larm">
          <Notis ton="fara">
            En kolumn som matchningen bygger på finns inte längre. Varje rad ser därför ut att
            sakna partner. Stäng verkstaden och ställ in matchningen på nytt.
          </Notis>
        </div>
      )}

      <div class="verkstad__listor">
        <Restlista
          titel="Kvar i vänsterfilen"
          filnamn={vanster.name}
          frame={vanster}
          rader={rest.vanster}
          kolumner={listkolumner(vanster, s.par.map((p) => p.vansterColId))}
          vald={valdVanster}
          avskrivna={s.avskrivnaVanster.size}
          onValj={setValdVanster}
          onSkrivAv={(rad) => {
            skrivAv('vanster', rad)
            if (valdVanster === rad) setValdVanster(null)
          }}
        />

        <div class="panel verkstad__mitt">
          <div class="panel__rubrik">Arbetsbänk</div>
          <div class="panel__innehall">
            <Raddetalj
              key={`v${valdVanster}`}
              rubrik="Vald rad"
              filnamn={vanster.name}
              frame={vanster}
              rad={valdVanster}
              onRatta={valdVanster === null ? () => {} : ratta('vanster', valdVanster)}
            />
            <Raddetalj
              key={`h${valdHoger}`}
              rubrik="Vald rad"
              filnamn={hoger.name}
              frame={hoger}
              rad={valdHoger}
              onRatta={valdHoger === null ? () => {} : ratta('hoger', valdHoger)}
            />

            <button
              class="knapp knapp--primar verkstad__para"
              disabled={valdVanster === null || valdHoger === null}
              title={
                valdVanster === null || valdHoger === null
                  ? 'Markera en rad i varje lista först.'
                  : undefined
              }
              onClick={paraIhop}
            >
              Para ihop
            </button>

            <Rundval vanster={vanster} hoger={hoger} rundor={s.rundor.length} />

            {s.extra.length > 0 && (
              <div class="falt">
                <span class="falt__etikett">Par gjorda här</span>
                <div class="vardelista__poster">
                  {s.extra.map((p) => (
                    <div class="verkstad__par" key={`${p.v}:${p.h}`}>
                      <span class="verkstad__par__text">
                        {kortText(vanster, s.par.map((x) => x.vansterColId), p.v)}
                        {' ↔ '}
                        {kortText(hoger, s.par.map((x) => x.hogerColId), p.h)}
                      </span>
                      <span class="verkstad__par__notis">{p.notis}</span>
                      <button
                        class="restrad__skriv"
                        aria-label="Ta bort paret"
                        onClick={() => taBortExtrapar(p.v, p.h)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rest.vanster.length + rest.hoger.length > 0 && (
              <button
                class="knapp knapp--tyst verkstad__skrivalla"
                onClick={() => {
                  skrivAvAlla(rest.vanster, rest.hoger)
                  setValdVanster(null)
                  setValdHoger(null)
                }}
              >
                Skriv av allt som är kvar
              </button>
            )}

            <Notis ton="info">
              Att skriva av en rad tar bort den ur listan — inget annat. Rader ur{' '}
              {vanster.name} utan partner följer ändå med i resultatet, med tomma celler, och
              rader ur {hoger.name} utan partner blir ändå kvar i sin egen flik.
            </Notis>
          </div>
        </div>

        <Restlista
          titel="Kvar i högerfilen"
          filnamn={hoger.name}
          frame={hoger}
          rader={rest.hoger}
          kolumner={listkolumner(hoger, s.par.map((p) => p.hogerColId))}
          vald={valdHoger}
          avskrivna={s.avskrivnaHoger.size}
          onValj={setValdHoger}
          onSkrivAv={(rad) => {
            skrivAv('hoger', rad)
            if (valdHoger === rad) setValdHoger(null)
          }}
        />
      </div>

      <div class="verkstad__fot">
        <span class="verkstad__fot__text">
          Listorna står i filens ordning, inte i den du sorterat fram i fliken.
        </span>
        <button class="knapp" onClick={props.onStang}>
          Avbryt
        </button>
        <button class="knapp knapp--primar" onClick={kor}>
          Slå ihop
        </button>
      </div>
    </div>
  )
}

/**
 * En ny runda: samma matchning igen, men på en annan kolumn och bara på det
 * som blivit över.
 *
 * Träffarna läggs till direkt och inte som förslag att granska. De är
 * ekvivalensträffar precis som grundmatchningens — samma sorts svar på samma
 * sorts fråga, bara ställd om en annan kolumn.
 */
function Rundval(props: { vanster: Frame; hoger: Frame; rundor: number }) {
  const v = visibleColumns(props.vanster)
  const h = visibleColumns(props.hoger)
  const [vansterColId, setVansterColId] = useState(v[0]?.id ?? '')
  const [hogerColId, setHogerColId] = useState(h[0]?.id ?? '')
  const [typ, setTyp] = useState<Matchningstyp>('oberoende')

  if (v.length === 0 || h.length === 0) return null

  return (
    <div class="falt">
      <span class="falt__etikett">Ny runda på en annan kolumn</span>
      <div class="regel">
        <select
          class="nivarad__kolumn"
          aria-label="Kolumn i vänsterfilen"
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
          aria-label="Kolumn i högerfilen"
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
          aria-label="Så här jämförs värdena"
          value={typ}
          onChange={(e) => setTyp((e.currentTarget as HTMLSelectElement).value as Matchningstyp)}
        >
          {MATCHNINGSTYPER.map((t) => (
            <option key={t.typ} value={t.typ} title={t.beskrivning}>
              {t.etikett}
            </option>
          ))}
        </select>
      </div>
      <button
        class="knapp"
        onClick={() => {
          const traffar = korRunda([{ vansterColId, hogerColId, typ }])
          notify(
            traffar === 0
              ? 'Rundan hittade inga nya par. Prova en annan kolumn eller en annan jämförelse.'
              : `Rundan parade ihop ${raderText(traffar)}.`,
          )
        }}
      >
        Kör runda{props.rundor > 0 ? ` (${props.rundor} körda)` : ''}
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
  return `rad ${frame.sourceRow[rad] || rad + 1}`
}

function beskrivPar(vanster: Frame, hoger: Frame, par: readonly Matchningspar[]): string {
  if (par.length === 0) return 'inga kolumnpar'
  return par
    .map((p) => {
      const v = findColumn(vanster, p.vansterColId)?.name ?? '?'
      const h = findColumn(hoger, p.hogerColId)?.name ?? '?'
      return `${v} ↔ ${h}`
    })
    .join(', ')
}
