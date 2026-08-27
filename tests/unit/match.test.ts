import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import {
  byggNycklar,
  matcha,
  slaIhop,
  slaSamman,
  type Matchningspar,
  type Matchningstyp,
} from '../../src/core/ops/match.js'

function frameOf(namn: string, headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame(namn, columns, rows.length)
}

const par = (v: Frame, h: Frame, vKol: number, hKol: number, typ: Matchningstyp = 'oberoende') =>
  ({
    vansterColId: v.columns[vKol]!.id,
    hogerColId: h.columns[hKol]!.id,
    typ,
  }) satisfies Matchningspar

describe('nycklar', () => {
  it('struntar i versaler och extra blanksteg som standard', () => {
    const v = frameOf('v', ['n'], [['Anna  Karlsson'], ['ANNA KARLSSON']])
    const h = frameOf('h', ['n'], [['anna karlsson']])
    const nycklar = byggNycklar(v, [par(v, h, 0, 0)], 'vanster')
    expect(nycklar[0]).toBe('anna karlsson')
    expect(nycklar[1]).toBe('anna karlsson')
  })

  it('teckenexakt behåller skiftläget', () => {
    const v = frameOf('v', ['n'], [['Anna'], ['anna']])
    const h = frameOf('h', ['n'], [['Anna']])
    const nycklar = byggNycklar(v, [par(v, h, 0, 0, 'exakt')], 'vanster')
    expect(nycklar[0]).not.toBe(nycklar[1])
  })

  it('bara siffror skalar bort allt annat', () => {
    const v = frameOf('v', ['tel'], [['070-123 45 67'], ['+46 70 1234567']])
    const h = frameOf('h', ['tel'], [['0701234567']])
    const nycklar = byggNycklar(v, [par(v, h, 0, 0, 'siffror')], 'vanster')
    expect(nycklar[0]).toBe('0701234567')
    expect(nycklar[1]).toBe('46701234567')
  })

  it('e-post mot namn läser namnet ur adressen och stryker prickarna', () => {
    const v = frameOf('v', ['epost'], [['erik.oberg@nordbygg.se']])
    const h = frameOf('h', ['namn'], [['Erik Öberg']])
    const p = [par(v, h, 0, 0, 'epostNamn')]
    expect(byggNycklar(v, p, 'vanster')[0]).toBe('erik oberg')
    // Namnsidan stryks också, annars kan de aldrig mötas.
    expect(byggNycklar(h, p, 'hoger')[0]).toBe('erik oberg')
  })

  it('flera par blir en sammansatt nyckel', () => {
    const v = frameOf('v', ['n', 'e'], [['Anna', 'a@x.se'], ['Anna', 'b@x.se']])
    const h = frameOf('h', ['n', 'e'], [['Anna', 'a@x.se']])
    const nycklar = byggNycklar(v, [par(v, h, 0, 0), par(v, h, 1, 1)], 'vanster')
    expect(nycklar[0]).not.toBe(nycklar[1])
  })

  it('en tom del gör hela nyckeln oanvändbar', () => {
    const v = frameOf('v', ['n', 'e'], [['Anna', ''], ['', 'a@x.se'], ['Anna', 'a@x.se']])
    const h = frameOf('h', ['n', 'e'], [['Anna', 'a@x.se']])
    const nycklar = byggNycklar(v, [par(v, h, 0, 0), par(v, h, 1, 1)], 'vanster')
    expect(nycklar[0]).toBe('')
    expect(nycklar[1]).toBe('')
    expect(nycklar[2]).not.toBe('')
  })

  it('en nyckeldel kan inte förfalskas med avskiljartecknet', () => {
    // Utan ett avskiljartecken som inte kan förekomma i data skulle
    // ("ab", "c") och ("a", "bc") få samma nyckel.
    const v = frameOf('v', ['a', 'b'], [['ab', 'c'], ['a', 'bc']])
    const h = frameOf('h', ['a', 'b'], [['ab', 'c']])
    const nycklar = byggNycklar(v, [par(v, h, 0, 0), par(v, h, 1, 1)], 'vanster')
    expect(nycklar[0]).not.toBe(nycklar[1])
  })
})

