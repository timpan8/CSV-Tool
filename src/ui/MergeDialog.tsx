import { useMemo, useState } from 'preact/hooks'
import { Modal, Notis, Val } from './parts.js'
import type { ColumnId, Frame } from '../core/types.js'
import { visibleColumns } from '../core/frame/frame.js'
import { rubriknyckel, synonymgrupp } from '../core/ops/rubriker.js'
import {
  FLERTRAFF,
  MATCHNINGSTYPER,
  matcha,
  slaIhop,
  type Flertraff,
  type Matchningspar,
  type Matchningstyp,
  type Sammanslagning,
} from '../core/ops/match.js'
import { formatCount, rader as raderText } from '../core/locale/sv.js'

/**
 * Slå ihop två filer.
 *
 * Siffrorna räknas om medan man ställer in, och det är hela poängen: ett par
 * kolumner som ger 3 träffar av 5 000 rader är nästan alltid fel kolumnpar,
 * inte fel data. Att upptäcka det efter körningen är för sent, eftersom man
 * då redan tror på resultatet.
 */
export function MergeDialog(props: {
  vanster: Frame
  andraFlikar: { id: string; frame: Frame }[]
  onStang: () => void
  onSlaIhop: (frame: Frame, text: string) => void
  onVerkstad: (hogerTabId: string, par: Matchningspar[], val: Sammanslagning) => void
}) {
  const [hogerId, setHogerId] = useState(props.andraFlikar[0]?.id ?? '')
  const hoger = props.andraFlikar.find((t) => t.id === hogerId)?.frame ?? null

  const [par, setPar] = useState<Matchningspar[]>([])
  const [flertraff, setFlertraff] = useState<Flertraff>('forsta')
  const [prefix, setPrefix] = useState('')
  const [valdaKolumner, setValdaKolumner] = useState<ColumnId[] | null>(null)
  // Sant tills användaren rört paren själv; då slutar förslaget skriva över.
  const [egnaPar, setEgnaPar] = useState(false)

  // Förslag på kolumnpar utifrån rubrikernas namn. Bara ett förslag — det
  // syns i listan och går att ändra innan något körs.
  const foreslagna = useMemo(() => (hoger ? foreslaPar(props.vanster, hoger) : []), [
    props.vanster,
    hoger,
  ])
  const aktivaPar = egnaPar ? par : foreslagna

  const matchning = useMemo(
    () => (hoger && aktivaPar.length > 0 ? matcha(props.vanster, hoger, aktivaPar) : null),
    [props.vanster, hoger, aktivaPar],
  )

  const hogerKolumner = hoger ? visibleColumns(hoger) : []
  const nyckelkolumner = new Set(aktivaPar.map((p) => p.hogerColId))
  const valda =
    valdaKolumner ?? hogerKolumner.filter((c) => !nyckelkolumner.has(c.id)).map((c) => c.id)

  const andraPar = (i: number, delta: Partial<Matchningspar>) => {
    const nya = aktivaPar.map((p) => ({ ...p }))
    nya[i] = { ...nya[i]!, ...delta }
    setEgnaPar(true)
    setPar(nya)
  }

  const laggPar = () => {
    if (!hoger) return
    const v = visibleColumns(props.vanster)[0]
    const h = hogerKolumner[0]
    if (!v || !h) return
    setEgnaPar(true)
    setPar([...aktivaPar.map((p) => ({ ...p })), { vansterColId: v.id, hogerColId: h.id, typ: 'oberoende' }])
  }

  const taBortPar = (i: number) => {
    setEgnaPar(true)
    setPar(aktivaPar.filter((_, j) => j !== i).map((p) => ({ ...p })))
  }

  const kor = () => {
    if (!hoger || !matchning) return
    const { frame, fyllda } = slaIhop(props.vanster, hoger, matchning, {
      hogerKolumner: valda,
      flertraff,
      prefix,
    })
    props.onSlaIhop(
      frame,
      `${props.vanster.name} + ${hoger.name} — ${formatCount(fyllda)} av ${raderText(frame.rowCount)} fick värden.`,
    )
  }

  const tillVerkstaden = () => {
    if (!hoger) return
    props.onVerkstad(hogerId, aktivaPar.map((p) => ({ ...p })), {
      hogerKolumner: valda,
      flertraff,
      prefix,
    })
  }

  if (props.andraFlikar.length === 0) {
    return (
      <Modal
        titel="Slå ihop med en annan fil"
        onStang={props.onStang}
        fot={
          <button class="knapp knapp--primar" onClick={props.onStang}>
            Stäng
          </button>
        }
      >
        <Notis ton="info">
          Det finns bara en fil öppen. Öppna den andra filen först — den blir en egen flik, och
          sedan går de att slå ihop.
        </Notis>
      </Modal>
    )
  }

  const rester = matchning ? matchning.vansterUtan.length + matchning.hogerUtan.length : 0

  const traffprocent =
    matchning && props.vanster.rowCount > 0
      ? Math.round((matchning.vansterMatchade / props.vanster.rowCount) * 100)
      : 0

  return (
    <Modal
      titel="Slå ihop med en annan fil"
      underrubrik={`${props.vanster.name} — ${raderText(props.vanster.rowCount)}`}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp"
            disabled={!matchning || rester === 0}
            title={
              rester === 0
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
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Hämta uppgifter ur</span>
        <Val
          varden={props.andraFlikar.map((t) => ({
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
      </div>

      {hoger && (
        <>
          <div class="falt">
            <span class="falt__etikett">Rader hör ihop när de stämmer i</span>
            {aktivaPar.map((p, i) => (
              <div class="regel" key={i}>
                <select
                  class="nivarad__kolumn"
                  value={p.vansterColId}
                  onChange={(e) =>
                    andraPar(i, { vansterColId: (e.currentTarget as HTMLSelectElement).value })
                  }
                >
                  {visibleColumns(props.vanster).map((c) => (
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
                <select
                  class="nivarad__kolumn"
                  value={p.typ}
                  title={MATCHNINGSTYPER.find((t) => t.typ === p.typ)?.beskrivning}
                  onChange={(e) =>
                    andraPar(i, {
                      typ: (e.currentTarget as HTMLSelectElement).value as Matchningstyp,
                    })
                  }
                >
                  {MATCHNINGSTYPER.map((t) => (
                    <option key={t.typ} value={t.typ} title={t.beskrivning}>
                      {t.etikett}
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
              {!egnaPar && foreslagna.length > 0 && (
                <span class="verktyg__sammanfattning">
                  Föreslaget utifrån kolumnernas namn. Ändra fritt.
                </span>
              )}
            </div>
          </div>

          {matchning && (
            <div class="falt">
              <span class="falt__etikett">Så här går matchningen</span>
              <table class="inventering">
                <tbody>
                  <tr>
                    <td class="inventering__antal">{formatCount(matchning.vansterMatchade)}</td>
                    <td>
                      av {formatCount(props.vanster.rowCount)} rader i {props.vanster.name} hittar
                      en träff ({traffprocent} %)
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
                      <td>
                        matchar mer än en rad (som mest {formatCount(matchning.storstaTraff)})
                      </td>
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
            </div>
          )}

          {matchning && traffprocent < 20 && matchning.vansterMatchade > 0 && (
            <Notis ton="varning">
              Bara {traffprocent} % av raderna matchar. Så låg andel beror oftast på fel
              kolumnpar eller på att värdena är skrivna på olika sätt — prova en annan
              matchningstyp, eller städa kolumnerna först.
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
            <span class="falt__etikett">Kolumner att hämta</span>
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
              placeholder={`t.ex. ${hoger.name} – `}
              onInput={(e) => setPrefix((e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <Notis ton="info">
            Resultatet blir en <strong>ny flik</strong>. Alla rader ur {props.vanster.name} följer
            med, även de utan träff — de får tomma celler i stället för att försvinna. Raderna ur{' '}
            {hoger.name} som blev över finns kvar i sin egen flik.
            {rester > 0 && (
              <>
                {' '}
                <strong>{formatCount(rester)} rader</strong> hittar ingen partner. Vill du gå
                igenom dem först — para ihop dem för hand, matcha om på en annan kolumn eller
                rätta värdena — så gör <em>Beta av resten…</em> det, och sammanslagningen sker
                efteråt.
              </>
            )}
          </Notis>
        </>
      )}
    </Modal>
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
