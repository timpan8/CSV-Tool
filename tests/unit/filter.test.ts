import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, intern } from '../../src/core/frame/column.js'
import { createFrame, identityView, removeColumn } from '../../src/core/frame/frame.js'
import type { ColumnType, Frame } from '../../src/core/types.js'
import {
  TOMT_FILTER,
  aktivaRegler,
  beskrivRegel,
  nyRegelId,
  operatorerFor,
  regelmask,
  tillampaFilter,
  type Filter,
  type Filterregel,
  type Operator,
} from '../../src/core/ops/filter.js'

function frameOf(headers: string[], rows: string[][], typer: ColumnType[] = []): Frame {
  const columns = headers.map((name, i) => createColumn(name, rows.length, typer[i] ?? 'text'))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const regel = (colId: string, operator: Operator, varde = '', extra: Partial<Filterregel> = {}) =>
  ({ id: nyRegelId(), colId, operator, varde, ...extra }) satisfies Filterregel

function kor(frame: Frame, regler: Filterregel[], koppling: 'alla' | 'nagon' = 'alla') {
  return tillampaFilter(frame, { regler, koppling }, identityView(frame.rowCount))
}

const ORTER = frameOf(
  ['Ort'],
  [['Malmö'], ['Lund'], ['malmö'], [''], ['Kiruna'], ['Malmö stad']],
)
const ORT = ORTER.columns[0]!.id

describe('textoperatorer', () => {
  const fall: [Operator, string, string[]][] = [
    ['ar', 'Malmö', ['Malmö', 'malmö']],
    ['arInte', 'Malmö', ['Lund', 'Kiruna', 'Malmö stad']],
    ['innehaller', 'malm', ['Malmö', 'malmö', 'Malmö stad']],
    ['innehallerInte', 'malm', ['Lund', 'Kiruna']],
    ['borjarMed', 'M', ['Malmö', 'malmö', 'Malmö stad']],
    ['slutarMed', 'd', ['Lund', 'Malmö stad']],
  ]
  for (const [operator, varde, forvantat] of fall) {
    it(`${operator} ${varde}`, () => {
      const { rader } = kor(ORTER, [regel(ORT, operator, varde)])
      const col = ORTER.columns[0]!
      expect(Array.from(rader, (r) => col.dict[col.codes[r]!]!)).toEqual(forvantat)
    })
  }

  it('är okänslig för versaler som standard men kan göras känslig', () => {
    expect(kor(ORTER, [regel(ORT, 'ar', 'Malmö')]).rader).toHaveLength(2)
    expect(
      kor(ORTER, [regel(ORT, 'ar', 'Malmö', { versalkanslig: true })]).rader,
    ).toHaveLength(1)
  })

  it('tomma celler matchar aldrig en textregel', () => {
    // arInte är den lömska: en tom cell "är inte Malmö", men den är tom.
    const { rader } = kor(ORTER, [regel(ORT, 'arInte', 'Malmö')])
    const col = ORTER.columns[0]!
    expect(Array.from(rader, (r) => col.dict[col.codes[r]!]!)).not.toContain('')
  })
})

describe('tomhet och giltighet', () => {
  it('tom och ifylld är varandras komplement', () => {
    const tomma = kor(ORTER, [regel(ORT, 'tom')]).rader.length
    const ifyllda = kor(ORTER, [regel(ORT, 'ifylld')]).rader.length
    expect(tomma + ifyllda).toBe(ORTER.rowCount)
    expect(tomma).toBe(1)
  })

  it('bara blanksteg räknas som ifyllt', () => {
    const frame = frameOf(['a'], [['   '], ['']])
    const id = frame.columns[0]!.id
    expect(kor(frame, [regel(id, 'ifylld')]).rader).toHaveLength(1)
  })

  it('ogiltig hittar värden som bryter mot kolumnens typ', () => {
    const frame = frameOf(['Belopp'], [['100'], ['okänt'], ['']], ['number'])
    const id = frame.columns[0]!.id
    const { rader } = kor(frame, [regel(id, 'ogiltig')])
    expect(Array.from(rader)).toEqual([1])
  })
})

describe('talgränser', () => {
  const BELOPP = frameOf(
    ['Belopp'],
    [['1 240,50'], ['980,00'], ['12 000,00'], ['okänt'], ['']],
    ['number'],
  )
  const id = BELOPP.columns[0]!.id

  it('jämför numeriskt och inte som text', () => {
    expect(Array.from(kor(BELOPP, [regel(id, 'storreAn', '1000')]).rader)).toEqual([0, 2])
    expect(Array.from(kor(BELOPP, [regel(id, 'hogstLika', '980')]).rader)).toEqual([1])
  })

  it('mellan tar med båda ändarna och tål omvänd ordning', () => {
    expect(Array.from(kor(BELOPP, [regel(id, 'mellan', '980', { varde2: '1240,50' })]).rader)).toEqual([0, 1])
    expect(Array.from(kor(BELOPP, [regel(id, 'mellan', '1240,50', { varde2: '980' })]).rader)).toEqual([0, 1])
  })

  it('otolkbara värden matchar ingen storleksjämförelse', () => {
    // "okänt" är varken större eller mindre — det går inte att jämföra.
    const storre = kor(BELOPP, [regel(id, 'storreAn', '0')]).rader
    const mindre = kor(BELOPP, [regel(id, 'mindreAn', '999999')]).rader
    expect(Array.from(storre)).not.toContain(3)
    expect(Array.from(mindre)).not.toContain(3)
  })

  it('ett ogiltigt gränsvärde ger ett fel i stället för ett tomt resultat', () => {
    const { fel } = kor(BELOPP, [regel(id, 'storreAn', 'abc')])
    expect(fel).toHaveLength(1)
    expect(fel[0]!.text).toContain('tal')
  })
})

describe('datumgränser', () => {
  const DATUM = frameOf(
    ['Datum'],
    [['2026-08-27'], ['27/08/2025'], ['2026-01-05'], ['i går']],
    ['date'],
  )
  const id = DATUM.columns[0]!.id

  it('jämför blandade format som datum', () => {
    expect(Array.from(kor(DATUM, [regel(id, 'storreAn', '2026-01-01')]).rader)).toEqual([0, 2])
  })

  it('säger till när gränsen inte är ett datum', () => {
    expect(kor(DATUM, [regel(id, 'storreAn', 'i förrgår')]).fel[0]!.text).toContain('datum')
  })
})

describe('lista och reguljära uttryck', () => {
  it('iLista matchar de valda värdena', () => {
    const { rader } = kor(ORTER, [regel(ORT, 'iLista', '', { varden: ['Lund', 'Kiruna'] })])
    expect(Array.from(rader)).toEqual([1, 4])
  })

  it('ett trasigt uttryck är ett svar, inte ett kast', () => {
    const { fel, rader } = kor(ORTER, [regel(ORT, 'regex', '([a-z')])
    expect(fel).toHaveLength(1)
    expect(fel[0]!.text).toContain('går inte att tolka')
    // Utan giltiga regler släpps allt igenom — men felet syns.
    expect(rader).toHaveLength(ORTER.rowCount)
  })

  it('uttrycket bär inget tillstånd mellan ordbokens poster', () => {
    // Ett globalt regex skulle missa varannan post via lastIndex.
    const frame = frameOf(['a'], [['aa'], ['aa'], ['aa'], ['aa']])
    const { rader } = kor(frame, [regel(frame.columns[0]!.id, 'regex', 'a')])
    expect(rader).toHaveLength(4)
  })
})

describe('kopplingen mellan regler', () => {
  const frame = frameOf(
    ['Ort', 'Status'],
    [
      ['Malmö', 'Aktiv'],
      ['Lund', 'Aktiv'],
      ['Malmö', 'Vilande'],
      ['Kiruna', 'Vilande'],
    ],
  )
  const [ort, status] = [frame.columns[0]!.id, frame.columns[1]!.id]
  const r1 = regel(ort, 'ar', 'Malmö')
  const r2 = regel(status, 'ar', 'Aktiv')

  it('alla kräver att båda stämmer', () => {
    expect(Array.from(kor(frame, [r1, r2], 'alla').rader)).toEqual([0])
  })

  it('någon räcker med en', () => {
    expect(Array.from(kor(frame, [r1, r2], 'nagon').rader)).toEqual([0, 1, 2])
  })

  it('alla är en delmängd av varje enskild regel, nagon en övermängd', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('Malmö', 'Lund', 'Kiruna', 'Aktiv', 'Vilande'), {
          minLength: 1,
          maxLength: 3,
        }),
        (varden) => {
          const regler = varden.map((v, i) => regel(i % 2 === 0 ? ort : status, 'ar', v))
          const alla = new Set(kor(frame, regler, 'alla').rader)
          const nagon = new Set(kor(frame, regler, 'nagon').rader)
          for (const r of regler) {
            const ensam = new Set(kor(frame, [r]).rader)
            for (const x of alla) expect(ensam.has(x)).toBe(true)
            for (const x of ensam) expect(nagon.has(x)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('resultatet är alltid en delföljd av utgångsordningen', () => {
  it('bevarar ordningen den fick in', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c', ''), { minLength: 0, maxLength: 20 }),
        fc.constantFrom<Operator>('innehaller', 'arInte', 'ifylld', 'ar'),
        (celler, operator) => {
          const frame = frameOf(['x'], celler.map((v) => [v]))
          // En godtycklig utgångsordning, som om en sortering redan körts.
          const utgang = Uint32Array.from(
            Array.from({ length: frame.rowCount }, (_, i) => frame.rowCount - 1 - i),
          )
          const { rader } = tillampaFilter(
            frame,
            { regler: [regel(frame.columns[0]!.id, operator, 'a')], koppling: 'alla' },
            utgang,
          )
          const kvar = new Set(rader)
          expect(Array.from(rader)).toEqual(Array.from(utgang).filter((r) => kvar.has(r)))
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('regler som inte kan köras', () => {
  it('en avslagen regel ligger kvar men räknas inte', () => {
    const filter: Filter = { regler: [regel(ORT, 'ar', 'Lund', { av: true })], koppling: 'alla' }
    expect(filter.regler).toHaveLength(1)
    expect(aktivaRegler(ORTER, filter)).toHaveLength(0)
    expect(tillampaFilter(ORTER, filter, identityView(ORTER.rowCount)).rader).toHaveLength(
      ORTER.rowCount,
    )
  })

  it('en ofärdig regel räknas inte', () => {
    expect(aktivaRegler(ORTER, { regler: [regel(ORT, 'ar', '')], koppling: 'alla' })).toHaveLength(0)
    expect(aktivaRegler(ORTER, { regler: [regel(ORT, 'tom')], koppling: 'alla' })).toHaveLength(1)
  })

  it('en regel på en borttagen kolumn hoppar ur men raderas inte', () => {
    const frame = frameOf(['Ort', 'Namn'], [['Lund', 'Anna']])
    const id = frame.columns[0]!.id
    const filter: Filter = { regler: [regel(id, 'ar', 'Lund')], koppling: 'alla' }
    expect(aktivaRegler(frame, filter)).toHaveLength(1)

    removeColumn(frame, id)
    expect(aktivaRegler(frame, filter)).toHaveLength(0)
    // Regeln finns kvar och vaknar till liv igen om kolumnen ångras tillbaka.
    expect(filter.regler).toHaveLength(1)
  })
})

describe('operatorlistan', () => {
  it('erbjuder storleksjämförelser bara på tal och datum', () => {
    expect(operatorerFor('text').some((o) => o.op === 'mellan')).toBe(false)
    expect(operatorerFor('number').some((o) => o.op === 'mellan')).toBe(true)
    expect(operatorerFor('date').some((o) => o.op === 'storreAn')).toBe(true)
  })
})

describe('beskrivRegel', () => {
  it('skriver ut regeln i klartext', () => {
    expect(beskrivRegel(ORTER, regel(ORT, 'ar', 'Malmö'))).toBe('Ort är Malmö')
    expect(beskrivRegel(ORTER, regel(ORT, 'tom'))).toBe('Ort är tom')
    expect(beskrivRegel(ORTER, regel(ORT, 'iLista', '', { varden: ['a', 'b'] }))).toBe(
      'Ort är a eller b',
    )
  })

  it('säger att kolumnen är borta i stället för att visa ett tomt namn', () => {
    expect(beskrivRegel(ORTER, regel('finns-inte', 'ar', 'x'))).toContain('Borttagen kolumn')
  })
})

describe('regelmask', () => {
  it('räknar en gång per unikt värde, inte per rad', () => {
    // Fyrahundra rader, tre unika värden.
    const rader = Array.from({ length: 400 }, (_, i) => [['a', 'b', 'c'][i % 3]!])
    const frame = frameOf(['x'], rader)
    const col = frame.columns[0]!
    expect(col.dict).toHaveLength(4) // '', a, b, c
    const { mask } = regelmask(col, regel(col.id, 'ar', 'b'))
    expect(mask).toHaveLength(4)
  })

  it('ett tomt filter lämnar utgångsordningen orörd, samma array', () => {
    const utgang = identityView(ORTER.rowCount)
    expect(tillampaFilter(ORTER, TOMT_FILTER, utgang).rader).toBe(utgang)
  })
})

describe('längdoperatorerna', () => {
  const ORD = frameOf(['Ord'], [['Malmö'], ['Lund'], [''], ['Kiruna'], ['Ö']])
  const kol = ORD.columns[0]!.id

  it('är längre än räknar tecken', () => {
    const { rader } = kor(ORD, [regel(kol, 'langreAn', '4')])
    expect([...rader].map((r) => ORD.columns[0]!.dict[ORD.columns[0]!.codes[r]!])).toEqual([
      'Malmö',
      'Kiruna',
    ])
  })

  it('är kortare än räknar tecken', () => {
    const { rader } = kor(ORD, [regel(kol, 'kortareAn', '5')])
    expect([...rader].map((r) => ORD.columns[0]!.dict[ORD.columns[0]!.codes[r]!])).toEqual([
      'Lund',
      'Ö',
    ])
  })

  it('släpper aldrig igenom tomma celler', () => {
    // En tom cell är okänd, inte kort. Samma hållning som storleksjämförelser.
    const { rader } = kor(ORD, [regel(kol, 'kortareAn', '99')])
    expect(rader.length).toBe(4)
  })

  it('rapporterar ett fel när gränsen inte är ett tal', () => {
    const { fel } = kor(ORD, [regel(kol, 'langreAn', 'fem')])
    expect(fel[0]?.text).toContain('antal tecken')
  })

  it('räknar tecken och inte kodenheter', () => {
    // Å med kombinerande ring normaliseras till ett tecken av normalizeAlways.
    const f = frameOf(['Ord'], [['Å']])
    const { rader } = kor(f, [regel(f.columns[0]!.id, 'langreAn', '1')])
    expect(rader.length).toBe(0)
  })

  it('beskriver regeln med enheten utsatt', () => {
    expect(beskrivRegel(ORD, regel(kol, 'langreAn', '4'))).toBe('Ord är längre än 4 tecken')
  })
})

describe('vänt filter', () => {
  const kol = ORTER.columns[0]!.id

  it('ger komplementet till det som annars visas', () => {
    const regler = [regel(kol, 'ar', 'Malmö')]
    const pa = tillampaFilter(ORTER, { regler, koppling: 'alla' }, identityView(ORTER.rowCount))
    const vant = tillampaFilter(
      ORTER,
      { regler, koppling: 'alla', inverterat: true },
      identityView(ORTER.rowCount),
    )
    expect(pa.rader.length + vant.rader.length).toBe(ORTER.rowCount)
    const bada = new Set([...pa.rader, ...vant.rader])
    expect(bada.size).toBe(ORTER.rowCount)
  })

  it('tar med tomma rader, som annars aldrig matchar', () => {
    const vant = tillampaFilter(
      ORTER,
      { regler: [regel(kol, 'ar', 'Malmö')], koppling: 'alla', inverterat: true },
      identityView(ORTER.rowCount),
    )
    const varden = [...vant.rader].map((r) => ORTER.columns[0]!.dict[ORTER.columns[0]!.codes[r]!])
    expect(varden).toContain('')
  })

  it('visar allt när det inte finns någon aktiv regel att vända', () => {
    const vant = tillampaFilter(
      ORTER,
      { regler: [], koppling: 'alla', inverterat: true },
      identityView(ORTER.rowCount),
    )
    expect(vant.rader.length).toBe(ORTER.rowCount)
  })

  it('vänder resultatet som helhet, inte varje regel för sig', () => {
    // Malmö *och* längre än 5 tecken träffar bara "Malmö stad". Vändningen
    // ska då ge fem rader, inte de rader som varken är Malmö eller långa.
    const regler = [regel(kol, 'innehaller', 'Malmö'), regel(kol, 'langreAn', '5')]
    const vant = tillampaFilter(
      ORTER,
      { regler, koppling: 'alla', inverterat: true },
      identityView(ORTER.rowCount),
    )
    expect(vant.rader.length).toBe(ORTER.rowCount - 1)
  })
})
