import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame, deleteRows, identityView, uniqueColumnName } from '../../src/core/frame/frame.js'
import { Flag, type Frame } from '../../src/core/types.js'
import {
  antalKallor,
  kallnamn,
  malformAvKallor,
  malformAvMall,
  krockandeKallor,
  medBevaradeBeslut,
  obeslutade,
  ofylldaFore,
  slaIhopMal,
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
    const form: Malkolumn[] = [{ namn: 'Land', forslagsnamn: 'Land', hamtning: [TOMT, TOMT], med: true }]
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
      { namn: 'Namn', forslagsnamn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[0]!.id }], med: true },
      { namn: 'Namn', forslagsnamn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[1]!.id }], med: true },
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
      { namn: 'Namn', forslagsnamn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[0]!.id }], med: true },
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

describe('standardvärde', () => {
  // Kunderna har Ort, ordrarna har den inte. Det är precis den lucka ett
  // standardvärde är till för.
  const form = () =>
    beslutade(malformAvKallor([KUNDER, ORDER])).map((k) =>
      k.namn === 'Ort' ? { ...k, standard: 'Okänd' } : k,
    )

  it('fyller cellerna i filerna som saknar kolumnen', () => {
    const { frame } = stapla([alla(KUNDER), alla(ORDER)], plan(form()))
    const ort = frame.columns.find((c) => c.name === 'Ort')!
    // Två kundrader med riktig ort, tre orderrader utan.
    expect([0, 1, 2, 3, 4].map((r) => getCell(ort, r))).toEqual([
      'Malmö',
      'Lund',
      'Okänd',
      'Okänd',
      'Okänd',
    ])
  })

  it('rör aldrig en cell som finns men är tom', () => {
    // Tomt betyder okänt. Att skriva över det vore att hitta på data.
    const a = frameOf('a', ['Ort'], [['Malmö'], ['']])
    const b = frameOf('b', ['Namn'], [['Bo']])
    const kolumner: Malkolumn[] = [
      { namn: 'Ort', forslagsnamn: 'Ort', hamtning: [{ fran: 'kolumn', colId: a.columns[0]!.id }, TOMT], med: true, standard: 'Okänd' },
    ]
    const { frame } = stapla([alla(a), alla(b)], plan(kolumner))
    expect([0, 1, 2].map((r) => getCell(frame.columns[0]!, r))).toEqual(['Malmö', '', 'Okänd'])
  })

  it('behåller utfylld-flaggan — värdet står fortfarande inte i filen', () => {
    const { frame } = stapla([alla(KUNDER), alla(ORDER)], plan(form()))
    const ort = frame.columns.find((c) => c.name === 'Ort')!
    expect(ort.flags[0]).toBe(0)
    expect(ort.flags[2]).toBe(Flag.Padded)
  })

  it('gör kolumnen ifylld, så den inte längre rapporteras som tom', () => {
    const a = frameOf('a', ['Land'], [['']])
    const b = frameOf('b', ['Namn'], [['Bo']])
    const kolumner: Malkolumn[] = [
      { namn: 'Land', forslagsnamn: 'Land', hamtning: [{ fran: 'kolumn', colId: a.columns[0]!.id }, TOMT], med: true, standard: 'SE' },
    ]
    expect(stapla([alla(a), alla(b)], plan(kolumner)).ofyllda).toEqual([])
  })

  it('bryter arvet av en typlåsning källorna var eniga om', () => {
    // Källorna är eniga om att Postnr är text. Men `Okänd` är varken text
    // efter användarens beslut eller ett postnummer — låsningen är inte längre
    // användarens, så den ärvs inte.
    const a = frameOf('a', ['Postnr'], [['01234']])
    a.columns[0]!.type = 'text'
    a.columns[0]!.typeLocked = true
    const b = frameOf('b', ['Namn'], [['Bo']])
    const kolumner: Malkolumn[] = [
      { namn: 'Postnr', forslagsnamn: 'Postnr', hamtning: [{ fran: 'kolumn', colId: a.columns[0]!.id }, TOMT], med: true, standard: 'Okänd' },
    ]
    expect(stapla([alla(a), alla(b)], plan(kolumner)).frame.columns[0]!.typeLocked).toBe(false)
  })

  it('ett tomt standardvärde är samma sak som inget', () => {
    const kolumner = beslutade(malformAvKallor([KUNDER, ORDER])).map((k) => ({ ...k, standard: '' }))
    const { frame } = stapla([alla(KUNDER), alla(ORDER)], plan(kolumner))
    const ort = frame.columns.find((c) => c.name === 'Ort')!
    expect(getCell(ort, 2)).toBe('')
    expect(ort.flags[2]).toBe(Flag.Padded)
  })
})

