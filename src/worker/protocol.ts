import type { SerializedFrame } from '../core/frame/serialize.js'
import type { ParseOverrides } from '../core/csv/parse.js'
import type { EncodingCheck } from '../core/csv/decode.js'

export type JobId = number

export interface ParseRequest {
  kind: 'parse'
  id: JobId
  file: File
  fileName: string
  overrides: ParseOverrides
  /** Sätts för .xlsx: valt blad och hur tal skrivs om. */
  xlsx?: { sheet?: string; decimal: ',' | '.' }
}

export interface PreviewRequest {
  kind: 'preview'
  id: JobId
  file: File
  overrides: ParseOverrides
  /** Antal rader att visa i importdialogen. */
  rows: number
  xlsx?: { sheet?: string; decimal: ',' | '.' }
}

export type WorkerRequest = ParseRequest | PreviewRequest

export interface ParsePreview {
  headers: string[]
  rows: string[][]
  delimiter: string
  encoding: string
  hadBom: boolean
  newline: string
  hadSepDirective: boolean
  check: EncodingCheck
  totalRowsSeen: number
  warnings: { kind: string; message: string; count?: number }[]
  /** Bladen i arbetsboken. Tom lista för CSV. */
  sheets?: string[]
  valdSheet?: string
}

export type WorkerResponse =
  | { kind: 'progress'; id: JobId; phase: string; done: number; total: number }
  | { kind: 'parsed'; id: JobId; frame: SerializedFrame }
  | { kind: 'preview'; id: JobId; preview: ParsePreview }
  | { kind: 'error'; id: JobId; message: string }
