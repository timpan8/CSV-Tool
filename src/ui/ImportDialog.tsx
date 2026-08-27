import { useEffect, useState } from 'preact/hooks'
import { Modal, Notis, Val } from './parts.js'
import { DELIMITER_NAMES } from '../core/csv/sniff.js'
import type { Delimiter, Encoding } from '../core/types.js'
import { dataWorker } from '../worker/client.js'
import type { ParsePreview } from '../worker/protocol.js'
import { formatCount } from '../core/locale/sv.js'

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

  const storlek = props.file.size >= 1024 * 1024
    ? `${(props.file.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(props.file.size / 1024))} kB`

  return (
    <Modal
      titel={`Öppna ${props.file.name}`}
      underrubrik={storlek}
      onStang={props.onAvbryt}
      fot={
        <>
          <button class="knapp" onClick={props.onAvbryt}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={preview === null}
            onClick={() => props.onOppna(settings)}
          >
            Öppna filen
          </button>
        </>
      }
    >
      {arExcel ? (
        <div class="faltrad">
          {preview && preview.sheets && preview.sheets.length > 1 && (
            <div class="falt">
              <span class="falt__etikett">Blad</span>
              <Val
                varden={preview.sheets.map((namn) => ({ varde: namn, etikett: namn }))}
                valt={settings.sheet ?? preview.valdSheet ?? preview.sheets[0]!}
                onValj={(v) => uppdatera({ sheet: v })}
              />
            </div>
          )}
          <div class="falt">
            <span class="falt__etikett">Decimaltecken för tal</span>
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
            <span class="falt__etikett">Avgränsare</span>
            <Val
              varden={DELIMITER_VAL}
              valt={(settings.delimiter ?? (preview?.delimiter as Delimiter) ?? ';')}
              onValj={(v) => uppdatera({ delimiter: v })}
            />
          </div>
          <div class="falt">
            <span class="falt__etikett">Teckenkodning</span>
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
          Första raden är rubriker
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={settings.trimFields}
            onChange={(e) => uppdatera({ trimFields: (e.currentTarget as HTMLInputElement).checked })}
          />
          Trimma blanksteg runt värden
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={settings.skipEmptyRows}
            onChange={(e) =>
              uppdatera({ skipEmptyRows: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          Hoppa över helt tomma rader
        </label>
      </div>

      {error && <Notis ton="fara">Filen kunde inte läsas: {error}</Notis>}

      {preview && <Sjalvkontroll preview={preview} arExcel={arExcel} />}

      {preview && (
        <div class="falt">
          <div class="faltrad" style={{ justifyContent: 'space-between' }}>
            <span class="falt__etikett">
              Förhandsvisning — {formatCount(preview.rows.length)} första raderna
            </span>
            {!arExcel && (
              <button class="knapp knapp--tyst" onClick={() => setVisaRa(!visaRa)}>
                {visaRa ? 'Visa tolkat' : 'Visa rådata'}
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
          En Excel-fil innehåller typade värden, inte text. Datum skrivs om till{' '}
          <strong>ÅÅÅÅ-MM-DD</strong> och tal med det decimaltecken du valt, utan
          tusentalsavgränsare. Ledande nollor i textceller bevaras.
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
          Ser rätt ut: {formatCount(preview.headers.length)} kolumner, och svenska tecken visas
          korrekt (inga tecken som Ã¥ Ã¤ Ã¶).
          {preview.hadSepDirective && ' Excels sep=-rad hittades och användes.'}
        </Notis>
      )}
      {preview.check.state === 'unknown' && (
        <Notis ton="info">
          Filen innehåller bara ASCII-tecken i den del vi läst, så det går inte att avgöra om
          teckenkodningen är rätt vald. Har filen svenska tecken längre ned kan de behöva en
          annan kodning.
        </Notis>
      )}
      {preview.check.state === 'mojibake' && (
        <Notis ton="varning">
          Teckenkodningen ser trasig ut. Exempel ur filen:{' '}
          <code>{preview.check.sample.slice(0, 2).join('  ·  ')}</code>. Prova en annan
          teckenkodning ovan.
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
