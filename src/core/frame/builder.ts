import type { Column } from '../types.js'
import { createColumn } from './column.js'

/**
 * Bygger en kolumn rad för rad utan att först materialisera hela filen som
 * strängmatris. Arrayerna växer genom fördubbling, precis som en vanlig
 * lista, men i typade arrayer.
 *
 * Delas av CSV-parsern, som matar den rad för rad ur en strömmande läsning,
 * och av Excel-läsaren, som har alla rader på en gång.
 */
export class ColumnBuilder {
  dict: string[] = ['']
  dictIndex = new Map<string, number>([['', 0]])
  codes = new Uint32Array(1024)
  flags = new Uint8Array(1024)
  n = 0

  constructor(public name: string) {}

  private grow(): void {
    if (this.n < this.codes.length) return
    const codes = new Uint32Array(this.codes.length * 2)
    codes.set(this.codes)
    this.codes = codes
    const flags = new Uint8Array(this.flags.length * 2)
    flags.set(this.flags)
    this.flags = flags
  }

  push(value: string, flag = 0): void {
    this.grow()
    let code = this.dictIndex.get(value)
    if (code === undefined) {
      code = this.dict.length
      this.dict.push(value)
      this.dictIndex.set(value, code)
    }
    this.codes[this.n] = code
    this.flags[this.n] = flag
    this.n += 1
  }

  /** Fyller på tomma celler så att alla kolumner blir lika långa. */
  padTo(length: number, flag = 0): void {
    while (this.n < length) this.push('', flag)
  }

  finish(rowCount: number): Column {
    const col = createColumn(this.name, 0)
    col.dict = this.dict
    col.dictIndex = this.dictIndex
    col.codes = this.codes.subarray(0, rowCount).slice()
    col.flags = this.flags.subarray(0, rowCount).slice()
    return col
  }
}
