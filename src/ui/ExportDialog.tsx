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
  { varde: 'excel', etikett: 'Excel-vänlig', titel: 'Semikolon, CRLF och UTF-8 med BOM. Öppnas rätt med dubbelklick i svenskt Excel.' },
  { varde: 'standard', etikett: 'Komma + UTF-8', titel: 'Internationell standard. Det de flesta system förväntar sig vid import.' },
  { varde: 'eget', etikett: 'Eget', titel: 'Ställ in varje val själv.' },
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
  const [profil, setProfil] = useState<Profil>('excel')
  const [options, setOptions] = useState<ExportOptions>({
    ...EXCEL_FRIENDLY,
    rows: props.harFilter ? 'view' : 'all',
  })
  const [filnamn, setFilnamn] = useState(() => foreslaFilnamn(props.frame.name))

  const valjProfil = (p: Profil) => {
    setProfil(p)
    if (p === 'excel') setOptions((o) => ({ ...o, ...EXCEL_FRIENDLY, rows: o.rows, columns: o.columns }))
    if (p === 'standard') setOptions((o) => ({ ...o, ...STANDARD_CSV, rows: o.rows, columns: o.columns }))
  }

  const uppdatera = (delta: Partial<ExportOptions>) => {
    setProfil('eget')
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

  const spara = () => {
    const { bytes } = encodeExport(stringifyCsv(props.frame, options), options)
    // Blob-URL i stället för data: — en stor fil får inte plats i en URL.
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filnamn.endsWith('.csv') ? filnamn : `${filnamn}.csv`
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
          <button class="knapp knapp--primar" onClick={spara}>
            Ladda ner
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Format</span>
        <Val varden={PROFILER} valt={profil} onValj={valjProfil} />
      </div>

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

      {forlorade.length > 0 && (
        <Notis ton="varning">
          Windows-1252 kan inte lagra {forlorade.slice(0, 6).join(' ')} — de ersätts med
          frågetecken. Välj UTF-8 om tecknen ska bevaras.
        </Notis>
      )}

      <div class="falt">
        <span class="falt__etikett">Så här kommer första raden se ut</span>
        <pre class="fortab__ra">{exempelrad || '(inga rader att exportera)'}</pre>
      </div>
    </Modal>
  )
}

function foreslaFilnamn(namn: string): string {
  const utanSuffix = namn.replace(/\.(csv|txt|tsv|xlsx)$/i, '')
  return `${utanSuffix || 'export'}-bearbetad.csv`
}
