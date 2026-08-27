import { useMemo, useState } from 'preact/hooks'
import { Modal, Notis, Val } from './parts.js'
import type { Delimiter, Encoding, Frame } from '../core/types.js'
import {
  EXCEL_FRIENDLY,
  encodeExport,
  selectForExport,
  stringifyCsv,
  type ExportOptions,
} from '../core/csv/stringify.js'
import { formatCount } from '../core/locale/sv.js'

const PROFILER = [
  {
    varde: 'xlsx',
    etikett: 'Excel-fil (.xlsx)',
    titel: 'Det enda formatet som både bevarar ledande nollor och låter SUMMA fungera på talkolumner.',
  },
  { varde: 'excel', etikett: 'CSV, Excel-vänlig', titel: 'Semikolon, CRLF och UTF-8 med BOM. Öppnas rätt med dubbelklick i svenskt Excel.' },
  { varde: 'standard', etikett: 'CSV, komma + UTF-8', titel: 'Internationell standard. Det de flesta system förväntar sig vid import.' },
  { varde: 'eget', etikett: 'CSV, eget', titel: 'Ställ in varje val själv.' },
] as const

type Profil = (typeof PROFILER)[number]['varde']

const STANDARD_CSV: ExportOptions = {
  ...EXCEL_FRIENDLY,
  delimiter: ',',
  newline: '\n',
  bom: false,
}