describe('ursprung', () => {
  it('pekar tillbaka på planens kolumner, även när namnen krockar', () => {
    // Två målkolumner som båda heter Namn blir Namn och Namn (2). Namnet kan
    // alltså inte vara svaret på vilken planpost en kolumn kom ur.
    const kolumner: Malkolumn[] = [
      { namn: 'Namn', forslagsnamn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[0]!.id }], med: false },
      { namn: 'Namn', forslagsnamn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[1]!.id }], med: true },
      { namn: 'Namn', forslagsnamn: 'Namn', hamtning: [{ fran: 'kolumn', colId: KUNDER.columns[2]!.id }], med: true },
    ]
    const { frame, ursprung } = stapla([alla(KUNDER)], plan(kolumner, { kallkolumn: 'Källa' }))
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Namn (2)', 'Källa'])
    // Den första planposten hoppades över, så spalterna kom ur post 1 och 2.
    expect(ursprung).toEqual([1, 2, -1])
  })

  it('källkolumnen har ingen planpost', () => {
    const { ursprung } = stapla(
      [alla(KUNDER)],
      plan(beslutade(malformAvKallor([KUNDER])), { kallkolumn: 'Källa' }),
    )
    expect(ursprung[ursprung.length - 1]).toBe(-1)
  })
})