describe('matcha', () => {
  const VANSTER = frameOf(
    'kunder',
    ['Namn', 'Ort'],
    [['Anna', 'Lund'], ['Bo', 'Malmö'], ['Cia', 'Kiruna'], ['', 'Umeå']],
  )
  const HOGER = frameOf(
    'order',
    ['Kund', 'Belopp'],
    [['anna', '100'], ['Cia', '200'], ['Dan', '300'], ['', '400']],
  )

  it('parar ihop raderna och listar resten på båda sidor', () => {
    const m = matcha(VANSTER, HOGER, [par(VANSTER, HOGER, 0, 0)])
    expect(m.par).toEqual([
      { v: 0, h: 0 },
      { v: 2, h: 1 },
    ])
    expect(m.vansterMatchade).toBe(2)
    expect(m.hogerMatchade).toBe(2)
    // Bo har ingen order; den tomma raden kan aldrig matcha.
    expect(m.vansterUtan).toEqual([1, 3])
    expect(m.hogerUtan).toEqual([2, 3])
  })

  it('tomma nycklar matchar aldrig varandra', () => {
    // Två rader som båda saknar namn är inte samma person.
    const m = matcha(VANSTER, HOGER, [par(VANSTER, HOGER, 0, 0)])
    expect(m.tommaVanster).toBe(1)
    expect(m.tommaHoger).toBe(1)
    expect(m.par.some((p) => p.v === 3 || p.h === 3)).toBe(false)
  })

  it('räknar kardinaliteten före körningen', () => {
    const v = frameOf('v', ['n'], [['Anna'], ['Bo']])
    const h = frameOf('h', ['n'], [['Anna'], ['anna'], ['Bo']])
    const m = matcha(v, h, [par(v, h, 0, 0)])
    expect(m.vansterMatchade).toBe(2)
    expect(m.vansterFlera).toBe(1)
    expect(m.storstaTraff).toBe(2)
    expect(m.hogerFlera).toBe(0)
  })

  it('räknar när flera vänsterrader pekar på samma högerrad', () => {
    const v = frameOf('v', ['n'], [['Anna'], ['ANNA']])
    const h = frameOf('h', ['n'], [['anna']])
    const m = matcha(v, h, [par(v, h, 0, 0)])
    expect(m.hogerFlera).toBe(1)
    expect(m.vansterFlera).toBe(0)
  })

  it('utan par blir ingenting matchat', () => {
    expect(matcha(VANSTER, HOGER, []).par).toHaveLength(0)
  })

  it('restlistorna täcker precis det som inte matchade', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c', ''), { minLength: 0, maxLength: 20 }),
        fc.array(fc.constantFrom('a', 'B', 'd', ''), { minLength: 0, maxLength: 20 }),
        (vanster, hoger) => {
          const v = frameOf('v', ['n'], vanster.map((x) => [x]))
          const h = frameOf('h', ['n'], hoger.map((x) => [x]))
          const m = matcha(v, h, [par(v, h, 0, 0)])

          const vMatchade = new Set(m.par.map((p) => p.v))
          const hMatchade = new Set(m.par.map((p) => p.h))
          // Varje rad är antingen matchad eller i restlistan — aldrig båda,
          // aldrig ingendera.
          expect(m.vansterUtan.length + vMatchade.size).toBe(v.rowCount)
          expect(m.hogerUtan.length + hMatchade.size).toBe(h.rowCount)
          for (const r of m.vansterUtan) expect(vMatchade.has(r)).toBe(false)
          for (const r of m.hogerUtan) expect(hMatchade.has(r)).toBe(false)
          expect(m.vansterMatchade).toBe(vMatchade.size)
          expect(m.hogerMatchade).toBe(hMatchade.size)
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('slaIhop', () => {
  const VANSTER = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia']])
  const HOGER = frameOf('order', ['Kund', 'Belopp'], [['anna', '100'], ['Cia', '200']])
  const P = [par(VANSTER, HOGER, 0, 0)]

  const val = (extra: Partial<Parameters<typeof slaIhop>[3]> = {}) => ({
    hogerKolumner: [HOGER.columns[1]!.id],
    flertraff: 'forsta' as const,
    prefix: '',
    ...extra,
  })

  it('behåller alla vänsterrader, även de utan träff', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame, fyllda } = slaIhop(VANSTER, HOGER, m, val())
    expect(frame.rowCount).toBe(3)
    expect(fyllda).toBe(2)
    const belopp = frame.columns[1]!
    expect([0, 1, 2].map((r) => getCell(belopp, r))).toEqual(['100', '', '200'])
  })

  it('behåller vänsterfilens egna kolumner först', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, val())
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Belopp'])
    expect(getCell(frame.columns[0]!, 1)).toBe('Bo')
  })

  it('duplicerar raden per träff när man ber om det', () => {
    const h = frameOf('order', ['Kund', 'Belopp'], [['Anna', '100'], ['anna', '150']])
    const p = [par(VANSTER, h, 0, 0)]
    const m = matcha(VANSTER, h, p)
    const { frame } = slaIhop(VANSTER, h, m, {
      hogerKolumner: [h.columns[1]!.id],
      flertraff: 'duplicera',
      prefix: '',
    })
    expect(frame.rowCount).toBe(4)
    expect([0, 1].map((r) => getCell(frame.columns[0]!, r))).toEqual(['Anna', 'Anna'])
    expect([0, 1].map((r) => getCell(frame.columns[1]!, r))).toEqual(['100', '150'])
  })

  it('lämnar tomt vid flera träffar när man valt det', () => {
    const h = frameOf('order', ['Kund', 'Belopp'], [['Anna', '100'], ['anna', '150']])
    const m = matcha(VANSTER, h, [par(VANSTER, h, 0, 0)])
    const { frame, fyllda } = slaIhop(VANSTER, h, m, {
      hogerKolumner: [h.columns[1]!.id],
      flertraff: 'lamna',
      prefix: '',
    })
    expect(frame.rowCount).toBe(3)
    expect(fyllda).toBe(0)
    expect(getCell(frame.columns[1]!, 0)).toBe('')
  })

  it('ger nya kolumner unika namn', () => {
    const h = frameOf('order', ['Kund', 'Namn'], [['anna', 'X']])
    const m = matcha(VANSTER, h, [par(VANSTER, h, 0, 0)])
    const { frame } = slaIhop(VANSTER, h, m, {
      hogerKolumner: [h.columns[1]!.id],
      flertraff: 'forsta',
      prefix: '',
    })
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Namn (2)'])
  })

  it('kan sätta ett prefix på de nya kolumnerna', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, val({ prefix: 'Order – ' }))
    expect(frame.columns[1]!.name).toBe('Order – Belopp')
  })

  it('radnumret pekar på vänsterfilen', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, val())
    expect(Array.from(frame.sourceRow)).toEqual([1, 2, 3])
  })

  it('utan valda högerkolumner blir resultatet vänsterfilen', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, val({ hogerKolumner: [] }))
    expect(frame.columns).toHaveLength(1)
    expect(frame.rowCount).toBe(3)
  })
})

