import { useEffect, useMemo, useState } from 'preact/hooks'
import { Resultat, Verktygspanel } from './Verktygspanel.js'
import { Notis } from './parts.js'
import type { Column, Frame } from '../core/types.js'
import {
  korMallar,
  mallensKallor,
  tolkaMall,
  type Mallar,
} from '../core/ops/columns.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { formatCount } from '../core/locale/sv.js'
import { celler, sprak, t, tf, tj } from './sprak.js'

/**
 * Bygger en kolumn ur en mall.
 *
 * Två saker i ett: `{Förnamn} {Efternamn}` slår ihop kolumner, och
 * `('{Användarnamn}'),` lägger en struktur runt varje värde. Det är samma
 * operation — text och värden varvade — och därför samma fält.
 *
 * Till skillnad från de andra verktygen beror resultatet på hela raden och
 * inte på ett enda värde, så förhandsvisningen räknas per rad. Det är dyrare
 * och kan inte undvikas — men det står i `perRad` i stället för att döljas.
 */
export function MergeTool(props: {
  col: Column
  frame: Frame
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}) {
  const { col, frame } = props
  /*
   * En kolumn som redan är byggd ur en mall öppnar panelen med sin egen mall.
   *
   * Ingen ny inkoppling behövs för det: regeln ligger på kolumnen, och
   * panelen kan läsa den själv när den monteras.
   */
  const regel = col.regel
  const [mall, setMall] = useState(regel?.mall ?? `{${col.name}} `)
  const [namn, setNamn] = useState(regel ? col.name : 'Sammanslagen')
  const [stadaLuckor, setStadaLuckor] = useState(regel?.stadaLuckor ?? true)
  const [egenForsta, setEgenForsta] = useState(regel?.forsta !== undefined)
  const [forsta, setForsta] = useState(regel?.forsta ?? '')
  const [egenSista, setEgenSista] = useState(regel?.sista !== undefined)
  const [sista, setSista] = useState(regel?.sista ?? '')
  const [komIhag, setKomIhag] = useState(true)

  /*
   * Ett undantag börjar som en kopia av huvudmallen.
   *
   * Den som kryssar i *Sista raden* vill nästan alltid ändra en detalj i
   * slutet, inte skriva om mallen från början. Ett tomt fält hade dessutom
   * gjort sista raden tom, vilket ser ut som ett fel i förhandsvisningen.
   */
  const vaxlaUndantag = (
    pa: boolean,
    varde: string,
    sattPa: (v: boolean) => void,
    satt: (v: string) => void,
  ) => {
    if (pa && varde.trim() === '') satt(mall)
    sattPa(pa)
  }

  const tolkningar = useMemo(() => {
    const huvud = tolkaMall(mall, frame)
    const f = egenForsta ? tolkaMall(forsta, frame) : null
    const s = egenSista ? tolkaMall(sista, frame) : null
    const okanda = [...new Set([...huvud.okanda, ...(f?.okanda ?? []), ...(s?.okanda ?? [])])]
    const mallar: Mallar = {
      delar: huvud.delar,
      forsta: f?.delar ?? null,
      sista: s?.delar ?? null,
    }
    return { mallar, okanda }
  }, [mall, forsta, sista, egenForsta, egenSista, frame, props.dataRevision])

  /*
   * Vyns ändpunkter som en nyckel, inte hela `frame.view`.
   *
   * Undantagen läser bara två rader, men en omsortering byter dem utan att
   * `dataRevision` rör sig — den räknaren svarar på om *datat* ändrats. Att i
   * stället lyssna på hela `view` hade räknat om mallen rad för rad vid varje
   * tangenttryck i sökrutan, eftersom `refreshView` bygger en ny array då.
   */
  const ordningsnyckel =
    frame.view.length === 0 ? '' : `${frame.view[0]}:${frame.view[frame.view.length - 1]}`

  const forh = useMemo(
    () =>
      beraknaForhandsvisning(
        col,
        {
          etikett: tf('Byggde kolumnen ”{0}” ur en mall', namn.trim() || t('Sammanslagen')),
          kind: 'merge',
          profil: {
            typ: 'mall',
            mall,
            namn: namn.trim() === '' ? t('Sammanslagen') : namn.trim(),
            stadaLuckor,
            forsta: egenForsta ? forsta : undefined,
            sista: egenSista ? sista : undefined,
            komIhagMallen: komIhag,
          },
          regel: komIhag
            ? {
                typ: 'mall',
                mall,
                stadaLuckor,
                forsta: egenForsta ? forsta : undefined,
                sista: egenSista ? sista : undefined,
                kallor: mallensKallor(
                  frame,
                  mall,
                  egenForsta ? forsta : undefined,
                  egenSista ? sista : undefined,
                ),
                // Avtrycket sätts när kolumnen faktiskt skapas — det är då
                // det finns ett tillstånd att fästa det vid.
                avtryck: 0,
              }
            : undefined,
          rad: (f, row) => [korMallar(f, row, tolkningar.mallar, { stadaLuckor })],
          nyaKolumner: [namn.trim() === '' ? t('Sammanslagen') : namn.trim()],
        },
        frame,
      ),
    [
      col,
      frame,
      props.dataRevision,
      ordningsnyckel,
      tolkningar,
      namn,
      stadaLuckor,
      komIhag,
      sprak.value,
    ],
  )

  /*
   * Tre rader ur användarens eget data: den första, en i mitten och den sista.
   *
   * Rutan finns för att undantagen bara syns i två celler av tusen. En
   * spökkolumn visar det översta av filen, och den som kryssat i *Sista raden*
   * hade fått scrolla till botten för att se om det blev rätt.
   */
  const prov = useMemo(() => {
    const view = frame.view
    if (view.length === 0) return []
    const rader: { etikett: string; rad: number }[] = [{ etikett: 'Första raden', rad: view[0]! }]
    if (view.length > 2) rader.push({ etikett: '…', rad: view[Math.floor(view.length / 2)]! })
    if (view.length > 1) {
      rader.push({ etikett: 'Sista raden', rad: view[view.length - 1]! })
    }
    return rader.map((r) => ({
      ...r,
      varde: korMallar(frame, r.rad, tolkningar.mallar, { stadaLuckor }),
    }))
  }, [frame, props.dataRevision, ordningsnyckel, tolkningar, stadaLuckor, sprak.value])

  useEffect(() => {
    props.onForhandsvisning([forh])
  }, [forh])
  useEffect(() => () => props.onForhandsvisning(null), [])

  const infoga = (kolumnnamn: string) => setMall((m) => `${m}{${kolumnnamn}}`)

  return (
    <Verktygspanel
      titel={t('Bygg kolumn ur mall')}
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            {t('Avbryt')}
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0 || tolkningar.okanda.length > 0}
            title={
              tolkningar.okanda.length > 0
                ? t('Mallen pekar på kolumner som inte finns.')
                : forh.andrade === 0
                  ? t('Kolumnen skulle bli tom.')
                  : undefined
            }
            onClick={() => props.onTillampa([forh])}
          >
            {t('Skapa kolumnen')}
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">{t('Mall')}</span>
        <input
          value={mall}
          onInput={(e) => setMall((e.currentTarget as HTMLInputElement).value)}
        />
        <p class="verktyg__sammanfattning">
          {tj(
            'Skriv {0} där ett värde ska in. Allt annat kommer med som det står.',
            <code>{'{Kolumnnamn}'}</code>,
          )}
        </p>
      </div>

      <div class="falt">
        <span class="falt__etikett">{t('Lägg till kolumn')}</span>
        <div class="val" role="group">
          {frame.columns
            .filter((c) => !c.hidden)
            .map((c) => (
              <button key={c.id} class="val__knapp" onClick={() => infoga(c.name)}>
                {c.name}
              </button>
            ))}
        </div>
      </div>

      {tolkningar.okanda.length > 0 && (
        <Notis ton="fara">
          {tj(
            'Mallen pekar på {0} som inte finns: {1}. Ett stavfel ger annars en kolumn full av halva värden.',
            t(tolkningar.okanda.length === 1 ? 'en kolumn' : 'kolumner'),
            <strong>{tolkningar.okanda.join(', ')}</strong>,
          )}
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">{t('Undantag')}</span>
        <label class="kryss">
          <input
            type="checkbox"
            checked={egenForsta}
            onChange={(e) =>
              vaxlaUndantag(
                (e.currentTarget as HTMLInputElement).checked,
                forsta,
                setEgenForsta,
                setForsta,
              )
            }
          />
          {t('Första raden ska se annorlunda ut')}
        </label>
        {egenForsta && (
          <input
            aria-label={t('Mall för första raden')}
            value={forsta}
            onInput={(e) => setForsta((e.currentTarget as HTMLInputElement).value)}
          />
        )}
        <label class="kryss">
          <input
            type="checkbox"
            checked={egenSista}
            onChange={(e) =>
              vaxlaUndantag(
                (e.currentTarget as HTMLInputElement).checked,
                sista,
                setEgenSista,
                setSista,
              )
            }
          />
          {t('Sista raden ska se annorlunda ut')}
        </label>
        {egenSista && (
          <input
            aria-label={t('Mall för sista raden')}
            value={sista}
            onInput={(e) => setSista((e.currentTarget as HTMLInputElement).value)}
          />
        )}
        {(egenForsta || egenSista) && (
          <p class="verktyg__sammanfattning">
            {t(
              'Första och sista raden är de du ser nu. Sorterar eller filtrerar du om behöver kolumnen byggas om.',
            )}
          </p>
        )}
      </div>

      {prov.length > 0 && (
        <div class="falt">
          <span class="falt__etikett">{t('Så blir det')}</span>
          <table class="inventering">
            <tbody>
              {prov.map((r) => (
                <tr key={r.rad}>
                  <td>{r.etikett === '…' ? '…' : t(r.etikett)}</td>
                  <td class="inventering__exempel">
                    {r.varde === '' ? t('(tomt)') : r.varde}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label class="kryss">
        <input
          type="checkbox"
          checked={komIhag}
          onChange={(e) => setKomIhag((e.currentTarget as HTMLInputElement).checked)}
        />
        {t('Kom ihåg mallen för kolumnen')}
      </label>
      <p class="verktyg__sammanfattning">
        {t(
          'Kolumnen märks som byggd ur mallen. Den räknas aldrig om av sig själv — men när källorna ändrats får du en Uppdatera i statusraden.',
        )}
      </p>

      <label class="kryss">
        <input
          type="checkbox"
          checked={stadaLuckor}
          onChange={(e) => setStadaLuckor((e.currentTarget as HTMLInputElement).checked)}
        />
        {t('Städa bort luckor efter tomma värden')}
      </label>

      <div class="falt">
        <span class="falt__etikett">{t('Namn på den nya kolumnen')}</span>
        <input
          value={namn}
          onInput={(e) => setNamn((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <Resultat
        visaBara={props.visaBara}
        onVisaBara={props.onVisaBara}
        andrade={forh.andrade}
        problem={0}
        etikettAndrade="Bara ifyllda"
      >
        {tj(
          '{0} av {1} ger ett värde.',
          <strong>{formatCount(forh.andrade)}</strong>,
          celler(forh.ifyllda),
        )}
      </Resultat>

      <Notis ton="info">
        {t(
          'Värdet räknas ut rad för rad, eftersom det beror på flera kolumner. På riktigt stora filer märks det som en kort fördröjning när du skriver i mallen.',
        )}
      </Notis>
    </Verktygspanel>
  )
}
