import { useMemo, useRef, useState } from 'preact/hooks'
import type { Frame } from '../core/types.js'
import { beskrivStegDelar, type Profil, type Profilsteg } from '../core/ops/profil.js'
import {
  historikensSteg,
  korProfil,
  laggTillProfiler,
  profiler,
  profilfilstext,
  saknadeKolumnerFor,
  sparaProfil,
  taBortProfil,
  tolkaProfilfil,
  type Stegresultat,
} from '../state/profiler.js'
import type { Tab } from '../state/store.js'
import { formatCount } from '../core/locale/sv.js'
import { Modal, Notis } from './parts.js'
import { kolumner as kolumnerText, t, tf, tj } from './sprak.js'

/**
 * Profiler: spara den här filens arbetsgång och kör om den på nästa.
 *
 * Två halvor som hör ihop. Den övre visar vad som gjorts i fliken och vad av
 * det som går att upprepa — en handredigerad cell hör till *den* filen och
 * står därför gråmarkerad med sitt skäl, i stället för att tyst utelämnas.
 * Den nedre kör en sparad profil, och rapporterar steg för steg vad som hände.
 *
 * Rapporten är hela poängen. En profil som kördes på en fil där två kolumner
 * hette något annat har gjort mindre än användaren tror, och det är den sortens
 * skillnad som annars upptäcks långt senare — i någon annans hand.
 */
