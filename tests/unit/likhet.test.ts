import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, intern } from '../../src/core/frame/column.js'
import type { Column } from '../../src/core/types.js'
import {
  foreslaLuddigaPar,
  STANDARDLIKHET,
  type Likhetsinstallning,
} from '../../src/core/ops/likhet.js'

function kolumn(varden: string[], typ: Column['type'] = 'text'): Column {
  const col = createColumn('n', varden.length, typ)
  varden.forEach((v, r) => {
    col.codes[r] = intern(col, v)
  })
  return col
}

const alla = (n: number) => Array.from({ length: n }, (_, i) => i)

function kor(
  v: string[],
  h: string[],
  extra: Partial<Likhetsinstallning> = {},
  typ: Column['type'] = 'text',
) {
  const vc = kolumn(v, typ)
  const hc = kolumn(h, typ)
  return foreslaLuddigaPar(vc, alla(v.length), hc, alla(h.length), {
    ...STANDARDLIKHET,
    ...extra,
  })
}

describe('poängsättningen', () => {
  it('ett stavfel ger ett förslag', () => {
    const { forslag } = kor(['Zlatan Ek'], ['Zlatan Ekk'])
    expect(forslag).toHaveLength(1)
    expect(forslag[0]).toMatchObject({ v: 0, h: 0, omsesidigt: true })
    expect(forslag[0]!.poang.stavning).toBeGreaterThan(0.8)
  })

  it('omkastad ordföljd fångas av ordmängden, inte av stavningen', () => {
    const { forslag } = kor(['Ida Ängström'], ['Ängström Ida'])
    expect(forslag).toHaveLength(1)
    // Samma ord, alltså full ordmängdsträff — och det är den som bär poängen.
    expect(forslag[0]!.poang.orden).toBe(1)
    expect(forslag[0]!.poang.poang).toBeCloseTo(0.95, 5)
    expect(forslag[0]!.poang.stavning).toBeLessThan(0.95)
  })

  it('två olika personer föreslås inte', () => {
    expect(kor(['Anna Karlsson'], ['Omar Haddad']).forslag).toEqual([])
  })

  it('accenter och skiftläge står inte i vägen', () => {
    const { forslag } = kor(['Erik Öberg'], ['ERIK OBERG'])
    expect(forslag).toHaveLength(1)
    expect(forslag[0]!.poang.poang).toBe(1)
  })

  it('bara det bästa förslagen behålls, men fler än ett', () => {
    const { forslag } = kor(
      ['Anna Karlsson'],
      ['Anna Karlson', 'Anna Karlssen', 'Anna Karlsdotter', 'Anne Karlsson'],
      { troskel: 0.5 },
    )
    expect(forslag.length).toBeLessThanOrEqual(STANDARDLIKHET.maxForslagPerRad)
    // Ett nej på det första ska avslöja en tvåa.
    expect(forslag.length).toBeGreaterThan(1)
  })

  it('ordningen är deterministisk', () => {
    const ett = kor(['Anna Karlsson', 'Erik Öberg'], ['Anna Karlson', 'Erik Oberg'])
    const tva = kor(['Anna Karlsson', 'Erik Öberg'], ['Anna Karlson', 'Erik Oberg'])
    expect(ett.forslag).toEqual(tva.forslag)
  })

  it('ömsesidigt bästa par märks ut', () => {
    // Båda vänsterraderna liknar samma högerrad, men bara den ena är dess bästa.
    const { forslag } = kor(['Anna Karlsson', 'Anna Karlssen'], ['Anna Karlsson'], {
      troskel: 0.5,
    })
    const omsesidiga = forslag.filter((f) => f.omsesidigt)
    expect(omsesidiga).toHaveLength(1)
    expect(omsesidiga[0]!.v).toBe(0)
    // Och det ömsesidiga ligger först.
    expect(forslag[0]!.omsesidigt).toBe(true)
  })

  it('ett värde som förekommer på flera rader ger förslag för var och en', () => {
    const { forslag } = kor(['Anna Karlsson', 'Anna Karlsson'], ['Anna Karlson'])
    expect(forslag.map((f) => f.v).sort()).toEqual([0, 1])
  })
})

