import { describe, expect, it } from 'vitest'
import { createColumn, intern, mapColumnValues } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { deserializeFrame, serializeFrame } from '../../src/core/frame/serialize.js'
import type { Frame, Kolumnregel } from '../../src/core/types.js'
import {
  dopOmIRegel,
  mallavtryck,
  regelavtryck,
  regelnsMallar,
  mallensKallor,
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

const bas = () =>
  frameOf(
    ['Namn', 'Ort'],
    [
      ['Anna ', 'Lund'],
      ['Bo', 'Malmö'],
      ['Cia', 'Kiruna'],
    ],
  )

const regel = (over: Partial<Kolumnregel> = {}): Kolumnregel => ({
  typ: 'mall',
  mall: "('{Namn}'),",
  stadaLuckor: true,
  kallor: ['Namn'],
  avtryck: 0,
  ...over,
})

describe('mallavtryck', () => {
  it('ändras när en källkolumns värde ändras', () => {
    const f = bas()
    const fore = mallavtryck(f, ['Namn'])
    f.columns[0]!.codes[1] = intern(f.columns[0]!, 'Bosse')
    expect(mallavtryck(f, ['Namn'])).not.toBe(fore)
  })

  it('ändras inte när en kolumn mallen inte läser ändras', () => {
    const f = bas()
    const fore = mallavtryck(f, ['Namn'])
    f.columns[1]!.codes[0] = intern(f.columns[1]!, 'Ystad')
    expect(mallavtryck(f, ['Namn'])).toBe(fore)
  })

  it('ändras när en källkolumn städas trots att koderna står kvar', () => {
    // Det här är skälet till att ordboken hashas och inte bara koderna:
    // `mapColumnValues` bygger om ordboken i samma ordning, så en transform
    // som inte slår ihop två värden lämnar varje kod orörd.
    const f = bas()
    const fore = mallavtryck(f, ['Namn'])
    const koderFore = Array.from(f.columns[0]!.codes)
    mapColumnValues(f.columns[0]!, (v) => v.trim())
    expect(Array.from(f.columns[0]!.codes)).toEqual(koderFore)
    expect(mallavtryck(f, ['Namn'])).not.toBe(fore)
  })

  it('ändras när källkolumnen byter namn', () => {
    const f = bas()
    const fore = mallavtryck(f, ['Namn'])
    f.columns[0]!.name = 'Kund'
    expect(mallavtryck(f, ['Namn'])).not.toBe(fore)
  })

  it('ändras när källkolumnen tas bort', () => {
    const f = bas()
    const fore = mallavtryck(f, ['Namn'])
    f.columns.splice(0, 1)
    expect(mallavtryck(f, ['Namn'])).not.toBe(fore)
  })

  it('ändras när radantalet ändras', () => {
    const f = bas()
    const fore = mallavtryck(f, ['Namn'])
    const utan = { ...f, rowCount: 2 }
    expect(mallavtryck(utan, ['Namn'])).not.toBe(fore)
  })
})

describe('regelavtryck', () => {
  it('bryr sig inte om ordningen när regeln saknar undantag', () => {
    const f = bas()
    const r = regel()
    const vand: Frame = { ...f, view: Uint32Array.from([2, 1, 0]) }
    expect(regelavtryck(vand, r)).toBe(regelavtryck(f, r))
  })

  it('ändras när vyns sista rad byts och regeln har ett undantag', () => {
    const f = bas()
    const r = regel({ sista: "('{Namn}')" })
    const vand: Frame = { ...f, view: Uint32Array.from([2, 1, 0]) }
    expect(regelavtryck(vand, r)).not.toBe(regelavtryck(f, r))
  })

  it('ändras inte när bara mitten sorteras om', () => {
    // Bara första och sista raden kan byta värde. En varning som kommer när
    // ingenting blivit fel lär en att strunta i varningarna.
    const r = regel({ sista: "('{Namn}')" })
    const f = frameOf(['Namn'], [['a'], ['b'], ['c'], ['d']])
    const rak: Frame = { ...f, view: Uint32Array.from([0, 1, 2, 3]) }
    const bytMitt: Frame = { ...f, view: Uint32Array.from([0, 2, 1, 3]) }
    expect(regelavtryck(bytMitt, r)).toBe(regelavtryck(rak, r))
  })
})

describe('regelnsMallar', () => {
  it('rapporterar okända namn ur alla tre mallarna', () => {
    const f = bas()
    const { okanda } = regelnsMallar(f, regel({ sista: '{Saknas}', forsta: '{Borta}' }))
    expect(okanda.sort()).toEqual(['Borta', 'Saknas'])
  })

  it('ger undantagen som null när de inte är satta', () => {
    const { mallar } = regelnsMallar(bas(), regel())
    expect(mallar.forsta).toBeNull()
    expect(mallar.sista).toBeNull()
  })
})

describe('mallensKallor', () => {
  it('samlar namnen ur alla mallarna utan dubbletter', () => {
    const f = bas()
    expect(mallensKallor(f, '{Namn} {Ort}', '{Namn}', undefined)).toEqual(['Namn', 'Ort'])
  })

  it('tar inte med namn som inte finns i filen', () => {
    expect(mallensKallor(bas(), '{Namn} {Saknas}')).toEqual(['Namn'])
  })
})

describe('dopOmIRegel', () => {
  it('skriver om namnet i alla tre mallarna', () => {
    const r = regel({ forsta: '-- {Namn}', sista: "('{Namn}')" })
    const ny = dopOmIRegel(r, 'Namn', 'Kund')
    expect(ny).not.toBeNull()
    expect(ny!.mall).toBe("('{Kund}'),")
    expect(ny!.forsta).toBe('-- {Kund}')
    expect(ny!.sista).toBe("('{Kund}')")
    expect(ny!.kallor).toEqual(['Kund'])
  })

  it('lämnar regeln i fred när den inte nämner kolumnen', () => {
    expect(dopOmIRegel(regel(), 'Ort', 'Stad')).toBeNull()
  })

  it('rör inte andra platshållare', () => {
    const r = regel({ mall: '{Namn} i {Ort}', kallor: ['Namn', 'Ort'] })
    expect(dopOmIRegel(r, 'Ort', 'Stad')!.mall).toBe('{Namn} i {Stad}')
  })
})

describe('regeln överlever en omladdning', () => {
  it('följer med genom serialiseringen', () => {
    const f = bas()
    f.columns[1]!.regel = regel({ sista: "('{Namn}')", avtryck: 12345 })
    const tillbaka = deserializeFrame(serializeFrame(f).frame)
    expect(tillbaka.columns[1]!.regel).toEqual({
      typ: 'mall',
      mall: "('{Namn}'),",
      sista: "('{Namn}')",
      stadaLuckor: true,
      kallor: ['Namn'],
      avtryck: 12345,
    })
  })

  it('läser en kolumn utan regel som tidigare', () => {
    const tillbaka = deserializeFrame(serializeFrame(bas()).frame)
    expect(tillbaka.columns[0]!.regel).toBeUndefined()
  })

  it('ser identiskt data som färskt efter en omladdning', () => {
    const f = bas()
    const r = regel()
    f.columns[1]!.regel = { ...r, avtryck: regelavtryck(f, r) }
    const tillbaka = deserializeFrame(serializeFrame(f).frame)
    expect(regelavtryck(tillbaka, tillbaka.columns[1]!.regel!)).toBe(
      tillbaka.columns[1]!.regel!.avtryck,
    )
  })
})
