import { useEffect, useState } from 'preact/hooks'
import { Modal, Notis, Val } from './parts.js'
import { DELIMITER_NAMES } from '../core/csv/sniff.js'
import type { Delimiter, Encoding } from '../core/types.js'
import { dataWorker } from '../worker/client.js'
import type { ParsePreview } from '../worker/protocol.js'
import { formatByte, formatCount } from '../core/locale/sv.js'
import { t, tf, tj } from './sprak.js'

const DELIMITER_VAL: { varde: Delimiter; etikett: string }[] = [
  { varde: ';', etikett: 'Semikolon  ;' },
  { varde: ',', etikett: 'Komma  ,' },
  { varde: '\t', etikett: 'Tabb' },
  { varde: '|', etikett: 'Lodstreck  |' },
]

const ENCODING_VAL: { varde: Encoding; etikett: string; titel: string }[] = [
  { varde: 'utf-8', etikett: 'UTF-8', titel: 'Modern standard. Det de flesta system exporterar idag.' },
  {
    varde: 'windows-1252',
    etikett: 'Windows-1252',
    titel: 'Det svenskt Excel skriver om man inte väljer något annat. Kallas även ISO-8859-1.',
  },
  { varde: 'utf-16le', etikett: 'UTF-16', titel: 'Excels "Spara som Unicode-text".' },
]

export interface ImportSettings {
  delimiter?: Delimiter
  encoding?: Encoding
  trimFields: boolean
  skipEmptyRows: boolean
  headerRow: number | null
  /** Endast för .xlsx. */
  sheet?: string
  decimal: ',' | '.'
}

/**
 * Hur många gånger sin filstorlek en fil behöver i minne medan den öppnas.
 *
 * Mätt på verktygets egen parser: en CSV på 34 MB med en halv miljon rader
 * lämnar en ram på ungefär 72 MB, alltså drygt två gånger filen. Toppen
 * under själva importen är högre — filens byte, den avkodade texten och
 * parserns mellanrader finns samtidigt — och det är toppen som avgör om
 * fliken överlever. Därför fyra, inte två.
 *
 * En arbetsbok är dessutom komprimerad. Samma data vägde 16 MB som `.xlsx`
 * mot 34 MB som CSV, så en xlsx-fil expanderar ungefär dubbelt så mycket per
 * byte — och betydligt mer än så när innehållet upprepar sig, vilket det ofta
 * gör i just de filer som är stora. Siffran är alltså en storleksordning och
 * inte ett löfte, och texten säger *ungefär*.
 */
const RAMFAKTOR = 4
const RAMFAKTOR_XLSX = 8

/**
 * Var vi börjar säga ifrån, i byte minne.
 *
 * Under det här är det ingen idé att oroa någon. Över det är det ingen idé
 * att låta bli: en flik som dör tar hela arbetsgången med sig, och det enda
 * verktyget kan göra åt saken är att säga det innan man väntat i en minut på
 * en import som ändå inte går igenom.
 */
const VARNA_VID = 512 * 1024 * 1024

/**
 * Ungefär hur mycket arbetsminne filen behöver medan den öppnas, i byte.
 *
 * Exporterad för att räknesättet ska gå att pröva utan att någon behöver
 * lägga en fil på hundra megabyte i testkatalogen.
 */
export function minnesbehov(storlek: number, arExcel: boolean): number {
  return storlek * (arExcel ? RAMFAKTOR_XLSX : RAMFAKTOR)
}

/** Sant när filen är stor nog att det är värt att säga något. */
export function varnarForStorlek(storlek: number, arExcel: boolean): boolean {
  return minnesbehov(storlek, arExcel) >= VARNA_VID
}

