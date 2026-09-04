import type { Column, ColumnType, Frame, FrameMeta } from '../types.js'
import { identityView } from './frame.js'

/**
 * Ramen i ett skick som går att skicka mellan huvudtråd och Worker.
 *
 * Poängen med den kolumnbaserade ordboksmodellen visar sig här: `codes` och
 * `flags` är typade arrayer vars buffertar kan *överföras* utan kopiering, och
 * det enda som faktiskt klonas är ordböckerna — alltså de unika värdena, inte
 * en sträng per cell. En kolumn med 100 000 rader och 300 orter kostar 300
 * strängar att skicka över, inte 100 000.
 */
export interface SerializedColumn {
  id: string
  name: string
  type: ColumnType
  typeLocked: boolean
  hidden: boolean
  width: number | null
  dict: string[]
  codes: ArrayBuffer
  flags: ArrayBuffer
  /**
   * Kolumnens egen sorteringsordning, om den har en.
   *
   * Valfri med flit: en rad sparad före fältet fanns läses tillbaka med
   * `undefined`, alltså bokstavsordning som förut, och `RADVERSION` behövde
   * därför inte höjas — en höjning kastar allt användaren har sparat.
   */
  sortordning?: readonly string[]
}

export interface SerializedFrame {
  id: string
  name: string
  rowCount: number
  columns: SerializedColumn[]
  sourceRow: ArrayBuffer
  meta: FrameMeta
}

export interface SerializedPayload {
  frame: SerializedFrame
  /** Buffertar att skicka som transferables, så de inte kopieras. */
  transfer: ArrayBuffer[]
}

function bufferOf(view: Uint32Array | Uint8Array): ArrayBuffer {
  // En subarray delar buffert med sitt original. Skicka bara den del som
  // faktiskt hör till kolumnen, annars överförs skräp — eller värre, en
  // buffert som ägaren fortfarande använder.
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer as ArrayBuffer
  }
  return view.slice().buffer as ArrayBuffer
}

export function serializeFrame(frame: Frame): SerializedPayload {
  const transfer: ArrayBuffer[] = []
  const columns = frame.columns.map((col): SerializedColumn => {
    const codes = bufferOf(col.codes)
    const flags = bufferOf(col.flags)
    transfer.push(codes, flags)
    return {
      id: col.id,
      name: col.name,
      type: col.type,
      typeLocked: col.typeLocked,
      hidden: col.hidden,
      width: col.width,
      dict: col.dict,
      codes,
      flags,
      ...(col.sortordning ? { sortordning: col.sortordning } : {}),
    }
  })
  const sourceRow = bufferOf(frame.sourceRow)
  transfer.push(sourceRow)
  return {
    frame: {
      id: frame.id,
      name: frame.name,
      rowCount: frame.rowCount,
      columns,
      sourceRow,
      meta: frame.meta,
    },
    transfer,
  }
}

export function deserializeFrame(payload: SerializedFrame): Frame {
  const columns: Column[] = payload.columns.map((c) => {
    const dictIndex = new Map<string, number>()
    for (let i = 0; i < c.dict.length; i++) dictIndex.set(c.dict[i]!, i)
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      typeLocked: c.typeLocked,
      hidden: c.hidden,
      width: c.width,
      dict: c.dict,
      codes: new Uint32Array(c.codes),
      flags: new Uint8Array(c.flags),
      dictIndex,
      ...(c.sortordning ? { sortordning: c.sortordning } : {}),
    }
  })
  return {
    id: payload.id,
    name: payload.name,
    columns,
    rowCount: payload.rowCount,
    // Vyn är härledd och skickas aldrig med — den räknas om av mottagaren.
    view: identityView(payload.rowCount),
    sourceRow: new Uint32Array(payload.sourceRow),
    meta: payload.meta,
  }
}
