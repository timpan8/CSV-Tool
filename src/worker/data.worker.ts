/// <reference lib="webworker" />
import { parseCsvBytes, parseCsvText } from '../core/csv/parse.js'
import { decodeBytes } from '../core/csv/decode.js'
import { inferAllTypes } from '../core/infer.js'
import { serializeFrame } from '../core/frame/serialize.js'
import { getCell } from '../core/frame/column.js'
import { frameFromRows, type XlsxCell, type XlsxOptions } from '../core/xlsx/read.js'
import type { ParsePreview, WorkerRequest, WorkerResponse } from './protocol.js'

const post = (message: WorkerResponse, transfer?: ArrayBuffer[]): void => {
  ;(self as unknown as Worker).postMessage(message, transfer ?? [])
}

/**
 * Läser bara så mycket av filen som behövs för förhandsvisningen.
 *
 * En förhandsvisning ska kännas omedelbar även på en 200 MB-fil, och den
 * behöver aldrig mer än de första raderna. Vi läser en bit i taget och
 * klipper vid sista hela raden, så att inte ett halvt fält visas.
 */
const PREVIEW_BYTES = 256 * 1024

function arExcel(file: File): boolean {
  return /\.xlsx$/i.test(file.name)
}

/**
 * Läser en arbetsbok.
 *
 * `read-excel-file/web-worker` är samma kod som webbversionen men utan att
 * själv starta en Worker — den är avsedd att köras inuti en egen, vilket är
 * precis vad vi gör. Biblioteket bygger på en ren JS-SAX-parser och behöver
 * alltså ingen DOM.
 */
async function lasArbetsbok(file: File): Promise<{ sheet: string; data: XlsxCell[][] }[]> {
  const { default: readXlsxFile } = await import('read-excel-file/web-worker')
  const blad = await readXlsxFile(file)
  return blad.map((b) => ({ sheet: b.sheet, data: b.data as XlsxCell[][] }))
}

function xlsxOptions(
  overrides: { headerRow?: number | null; trimFields?: boolean; skipEmptyRows?: boolean },
  xlsx: { sheet?: string; decimal: ',' | '.' } | undefined,
): XlsxOptions {
  return {
    sheet: xlsx?.sheet,
    decimal: xlsx?.decimal ?? ',',
    headerRow: overrides.headerRow !== undefined ? overrides.headerRow : 0,
    trimFields: overrides.trimFields ?? true,
    skipEmptyRows: overrides.skipEmptyRows ?? true,
  }
}

function valjBlad(
  blad: { sheet: string; data: XlsxCell[][] }[],
  onskat: string | undefined,
): { sheet: string; data: XlsxCell[][] } {
  return blad.find((b) => b.sheet === onskat) ?? blad[0] ?? { sheet: 'Blad1', data: [] }
}

async function handlePreview(req: Extract<WorkerRequest, { kind: 'preview' }>): Promise<void> {
  if (arExcel(req.file)) {
    const blad = await lasArbetsbok(req.file)
    const options = xlsxOptions(req.overrides, req.xlsx)
    const valt = valjBlad(blad, options.sheet)
    const frame = frameFromRows(valt.data, options, req.file.name)
    inferAllTypes(frame.columns)

    const rows: string[][] = []
    const gransen = Math.min(req.rows, frame.rowCount)
    for (let r = 0; r < gransen; r++) rows.push(frame.columns.map((c) => getCell(c, r)))

    post({
      kind: 'preview',
      id: req.id,
      preview: {
        headers: frame.columns.map((c) => c.name),
        rows,
        delimiter: '',
        encoding: 'xlsx',
        hadBom: false,
        newline: '',
        hadSepDirective: false,
        // En arbetsbok har inga tecken att avkoda, så det finns ingenting att
        // kontrollera. Att visa en grön bock vore att påstå mer än vi vet.
        check: { state: 'unknown' },
        totalRowsSeen: frame.rowCount,
        warnings: frame.meta.warnings.map((w) => ({
          kind: w.kind,
          message: w.message,
          count: w.count,
        })),
        sheets: blad.map((b) => b.sheet),
        valdSheet: valt.sheet,
      },
    })
    return
  }

  const slice = req.file.slice(0, PREVIEW_BYTES)
  const bytes = new Uint8Array(await slice.arrayBuffer())
  const decode = decodeBytes(bytes, req.overrides.encoding)

  // Klipp vid sista radslutet så att en avhuggen sista rad inte visas som data.
  let text = decode.text
  if (req.file.size > PREVIEW_BYTES) {
    const lastBreak = text.lastIndexOf('\n')
    if (lastBreak > 0) text = text.slice(0, lastBreak + 1)
  }

  const { frame, settings } = parseCsvText(text, decode, req.overrides)
  inferAllTypes(frame.columns)

  const rows: string[][] = []
  const limit = Math.min(req.rows, frame.rowCount)
  for (let r = 0; r < limit; r++) rows.push(frame.columns.map((c) => getCell(c, r)))

  const preview: ParsePreview = {
    headers: frame.columns.map((c) => c.name),
    rows,
    delimiter: settings.delimiter,
    encoding: settings.encoding,
    hadBom: settings.hadBom,
    newline: settings.newline,
    hadSepDirective: settings.hadSepDirective,
    check: decode.check,
    totalRowsSeen: frame.rowCount,
    warnings: frame.meta.warnings.map((w) => ({ kind: w.kind, message: w.message, count: w.count })),
  }
  post({ kind: 'preview', id: req.id, preview })
}

async function handleParse(req: Extract<WorkerRequest, { kind: 'parse' }>): Promise<void> {
  post({ kind: 'progress', id: req.id, phase: 'reading', done: 0, total: 1 })

  if (arExcel(req.file)) {
    const blad = await lasArbetsbok(req.file)
    const options = xlsxOptions(req.overrides, req.xlsx)
    const valt = valjBlad(blad, options.sheet)
    post({ kind: 'progress', id: req.id, phase: 'parsing', done: 0, total: 1 })
    const frame = frameFromRows(valt.data, options, req.fileName)
    // Bladets namn hjälper när man öppnat flera blad ur samma arbetsbok.
    if (blad.length > 1) frame.name = `${req.fileName} · ${valt.sheet}`
    inferAllTypes(frame.columns)
    const { frame: payload, transfer } = serializeFrame(frame)
    post({ kind: 'parsed', id: req.id, frame: payload }, transfer)
    return
  }

  const bytes = new Uint8Array(await req.file.arrayBuffer())

  post({ kind: 'progress', id: req.id, phase: 'parsing', done: 0, total: 1 })
  const { frame } = parseCsvBytes(bytes, req.overrides)
  frame.name = req.fileName
  frame.meta.fileName = req.fileName

  post({ kind: 'progress', id: req.id, phase: 'indexing', done: 0, total: 1 })
  inferAllTypes(frame.columns)

  const { frame: payload, transfer } = serializeFrame(frame)
  post({ kind: 'parsed', id: req.id, frame: payload }, transfer)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  const run = req.kind === 'preview' ? handlePreview(req) : handleParse(req)
  run.catch((error: unknown) => {
    post({
      kind: 'error',
      id: req.id,
      message: error instanceof Error ? error.message : String(error),
    })
  })
}
