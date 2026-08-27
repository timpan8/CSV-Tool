import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame, identityView } from '../../src/core/frame/frame.js'
import { Flag, type Frame } from '../../src/core/types.js'
import {
  antalKallor,
  kallnamn,
  malformAvKallor,
  malformAvMall,
  obeslutade,
  stapla,
  TOMT,
  type Kalla,
  type Malkolumn,
} from '../../src/core/ops/stapla.js'

function frameOf(namn: string, headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame(namn, columns, rows.length)
}

const alla = (f: Frame): Kalla => ({ frame: f, rader: identityView(f.rowCount) })

const KUNDER = frameOf(
  'kunder.csv',
  ['Namn', 'E-post', 'Ort'],
  [['Anna', 'anna@x.se', 'Malmö'], ['Bo', 'bo@x.se', 'Lund']],
)
const ORDER = frameOf(
  'order.csv',
  ['Name', 'mail', 'Summa'],
  [['Cia', 'cia@y.se', '100'], ['Dan', 'dan@y.se', '200'], ['Eva', 'eva@y.se', '300']],
)

/** Alla målkolumner beslutade, för test som inte handlar om besluten. */
function beslutade(kolumner: Malkolumn[]): Malkolumn[] {
  return kolumner.map((k) => ({ ...k, med: k.med ?? true }))
}

const plan = (kolumner: Malkolumn[], extra: Partial<Parameters<typeof stapla>[1]> = {}) => ({
  kolumner,
  kallkolumn: null,
  namn: 'Kombinerad',
  ...extra,
})

describe('malformAvKallor', () => {
  it('slår ihop kolumner som betyder samma sak', () => {
    const form = malformAvKallor([KUNDER, ORDER])
    // Namn ↔ Name och E-post ↔ mail blir en målkolumn var.
    expect(form.map((k) => k.namn)).toEqual(['Namn', 'E-post', 'Ort', 'Summa'])
    expect(antalKallor(form[0]!.hamtning)).toBe(2)
    expect(antalKallor(form[1]!.hamtning)).toBe(2)
  })

  it('kolumner som bara finns i vissa filer är obeslutade', () => {
    const form = malformAvKallor([KUNDER, ORDER])
    expect(form[0]!.med).toBe(true)
    // Ort finns bara i kundfilen, Summa bara i orderfilen.
    expect(obeslutade(form).map((k) => k.namn)).toEqual(['Ort', 'Summa'])
  })

  it('en ensam fil behöver inga beslut alls', () => {
    expect(obeslutade(malformAvKallor([KUNDER]))).toEqual([])
  })

  it('en källkolumn binds aldrig till två målkolumner', () => {
    const a = frameOf('a', ['E-post'], [['x']])
    const b = frameOf('b', ['mail', 'email'], [['y']])
    const form = malformAvKallor([a, b])
    const bundna = form.flatMap((k) =>
      k.hamtning.filter((h) => h.fran === 'kolumn').map((h) => (h as { colId: string }).colId),
    )
    expect(new Set(bundna).size).toBe(bundna.length)
  })
})

