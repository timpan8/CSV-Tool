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
}

export interface PreviewRequest {
  kind: 'preview'
  id: JobId
  file: File
  overrides: ParseOverrides
  /** Antal rader att visa i importdialogen. */
  rows: number
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
}

export type WorkerResponse =
  | { kind: 'progress'; id: JobId; phase: string; done: number; total: number }
  | { kind: 'parsed'; id: JobId; frame: SerializedFrame }
  | { kind: 'preview'; id: JobId; preview: ParsePreview }
  | { kind: 'error'; id: JobId; message: string }