export function ImportDialog(props: {
  file: File
  onAvbryt: () => void
  onOppna: (settings: ImportSettings) => void
}) {
  const arExcel = /\.xlsx$/i.test(props.file.name)
  const [settings, setSettings] = useState<ImportSettings>({
    trimFields: true,
    skipEmptyRows: true,
    headerRow: 0,
    decimal: ',',
  })
  const [preview, setPreview] = useState<ParsePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visaRa, setVisaRa] = useState(false)

  useEffect(() => {
    let avbruten = false
    dataWorker
      .preview(
        props.file,
        {
          delimiter: settings.delimiter,
          encoding: settings.encoding,
          trimFields: settings.trimFields,
          skipEmptyRows: settings.skipEmptyRows,
          headerRow: settings.headerRow,
        },
        8,
        arExcel ? { sheet: settings.sheet, decimal: settings.decimal } : undefined,
      )
      .then((p) => {
        if (!avbruten) {
          setPreview(p)
          setError(null)
        }
      })
      .catch((e: Error) => {
        if (!avbruten) setError(e.message)
      })
    return () => {
      avbruten = true
    }
  }, [props.file, settings])

  const uppdatera = (delta: Partial<ImportSettings>) =>
    setSettings((current) => ({ ...current, ...delta }))

  const storlek = formatByte(props.file.size)

  return (
    <Modal
      titel={tf('Öppna {0}', props.file.name)}
      underrubrik={storlek}
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            {t('Avbryt')}
          </button>
          <button
            class="knapp knapp--primar"
            disabled={preview === null}
            onClick={() => props.onOppna(settings)}
          >
            {t('Öppna filen')}
          </button>
        </>
      }
    >
      {arExcel ? (
        <div class="faltrad">
          {preview && preview.sheets && preview.sheets.length > 1 && (
            <div class="falt">
              <span class="falt__etikett">{t('Blad')}</span>
              <Val
                varden={preview.sheets.map((namn) => ({ varde: namn, etikett: namn }))}
                valt={settings.sheet ?? preview.valdSheet ?? preview.sheets[0]!}
                onValj={(v) => uppdatera({ sheet: v })}
              />
            </div>
          )}
          <div class="falt">
            <span class="falt__etikett">{t('Decimaltecken för tal')}</span>
            <Val
              varden={[
                { varde: ',' as const, etikett: 'Komma  1240,5', titel: 'Det svenskt Excel förväntar sig när filen läses tillbaka.' },
                { varde: '.' as const, etikett: 'Punkt  1240.5', titel: 'Internationell form.' },
              ]}
              valt={settings.decimal}
              onValj={(v) => uppdatera({ decimal: v })}
            />
          </div>
        </div>
      ) : (
        <div class="faltrad">
          <div class="falt">
            <span class="falt__etikett">{t('Avgränsare')}</span>
            <Val
              varden={DELIMITER_VAL}
              valt={(settings.delimiter ?? (preview?.delimiter as Delimiter) ?? ';')}
              onValj={(v) => uppdatera({ delimiter: v })}
            />
          </div>
          <div class="falt">
            <span class="falt__etikett">{t('Teckenkodning')}</span>
            <Val
              varden={ENCODING_VAL}
              valt={(settings.encoding ?? (preview?.encoding as Encoding) ?? 'utf-8')}
              onValj={(v) => uppdatera({ encoding: v })}
            />
          </div>
        </div>
      )}

      <div class="faltrad">
        <label class="kryss">
          <input
            type="checkbox"
            checked={settings.headerRow !== null}
            onChange={(e) =>
              uppdatera({ headerRow: (e.currentTarget as HTMLInputElement).checked ? 0 : null })
            }
          />
          {t('Första raden är rubriker')}
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={settings.trimFields}
            onChange={(e) => uppdatera({ trimFields: (e.currentTarget as HTMLInputElement).checked })}
          />
          {t('Trimma blanksteg runt värden')}
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={settings.skipEmptyRows}
            onChange={(e) =>
              uppdatera({ skipEmptyRows: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          {t('Hoppa över helt tomma rader')}
        </label>
      </div>

      {error && <Notis ton="fara">{tf('Filen kunde inte läsas: {0}', error)}</Notis>}

      <Minnesvarning file={props.file} arExcel={arExcel} />

      {preview && <Sjalvkontroll preview={preview} arExcel={arExcel} />}

      {preview && (
        <div class="falt">
          <div class="faltrad" style={{ justifyContent: 'space-between' }}>
            <span class="falt__etikett">
              {tf('Förhandsvisning — {0} första raderna', formatCount(preview.rows.length))}
            </span>
            {!arExcel && (
              <button class="knapp knapp--tyst" onClick={() => setVisaRa(!visaRa)}>
                {t(visaRa ? 'Visa tolkat' : 'Visa rådata')}
              </button>
            )}
          </div>
          {visaRa && !arExcel ? (
            <RaData file={props.file} encoding={settings.encoding ?? (preview.encoding as Encoding)} />
          ) : (
            <div class="fortab__omslag">
              <table class="fortab">
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, c) => (
                        <td key={c}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/**
 * Varningen för en fil som troligen inte får plats.
 *
 * Den står här och inte bland importvarningarna nedan, eftersom de kommer ur
 * parsningen — och poängen med den här är att den kommer *före*. Att få veta
 * att filen var för stor efter att ha väntat på att den skulle läsas är inte
 * att få veta det.
 *
 * Den blockerar inte. Gissningen är en storleksordning, maskinerna är olika,
 * och den som vet att det brukar fungera ska inte hindras av en siffra som
 * kan ha fel. Det är samma hållning som resten av importdialogen: säg det
 * rakt ut, låt användaren bestämma.
 */
function Minnesvarning({ file, arExcel }: { file: File; arExcel: boolean }) {
  if (!varnarForStorlek(file.size, arExcel)) return null
  const behov = minnesbehov(file.size, arExcel)
  return (
    <Notis ton="varning">
      {tf(
        'Filen är stor. Den behöver ungefär {0} arbetsminne medan den öppnas, och allt arbete sker i den här fliken — går minnet ut stänger webbläsaren fliken utan att fråga.',
        formatByte(behov),
      )}{' '}
      {arExcel
        ? t(
            'En Excel-fil är komprimerad och växer mer än sin storlek antyder. Har du filen som CSV tar den mindre plats.',
          )
        : t('Ett sätt runt det är att dela filen i delar och köra dem en i taget.')}
    </Notis>
  )
}

/**
 * Självkontrollen av teckenkodningen.
 *
 * Den har tre lägen och inte två. En fil som bara innehåller ASCII ger inget
 * bevis för att kodningen är rätt vald, och att visa en grön bock där vore
 * att ljuga med hög konfidens.
 */
function Sjalvkontroll({ preview, arExcel }: { preview: ParsePreview; arExcel: boolean }) {
  const extra = preview.warnings.filter(
    (w) => w.kind !== 'encoding-uncertain' && w.kind !== 'mojibake',
  )
  if (arExcel) {
    // En arbetsbok har inga tecken att avkoda, men den har heller ingen
    // råtext. Det som står här är alltså inte en bekräftelse utan en
    // upplysning om vad vi behövde skriva om.
    return (
      <>
        <Notis ton="info">
          {tj(
            'En Excel-fil innehåller typade värden, inte text. Datum skrivs om till {0} och tal med det decimaltecken du valt, utan tusentalsavgränsare. Ledande nollor i textceller bevaras.',
            <strong>{t('ÅÅÅÅ-MM-DD')}</strong>,
          )}
        </Notis>
        {extra.map((w, i) => (
          <Notis ton="varning" key={i}>
            {w.message}
          </Notis>
        ))}
      </>
    )
  }
  return (
    <>
      {preview.check.state === 'ok' && (
        <Notis ton="lyckat">
          {tf(
            'Ser rätt ut: {0} kolumner, och svenska tecken visas korrekt (inga tecken som Ã¥ Ã¤ Ã¶).',
            formatCount(preview.headers.length),
          )}
          {preview.hadSepDirective && ` ${t('Excels sep=-rad hittades och användes.')}`}
        </Notis>
      )}
      {preview.check.state === 'unknown' && (
        <Notis ton="info">
          {t(
            'Filen innehåller bara ASCII-tecken i den del vi läst, så det går inte att avgöra om teckenkodningen är rätt vald. Har filen svenska tecken längre ned kan de behöva en annan kodning.',
          )}
        </Notis>
      )}
      {preview.check.state === 'mojibake' && (
        <Notis ton="varning">
          {tj(
            'Teckenkodningen ser trasig ut. Exempel ur filen: {0}. Prova en annan teckenkodning ovan.',
            <code>{preview.check.sample.slice(0, 2).join('  ·  ')}</code>,
          )}
        </Notis>
      )}
      {extra.map((w, i) => (
        <Notis ton="varning" key={i}>
          {w.message}
        </Notis>
      ))}
    </>
  )
}

function RaData({ file, encoding }: { file: File; encoding: Encoding }) {
  const [text, setText] = useState('')
  useEffect(() => {
    let avbruten = false
    file
      .slice(0, 4096)
      .arrayBuffer()
      .then((buffer) => {
        if (avbruten) return
        const decoded = new TextDecoder(encoding).decode(new Uint8Array(buffer))
        setText(decoded.split('\n').slice(0, 12).join('\n'))
      })
    return () => {
      avbruten = true
    }
  }, [file, encoding])
  return <pre class="fortab__ra">{text}</pre>
}

export { DELIMITER_NAMES }
