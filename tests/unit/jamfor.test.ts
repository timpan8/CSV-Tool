import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import {
  JAMFORTYPER,
  UTFALLSORDNING,
  Utfall,
  jamfor,
  jamforPar,
  utfallskolumn,
  type Jamforpar,
  type Jamfortyp,
} from '../../src/core/ops/jamfor.js'
import { sorteraRader } from '../../src/core/ops/sort.js'

function frameOf(namn: string, headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame(namn, columns, rows.length)
}

const par = (v: Frame, h: Frame, vKol: number, hKol: number, typ: Jamfortyp = 'oberoende'): Jamforpar => ({
  vansterColId: v.columns[vKol]!.id,
  hogerColId: h.columns[hKol]!.id,
  typ,
})

const koder = (u: Uint8Array) => Array.from(u)

describe('rad mot rad', () => {
  it('ställer rad i mot rad i och skiljer lika, olika, saknas och båda tomma', () => {
    const v = frameOf('v', ['Namn'], [['Anna'], ['Bo'], [''], ['Eva']])
    const h = frameOf('h', ['Name'], [['anna'], ['Bob'], ['']])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'radMotRad')!
    expect(koder(r.vanster.utfall)).toEqual([Utfall.lika, Utfall.skiljer, Utfall.badaTomma, Utfall.saknas])
    expect(koder(r.hoger.utfall)).toEqual([Utfall.lika, Utfall.skiljer, Utfall.badaTomma])
    expect(r.vanster.antal[Utfall.lika]).toBe(1)
    expect(r.vanster.antal[Utfall.saknas]).toBe(1)
    expect(r.hoger.antal[Utfall.saknas]).toBe(0)
    expect(r.vanster.traffar).toBeNull()
  })

  it('den längre högersidan får saknas på sina extra rader', () => {
    const v = frameOf('v', ['A'], [['x']])
    const h = frameOf('h', ['A'], [['x'], ['y'], ['z']])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'radMotRad')!
    expect(koder(r.hoger.utfall)).toEqual([Utfall.lika, Utfall.saknas, Utfall.saknas])
    expect(r.hoger.antal[Utfall.saknas]).toBe(2)
  })

  it('följer vyn, inte filen — rader utanför vyn förblir ojämförda', () => {
    const v = frameOf('v', ['A'], [['b'], ['a'], ['c']])
    const h = frameOf('h', ['A'], [['a'], ['b']])
    // Vänster visar bara rad 1 och 0, i den ordningen: a, b.
    v.view = Uint32Array.from([1, 0])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'radMotRad')!
    expect(koder(r.vanster.utfall)).toEqual([Utfall.lika, Utfall.lika, Utfall.ejJamford])
    expect(r.vanster.antal[Utfall.lika]).toBe(2)
  })

  it('normaliserar per typ', () => {
    const v = frameOf('v', ['A'], [['Öberg'], ['556677-8899']])
    const h = frameOf('h', ['A'], [['oberg'], ['5566778899']])
    const exakt = jamforPar(v, h, par(v, h, 0, 0, 'exakt'), 'radMotRad')!
    expect(koder(exakt.vanster.utfall)).toEqual([Utfall.skiljer, Utfall.skiljer])
    const accent = jamforPar(v, h, par(v, h, 0, 0, 'accentoberoende'), 'radMotRad')!
    expect(koder(accent.vanster.utfall)).toEqual([Utfall.lika, Utfall.skiljer])
    const siffror = jamforPar(v, h, par(v, h, 0, 0, 'siffror'), 'radMotRad')!
    expect(koder(siffror.vanster.utfall)).toEqual([Utfall.badaTomma, Utfall.lika])
  })

  it('fungerar med samma ram på båda sidor — kolumn A mot kolumn C', () => {
    const f = frameOf('f', ['A', 'B', 'C'], [['x', '1', 'x'], ['y', '2', 'z']])
    const r = jamforPar(f, f, { vansterColId: f.columns[0]!.id, hogerColId: f.columns[2]!.id, typ: 'oberoende' }, 'radMotRad')!
    expect(koder(r.vanster.utfall)).toEqual([Utfall.lika, Utfall.skiljer])
    expect(koder(r.hoger.utfall)).toEqual([Utfall.lika, Utfall.skiljer])
  })

  it('identiska ramar ger bara lika eller båda tomma', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('a', 'B', ' a', '', 'ö'), { minLength: 1, maxLength: 30 }), (varden) => {
        const v = frameOf('v', ['A'], varden.map((x) => [x]))
        const h = frameOf('h', ['A'], varden.map((x) => [x]))
        const r = jamforPar(v, h, par(v, h, 0, 0, 'exakt'), 'radMotRad')!
        for (const u of r.vanster.utfall) expect([Utfall.lika, Utfall.badaTomma]).toContain(u)
        expect(r.vanster.antal[Utfall.skiljer] + r.vanster.antal[Utfall.saknas]).toBe(0)
      }),
    )
  })
})

