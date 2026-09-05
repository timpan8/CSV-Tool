import { describe, expect, it } from 'vitest'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import { delaTillRader, inventeraRadelning, type Radelning } from '../../src/core/ops/rader.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const kolumnvarden = (frame: Frame, index: number) =>
  Array.from({ length: frame.rowCount }, (_, r) => getCell(frame.columns[index]!, r))

function inst(frame: Frame, over: Partial<Radelning> = {}): Radelning {
  return {
    colId: frame.columns[1]!.id,
    avgransare: ';',
    trimma: true,
    hoppaTomma: true,
    namn: 'Delad',
    ...over,
  }
}

describe('delaTillRader', () => {
  const frame = frameOf(
    ['Avdelning', 'Mottagare'],
    [
      ['Sälj', 'a <x@y>; b <z@w>; c <q@r>'],
      ['Ekonomi', 'd <e@f>'],
    ],
  )

  it('ger en rad per del', () => {
    const { frame: ut } = delaTillRader(frame, inst(frame))
    expect(ut.rowCount).toBe(4)
    expect(kolumnvarden(ut, 1)).toEqual(['a <x@y>', 'b <z@w>', 'c <q@r>', 'd <e@f>'])
  })

  it('kopierar övriga kolumners värden ner på de nya raderna', () => {
    const { frame: ut } = delaTillRader(frame, inst(frame))
    expect(kolumnvarden(ut, 0)).toEqual(['Sälj', 'Sälj', 'Sälj', 'Ekonomi'])
  })

  it('låter en cell utan avgränsare ge en oförändrad rad', () => {
    const { frame: ut, odelade } = delaTillRader(frame, inst(frame))
    expect(odelade).toBe(1)
    expect(getCell(ut.columns[1]!, 3)).toBe('d <e@f>')
  })

  it('räknar rader in och ut före körningen', () => {
    const inv = inventeraRadelning(frame, inst(frame))
    expect(inv.kalla).toBe(2)
    expect(inv.resultat).toBe(4)
    expect(inv.flest).toBe(3)
    expect(inv.exempel[0]).toEqual({
      fore: 'a <x@y>; b <z@w>; c <q@r>',
      efter: ['a <x@y>', 'b <z@w>', 'c <q@r>'],
    })
  })

  it('hoppar över den tomma delen efter en avslutande avgränsare', () => {
    const f = frameOf(['A', 'B'], [['x', 'a; b;']])
    expect(delaTillRader(f, inst(f)).frame.rowCount).toBe(2)
    expect(delaTillRader(f, inst(f, { hoppaTomma: false })).frame.rowCount).toBe(3)
  })

  it('låter en tom cell ge en rad, inte noll', () => {
    const f = frameOf(['A', 'B'], [['x', ''], ['y', 'a; b']])
    const { frame: ut } = delaTillRader(f, inst(f))
    expect(ut.rowCount).toBe(3)
    expect(kolumnvarden(ut, 0)).toEqual(['x', 'y', 'y'])
  })

  it('låter en cell med bara avgränsare ge en rad, inte noll', () => {
    const f = frameOf(['A', 'B'], [['x', ';;']])
    const { frame: ut } = delaTillRader(f, inst(f))
    expect(ut.rowCount).toBe(1)
    expect(kolumnvarden(ut, 0)).toEqual(['x'])
  })

  it('går på det du ser och inte på hela filen', () => {
    const filtrerad: Frame = { ...frame, view: Uint32Array.from([1]) }
    const { frame: ut, kalla } = delaTillRader(filtrerad, inst(frame))
    expect(kalla).toBe(1)
    expect(ut.rowCount).toBe(1)
    expect(kolumnvarden(ut, 0)).toEqual(['Ekonomi'])
  })

  it('följer vyns ordning', () => {
    const vand: Frame = { ...frame, view: Uint32Array.from([1, 0]) }
    const { frame: ut } = delaTillRader(vand, inst(frame))
    expect(kolumnvarden(ut, 0)).toEqual(['Ekonomi', 'Sälj', 'Sälj', 'Sälj'])
  })

  it('låter varje ny rad ärva källradens radnummer', () => {
    const { frame: ut } = delaTillRader(frame, inst(frame))
    expect(Array.from(ut.sourceRow)).toEqual([1, 1, 1, 2])
  })

  it('behåller en låst kolumntyp', () => {
    const f = frameOf(['Kod', 'B'], [['007', 'a; b']])
    f.columns[0]!.type = 'text'
    f.columns[0]!.typeLocked = true
    const { frame: ut } = delaTillRader(f, inst(f))
    expect(ut.columns[0]!.type).toBe('text')
    expect(getCell(ut.columns[0]!, 1)).toBe('007')
  })

  it('rör aldrig originalet', () => {
    delaTillRader(frame, inst(frame))
    expect(frame.rowCount).toBe(2)
    expect(kolumnvarden(frame, 1)[0]).toBe('a <x@y>; b <z@w>; c <q@r>')
  })

  it('döper fliken efter källan när namnet är tomt', () => {
    const { frame: ut } = delaTillRader(frame, inst(frame, { namn: '  ' }))
    expect(ut.name).toBe('test delad')
  })
})