export function ProfilDialog(props: { tab: Tab; onStang: () => void }) {
  const [namn, setNamn] = useState('')
  const [valda, setValda] = useState<Set<number> | null>(null)
  const [rapport, setRapport] = useState<{ profil: string; rader: Stegresultat[] } | null>(null)
  const [fel, setFel] = useState<string | null>(null)
  const filinput = useRef<HTMLInputElement>(null)

  const poster = useMemo(() => historikensSteg(props.tab), [props.tab, props.tab.cursor])
  const korbara = poster.filter((p) => p.steg !== null)
  // Utan eget val är allt som går att köra om förvalt.
  const ikryssad = (i: number) => (valda === null ? true : valda.has(i))
  const vaxla = (i: number, pa: boolean) => {
    const nya = new Set(valda ?? poster.map((p, j) => (p.steg ? j : -1)).filter((j) => j >= 0))
    if (pa) nya.add(i)
    else nya.delete(i)
    setValda(nya)
  }

  const stegAttSpara: Profilsteg[] = poster
    .map((p, i) => (p.steg && ikryssad(i) ? p.steg : null))
    .filter((s): s is Profilsteg => s !== null)

  const spara = () => {
    const rent = namn.trim()
    if (rent === '' || stegAttSpara.length === 0) return
    sparaProfil(rent, stegAttSpara, new Date().toISOString().slice(0, 10))
    setNamn('')
    setValda(null)
  }

  const kor = (profil: Profil) => {
    setRapport({ profil: profil.namn, rader: korProfil(props.tab, profil) })
  }

  const laddaNer = () => {
    const blob = new Blob([profilfilstext(profiler.value)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'csv-verkstan-profiler.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const lasFil = async (fil: File) => {
    const lasta = tolkaProfilfil(await fil.text())
    if (lasta === null) {
      setFel(`${fil.name} ser inte ut som en profilfil.`)
      return
    }
    if (lasta.length === 0) {
      setFel(`${fil.name} innehöll inga steg som den här versionen känner igen.`)
      return
    }
    setFel(null)
    laggTillProfiler(lasta)
  }

  return (
    <Modal
      titel={t('Profiler')}
      underrubrik={props.tab.frame.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={laddaNer} disabled={profiler.value.length === 0}>
            {t('Spara till fil')}
          </button>
          <button class="knapp" onClick={() => filinput.current?.click()}>
            {t('Öppna profilfil…')}
          </button>
          <button class="knapp knapp--primar" onClick={props.onStang}>
            {t('Stäng')}
          </button>
        </>
      }
    >
      <input
        ref={filinput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const fil = (e.currentTarget as HTMLInputElement).files?.[0]
          if (fil) void lasFil(fil)
          ;(e.currentTarget as HTMLInputElement).value = ''
        }}
      />

      {fel && <Notis ton="fara">{fel}</Notis>}

      <div class="falt">
        <span class="falt__etikett">{t('Det du gjort i den här filen')}</span>
        {poster.length === 0 ? (
          <p class="verktyg__sammanfattning">
            {t(
              'Inga steg än. Städa, skriv om eller döp om något först — det som går att upprepa hamnar här.',
            )}
          </p>
        ) : (
          <div class="profilsteg">
            {poster.map((post, i) => (
              <label class={`profilsteg__rad${post.steg ? '' : ' profilsteg__rad--av'}`} key={i}>
                <input
                  type="checkbox"
                  disabled={post.steg === null}
                  checked={post.steg !== null && ikryssad(i)}
                  onChange={(e) => vaxla(i, (e.currentTarget as HTMLInputElement).checked)}
                />
                <span class="profilsteg__text">
                  {post.steg ? stegtext(post.steg) : post.label}
                </span>
                {post.steg === null && (
                  <span class="profilsteg__skal">{t('hör till den här filen')}</span>
                )}
              </label>
            ))}
          </div>
        )}
        {poster.length > korbara.length && (
          <p class="verktyg__sammanfattning">
            {t(
              'Handredigerade celler, inklistringar och borttagna rader pekar på rader i just den här filen och betyder ingenting i nästa. De kan därför inte sparas.',
            )}
          </p>
        )}
      </div>

      {korbara.length > 0 && (
        <div class="falt">
          <span class="falt__etikett">{t('Spara som profil')}</span>
          <div class="faltrad">
            <input
              value={namn}
              placeholder={t('t.ex. Månadsfilen från Fortnox')}
              aria-label={t('Namn på profilen')}
              onInput={(e) => setNamn((e.currentTarget as HTMLInputElement).value)}
            />
            <button
              class="knapp knapp--primar"
              disabled={namn.trim() === '' || stegAttSpara.length === 0}
              onClick={spara}
            >
              {tf('Spara {0} steg', formatCount(stegAttSpara.length))}
            </button>
          </div>
        </div>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Sparade profiler')}</span>
        {profiler.value.length === 0 ? (
          <p class="verktyg__sammanfattning">
            {t(
              'Inga sparade profiler. De ligger i den här webbläsaren och lämnar aldrig datorn — spara dem till fil om de ska följa med någon annanstans.',
            )}
          </p>
        ) : (
          profiler.value.map((profil) => (
            <Profilrad
              key={profil.id}
              profil={profil}
              frame={props.tab.frame}
              onKor={() => kor(profil)}
              onTaBort={() => taBortProfil(profil.id)}
            />
          ))
        )}
      </div>

      {rapport && <Rapport namn={rapport.profil} rader={rapport.rader} />}
    </Modal>
  )
}

function Profilrad(props: {
  profil: Profil
  frame: Frame
  onKor: () => void
  onTaBort: () => void
}) {
  const saknade = saknadeKolumnerFor(props.frame, props.profil.steg)
  return (
    <div class="profil">
      <div class="profil__rubrik">
        <strong>{props.profil.namn}</strong>
        <span class="profil__antal">
          {tf('{0} steg', formatCount(props.profil.steg.length))}
          {props.profil.skapad ? ` · ${props.profil.skapad}` : ''}
        </span>
        <button class="knapp knapp--liten" onClick={props.onKor}>
          {t('Kör')}
        </button>
        <button
          class="restrad__skriv"
          aria-label={tf('Ta bort profilen {0}', props.profil.namn)}
          onClick={props.onTaBort}
        >
          ✕
        </button>
      </div>
      <ol class="profil__steg">
        {props.profil.steg.map((steg, i) => (
          <li key={i}>{stegtext(steg)}</li>
        ))}
      </ol>
      {saknade.length > 0 && (
        <p class="profil__saknade">
          {tj(
            '{0} saknas i den här filen: {1}. De stegen hoppas över.',
            kolumnerText(saknade.length),
            <strong>{saknade.join(', ')}</strong>,
          )}
        </p>
      )}
    </div>
  )
}

function Rapport(props: { namn: string; rader: readonly Stegresultat[] }) {
  const korda = props.rader.filter((r) => r.utfall === 'kord').length
  const saknade = props.rader.filter((r) => r.utfall === 'kolumnSaknas')
  return (
    <div class="falt">
      <span class="falt__etikett">{tf('Så gick ”{0}”', props.namn)}</span>
      <table class="inventering">
        <tbody>
          {props.rader.map((rad, i) => (
            <tr key={i} class={rad.utfall === 'kolumnSaknas' ? 'inventering--okant' : ''}>
              <td class="inventering__antal">
                {rad.utfall === 'kolumnSaknas' ? '—' : formatCount(rad.andrade)}
              </td>
              <td>
                {stegtext(rad.steg)}
                {rad.utfall === 'kolumnSaknas' && (
                  <span class="verktyg__sammanfattning">
                    {' '}
                    {tf('— hittade ingen kolumn som heter {0}', rad.saknad ?? '?')}
                  </span>
                )}
                {rad.utfall === 'ingenAndring' && (
                  <span class="verktyg__sammanfattning"> {t('— inget att ändra')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {saknade.length > 0 ? (
        <Notis ton="varning">
          {tf('{0} av {1} steg kördes.', formatCount(korda), formatCount(props.rader.length))}{' '}
          {tf(
            '{0} hittade inte sin kolumn — döp om kolumnen i filen, eller rätta profilen, och kör igen.',
            saknade.length === 1 ? t('Ett steg') : tf('{0} steg', formatCount(saknade.length)),
          )}
        </Notis>
      ) : (
        <Notis ton="lyckat">
          {tf(
            'Alla {0} steg kördes. Ctrl+Z backar ett steg i taget.',
            formatCount(props.rader.length),
          )}
        </Notis>
      )}
    </div>
  )
}

/**
 * Ett profilsteg på gränssnittets språk.
 *
 * Mallen slås upp i ordboken; kolumnnamn och värden lämnas som de står. Bara
 * de delar kärnan pekat ut som husets egna ord översätts — se
 * `beskrivStegDelar`.
 */
function stegtext(steg: Profilsteg): string {
  const { mall, delar, etiketter } = beskrivStegDelar(steg)
  return tf(mall, ...delar.map((d, i) => (etiketter.includes(i) ? t(d) : d)))
}
