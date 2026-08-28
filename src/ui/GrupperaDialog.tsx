import { useMemo, useState } from 'preact/hooks'
import { Modal, Notis, Val } from './parts.js'
import type { ColumnId, Frame } from '../core/types.js'
import {
  BERAKNINGAR,
  berakningsnamn,
  berakningspost,
  forslagsnamn,
  gruppera,
  type Berakning,
  type Berakningstyp,
  type Grupperingsplan,
} from '../core/ops/gruppera.js'
import { TALFORMAT, type Talformat } from '../core/ops/numbers.js'
import { visibleColumns } from '../core/frame/frame.js'
import { celler, formatCount, rader } from '../core/locale/sv.js'

/**
 * Gruppera och summera.
 *
 * En dialog och inte en verktygspanel, eftersom resultatet inte är en
 * omskrivning av kolumnen man står i utan en *ny tabell* med färre rader.
 * Förhandsvisningen kan därför inte ligga i rutnätet som de andra verktygens
 * spökkolumner — den ligger i dialogen, och visar riktiga resultatrader.
 *
 * Hela resultatet räknas ut för att visa förhandsvisningen. Det låter dyrt men
 * är exakt vad knappen sedan gör, och beräkningen är linjär i antalet rader
 * med talen tolkade per unikt värde. Att i stället visa ett urval skulle
 * betyda att förhandsvisningen och resultatet räknats på olika sätt, och då är
 * den inte längre en förhandsvisning.
 */

let raknare = 0
const nyttId = () => `b${(raknare += 1).toString(36)}`

/** Den beräkning man oftast vill ha på en kolumn man just pekat ut. */
function forstaBerakningen(frame: Frame, nycklar: readonly ColumnId[]): Berakning {
  const kandidat = visibleColumns(frame).find(
    (c) => c.type === 'number' && !nycklar.includes(c.id),
  )
  return kandidat
    ? { id: nyttId(), typ: 'summa', colId: kandidat.id, namn: '' }
    : { id: nyttId(), typ: 'antal', colId: null, namn: '' }
}