export function ExportDialog(props: {
  frame: Frame
  harFilter: boolean
  onStang: () => void
  onExporterad: () => void
}) {
  const [profil, setProfil] = useState<Profil>('xlsx')
  const [options, setOptions] = useState<ExportOptions>({
    ...EXCEL_FRIENDLY,
    rows: props.harFilter ? 'view' : 'all',
  })
  const [filnamn, setFilnamn] = useState(() => foreslaFilnamn(props.frame.name))
  const arXlsx = profil === 'xlsx'

  const valjProfil = (p: Profil) => {
    setProfil(p)
    if (p === 'excel' || p === 'xlsx') {
      setOptions((o) => ({ ...o, ...EXCEL_FRIENDLY, rows: o.rows, columns: o.columns }))
    }
    if (p === 'standard') setOptions((o) => ({ ...o, ...STANDARD_CSV, rows: o.rows, columns: o.columns }))
    setFilnamn((namn) => byteSuffix(namn, p === 'xlsx' ? 'xlsx' : 'csv'))
  }

  const uppdatera = (delta: Partial<ExportOptions>) => {
    // Att ändra en CSV-inställning betyder att man lämnat de färdiga
    // profilerna. Excel-formatet har inga sådana val, så det ska inte slås om
    // av att man kryssar i rubrikrad.
    if (!arXlsx) setProfil('eget')
    setOptions((o) => ({ ...o, ...delta }))
  }

  const urval = useMemo(() => selectForExport(props.frame, options), [props.frame, options])

  // Ett exempel på hur första raden faktiskt kommer se ut i filen, räknat på
  // riktigt i stället för beskrivet i ord.
  const exempelrad = useMemo(() => {
    const smakprov: Frame = { ...props.frame, view: urval.rows.slice(0, 1) }
    return stringifyCsv(smakprov, options).split(options.newline)[0] ?? ''
  }, [props.frame, options, urval])

  const forlorade = useMemo(() => {
    if (options.encoding !== 'windows-1252') return []
    const smakprov: Frame = { ...props.frame, view: urval.rows.slice(0, 500) }
    return encodeExport(stringifyCsv(smakprov, options), options).lostCharacters
  }, [props.frame, options, urval])

  const spara = async () => {
    const suffix = arXlsx ? 'xlsx' : 'csv'
    let bytes: Uint8Array
    let typ: string
    if (arXlsx) {
      // Skrivaren laddas först när någon faktiskt exporterar Excel, så den
      // kostar ingenting för alla som bara använder CSV.
      const { exportXlsx } = await import('../core/xlsx/write.js')
      bytes = exportXlsx(props.frame, options)
      typ = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    } else {
      bytes = encodeExport(stringifyCsv(props.frame, options), options).bytes
      typ = 'text/csv;charset=utf-8'
    }
    // Blob-URL i stället för data: — en stor fil får inte plats i en URL.
    const blob = new Blob([bytes as unknown as BlobPart], { type: typ })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = byteSuffix(filnamn, suffix)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    props.onExporterad()
  }

  return (
    <Modal
      titel="Exportera"
      underrubrik={`${formatCount(urval.rows.length)} rader · ${formatCount(urval.columns.length)} kolumner`}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button class="knapp knapp--primar" onClick={() => void spara()}>
            Ladda ner
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Format</span>
        <Val varden={PROFILER} valt={profil} onValj={valjProfil} />
      </div>

      {!arXlsx && (
      <div class="faltrad">
        <div class="falt">
          <span class="falt__etikett">Avgränsare</span>
          <Val
            varden={[
              { varde: ';' as Delimiter, etikett: 'Semikolon' },
              { varde: ',' as Delimiter, etikett: 'Komma' },
              { varde: '\t' as Delimiter, etikett: 'Tabb' },
            ]}
            valt={options.delimiter}
            onValj={(v) => uppdatera({ delimiter: v })}
          />
        </div>
        <div class="falt">
          <span class="falt__etikett">Teckenkodning</span>
          <Val
            varden={[
              { varde: 'utf-8' as Encoding, etikett: 'UTF-8' },
              { varde: 'windows-1252' as Encoding, etikett: 'Windows-1252' },
            ]}
            valt={options.encoding}
            onValj={(v) => uppdatera({ encoding: v, bom: v === 'utf-8' ? options.bom : false })}
          />
        </div>
        <div class="falt">
          <span class="falt__etikett">Radslut</span>
          <Val
            varden={[
              { varde: '\r\n' as const, etikett: 'CRLF (Windows)' },
              { varde: '\n' as const, etikett: 'LF' },
            ]}
            valt={options.newline}
            onValj={(v) => uppdatera({ newline: v })}
          />
        </div>
      </div>
      )}

      {!arXlsx && (
      <div class="faltrad">
        <label class="kryss">
          <input
            type="checkbox"
            checked={options.bom}
            disabled={options.encoding !== 'utf-8'}
            onChange={(e) => uppdatera({ bom: (e.currentTarget as HTMLInputElement).checked })}
          />
          Skriv BOM (behövs för att Excel ska visa å ä ö rätt)
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={options.includeHeader}
            onChange={(e) =>
              uppdatera({ includeHeader: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          Ta med rubrikrad
        </label>
        <label class="kryss">
          <input
            type="checkbox"
            checked={options.protectFormulas}
            onChange={(e) =>
              uppdatera({ protectFormulas: (e.currentTarget as HTMLInputElement).checked })
            }
          />
          Skydda mot formler i Excel
        </label>
      </div>
      )}

      {arXlsx && (
        <div class="faltrad">
          <label class="kryss">
            <input
              type="checkbox"
              checked={options.includeHeader}
              onChange={(e) =>
                uppdatera({ includeHeader: (e.currentTarget as HTMLInputElement).checked })
              }
            />
            Ta med rubrikrad
          </label>
        </div>
      )}

      <div class="faltrad">
        <div class="falt">
          <span class="falt__etikett">Vilka rader</span>
          <Val
            varden={[
              { varde: 'view' as const, etikett: `Som visas nu (${formatCount(props.frame.view.length)})` },
              { varde: 'all' as const, etikett: `Alla (${formatCount(props.frame.rowCount)})` },
            ]}
            valt={options.rows}
            onValj={(v) => setOptions((o) => ({ ...o, rows: v }))}
          />
        </div>
        <div class="falt">
          <span class="falt__etikett">Vilka kolumner</span>
          <Val
            varden={[
              { varde: 'visible' as const, etikett: 'Bara synliga' },
              { varde: 'all' as const, etikett: 'Alla, även dolda' },
            ]}
            valt={options.columns}
            onValj={(v) => setOptions((o) => ({ ...o, columns: v }))}
          />
        </div>
        <div class="falt" style={{ flex: 1, minWidth: 200 }}>
          <span class="falt__etikett">Filnamn</span>
          <input
            value={filnamn}
            onInput={(e) => setFilnamn((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </div>

      {props.harFilter && options.rows === 'all' && (
        <Notis ton="varning">
          Du har ett aktivt filter men exporterar alla {formatCount(props.frame.rowCount)} rader.
          Är det avsiktligt?
        </Notis>
      )}

      {arXlsx && (
        <Notis ton="lyckat">
          Talkolumner skrivs som riktiga tal, så <strong>SUMMA</strong> fungerar direkt i Excel.
          Allt annat skrivs som text, vilket är det enda sättet att få{' '}
          <strong>01234</strong> att förbli <strong>01234</strong> — en CSV kan Excel alltid
          tolka om på egen hand.
        </Notis>
      )}

      {forlorade.length > 0 && !arXlsx && (
        <Notis ton="varning">
          Windows-1252 kan inte lagra {forlorade.slice(0, 6).join(' ')} — de ersätts med
          frågetecken. Välj UTF-8 om tecknen ska bevaras.
        </Notis>
      )}

      {!arXlsx && (
        <div class="falt">
          <span class="falt__etikett">Så här kommer första raden se ut</span>
          <pre class="fortab__ra">{exempelrad || '(inga rader att exportera)'}</pre>
        </div>
      )}
    </Modal>
  )
}

function foreslaFilnamn(namn: string): string {
  const utanSuffix = namn.replace(/\.(csv|txt|tsv|xlsx)$/i, '')
  return `${utanSuffix || 'export'}-bearbetad.xlsx`
}

function byteSuffix(namn: string, suffix: 'csv' | 'xlsx'): string {
  const utan = namn.replace(/\.(csv|txt|tsv|xlsx)$/i, '')
  return `${utan || 'export'}.${suffix}`
}