describe('urval', () => {
  const VANSTER = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia']])
  const HOGER = frameOf('order', ['Kund'], [['Anna'], ['Bo'], ['Cia']])
  const P = [par(VANSTER, HOGER, 0, 0)]

  it('matchar bara de utvalda raderna och behåller fysiska index', () => {
    const m = matcha(VANSTER, HOGER, P, { vansterRader: [1, 2], hogerRader: [1, 2] })
    expect(m.par).toEqual([
      { v: 1, h: 1 },
      { v: 2, h: 2 },
    ])
    // Anna finns på båda sidor men ligger utanför urvalet och syns inte alls.
    expect(m.vansterUtan).toEqual([])
    expect(m.hogerUtan).toEqual([])
    expect(m.vansterMatchade).toBe(2)
  })

  it('en rad utanför högerurvalet kan inte träffas', () => {
    const m = matcha(VANSTER, HOGER, P, { hogerRader: [2] })
    expect(m.par).toEqual([{ v: 2, h: 2 }])
    expect(m.vansterUtan).toEqual([0, 1])
    expect(m.vansterMatchade).toBe(1)
  })

  it('tom urvalslista betyder inga rader, inte alla', () => {
    const m = matcha(VANSTER, HOGER, P, { vansterRader: [] })
    expect(m.par).toEqual([])
    expect(m.vansterUtan).toEqual([])
    expect(m.hogerUtan).toEqual([0, 1, 2])
  })

  it('utan urval är resultatet oförändrat', () => {
    expect(matcha(VANSTER, HOGER, P, {})).toEqual(matcha(VANSTER, HOGER, P))
  })

  it('en runda på restlistan hittar bara nya par', () => {
    // Namnen skiljer sig, men ortsparet binder ihop rad 1.
    const v = frameOf('v', ['Namn', 'Ort'], [['Anna', 'Lund'], ['B. Ek', 'Kiruna']])
    const h = frameOf('h', ['Kund', 'Stad'], [['Anna', 'Lund'], ['Bo Ek', 'Kiruna']])
    const forsta = matcha(v, h, [par(v, h, 0, 0)])
    expect(forsta.vansterUtan).toEqual([1])

    const runda = matcha(v, h, [par(v, h, 1, 1)], {
      vansterRader: forsta.vansterUtan,
      hogerRader: forsta.hogerUtan,
    })
    expect(runda.par).toEqual([{ v: 1, h: 1 }])
  })
})