export function GrupperaDialog(props: {
  frame: Frame
  /** Kolumnen man öppnade dialogen från, om någon. */
  startkolumn: ColumnId | null
  onSkapa: (resultat: Frame, text: string) => void
  onStang: () => void
}) {
  const { frame } = props
  const synliga = visibleColumns(frame)

  const [nycklar, setNycklar] = useState<ColumnId[]>(() => {
    if (props.startkolumn && synliga.some((c) => c.id === props.startkolumn)) {
      return [props.startkolumn]
    }
    return synliga[0] ? [synliga[0].id] : []
  })
  const [berakningar, setBerakningar] = useState<Berakning[]>(() => [
    { id: nyttId(), typ: 'antal', colId: null, namn: '' },
    forstaBerakningen(frame, props.startkolumn ? [props.startkolumn] : []),
  ])
  const [strunta, setStrunta] = useState({ skiftlage: true, blanksteg: true, diakriter: false })
  const [tommaMed, setTommaMed] = useState(false)
  const [format, setFormat] = useState<Talformat>('komma')
  const [decimalval, setDecimalval] = useState<string>('som-det-blir')
  const [namn, setNamn] = useState('')

  const decimaler = decimalval === 'som-det-blir' ? null : Number(decimalval)

  const slutnamn = namn.trim() === '' ? forslagsnamn(frame, nycklar) : namn.trim()

  /*
   * Flikens namn ingår inte i beräkningen.
   *
   * Det påverkar bara rubriken, och att räkna om 200 000 rader för varje
   * tecken man skriver i namnfältet vore att betala hela priset för ingenting.
   * Namnet sätts i stället på ramen när fliken skapas.
   */
  const plan: Grupperingsplan = {
    nycklar,
    berakningar,
    strunta,
    tommaMed,
    namn: '',
    format,
    decimaler,
  }

  // Nyckeln fångar exakt det planen består av. Kolumnobjekten är desamma
  // mellan omritningarna, så det räcker med deras id:n.
  const plannyckel = JSON.stringify(plan)
  const resultat = useMemo(() => gruppera(frame, plan), [frame, plannyckel])

  const vaxlaNyckel = (id: ColumnId) =>
    setNycklar((nu) => (nu.includes(id) ? nu.filter((n) => n !== id) : [...nu, id]))

  const andraBerakning = (id: string, over: Partial<Berakning>) =>
    setBerakningar((nu) => nu.map((b) => (b.id === id ? { ...b, ...over } : b)))

  const forhandsrader = Math.min(resultat.frame.rowCount, 8)
  const utanBerakning = berakningar.length === 0
  const nyckelnamn = nycklar
    .map((id) => synliga.find((c) => c.id === id)?.name)
    .filter((n): n is string => n !== undefined)

  return (
    <Modal
      titel="Gruppera och summera"
      underrubrik={frame.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={utanBerakning || resultat.antalGrupper === 0}
            title={
              utanBerakning
                ? 'Välj minst en sak att räkna ut.'
                : resultat.antalGrupper === 0
                  ? 'Det finns inga grupper att sammanfatta.'
                  : undefined
            }
            onClick={() =>
              props.onSkapa(
                { ...resultat.frame, name: slutnamn },
                `${formatCount(resultat.antalGrupper)} grupper ur ${rader(resultat.radermed)}`,
              )
            }
          >
            Skapa fliken
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Gruppera på</span>
        <div class="val" role="group">
          {synliga.map((c) => {
            const i = nycklar.indexOf(c.id)
            return (
              <button
                key={c.id}
                class={`val__knapp${i >= 0 ? ' val__knapp--vald' : ''}`}
                aria-pressed={i >= 0}
                onClick={() => vaxlaNyckel(c.id)}
              >
                {i >= 0 && nycklar.length > 1 && (
                  <span class="gruppera__ordning">{i + 1}</span>
                )}
                {c.name}
              </button>
            )
          })}
        </div>
        <p class="verktyg__sammanfattning">
          {nyckelnamn.length === 0
            ? 'Ingen kolumn vald — hela filen blir en enda sammanfattningsrad.'
            : `En rad per ${nyckelnamn.join(' + ')}. Klicka igen för att välja bort.`}
        </p>
      </div>

      <div class="falt">
        <span class="falt__etikett">Räkna ut</span>
        {berakningar.map((b) => {
          const post = berakningspost(b.typ)
          const las = resultat.lasbarhet.find((l) => l.id === b.id)
          return (
            <div key={b.id} class="gruppera__rad">
              <select
                aria-label="Beräkning"
                value={b.typ}
                onChange={(e) => {
                  const typ = (e.currentTarget as HTMLSelectElement).value as Berakningstyp
                  const behover = berakningspost(typ).behoverKolumn
                  andraBerakning(b.id, {
                    typ,
                    colId: behover ? (b.colId ?? synliga[0]?.id ?? null) : null,
                  })
                }}
              >
                {BERAKNINGAR.map((p) => (
                  <option key={p.typ} value={p.typ} title={p.hjalp}>
                    {p.etikett}
                  </option>
                ))}
              </select>
              {post.behoverKolumn ? (
                <select
                  aria-label="Kolumn att räkna på"
                  value={b.colId ?? ''}
                  onChange={(e) =>
                    andraBerakning(b.id, {
                      colId: (e.currentTarget as HTMLSelectElement).value as ColumnId,
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
                <span class="gruppera__tomval">alla rader</span>
              )}
              <input
                class="gruppera__namn"
                aria-label="Rubrik i resultatet"
                placeholder={berakningsnamn({ ...b, namn: '' }, frame)}
                value={b.namn}
                onInput={(e) => andraBerakning(b.id, { namn: (e.currentTarget as HTMLInputElement).value })}
              />
              <button
                class="knapp knapp--tyst"
                aria-label={`Ta bort ${berakningsnamn(b, frame)}`}
                title="Ta bort beräkningen"
                onClick={() => setBerakningar((nu) => nu.filter((x) => x.id !== b.id))}
              >
                ✕
              </button>
              {post.taluppgift && las && las.ifyllda > 0 && las.lasta < las.ifyllda && (
                <span class="gruppera__varning">
                  {formatCount(las.lasta)} av {celler(las.ifyllda)} går att läsa som tal
                </span>
              )}
            </div>
          )
        })}
        <div>
          <button
            class="knapp"
            onClick={() =>
              setBerakningar((nu) => [...nu, forstaBerakningen(frame, nycklar)])
            }
          >
            + Lägg till beräkning
          </button>
        </div>
      </div>

      {utanBerakning && (
        <Notis ton="varning">
          Utan någon beräkning blir resultatet bara en lista över de olika värdena. Lägg till minst
          en sak att räkna ut.
        </Notis>
      )}

      {berakningar.some((b) => {
        const las = resultat.lasbarhet.find((l) => l.id === b.id)
        return berakningspost(b.typ).taluppgift && las && las.ifyllda > 0 && las.lasta === 0
      }) && (
        <Notis ton="fara">
          En av summorna hittar inga tal alls i sin kolumn. Kör <strong>Tal…</strong> på den först,
          eller välj en annan kolumn — en summa av ingenting är tom, inte noll.
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">Strunta i</span>
        <div class="faltrad">
          <label class="kryss">
            <input
              type="checkbox"
              checked={strunta.skiftlage}
              onChange={(e) =>
                setStrunta({ ...strunta, skiftlage: (e.currentTarget as HTMLInputElement).checked })
              }
            />
            VERSALER
          </label>
          <label class="kryss">
            <input
              type="checkbox"
              checked={strunta.blanksteg}
              onChange={(e) =>
                setStrunta({ ...strunta, blanksteg: (e.currentTarget as HTMLInputElement).checked })
              }
            />
            Extra blanksteg
          </label>
          <label class="kryss">
            <input
              type="checkbox"
              checked={strunta.diakriter}
              onChange={(e) =>
                setStrunta({ ...strunta, diakriter: (e.currentTarget as HTMLInputElement).checked })
              }
            />
            å ä ö
          </label>
        </div>
        <p class="verktyg__sammanfattning">
          Samma jämförelse som dubblettvyn gör, så <em>hitta dubbletter i {nyckelnamn[0] ?? 'Ort'}</em>{' '}
          och <em>summera per {nyckelnamn[0] ?? 'Ort'}</em> är eniga om vad som är samma värde.
        </p>
      </div>

      {nycklar.length > 0 && (
        <label class="kryss">
          <input
            type="checkbox"
            checked={tommaMed}
            onChange={(e) => setTommaMed((e.currentTarget as HTMLInputElement).checked)}
          />
          Ta med raderna som saknar värde i grupperingskolumnerna
        </label>
      )}

      <div class="faltrad">
        <div class="falt">
          <span class="falt__etikett">Tal skrivs som</span>
          <Val varden={TALFORMAT.map((f) => ({ varde: f.varde, etikett: f.exempel }))} valt={format} onValj={setFormat} />
        </div>
        <div class="falt">
          <span class="falt__etikett">Decimaler</span>
          <Val
            varden={[
              { varde: 'som-det-blir', etikett: 'Som det blir' },
              { varde: '0', etikett: '0' },
              { varde: '1', etikett: '1' },
              { varde: '2', etikett: '2' },
            ]}
            valt={decimalval}
            onValj={setDecimalval}
          />
        </div>
      </div>

      <div class="falt">
        <span class="falt__etikett">Namn på den nya fliken</span>
        <input
          value={namn}
          placeholder={forslagsnamn(frame, nycklar)}
          onInput={(e) => setNamn((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      {resultat.utanNyckel > 0 && (
        <Notis ton="varning">
          <strong>{rader(resultat.utanNyckel)}</strong> saknar värde i{' '}
          {nyckelnamn.length === 1 ? nyckelnamn[0] : 'grupperingskolumnerna'} och är inte med i
          något av talen. Kryssa i rutan ovan för att ta med dem som en egen grupp.
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">
          Så här blir det{resultat.antalGrupper > forhandsrader ? ` (${formatCount(forhandsrader)} av ${formatCount(resultat.antalGrupper)} rader)` : ''}
        </span>
        <div class="fortab__omslag">
          <table class="fortab">
            <thead>
              <tr>
                {resultat.frame.columns.map((c) => (
                  <th key={c.id}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: forhandsrader }, (_, r) => (
                <tr key={r}>
                  {resultat.frame.columns.map((c) => (
                    <td key={c.id}>{c.dict[c.codes[r]!] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="verktyg__sammanfattning">
          <strong>{formatCount(resultat.antalGrupper)}</strong>{' '}
          {resultat.antalGrupper === 1 ? 'grupp' : 'grupper'} ur {rader(resultat.radermed)}. Största
          gruppen har {rader(resultat.storsta)}.
        </p>
      </div>

      <Notis ton="info">
        Resultatet blir en ny flik. Originalet rörs inte, och den nya fliken går att sortera,
        filtrera och exportera som vilken fil som helst. Steget kommer inte med i en profil — en
        profil kör om steg på samma fil, och det här skapar en annan.
      </Notis>
    </Modal>
  )
}