describe('ofylldaFore', () => {
  /**
   * Samma fråga, ställd före och efter.
   *
   * `ofylldaFore` svarar per planpost och bryr sig inte om `med`; `stapla`
   * svarar med de unikgjorda namnen på de kolumner som faktiskt byggdes. Att
   * översätta det ena till det andra är hela likhetsbeviset.
   */
  const namnen = (kallor: Kalla[], kolumner: Malkolumn[]): string[] => {
    const flaggor = ofylldaFore(kallor, kolumner)
    const tagna: string[] = []
    const ut: string[] = []
    kolumner.forEach((k, i) => {
      if (k.med !== true) return
      const namn = uniqueColumnName(tagna, k.namn)
      tagna.push(namn)
      if (flaggor[i]) ut.push(namn)
    })
    return ut
  }
  const badaVagarna = (kallor: Kalla[], kolumner: Malkolumn[]) => ({
    fore: namnen(kallor, kolumner),
    efter: stapla(kallor, plan(kolumner)).ofyllda,
  })

  it('säger samma sak som körningen om en tom kolumn', () => {
    const f = frameOf('f', ['Land', 'Namn'], [['', 'Anna'], ['', 'Bo']])
    const { fore, efter } = badaVagarna([alla(f)], beslutade(malformAvKallor([f])))
    expect(fore).toEqual(['Land'])
    expect(fore).toEqual(efter)
  })

  it('säger samma sak när ingen fil fyller kolumnen', () => {
    const kolumner: Malkolumn[] = [{ namn: 'Land', forslagsnamn: 'Land', hamtning: [TOMT], med: true }]
    const { fore, efter } = badaVagarna([alla(KUNDER)], kolumner)
    expect(fore).toEqual(['Land'])
    expect(fore).toEqual(efter)
  })

  it('ett standardvärde gör kolumnen ifylld, i båda svaren', () => {
    const kolumner: Malkolumn[] = [{ namn: 'Land', forslagsnamn: 'Land', hamtning: [TOMT], med: true, standard: 'SE' }]
    const { fore, efter } = badaVagarna([alla(KUNDER)], kolumner)
    expect(fore).toEqual([])
    expect(fore).toEqual(efter)
  })

  it('ser bara till de rader som faktiskt tas med', () => {
    // Rad 0 är tom, rad 1 har ett värde. Väljer man bara rad 0 blir kolumnen
    // tom i resultatet, hur full filen än är.
    const f = frameOf('f', ['Ort'], [[''], ['Lund']])
    const kolumner: Malkolumn[] = [
      { namn: 'Ort', forslagsnamn: 'Ort', hamtning: [{ fran: 'kolumn', colId: f.columns[0]!.id }], med: true },
    ]
    const bara0 = [{ frame: f, rader: [0] }]
    expect(namnen(bara0, kolumner)).toEqual(['Ort'])
    expect(stapla(bara0, plan(kolumner)).ofyllda).toEqual(['Ort'])
    const bara1 = [{ frame: f, rader: [1] }]
    expect(namnen(bara1, kolumner)).toEqual([])
  })

  it('ett radnummer utanför källan räknas som tomt, precis som i körningen', () => {
    // Uppslaget ger undefined, och en Uint32Array gör 0 av det. Svaret måste
    // bli detsamma på båda vägarna.
    const f = frameOf('f', ['Ort'], [[''], ['Lund'], ['Kiruna']])
    const kolumner: Malkolumn[] = [
      { namn: 'Ort', forslagsnamn: 'Ort', hamtning: [{ fran: 'kolumn', colId: f.columns[0]!.id }], med: true },
    ]
    const kallor: Kalla[] = [{ frame: f, rader: [9] }]
    expect(namnen(kallor, kolumner)).toEqual(['Ort'])
    expect(namnen(kallor, kolumner)).toEqual(stapla(kallor, plan(kolumner)).ofyllda)
  })

  it('svarar även om kolumner som ännu inte beslutats', () => {
    // Att en kolumn blir tom är själva skälet att svara nej på frågan om den.
    // Ett svar som bara gäller redan medtagna kolumner kommer för sent.
    const f = frameOf('f', ['Land'], [['']])
    const kolumner: Malkolumn[] = [{ namn: 'Land', forslagsnamn: 'Land', hamtning: [TOMT], med: null }]
    expect(ofylldaFore([alla(f)], kolumner)).toEqual([true])
  })

  it('en källordbok med spöken lurar inte svaret', () => {
    // `intern` tar aldrig bort. Tas raden med Malmö bort ligger värdet kvar i
    // ordboken, och ett svar som läste ordbokslängden hade sagt "ifylld" om en
    // kolumn vars enda kvarvarande cell är tom.
    const f = frameOf('f', ['Ort'], [['Malmö'], ['']])
    deleteRows(f, [0])
    const kolumner: Malkolumn[] = [
      { namn: 'Ort', forslagsnamn: 'Ort', hamtning: [{ fran: 'kolumn', colId: f.columns[0]!.id }], med: true },
    ]
    expect(f.columns[0]!.dict.length).toBe(2)
    const { fore, efter } = badaVagarna([alla(f)], kolumner)
    expect(fore).toEqual(['Ort'])
    expect(fore).toEqual(efter)
  })

  it('döper om krockande namn precis som körningen', () => {
    const kolumner: Malkolumn[] = [
      { namn: 'Land', forslagsnamn: 'Land', hamtning: [TOMT], med: true },
      { namn: 'Land', forslagsnamn: 'Land', hamtning: [TOMT], med: true },
    ]
    const { fore, efter } = badaVagarna([alla(KUNDER)], kolumner)
    expect(fore).toEqual(['Land', 'Land (2)'])
    expect(fore).toEqual(efter)
  })

  it('går aldrig isär med körningen, hur formen än ser ut', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.string({ maxLength: 4 }), { minLength: 1, maxLength: 3 }), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.option(fc.string({ minLength: 1, maxLength: 3 }), { nil: undefined }),
        (rutnat, standard) => {
          const bredd = Math.max(...rutnat.map((r) => r.length))
          const rubriker = Array.from({ length: bredd }, (_, i) => `k${i}`)
          const f = frameOf('f', rubriker, rutnat.map((r) => rubriker.map((_, i) => r[i] ?? '')))
          const g = frameOf('g', ['annat'], [['x']])
          const kolumner = beslutade(malformAvKallor([f, g])).map((k) => ({ ...k, standard }))
          const kallor = [alla(f), alla(g)]
          expect(namnen(kallor, kolumner)).toEqual(stapla(kallor, plan(kolumner)).ofyllda)
        },
      ),
    )
  })
})