describe('finns någonstans', () => {
  it('letar upp värdet var som helst, räknar träffarna och lämnar tomma som tomma', () => {
    const v = frameOf('v', ['Ort'], [['Malmö'], ['Lund'], [''], ['malmö']])
    const h = frameOf('h', ['Stad'], [['Ystad'], ['MALMÖ'], ['Malmö']])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'finnsNagonstans')!
    expect(koder(r.vanster.utfall)).toEqual([Utfall.lika, Utfall.saknas, Utfall.tom, Utfall.lika])
    expect(Array.from(r.vanster.traffar!)).toEqual([2, 0, 0, 2])
    // Åt andra hållet, så att högerfliken också kan färgas.
    expect(koder(r.hoger.utfall)).toEqual([Utfall.saknas, Utfall.lika, Utfall.lika])
    expect(Array.from(r.hoger.traffar!)).toEqual([0, 2, 2])
    expect(r.vanster.antal[Utfall.lika]).toBe(2)
    expect(r.vanster.antal[Utfall.tom]).toBe(1)
  })

  it('går på vyn: bortfiltrerade rader räknas inte, men uppslaget ser hela den andra kolumnen', () => {
    const v = frameOf('v', ['A'], [['x'], ['y']])
    const h = frameOf('h', ['A'], [['y'], ['x']])
    h.view = Uint32Array.from([0])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'finnsNagonstans')!
    // Uppslaget räknar på ordboken, alltså hela filen: x finns i h.
    expect(koder(r.vanster.utfall)).toEqual([Utfall.lika, Utfall.lika])
    expect(koder(r.hoger.utfall)).toEqual([Utfall.lika, Utfall.ejJamford])
  })
})

describe('flera par', () => {
  it('bedöms oberoende av varandra, och par med borttagna kolumner hoppas över', () => {
    const v = frameOf('v', ['Namn', 'Ort'], [['Anna', 'Lund'], ['Bo', 'Ystad']])
    const h = frameOf('h', ['Namn', 'Ort'], [['Anna', 'Malmö'], ['Bo', 'Ystad']])
    const r = jamfor(v, h, [par(v, h, 0, 0), par(v, h, 1, 1), { vansterColId: 'finns-inte', hogerColId: 'x', typ: 'exakt' }], 'radMotRad')
    expect(r).toHaveLength(2)
    expect(koder(r[0]!.vanster.utfall)).toEqual([Utfall.lika, Utfall.lika])
    expect(koder(r[1]!.vanster.utfall)).toEqual([Utfall.skiljer, Utfall.lika])
  })

  it('erbjuder bara de typer som läser en kolumn per sida', () => {
    expect(JAMFORTYPER.map((t) => t.typ)).toEqual(['oberoende', 'exakt', 'accentoberoende', 'siffror'])
  })
})

describe('utfallskolumnen', () => {
  it('skriver utfallet som text, med egen ordning som lägger lika först', () => {
    const v = frameOf('v', ['A'], [['x'], ['y'], [''], ['w'], ['q']])
    const h = frameOf('h', ['A'], [['z'], ['y'], [''], ['w']])
    v.view = Uint32Array.from([0, 1, 2, 3])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'radMotRad')!
    const col = utfallskolumn('Jämförelse', r.vanster)
    const texter = Array.from({ length: 5 }, (_, i) => getCell(col, i))
    expect(texter).toEqual(['skiljer sig', 'lika', 'båda tomma', 'lika', ''])
    expect(col.typeLocked).toBe(true)
    expect(col.sortordning).toBe(UTFALLSORDNING)

    const frame = createFrame('t', [col], 5)
    const ordning = Array.from(sorteraRader(frame, [{ colId: col.id, riktning: 'stigande' }]))
    expect(ordning.map((i) => texter[i])).toEqual(['lika', 'lika', 'båda tomma', 'skiljer sig', ''])
  })

  it('kan skriva antalet träffar i uppslagsläget', () => {
    const v = frameOf('v', ['A'], [['x'], ['y']])
    const h = frameOf('h', ['A'], [['x'], ['x'], ['q']])
    const r = jamforPar(v, h, par(v, h, 0, 0), 'finnsNagonstans')!
    const col = utfallskolumn('J', r.vanster, true)
    expect([getCell(col, 0), getCell(col, 1)]).toEqual(['lika (2)', 'saknas'])
  })
})
