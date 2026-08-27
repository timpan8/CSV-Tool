import { describe, expect, it } from 'vitest'
import { createColumn, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import {
  STANDARDDELNING,
  delaVarde,
  inventeraDelning,
  korMall,
  tolkaMall,
  type Delning,
} from '../../src/core/ops/columns.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const dela = (value: string, inst: Partial<Delning> = {}) =>
  delaVarde(value, { ...STANDARDDELNING, ...inst })

describe('dela vid första', () => {
  it('delar namn i förnamn och resten', () => {
    expect(dela('Anna Karlsson')).toEqual(['Anna', 'Karlsson'])
    expect(dela('Anna Maria Karlsson')).toEqual(['Anna', 'Maria Karlsson'])
  })

  it('ger tom andra kolumn när avgränsaren saknas', () => {
    expect(dela('Anna')).toEqual(['Anna', ''])
  })
})

describe('dela vid sista', () => {
  it('lägger mellannamnen hos förnamnet', () => {
    expect(dela('Anna Maria Karlsson', { satt: 'sista' })).toEqual(['Anna Maria', 'Karlsson'])
    expect(dela('Anna Karlsson', { satt: 'sista' })).toEqual(['Anna', 'Karlsson'])
  })
})

describe('dela vid varje', () => {
  it('fördelar på så många kolumner som begärts', () => {
    expect(dela('a;b;c', { satt: 'avgransare', avgransare: ';', antal: 3 })).toEqual(['a', 'b', 'c'])
  })

  it('lägger överskottet i sista kolumnen i stället för att kasta det', () => {
    // Det som inte får plats får inte försvinna i tysthet.
    expect(dela('a;b;c;d', { satt: 'avgransare', avgransare: ';', antal: 2 })).toEqual([
      'a',
      'b;c;d',
    ])
  })

  it('fyller ut med tomma när värdet har färre delar', () => {
    expect(dela('a', { satt: 'avgransare', avgransare: ';', antal: 3 })).toEqual(['a', '', ''])
  })
})

describe('dela på position', () => {
  it('klipper på ett fast tecken', () => {
    expect(dela('12345', { satt: 'position', position: 3 })).toEqual(['123', '45'])
    expect(dela('12', { satt: 'position', position: 3 })).toEqual(['12', ''])
  })

  it('sätter inte ihop delarna igen med avgränsaren', () => {
    expect(dela('abcdef', { satt: 'position', position: 2, antal: 2 })).toEqual(['ab', 'cdef'])
  })
})

describe('trimning', () => {
  it('trimmar varje del som standard', () => {
    expect(dela('Anna ; Karlsson', { satt: 'avgransare', avgransare: ';' })).toEqual([
      'Anna',
      'Karlsson',
    ])
  })

  it('kan lämnas av', () => {
    expect(
      dela('Anna ; Karlsson', { satt: 'avgransare', avgransare: ';', trimma: false }),
    ).toEqual(['Anna ', ' Karlsson'])
  })
})

describe('tomma värden', () => {
  it('ger tomma delar och inte skräp', () => {
    expect(dela('')).toEqual(['', ''])
    expect(dela('   ')).toEqual(['', ''])
  })
})

describe('inventeraDelning', () => {
  it('räknar flest delar och värden utan avgränsare', () => {
    const inv = inventeraDelning(
      ['Anna Karlsson', 'Anna Maria Karlsson', 'Cher', ''],
      { ...STANDARDDELNING, satt: 'avgransare' },
    )
    expect(inv.flest).toBe(3)
    expect(inv.utanAvgransare).toBe(1)
    expect(inv.exempel?.fore).toBe('Anna Karlsson')
  })

  it('räknar celler när vikter skickas in', () => {
    const inv = inventeraDelning(['Cher', 'Anna Karlsson'], STANDARDDELNING, [6, 2])
    expect(inv.utanAvgransare).toBe(6)
  })
})

describe('tolkaMall', () => {
  const frame = frameOf(['Förnamn', 'Efternamn'], [['Anna', 'Karlsson']])

  it('delar upp text och platshållare', () => {
    const t = tolkaMall('{Förnamn} {Efternamn}', frame)
    expect(t.delar).toEqual([
      { typ: 'kolumn', namn: 'Förnamn' },
      { typ: 'text', varde: ' ' },
      { typ: 'kolumn', namn: 'Efternamn' },
    ])
    expect(t.anvanda).toEqual(['Förnamn', 'Efternamn'])
    expect(t.okanda).toEqual([])
  })

  it('rapporterar namn som inte finns i filen', () => {
    const t = tolkaMall('{Fornamn} {Efternamn}', frame)
    expect(t.okanda).toEqual(['Fornamn'])
    expect(t.anvanda).toEqual(['Efternamn'])
  })

  it('klarar text före och efter', () => {
    const t = tolkaMall('Hej {Förnamn}!', frame)
    expect(t.delar).toEqual([
      { typ: 'text', varde: 'Hej ' },
      { typ: 'kolumn', namn: 'Förnamn' },
      { typ: 'text', varde: '!' },
    ])
  })

  it('klarar en mall helt utan platshållare', () => {
    expect(tolkaMall('bara text', frame).delar).toEqual([{ typ: 'text', varde: 'bara text' }])
  })

  it('nollställer sig mellan anrop', () => {
    // Ett globalt regex som återanvänds hoppar över varannan mall.
    expect(tolkaMall('{Förnamn}', frame).anvanda).toEqual(['Förnamn'])
    expect(tolkaMall('{Förnamn}', frame).anvanda).toEqual(['Förnamn'])
  })
})

describe('korMall', () => {
  const frame = frameOf(
    ['Förnamn', 'Efternamn', 'Ort'],
    [
      ['Anna', 'Karlsson', 'Lund'],
      ['Cher', '', 'Malmö'],
    ],
  )

  it('sätter ihop värdena', () => {
    const { delar } = tolkaMall('{Förnamn} {Efternamn}, {Ort}', frame)
    expect(korMall(frame, 0, delar)).toBe('Anna Karlsson, Lund')
  })

  it('städar bort luckan efter ett tomt värde', () => {
    // "Cher , Malmö" med dubbelt mellanslag förstör varje senare matchning.
    const { delar } = tolkaMall('{Förnamn} {Efternamn}', frame)
    expect(korMall(frame, 1, delar)).toBe('Cher')
  })

  it('kan lämna luckorna kvar när man vill det', () => {
    const { delar } = tolkaMall('{Förnamn} {Efternamn}', frame)
    expect(korMall(frame, 1, delar, { stadaLuckor: false })).toBe('Cher ')
  })

  it('ger tomt för ett kolumnnamn som inte finns', () => {
    const { delar } = tolkaMall('{Saknas}', frame)
    expect(korMall(frame, 0, delar)).toBe('')
  })
})