describe('stapla', () => {
  it('radantalet är summan av källornas', () => {
    const { frame, perKalla } = stapla(
      [alla(KUNDER), alla(ORDER)],
      plan(beslutade(malformAvKallor([KUNDER, ORDER]))),
    )
    expect(frame.rowCount).toBe(5)
    expect(perKalla).toEqual([2, 3])
  })

  it('värdena hamnar rätt över blockgränsen', () => {
    const { frame } = stapla(
      [alla(KUNDER), alla(ORDER)],
      plan(beslutade(malformAvKallor([KUNDER, ORDER]))),
    )
    const namn = frame.columns[0]!
    expect([0, 1, 2, 3, 4].map((r) => getCell(namn, r))).toEqual(['Anna', 'Bo', 'Cia', 'Dan', 'Eva'])
  })

  it('en kolumn som saknas i en fil blir tom där', () => {
    const { frame } = stapla(
      [alla(KUNDER), alla(ORDER)],
      plan(beslutade(malformAvKallor([KUNDER, ORDER]))),
    )
    const ort = frame.columns.find((c) => c.name === 'Ort')!
    expect([0, 1, 2, 3, 4].map((r) => getCell(ort, r))).toEqual(['Malmö', 'Lund', '', '', ''])
  })

  it('en kolumn som hoppas över finns inte i resultatet', () => {
    const form = malformAvKallor([KUNDER, ORDER]).map((k) =>
      k.namn === 'Summa' ? { ...k, med: false } : { ...k, med: k.med ?? true },
    )
    const { frame } = stapla([alla(KUNDER), alla(ORDER)], plan(form))
    expect(frame.columns.map((c) => c.name)).not.toContain('Summa')
  })

  it('en målkolumn ingen fil fyller rapporteras', () => {
    const form: Malkolumn[] = [{ namn: 'Land', hamtning: [TOMT, TOMT], med: true }]
    const { frame, ofyllda } = stapla([alla(KUNDER), alla(ORDER)], plan(form))
    expect(ofyllda).toEqual(['Land'])
    expect(getCell(frame.columns[0]!, 0)).toBe('')
  })

  it('källkolumnen visar vilken fil raden kom från', () => {
    const { frame } = stapla(
      [alla(KUNDER), alla(ORDER)],
      plan(beslutade(malformAvKallor([KUNDER, ORDER])), { kallkolumn: 'Källa' }),
    )
    const kalla = frame.columns.at(-1)!
    expect(kalla.name).toBe('Källa')
    expect([0, 1, 2].map((r) => getCell(kalla, r))).toEqual([
      'kunder.csv',
      'kunder.csv',
      'order.csv',
    ])
  })

  it('samma fil två gånger går att skilja åt', () => {
    // Radnumret är detsamma i båda blocken, så källkolumnen är det enda som
    // gör paret entydigt.
    expect(kallnamn([{ frame: KUNDER }, { frame: KUNDER }])).toEqual([
      'kunder.csv',
      'kunder.csv (2)',
    ])
  })

  it('målkolumner med samma namn görs unika', () => {
    const form: Malkolumn[] = [
      { namn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[0]!.id }], med: true },
      { namn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[1]!.id }], med: true },
    ]
    const { frame } = stapla([alla(KUNDER)], plan(form))
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Namn (2)'])
  })

  it('radnumret är källfilens egna', () => {
    const { frame } = stapla(
      [alla(KUNDER), alla(ORDER)],
      plan(beslutade(malformAvKallor([KUNDER, ORDER]))),
    )
    expect(Array.from(frame.sourceRow)).toEqual([1, 2, 1, 2, 3])
  })

  it('bara de rader man ber om följer med, i den ordningen', () => {
    const { frame } = stapla(
      [{ frame: ORDER, rader: [2, 0] }],
      plan(beslutade(malformAvKallor([ORDER]))),
    )
    expect(frame.rowCount).toBe(2)
    expect([0, 1].map((r) => getCell(frame.columns[0]!, r))).toEqual(['Eva', 'Cia'])
  })

  it('en kolumn som saknades i filen märks som utfylld, inte som tom', () => {
    // Skillnaden mellan "fil 2 hade kolumnen men cellen var tom" och "fil 2
    // hade ingen sådan kolumn" är hela poängen med att fråga per kolumn.
    const { frame } = stapla(
      [alla(KUNDER), alla(ORDER)],
      plan(beslutade(malformAvKallor([KUNDER, ORDER]))),
    )
    const ort = frame.columns.find((c) => c.name === 'Ort')!
    expect(ort.flags[0]).toBe(0)
    expect(ort.flags[2]).toBe(Flag.Padded)
  })

  it('ett urval drar inte med sig värden som inte är med i resultatet', () => {
    // inferType läser ordboken, inte raderna. Interneras hela källordboken
    // skulle bortfiltrerade värden vara med och bestämma resultatets typ.
    const f = frameOf('f', ['Blandat'], [['1'], ['2'], ['inte ett tal']])
    const { frame } = stapla(
      [{ frame: f, rader: [0, 1] }],
      plan(beslutade(malformAvKallor([f]))),
    )
    expect(frame.columns[0]!.dict).toEqual(['', '1', '2'])
    expect(frame.columns[0]!.type).toBe('number')
  })

  it('en kolumn som blev tom i hela resultatet rapporteras', () => {
    const f = frameOf('f', ['Land'], [[''], ['']])
    const { ofyllda } = stapla([alla(f)], plan(beslutade(malformAvKallor([f]))))
    expect(ofyllda).toEqual(['Land'])
  })

  it('en hämtningslista som är för kort glider inte', () => {
    // Vore listan positionellt fel skulle värden ur fil 2 hamna under fil 1.
    const form: Malkolumn[] = [
      { namn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[0]!.id }], med: true },
    ]
    const { frame } = stapla([alla(KUNDER), alla(ORDER)], plan(form))
    expect([0, 1, 2].map((r) => getCell(frame.columns[0]!, r))).toEqual(['Anna', 'Bo', ''])
  })

  it('flaggorna hör till cellen och följer med', () => {
    const a = frameOf('a', ['Namn'], [['Anna']])
    a.columns[0]!.flags[0] = Flag.UserEdited
    const { frame } = stapla([alla(a)], plan(beslutade(malformAvKallor([a]))))
    expect(frame.columns[0]!.flags[0]).toBe(Flag.UserEdited)
  })
})