describe('hopslagning för hand', () => {
  /** Två filer som stavar telefonnumret så olika att hittaAlias missar. */
  const A = frameOf('a.csv', ['Namn', 'Mobilnr'], [['Anna', '070-1']])
  const B = frameOf('b.csv', ['Namn', 'Telefon'], [['Bo', '070-2']])
  const kol = (form: Malkolumn[], namn: string) => form.findIndex((k) => k.namn === namn)

  it('gissningen missar, och det är därför greppet finns', () => {
    const form = malformAvKallor([A, B])
    expect(form.map((k) => k.namn)).toEqual(['Namn', 'Mobilnr', 'Telefon'])
  })

  it('den som behålls ger namnet, den andra fyller luckorna', () => {
    const form = malformAvKallor([A, B])
    const ihop = slaIhopMal(form, kol(form, 'Mobilnr'), kol(form, 'Telefon'))
    expect(ihop.map((k) => k.namn)).toEqual(['Namn', 'Mobilnr'])
    const { frame } = stapla([alla(A), alla(B)], plan(beslutade(ihop)))
    const tel = frame.columns.find((c) => c.name === 'Mobilnr')!
    expect([0, 1].map((r) => getCell(tel, r))).toEqual(['070-1', '070-2'])
  })

  it('antecknar vad den absorberat', () => {
    const form = malformAvKallor([A, B])
    const ihop = slaIhopMal(form, kol(form, 'Mobilnr'), kol(form, 'Telefon'))
    expect(ihop[1]!.sammanslagna).toEqual(['Telefon'])
  })

  it('kedjade hopslagningar plattas ut', () => {
    // `Mobil` hade hittaAlias klarat själv; `Kontaktväg` är det den inte kan
    // gissa, och alltså det greppet finns till för.
    const C = frameOf('c.csv', ['Namn', 'Kontaktväg'], [['Cia', '070-3']])
    let form = malformAvKallor([A, B, C])
    form = slaIhopMal(form, kol(form, 'Mobilnr'), kol(form, 'Telefon'))
    form = slaIhopMal(form, kol(form, 'Mobilnr'), kol(form, 'Kontaktväg'))
    expect(form[1]!.sammanslagna).toEqual(['Telefon', 'Kontaktväg'])
    const { frame } = stapla([alla(A), alla(B), alla(C)], plan(beslutade(form)))
    const tel = frame.columns.find((c) => c.name === 'Mobilnr')!
    expect([0, 1, 2].map((r) => getCell(tel, r))).toEqual(['070-1', '070-2', '070-3'])
  })

  it('krockar pekas ut innan något går förlorat', () => {
    // Har en fil BÅDA kolumnerna är de inte samma sak, och en hopslagning
    // kastar den ena. Det ska stå innan man trycker.
    const bada = frameOf('bada.csv', ['Mobilnr', 'Telefon'], [['1', '2']])
    const form = malformAvKallor([bada])
    expect(krockandeKallor(form[0]!, form[1]!)).toEqual([0])
    expect(krockandeKallor(malformAvKallor([A, B])[1]!, malformAvKallor([A, B])[2]!)).toEqual([])
  })

  it('en fil som har båda kolumnerna tappar inte den ena tyst', () => {
    // `Hamtning[]` rymmer en källkolumn per fil. Två går inte att uttrycka, så
    // det som blir över måste stå kvar som en egen rad — inte försvinna.
    const bada = frameOf('bada.csv', ['Telefon', 'Mobilnr'], [['fast', 'mobil']])
    const bara = frameOf('bara.csv', ['Mobilnr'], [['070-9']])
    const form = malformAvKallor([bada, bara])
    expect(form.map((k) => k.namn)).toEqual(['Telefon', 'Mobilnr'])

    const ihop = slaIhopMal(form, 0, 1)
    expect(ihop.map((k) => k.namn)).toEqual(['Telefon', 'Mobilnr'])
    // Resten bär bara krocken, och den är en ny fråga.
    expect(ihop[1]!.med).toBe(null)
    expect(ihop[1]!.fraga).toBe(true)
    expect(antalKallor(ihop[1]!.hamtning)).toBe(1)

    const { frame } = stapla([alla(bada), alla(bara)], plan(beslutade(ihop)))
    const tel = frame.columns.find((c) => c.name === 'Telefon')!
    const mob = frame.columns.find((c) => c.name === 'Mobilnr')!
    expect([0, 1].map((r) => getCell(tel, r))).toEqual(['fast', '070-9'])
    expect([0, 1].map((r) => getCell(mob, r))).toEqual(['mobil', ''])
  })

  it('en överhoppad kolumn slukar inte den andras data', () => {
    // Mobilnr var överhoppad, Telefon obesvarad. Efter hopslagningen är raden
    // en annan fråga än den som besvarades, så nejet får inte stå kvar och
    // tyst svälja Telefons värden — den frågas om igen och spärrar körningen.
    const form = malformAvKallor([A, B])
    const avslagen = form.map((k, i) => (i === 1 ? { ...k, med: false as const } : k))
    const ihop = slaIhopMal(avslagen, 1, 2)
    expect(ihop[1]!.med).toBe(null)
    expect(obeslutade(ihop)).toHaveLength(1)
  })

  it('ett uttryckligt ja väger tyngre än ett nej', () => {
    const form = malformAvKallor([A, B])
    const svarad = form.map((k, i) =>
      i === 1 ? { ...k, med: false as const } : i === 2 ? { ...k, med: true as const } : k,
    )
    expect(slaIhopMal(svarad, 1, 2)[1]!.med).toBe(true)
  })

  it('två nej förblir ett nej', () => {
    const form = malformAvKallor([A, B]).map((k) => ({ ...k, med: false as const }))
    expect(slaIhopMal(form, 1, 2)[1]!.med).toBe(false)
  })

  it('anteckningen bär identiteten, så ett namnbyte inte raderar raden', () => {
    // Döper man överlevaren till den absorberades namn skulle en namnbaserad
    // anteckning göra raden till sin egen absorberade — och ta bort sig själv.
    const form = malformAvKallor([A, B])
    const ihop = slaIhopMal(form, kol(form, 'Mobilnr'), kol(form, 'Telefon'))
    const omdopt = ihop.map((k, i) => (i === 1 ? { ...k, namn: 'Telefon' } : k))
    const bevarat = medBevaradeBeslut(malformAvKallor([A, B]), omdopt)
    expect(bevarat.map((k) => k.forslagsnamn)).toEqual(['Namn', 'Mobilnr'])
    expect(antalKallor(bevarat[1]!.hamtning)).toBe(2)
  })

  it('att slå ihop en kolumn med sig själv gör ingenting', () => {
    const form = malformAvKallor([A, B])
    expect(slaIhopMal(form, 1, 1)).toEqual(form)
  })
})