describe('slaSamman', () => {
  const VANSTER = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia']])
  const HOGER = frameOf('order', ['Kund'], [['Anna'], ['Dan']])
  const BAS = matcha(VANSTER, HOGER, [par(VANSTER, HOGER, 0, 0)])

  it('utan extra par är matchningen sig själv', () => {
    expect(slaSamman(BAS, [], VANSTER, HOGER)).toBe(BAS)
  })

  it('lägger till paret och räknar om restlistorna', () => {
    const m = slaSamman(BAS, [{ v: 1, h: 1 }], VANSTER, HOGER)
    expect(m.par).toEqual([
      { v: 0, h: 0 },
      { v: 1, h: 1 },
    ])
    expect(m.vansterUtan).toEqual([2])
    expect(m.hogerUtan).toEqual([])
    expect(m.vansterMatchade).toBe(2)
    expect(m.hogerMatchade).toBe(2)
  })

  it('ett par som redan finns lägger inte till något', () => {
    const m = slaSamman(BAS, [{ v: 0, h: 0 }], VANSTER, HOGER)
    expect(m.par).toEqual(BAS.par)
    expect(m.vansterUtan).toEqual(BAS.vansterUtan)
  })

  it('paren ligger i samma ordning som en hashjoin ger dem', () => {
    const h = frameOf('order', ['Kund'], [['Anna'], ['anna'], ['Dan']])
    const bas = matcha(VANSTER, h, [par(VANSTER, h, 0, 0)])
    const m = slaSamman(bas, [{ v: 2, h: 2 }], VANSTER, h)
    expect(m.par).toEqual([
      { v: 0, h: 0 },
      { v: 0, h: 1 },
      { v: 2, h: 2 },
    ])
  })

  it('tomma nycklar är en egenskap hos nyckeln och räknas inte om', () => {
    const v = frameOf('v', ['n'], [['Anna'], ['']])
    const h = frameOf('h', ['n'], [['Anna'], ['']])
    const bas = matcha(v, h, [par(v, h, 0, 0)])
    expect(bas.tommaVanster).toBe(1)
    // Raden utan namn går att para för hand — den är fortfarande en rad som
    // aldrig kunde matcha av sig själv.
    const m = slaSamman(bas, [{ v: 1, h: 1 }], v, h)
    expect(m.tommaVanster).toBe(1)
    expect(m.tommaHoger).toBe(1)
    expect(m.vansterUtan).toEqual([])
  })

  it('varje rad är matchad eller i restlistan, aldrig båda', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c', ''), { minLength: 1, maxLength: 12 }),
        fc.array(fc.constantFrom('a', 'B', 'd', ''), { minLength: 1, maxLength: 12 }),
        fc.array(fc.tuple(fc.nat(11), fc.nat(11)), { maxLength: 8 }),
        (vanster, hoger, extra) => {
          const v = frameOf('v', ['n'], vanster.map((x) => [x]))
          const h = frameOf('h', ['n'], hoger.map((x) => [x]))
          const bas = matcha(v, h, [par(v, h, 0, 0)])
          const giltiga = extra
            .filter(([a, b]) => a < v.rowCount && b < h.rowCount)
            .map(([a, b]) => ({ v: a, h: b }))
          const m = slaSamman(bas, giltiga, v, h)

          const vMatchade = new Set(m.par.map((p) => p.v))
          const hMatchade = new Set(m.par.map((p) => p.h))
          expect(m.vansterUtan.length + vMatchade.size).toBe(v.rowCount)
          expect(m.hogerUtan.length + hMatchade.size).toBe(h.rowCount)
          expect(m.vansterMatchade).toBe(vMatchade.size)
          expect(m.hogerMatchade).toBe(hMatchade.size)
          // Inga dubbletter bland paren.
          expect(new Set(m.par.map((p) => `${p.v}:${p.h}`)).size).toBe(m.par.length)
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('namn mot förnamn + efternamn', () => {
  const vanster = frameOf('vänster', ['Namn'], [
    ['Anna Karlsson'],
    ['Erik Öberg'],
    ['Åsa'],
    ['Nils Ödman'],
  ])
  const hoger = frameOf('höger', ['Fornamn', 'Efternamn'], [
    ['Karlsson', 'Anna'],
    ['erik', 'öberg'],
    ['Åsa', ''],
    ['Nils', 'Ödman'],
  ])
  const par = [
    {
      vansterColId: vanster.columns[0]!.id,
      hogerColId: hoger.columns[0]!.id,
      hogerColId2: hoger.columns[1]!.id,
      typ: 'namndelar' as const,
    },
  ]

  it('matchar hela namnet mot de två delarna oavsett ordning', () => {
    const m = matcha(vanster, hoger, par)
    // Rad 0: Anna Karlsson ↔ Karlsson + Anna. Rad 1: skiftläget spelar ingen roll.
    expect(m.par).toContainEqual({ v: 0, h: 0 })
    expect(m.par).toContainEqual({ v: 1, h: 1 })
    expect(m.par).toContainEqual({ v: 3, h: 3 })
  })

  it('låter en tom del göra raden omatchbar', () => {
    // Åsa har inget efternamn på högersidan. Utan regeln skulle "Åsa" matcha
    // vilken Åsa som helst — samma fel som en tom nyckel.
    const m = matcha(vanster, hoger, par)
    expect(m.par.some((p) => p.v === 2 || p.h === 2)).toBe(false)
    expect(m.vansterUtan).toContain(2)
    expect(m.hogerUtan).toContain(2)
  })

  it('behåller prickarna: Oberg är inte Öberg', () => {
    const v = frameOf('v', ['Namn'], [['Erik Oberg']])
    const h = frameOf('h', ['F', 'E'], [['Erik', 'Öberg']])
    const m = matcha(v, h, [
      {
        vansterColId: v.columns[0]!.id,
        hogerColId: h.columns[0]!.id,
        hogerColId2: h.columns[1]!.id,
        typ: 'namndelar',
      },
    ])
    expect(m.par).toHaveLength(0)
  })

  it('ger ingen träff alls när den andra kolumnen inte valts', () => {
    const m = matcha(vanster, hoger, [
      {
        vansterColId: vanster.columns[0]!.id,
        hogerColId: hoger.columns[0]!.id,
        typ: 'namndelar',
      },
    ])
    expect(m.par).toHaveLength(0)
  })
})