describe('typen i resultatet', () => {
  function medTyp(namn: string, varden: string[], las?: 'text' | 'number'): Frame {
    const f = frameOf(namn, ['Postnr'], varden.map((v) => [v]))
    if (las) {
      f.columns[0]!.type = las
      f.columns[0]!.typeLocked = true
    }
    return f
  }

  it('tolkas om över det staplade datat', () => {
    // Fil 1 ser ut som tal, fil 2 gör det inte. Resultatet är inte tal.
    const a = medTyp('a', ['1', '2', '3'])
    const b = medTyp('b', ['ett', 'två', 'tre'])
    const { frame } = stapla([alla(a), alla(b)], plan(beslutade(malformAvKallor([a, b]))))
    expect(frame.columns[0]!.type).toBe('text')
  })

  it('en låsning som alla källor är eniga om ärvs', () => {
    // 01234 ska inte bli ett tal bara för att filerna staplats.
    const a = medTyp('a', ['01234'], 'text')
    const b = medTyp('b', ['05678'], 'text')
    const { frame } = stapla([alla(a), alla(b)], plan(beslutade(malformAvKallor([a, b]))))
    expect(frame.columns[0]!.typeLocked).toBe(true)
    expect(frame.columns[0]!.type).toBe('text')
  })

  it('motstridiga låsningar är ingen låsning', () => {
    const a = medTyp('a', ['1'], 'text')
    const b = medTyp('b', ['2'], 'number')
    const { frame } = stapla([alla(a), alla(b)], plan(beslutade(malformAvKallor([a, b]))))
    expect(frame.columns[0]!.typeLocked).toBe(false)
  })
})

describe('egenskaper', () => {
  it('varje cell i resultatet är samma sträng som i sin källa', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.string({ maxLength: 6 }), { minLength: 2, maxLength: 2 }), {
          maxLength: 12,
        }),
        fc.array(fc.array(fc.string({ maxLength: 6 }), { minLength: 2, maxLength: 2 }), {
          maxLength: 12,
        }),
        (a, b) => {
          const fa = frameOf('a', ['Namn', 'Ort'], a)
          const fb = frameOf('b', ['Name', 'City'], b)
          const kallor = [alla(fa), alla(fb)]
          const { frame } = stapla(kallor, plan(beslutade(malformAvKallor([fa, fb]))))

          expect(frame.rowCount).toBe(a.length + b.length)
          for (let k = 0; k < 2; k++) {
            const mal = frame.columns[k]!
            for (let r = 0; r < a.length; r++) {
              expect(getCell(mal, r)).toBe(getCell(fa.columns[k]!, r))
            }
            for (let r = 0; r < b.length; r++) {
              expect(getCell(mal, a.length + r)).toBe(getCell(fb.columns[k]!, r))
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('malformAvMall', () => {
  const MALL = frameOf(
    'mall.csv',
    ['Namn', 'E-post', 'Land'],
    [['Anna Karlsson', 'anna@x.se', 'Sverige']],
  )

  it('mallens rubriker blir målformen, i mallens ordning', () => {
    const form = malformAvMall(MALL, [KUNDER])
    expect(form.slice(0, 3).map((k) => k.namn)).toEqual(['Namn', 'E-post', 'Land'])
  })

  it('mallens kolumner behöver inga beslut — mallen är beslutet', () => {
    const form = malformAvMall(MALL, [KUNDER, ORDER])
    expect(form.slice(0, 3).every((k) => k.med === true)).toBe(true)
  })

  it('mallens exempelrad blir en ledtråd, inte data', () => {
    const form = malformAvMall(MALL, [KUNDER])
    expect(form[0]!.ledtrad).toBe('Anna Karlsson')
    // Mallen är aldrig en källa, så raden kan inte hamna i resultatet.
    const { frame } = stapla([alla(KUNDER)], plan(beslutade(form)))
    expect(frame.rowCount).toBe(KUNDER.rowCount)
  })

  it('hämtar ur källorna även när rubrikerna heter olika', () => {
    const form = malformAvMall(MALL, [KUNDER, ORDER])
    // Namn ↔ Name och E-post ↔ mail.
    expect(antalKallor(form[0]!.hamtning)).toBe(2)
    expect(antalKallor(form[1]!.hamtning)).toBe(2)
  })

  it('en mallkolumn ingen fil fyller blir en tom kolumn och rapporteras', () => {
    const form = malformAvMall(MALL, [KUNDER])
    expect(antalKallor(form[2]!.hamtning)).toBe(0)
    const { frame, ofyllda } = stapla([alla(KUNDER)], plan(beslutade(form)))
    expect(ofyllda).toContain('Land')
    expect(frame.columns.map((c) => c.name)).toContain('Land')
  })

  it('källkolumner mallen saknar läggs till obeslutade i stället för att kastas', () => {
    // Mallen får inte bli ett tyst filter — det är samma regel som för unionen.
    const form = malformAvMall(MALL, [KUNDER])
    expect(obeslutade(form).map((k) => k.namn)).toEqual(['Ort'])
  })
})