describe('medBevaradeBeslut', () => {
  const A = frameOf('a.csv', ['Namn', 'Ort'], [['Anna', 'Lund']])
  const B = frameOf('b.csv', ['Namn', 'Stad'], [['Bo', 'Malmö']])

  it('svaret på en fråga överlever en omräkning', () => {
    const gamla = malformAvKallor([A, B]).map((k) => ({ ...k, med: k.med ?? false }))
    const bevarat = medBevaradeBeslut(malformAvKallor([A, B]), gamla)
    expect(bevarat.map((k) => k.med)).toEqual(gamla.map((k) => k.med))
  })

  it('ett gammalt obesvarat skriver inte över ett nytt beslut', () => {
    const gamla: Malkolumn[] = [{ namn: 'Namn', forslagsnamn: 'Namn', hamtning: [TOMT], med: null }]
    const nya: Malkolumn[] = [{ namn: 'Namn', forslagsnamn: 'Namn', hamtning: [TOMT], med: true }]
    expect(medBevaradeBeslut(nya, gamla)[0]!.med).toBe(true)
  })

  it('standardvärdet överlever', () => {
    const gamla: Malkolumn[] = [{ namn: 'Ort', forslagsnamn: 'Ort', hamtning: [TOMT], med: true, standard: 'Okänd' }]
    const nya: Malkolumn[] = [{ namn: 'Ort', forslagsnamn: 'Ort', hamtning: [TOMT], med: null }]
    expect(medBevaradeBeslut(nya, gamla)[0]!.standard).toBe('Okänd')
  })

  it('en handgjord hopslagning görs om', () => {
    // Det verktyget gissar hittar det igen. Det användaren vet gör det inte —
    // så hopslagningen måste läggas tillbaka när förslaget räknas om.
    const form = malformAvKallor([A, B])
    const ihop = slaIhopMal(form, 1, 2)
    expect(ihop.map((k) => k.namn)).toEqual(['Namn', 'Ort'])

    const bevarat = medBevaradeBeslut(malformAvKallor([A, B]), ihop)
    expect(bevarat.map((k) => k.namn)).toEqual(['Namn', 'Ort'])
    expect(antalKallor(bevarat[1]!.hamtning)).toBe(2)
  })

  it('görs om även när den absorberade står först i det nya förslaget', () => {
    const gamla: Malkolumn[] = [
      { namn: 'B', forslagsnamn: 'B', hamtning: [TOMT, { fran: 'kolumn', colId: B.columns[0]!.id }], med: true, sammanslagna: ['A'] },
    ]
    const nya: Malkolumn[] = [
      { namn: 'A', forslagsnamn: 'A', hamtning: [{ fran: 'kolumn', colId: A.columns[0]!.id }, TOMT], med: null },
      { namn: 'B', forslagsnamn: 'B', hamtning: [TOMT, { fran: 'kolumn', colId: B.columns[0]!.id }], med: null },
    ]
    const ut = medBevaradeBeslut(nya, gamla)
    expect(ut.map((k) => k.namn)).toEqual(['B'])
    expect(antalKallor(ut[0]!.hamtning)).toBe(2)
  })

  it('en absorberad kolumn står hellre kvar för sig än faller bort tyst', () => {
    // Överlevaren följde med sin fil när den kryssades av.
    const gamla: Malkolumn[] = [
      { namn: 'Telefon', forslagsnamn: 'Telefon', hamtning: [TOMT], med: true, sammanslagna: ['Mobilnr'] },
    ]
    const nya: Malkolumn[] = [{ namn: 'Mobilnr', forslagsnamn: 'Mobilnr', hamtning: [TOMT], med: null }]
    expect(medBevaradeBeslut(nya, gamla).map((k) => k.namn)).toEqual(['Mobilnr'])
  })

  it('en anteckning som pekar på sig själv sätter inte igång en cykel', () => {
    const gamla: Malkolumn[] = [{ namn: 'X', forslagsnamn: 'X', hamtning: [TOMT], med: true, sammanslagna: ['X'] }]
    const nya: Malkolumn[] = [{ namn: 'X', forslagsnamn: 'X', hamtning: [TOMT], med: null }]
    expect(medBevaradeBeslut(nya, gamla).map((k) => k.namn)).toEqual(['X'])
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