describe('vägran', () => {
  it('talkolumner får ingen luddig likhet', () => {
    // 10021 och 10024 liknar varandra som text men är olika kunder.
    const r = kor(['10021'], ['10024'], {}, 'number')
    expect(r.hinder).toBe('talkolumn')
    expect(r.forslag).toEqual([])
  })

  it('för långa restlistor vägras med ett tal i stället för att ta tid', () => {
    const manga = Array.from({ length: 30 }, (_, i) => `Namn ${i}`)
    const r = kor(manga, manga, { maxRestrader: 10 })
    expect(r.hinder).toBe('forStoraRestlistor')
  })

  it('korta värden ger bara brus och räknas inte', () => {
    expect(kor(['Ek'], ['Ec']).hinder).toBe('ingaVarden')
  })
})

describe('taken', () => {
  it('stoppgram håller nere arbetet när varje värde slutar likadant', () => {
    // Varje värde delar ändelsen " kommun": utan stoppgramtaket är varje
    // trigrams postningslista hela högersidan.
    const varden = Array.from({ length: 200 }, (_, i) => `Ort ${i} kommun`)
    const utan = kor(varden, varden, { stoppandel: 1 })
    const med = kor(varden, varden, {})
    expect(med.steg).toBeLessThan(utan.steg / 2)
    // Och den självklara träffen finns kvar.
    expect(med.forslag.some((f) => f.v === f.h)).toBe(true)
  })

  it('ett värde som bara består av stoppgram får ändå sitt förslag', () => {
    const varden = Array.from({ length: 40 }, () => 'aaaa')
    const r = foreslaLuddigaPar(
      kolumn([...varden, 'aaaa']),
      alla(41),
      kolumn(varden),
      alla(40),
      { ...STANDARDLIKHET, stoppandel: 0.01, maxForslag: 50 },
    )
    expect(r.forslag.length).toBeGreaterThan(0)
  })

  it('stegtaket avbryter i stället för att aldrig bli klart', () => {
    const varden = Array.from({ length: 300 }, (_, i) => `Anna Karlsson ${i}`)
    const r = kor(varden, varden, { maxSteg: 500 })
    expect(r.avkortat).toBe(true)
  })

  it('förslagstaket kortar av och säger det', () => {
    const varden = Array.from({ length: 60 }, (_, i) => `Anna Karlsson ${i}`)
    const r = kor(varden, varden, { maxForslag: 5, troskel: 0.5 })
    expect(r.forslag).toHaveLength(5)
    expect(r.avkortat).toBe(true)
  })
})

describe('egenskaper', () => {
  it('poängen ligger alltid i [0, 1] och identiska värden ger 1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 4, maxLength: 20 }), { minLength: 1, maxLength: 8 }),
        (varden) => {
          const r = kor(varden, varden, { troskel: 0 })
          for (const f of r.forslag) {
            expect(f.poang.poang).toBeGreaterThanOrEqual(0)
            expect(f.poang.poang).toBeLessThanOrEqual(1)
            expect(f.poang.stavning).toBeLessThanOrEqual(1)
            expect(f.poang.orden).toBeLessThanOrEqual(1)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('likheten är symmetrisk', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 16 }),
        fc.string({ minLength: 4, maxLength: 16 }),
        (a, b) => {
          const fram = kor([a], [b], { troskel: 0 }).forslag[0]?.poang.poang ?? null
          const bak = kor([b], [a], { troskel: 0 }).forslag[0]?.poang.poang ?? null
          expect(fram).toBe(bak)
        },
      ),
      { numRuns: 200 },
    )
  })
})
