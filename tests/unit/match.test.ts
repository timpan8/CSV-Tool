import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, getCell, hasFlag, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { Flag, type Frame } from '../../src/core/types.js'
import {
  byggNycklar,
  byggPlan,
  forhandsurval,
  matcha,
  NYCKELAVSKILJARE,
  nyckelavvikelse,
  nyckelForRad,
  slaIhop,
  slaSamman,
  type Matchning,
  type Matchningspar,
  type Matchningstyp,
  TRAFFORDNING,
  foreslaPar,
  provaKolumnpar,
  TRAFFVARDEN,
} from '../../src/core/ops/match.js'
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
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Belopp', 'Träff'])
    expect(getCell(frame.columns[0]!, 1)).toBe('Bo')
  })

  it('två körningar myntar två olika ram-id', () => {
    // Ram-id:t är det enda som säger att två flikar är olika filer, och
    // verkstadens sessionskoppling vilar på det. Ett id härlett ur källorna
    // gav två omgångar på samma källor exakt samma id.
    const m = matcha(VANSTER, HOGER, P)
    const forsta = slaIhop(VANSTER, HOGER, m, val()).frame
    const andra = slaIhop(VANSTER, HOGER, m, val()).frame
    expect(forsta.id).not.toBe(andra.id)
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
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Namn (2)', 'Träff'])
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
    // Vänsterfilens enda kolumn plus Träff.
    expect(frame.columns).toHaveLength(2)
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


describe('forhandsurval', () => {
  /** En matchning med bara de fält urvalet läser. */
  const m = (matchade: number[][], utan: number[]): Matchning => ({
    par: matchade.flatMap(([v, h]) => [{ v: v!, h: h! }]),
    vansterUtan: utan,
    hogerUtan: [],
    vansterMatchade: new Set(matchade.map(([v]) => v)).size,
    hogerMatchade: 0,
    vansterFlera: 0,
    vansterOsakra: [],
    hogerFlera: 0,
    tommaVanster: 0,
    tommaHoger: 0,
    storstaTraff: 1,
  })

  it('tar med både träffar och icke-träffar', () => {
    const urval = forhandsurval(m([[0, 0], [2, 1], [4, 2]], [1, 3, 5]), 6)
    expect(urval.vanster).toEqual([0, 1, 2, 3, 4, 5])
    expect(urval.hoger).toEqual([])
  })

  it('står i filens ordning', () => {
    const urval = forhandsurval(m([[7, 0], [9, 1]], [1, 3]), 4).vanster
    expect(urval).toEqual([1, 3, 7, 9])
    expect([...urval].sort((a, b) => a - b)).toEqual(urval)
  })

  it('visar en ensam omatchad rad även bland många träffar', () => {
    // Just den raden är den enda man behöver upptäcka.
    const matchade = Array.from({ length: 200 }, (_, i) => [i, i])
    const urval = forhandsurval(m(matchade, [200]), 8).vanster
    expect(urval).toContain(200)
    expect(urval).toHaveLength(8)
  })

  it('visar en ensam träff även bland många omatchade', () => {
    const utan = Array.from({ length: 200 }, (_, i) => i + 1)
    const urval = forhandsurval(m([[0, 0]], utan), 8).vanster
    expect(urval).toContain(0)
    expect(urval).toHaveLength(8)
  })

  it('följer proportionen när båda sidorna är gott om', () => {
    // 75 % träffar ska ge ungefär 75 % träffar i urvalet.
    const matchade = Array.from({ length: 300 }, (_, i) => [i, i])
    const utan = Array.from({ length: 100 }, (_, i) => i + 300)
    const urval = forhandsurval(m(matchade, utan), 8).vanster
    const antalUtan = urval.filter((r) => r >= 300).length
    expect(antalUtan).toBe(2)
    expect(urval).toHaveLength(8)
  })

  it('blandar in högerrader när de skickas med', () => {
    const matchade = Array.from({ length: 40 }, (_, i) => [i, i])
    const utan = Array.from({ length: 40 }, (_, i) => i + 40)
    const urval = forhandsurval(m(matchade, utan), 9, [100, 101, 102, 103])
    // Alla tre sorterna syns, och taket hålls över båda listorna tillsammans.
    expect(urval.hoger.length).toBeGreaterThan(0)
    expect(urval.vanster.some((r) => r < 40)).toBe(true)
    expect(urval.vanster.some((r) => r >= 40)).toBe(true)
    expect(urval.vanster.length + urval.hoger.length).toBe(9)
  })

  it('en ensam högerrad bland många vänsterrader syns ändå', () => {
    const matchade = Array.from({ length: 500 }, (_, i) => [i, i])
    const urval = forhandsurval(m(matchade, [500]), 6, [900])
    expect(urval.hoger).toEqual([900])
  })

  it('utan högerrader är urvalet identiskt med förut', () => {
    const matchade = Array.from({ length: 30 }, (_, i) => [i, i])
    const utan = Array.from({ length: 10 }, (_, i) => i + 30)
    for (const tak of [1, 2, 5, 12, 99]) {
      expect(forhandsurval(m(matchade, utan), tak, [])).toEqual(
        forhandsurval(m(matchade, utan), tak),
      )
    }
  })

  it('räknar en vänsterrad med flera träffar en gång', () => {
    const urval = forhandsurval(m([[0, 0], [0, 1], [0, 2], [3, 3]], [1]), 4).vanster
    expect(urval).toEqual([0, 1, 3])
  })

  it('klarar noll träffar, noll rader och ett tak större än filen', () => {
    expect(forhandsurval(m([], [0, 1]), 5).vanster).toEqual([0, 1])
    expect(forhandsurval(m([[0, 0]], []), 5).vanster).toEqual([0])
    expect(forhandsurval(m([], []), 5).vanster).toEqual([])
    expect(forhandsurval(m([[0, 0]], [1]), 0).vanster).toEqual([])
    expect(forhandsurval(m([[0, 0]], [1]), -3).vanster).toEqual([])
  })

  it('taket hålls', () => {
    const matchade = Array.from({ length: 50 }, (_, i) => [i * 2, i])
    const utan = Array.from({ length: 50 }, (_, i) => i * 2 + 1)
    for (const tak of [1, 2, 3, 7, 12, 99, 500]) {
      expect(forhandsurval(m(matchade, utan), tak).vanster.length).toBeLessThanOrEqual(tak)
    }
  })
})

describe('slaIhop med urval', () => {
  const VANSTER = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia'], ['Dan']])
  const HOGER = frameOf('order', ['Kund', 'Belopp'], [['anna', '100'], ['Cia', '200']])
  const P = [par(VANSTER, HOGER, 0, 0)]
  const VAL = { hogerKolumner: [HOGER.columns[1]!.id], flertraff: 'forsta' as const, prefix: '' }

  it('bygger exakt de raderna, i urvalets ordning', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame, fyllda, rader } = slaIhop(VANSTER, HOGER, m, VAL, [1, 2])
    expect(frame.rowCount).toBe(2)
    expect(rader).toBe(2)
    // Bo utan träff, Cia med.
    expect([0, 1].map((r) => getCell(frame.columns[0]!, r))).toEqual(['Bo', 'Cia'])
    expect([0, 1].map((r) => getCell(frame.columns[1]!, r))).toEqual(['', '200'])
    // fyllda beskriver urvalet, inte filen.
    expect(fyllda).toBe(1)
  })

  it('behåller radnumren ur vänsterfilen', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, VAL, [3, 0])
    expect(Array.from(frame.sourceRow)).toEqual([4, 1])
  })

  it('ett tomt urval ger en tom ram utan att kasta', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame, fyllda, rader } = slaIhop(VANSTER, HOGER, m, VAL, [])
    expect(frame.rowCount).toBe(0)
    expect(rader).toBe(0)
    expect(fyllda).toBe(0)
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Belopp', 'Träff'])
  })

  it('duplicerar inom urvalet precis som utan', () => {
    const v = frameOf('v', ['Namn'], [['Anna'], ['Bo']])
    const h = frameOf('h', ['Kund', 'Nr'], [['anna', '1'], ['anna', '2'], ['bo', '3']])
    const m = matcha(v, h, [par(v, h, 0, 0)])
    const val = { hogerKolumner: [h.columns[1]!.id], flertraff: 'duplicera' as const, prefix: '' }
    const { frame } = slaIhop(v, h, m, val, [0])
    expect(frame.rowCount).toBe(2)
    expect([0, 1].map((r) => getCell(frame.columns[1]!, r))).toEqual(['1', '2'])
  })

  it('tar med högerrader utan partner när de skickas med', () => {
    const m = matcha(VANSTER, HOGER, P)
    // Bo (rad 1) saknar order; ingen orderrad saknar kund här, så vi tar med
    // rad 1 ur högerfilen för hand för att pröva formen.
    const { frame, fyllda, rader } = slaIhop(VANSTER, HOGER, m, VAL, undefined, [1])
    expect(rader).toBe(5)
    expect(frame.rowCount).toBe(5)
    // Vänsterraderna först, i filens ordning, högerraden sist.
    expect([0, 1, 2, 3, 4].map((r) => getCell(frame.columns[0]!, r))).toEqual([
      'Anna', 'Bo', 'Cia', 'Dan', '',
    ])
    // Högerkolumnen är ifylld på den sista raden.
    expect(getCell(frame.columns[1]!, 4)).toBe('200')
    // Och den räknas inte som en lyckad sammanslagning.
    expect(fyllda).toBe(2)
  })

  it('vänsterkolumnerna är frånvarande, inte tomma, på en högerrad', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, VAL, undefined, [1])
    const namn = frame.columns[0]!
    // Spegelbilden av testet för vänsterrader utan partner.
    expect(getCell(namn, 4)).toBe('')
    expect(hasFlag(namn, 4, Flag.Padded)).toBe(true)
    expect(hasFlag(namn, 0, Flag.Padded)).toBe(false)
  })

  it('Träff-kolumnen säger att raden bara finns i den andra filen', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, VAL, undefined, [1])
    const traff = frame.columns[frame.columns.length - 1]!
    expect(getCell(traff, 0)).toBe(TRAFFVARDEN.traff)
    expect(getCell(traff, 1)).toBe(TRAFFVARDEN.utan)
    expect(getCell(traff, 4)).toBe(TRAFFVARDEN.bara)
  })

  it('Träff-kolumnen sorterar från lyckad till helt utan partner', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, VAL, undefined, [1])
    const traff = frame.columns[frame.columns.length - 1]!
    expect(traff.sortordning).toEqual(TRAFFORDNING)

    const niva = [{ colId: traff.id, riktning: 'stigande' as const }]
    const ordnade = Array.from(sorteraRader(frame, niva), (r) => getCell(traff, r))
    // Bokstavsordningen hade lagt ”bara i den andra filen” först och ”träff”
    // sist, alltså precis tvärtom.
    expect(ordnade[0]).toBe(TRAFFVARDEN.traff)
    expect(ordnade[ordnade.length - 1]).toBe(TRAFFVARDEN.bara)
  })

  it('radnumret pekar på den fil raden faktiskt kom ifrån', () => {
    const m = matcha(VANSTER, HOGER, P)
    const { frame } = slaIhop(VANSTER, HOGER, m, VAL, undefined, [1])
    // Fyra vänsterrader ur kunder, sedan rad 2 ur order.
    expect(Array.from(frame.sourceRow)).toEqual([1, 2, 3, 4, 2])
  })

  it('utan högerrader är resultatet bit för bit oförändrat — regressionsvakt', () => {
    const m = matcha(VANSTER, HOGER, P)
    const utan = slaIhop(VANSTER, HOGER, m, VAL)
    const tom = slaIhop(VANSTER, HOGER, m, VAL, undefined, [])
    const dump = (f: typeof utan.frame) =>
      Array.from({ length: f.rowCount }, (_, r) => f.columns.map((c) => getCell(c, r)))
    expect(dump(tom.frame)).toEqual(dump(utan.frame))
    expect(tom.fyllda).toBe(utan.fyllda)
    // Det fjärde Träff-värdet får inte ligga i ordboken när ingen rad använder
    // det — annars dyker det upp som ett alternativ med noll rader i filtret.
    const traff = (f: typeof utan.frame) => f.columns[f.columns.length - 1]!.dict
    expect(traff(tom.frame)).toEqual(traff(utan.frame))
    expect(traff(utan.frame)).not.toContain(TRAFFVARDEN.bara)
  })

  it('utan urval är resultatet oförändrat — regressionsvakt', () => {
    const m = matcha(VANSTER, HOGER, P)
    const utan = slaIhop(VANSTER, HOGER, m, VAL)
    const med = slaIhop(VANSTER, HOGER, m, VAL, [0, 1, 2, 3])
    const dump = (f: typeof utan.frame) =>
      Array.from({ length: f.rowCount }, (_, r) => f.columns.map((c) => getCell(c, r)))
    expect(dump(med.frame)).toEqual(dump(utan.frame))
    expect(med.fyllda).toBe(utan.fyllda)
    expect(med.rader).toBe(utan.rader)
    expect(Array.from(med.frame.sourceRow)).toEqual(Array.from(utan.frame.sourceRow))
  })
})

describe('NYCKELAVSKILJARE', () => {
  it('delar en flerkolumnsnyckel i sina delar', () => {
    const v = frameOf('v', ['Namn', 'Ort'], [['Anna Karlsson', 'Malmö']])
    const nycklar = byggNycklar(v, [par(v, v, 0, 0), par(v, v, 1, 1)], 'vanster')
    expect(nycklar[0]!.split(NYCKELAVSKILJARE)).toEqual(['anna karlsson', 'malmö'])
  })
})


describe('byggPlan', () => {
  const V = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia']])
  const H = frameOf('order', ['Kund', 'Nr'], [['anna', '1'], ['anna', '2'], ['cia', '3']])
  const M = () => matcha(V, H, [par(V, H, 0, 0)])

  it('säger vilka rader som blev utan partner', () => {
    // Det är den upplysningen förhandsvisningen inte kan gissa sig till: en
    // tom cell kan lika gärna vara en partner vars värde var tomt.
    const plan = byggPlan(M(), 'forsta', V.rowCount)
    expect(plan.map((p) => p.h === null)).toEqual([false, true, false])
  })

  it('duplicera ger en post per träff, forsta bara den första', () => {
    expect(byggPlan(M(), 'duplicera', V.rowCount)).toHaveLength(4)
    expect(byggPlan(M(), 'forsta', V.rowCount)).toHaveLength(3)
  })

  it('lamna gör en flerträffsrad partnerlös i stället för att välja åt en', () => {
    const plan = byggPlan(M(), 'lamna', V.rowCount)
    expect(plan.map((p) => p.h === null)).toEqual([true, true, false])
  })

  it('följer urvalet, i urvalets ordning', () => {
    const plan = byggPlan(M(), 'forsta', V.rowCount, [2, 1])
    expect(plan.map((p) => p.v)).toEqual([2, 1])
    expect(plan.map((p) => p.h === null)).toEqual([false, true])
  })

  it('lägger högerraderna sist, utan vänsterrad', () => {
    const m = matcha(V, H, [par(V, H, 0, 0)])
    const plan = byggPlan(m, 'forsta', V.rowCount, undefined, [1, 2])
    expect(plan.slice(-2)).toEqual([
      { v: null, h: 1, flera: false },
      { v: null, h: 2, flera: false },
    ])
    // Vänstersvepet är oförändrat före dem.
    expect(plan.slice(0, -2).every((p) => p.v !== null)).toBe(true)
  })

  it('utan högerrader ser planen ut precis som förut', () => {
    const m = matcha(V, H, [par(V, H, 0, 0)])
    expect(byggPlan(m, 'forsta', V.rowCount, undefined, [])).toEqual(
      byggPlan(m, 'forsta', V.rowCount),
    )
  })

  it('är exakt den plan slaIhop bygger sitt resultat av', () => {
    // Vakten som gör att rutan och knappen aldrig kan bli oense.
    const m = M()
    const val = { hogerKolumner: [H.columns[1]!.id], flertraff: 'duplicera' as const, prefix: '' }
    const { frame } = slaIhop(V, H, m, val)
    const plan = byggPlan(m, 'duplicera', V.rowCount)
    expect(plan).toHaveLength(frame.rowCount)
    const nr = frame.columns[1]!
    plan.forEach((p, r) => {
      expect(getCell(nr, r) === '').toBe(p.h === null)
    })
  })
})


describe('celler utan partner är frånvarande, inte tomma', () => {
  it('märker den hämtade cellen med Flag.Padded när raden blev utan partner', () => {
    // Samma beslut som `stapla` fattar för en kolumn som saknas i en fil.
    // Utan flaggan går "ingen partner" inte att skilja från "partnerns värde
    // var tomt" — varken i förhandsvisningen eller i den färdiga fliken.
    const v = frameOf('kunder', ['Namn'], [['Anna'], ['Bo']])
    const h = frameOf('order', ['Kund', 'Nr'], [['anna', '']])
    const m = matcha(v, h, [par(v, h, 0, 0)])
    const { frame } = slaIhop(v, h, m, {
      hogerKolumner: [h.columns[1]!.id],
      flertraff: 'forsta',
      prefix: '',
    })
    const nr = frame.columns[1]!

    // Båda cellerna är tomma …
    expect([getCell(nr, 0), getCell(nr, 1)]).toEqual(['', ''])
    // … men bara den ena saknar ett värde. Anna hittade en partner vars Nr
    // råkade vara tomt; Bo hittade ingen partner alls.
    expect(hasFlag(nr, 0, Flag.Padded)).toBe(false)
    expect(hasFlag(nr, 1, Flag.Padded)).toBe(true)
  })

  it('rör inte vänsterfilens kolumner', () => {
    const v = frameOf('kunder', ['Namn'], [['Anna'], ['Bo']])
    const h = frameOf('order', ['Kund', 'Nr'], [['anna', '1']])
    const m = matcha(v, h, [par(v, h, 0, 0)])
    const { frame } = slaIhop(v, h, m, {
      hogerKolumner: [h.columns[1]!.id],
      flertraff: 'forsta',
      prefix: '',
    })
    expect(hasFlag(frame.columns[0]!, 1, Flag.Padded)).toBe(false)
  })
})

describe('nyckelForRad', () => {
  /**
   * Samma nyckel som matchningen räknar, för en rad.
   *
   * Att svaren aldrig får gå isär är hela poängen: visar gränssnittet en
   * nyckel som `matcha` inte hashade är förklaringen till att raden blev över
   * en annan förklaring än den sanna.
   */
  const somByggNycklar = (f: Frame, p: Matchningspar[], sida: 'vanster' | 'hoger') => {
    const hela = byggNycklar(f, p, sida)
    return Array.from({ length: f.rowCount }, (_, r) => {
      const delar = nyckelForRad(f, p, sida, r)
      return delar.some((d) => d.nyckel === '')
        ? ''
        : delar.map((d) => d.nyckel).join(NYCKELAVSKILJARE)
    }).map((egen, r) => [egen, hela[r]])
  }

  it('ger samma nyckel som byggNycklar, rad för rad', () => {
    const v = frameOf('v', ['Namn', 'Ort'], [['Erik Öberg', 'Lund'], ['ANNA  K', 'Malmö'], ['', 'Boden']])
    const h = frameOf('h', ['n', 'o'], [['x', 'y']])
    const p = [par(v, h, 0, 0), par(v, h, 1, 1)]
    for (const [egen, hela] of somByggNycklar(v, p, 'vanster')) expect(egen).toBe(hela)
  })

  it('visar den normaliserade formen bredvid värdet', () => {
    const v = frameOf('v', ['Namn'], [['Erik Öberg']])
    const h = frameOf('h', ['n'], [['x']])
    const delar = nyckelForRad(v, [par(v, h, 0, 0, 'accentoberoende')], 'vanster', 0)
    expect(delar).toEqual([{ par: 0, varde: 'Erik Öberg', nyckel: 'erik oberg' }])
  })

  it('en tom del ger tom nyckel, precis som i matchningen', () => {
    const v = frameOf('v', ['Namn'], [['']])
    const h = frameOf('h', ['n'], [['x']])
    expect(nyckelForRad(v, [par(v, h, 0, 0)], 'vanster', 0)[0]!.nyckel).toBe('')
    expect(byggNycklar(v, [par(v, h, 0, 0)], 'vanster')[0]).toBe('')
  })

  it('slår ihop högersidans två kolumner som matchningen gör', () => {
    const v = frameOf('v', ['Namn'], [['Anna Karlsson']])
    const h = frameOf('h', ['Fornamn', 'Efternamn'], [['Karlsson', 'Anna']])
    const p: Matchningspar[] = [
      {
        vansterColId: v.columns[0]!.id,
        hogerColId: h.columns[0]!.id,
        hogerColId2: h.columns[1]!.id,
        typ: 'namndelar',
      },
    ]
    const del = nyckelForRad(h, p, 'hoger', 0)[0]!
    expect(del.varde).toBe('Karlsson Anna')
    expect(del.nyckel).toBe(byggNycklar(h, p, 'hoger')[0])
    // Ordföljden spelar ingen roll — det är hela poängen med namndelar.
    expect(del.nyckel).toBe(byggNycklar(v, p, 'vanster')[0])
  })

  it('en kolumn som tagits bort ger tom nyckel i stället för att kasta', () => {
    const v = frameOf('v', ['Namn'], [['Anna']])
    const h = frameOf('h', ['n'], [['x']])
    const p: Matchningspar[] = [{ vansterColId: 'finns-inte', hogerColId: h.columns[0]!.id, typ: 'oberoende' }]
    expect(nyckelForRad(v, p, 'vanster', 0)).toEqual([{ par: 0, varde: '', nyckel: '' }])
  })
})

describe('Träff-kolumnen', () => {
  const KUND = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia']])
  const ORDER = frameOf('order', ['Kund', 'Belopp'], [['Anna', '100'], ['anna', '150'], ['Bo', '90']])
  const P = [par(KUND, ORDER, 0, 0)]
  const traffar = (frame: Frame) => {
    const col = frame.columns.find((c) => c.name === 'Träff')!
    return Array.from({ length: frame.rowCount }, (_, r) => getCell(col, r))
  }

  it('skiljer träff, ingen träff och flera träffar åt', () => {
    // Anna matchar två orderrader, Bo en, Cia ingen.
    const m = matcha(KUND, ORDER, P)
    const { frame } = slaIhop(KUND, ORDER, m, {
      hogerKolumner: [ORDER.columns[1]!.id],
      flertraff: 'lamna',
      prefix: '',
    })
    expect(traffar(frame)).toEqual([TRAFFVARDEN.flera, TRAFFVARDEN.traff, TRAFFVARDEN.utan])
  })

  it('säger flera träffar även när en av dem valdes', () => {
    // Med "Första träffen" får raden ett värde — men den var ändå osäker, och
    // det är precis det man behöver kunna filtrera fram i efterhand.
    const m = matcha(KUND, ORDER, P)
    const { frame } = slaIhop(KUND, ORDER, m, {
      hogerKolumner: [ORDER.columns[1]!.id],
      flertraff: 'forsta',
      prefix: '',
    })
    expect(traffar(frame)[0]).toBe(TRAFFVARDEN.flera)
    expect(getCell(frame.columns[1]!, 0)).toBe('100')
  })

  it('kostar tre ordboksposter, inte en per rad', () => {
    const m = matcha(KUND, ORDER, P)
    const { frame } = slaIhop(KUND, ORDER, m, {
      hogerKolumner: [],
      flertraff: 'lamna',
      prefix: '',
    })
    const col = frame.columns.find((c) => c.name === 'Träff')!
    expect(col.dict).toEqual(['', TRAFFVARDEN.traff, TRAFFVARDEN.utan, TRAFFVARDEN.flera])
    expect(col.typeLocked).toBe(true)
  })

  it('viker undan för en kolumn som redan heter Träff', () => {
    const v = frameOf('v', ['Namn', 'Träff'], [['Anna', 'ja']])
    const m = matcha(v, ORDER, [par(v, ORDER, 0, 0)])
    const { frame } = slaIhop(v, ORDER, m, { hogerKolumner: [], flertraff: 'lamna', prefix: '' })
    expect(frame.columns.map((c) => c.name)).toEqual(['Namn', 'Träff', 'Träff (2)'])
  })
})

describe('vansterOsakra', () => {
  const KUND = frameOf('kunder', ['Namn'], [['Anna'], ['Bo'], ['Cia']])
  const ORDER = frameOf('order', ['Kund'], [['Anna'], ['anna'], ['Bo']])

  it('pekar ut raderna med för många partners, inte bara räknar dem', () => {
    // Räknaren fanns sedan tidigare; raderna gjorde det inte, och då hamnade
    // en osäker rad i ingen lista alls.
    const m = matcha(KUND, ORDER, [par(KUND, ORDER, 0, 0)])
    expect(m.vansterFlera).toBe(1)
    expect(m.vansterOsakra).toEqual([0])
    // Och de ligger inte i vansterUtan — de saknar inte partner.
    expect(m.vansterUtan).toEqual([2])
  })

  it('överlever att verkstadens egna par vägs in', () => {
    const m = matcha(KUND, ORDER, [par(KUND, ORDER, 0, 0)])
    const full = slaSamman(m, [{ v: 2, h: 2 }], KUND, ORDER)
    expect(full.vansterOsakra).toEqual([0])
    expect(full.vansterUtan).toEqual([])
  })
})

describe('nyckelavvikelse', () => {
  it('två lika nycklar har ingen avvikelse', () => {
    expect(nyckelavvikelse('nils ödman', 'nils ödman')).toBe(null)
  })

  it('pekar ut tillägget i slutet', () => {
    const a = nyckelavvikelse('nils ödman', 'nils ödman (avliden)')!
    expect('nils ödman'.slice(...a.v)).toBe('')
    expect('nils ödman (avliden)'.slice(...a.h)).toBe(' (avliden)')
  })

  it('pekar ut tillägget i början utan att måla resten', () => {
    // En jämförelse enbart framifrån hade rödmarkerat hela strängen så fort
    // ett tecken lagts till först.
    const a = nyckelavvikelse('anna berg', 'fru anna berg')!
    expect('anna berg'.slice(...a.v)).toBe('')
    expect('fru anna berg'.slice(...a.h)).toBe('fru ')
  })

  it('pekar ut ett utbytt tecken mitt i', () => {
    const a = nyckelavvikelse('nordbygg', 'nordbygq')!
    expect('nordbygg'.slice(...a.v)).toBe('g')
    expect('nordbygq'.slice(...a.h)).toBe('q')
  })

  it('två helt olika nycklar avviker i sin helhet', () => {
    const a = nyckelavvikelse('anna', 'bo')!
    expect('anna'.slice(...a.v)).toBe('anna')
    expect('bo'.slice(...a.h)).toBe('bo')
  })

  it('intervallen ligger alltid inom sin sträng', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.string({ maxLength: 12 }), (a, b) => {
        const r = nyckelavvikelse(a, b)
        if (r === null) return a === b
        return (
          r.v[0] >= 0 && r.v[1] <= a.length && r.v[0] <= r.v[1] &&
          r.h[0] >= 0 && r.h[1] <= b.length && r.h[0] <= r.h[1] &&
          // Det som ligger utanför avvikelsen är gemensamt.
          a.slice(0, r.v[0]) === b.slice(0, r.h[0]) &&
          a.slice(r.v[1]) === b.slice(r.h[1])
        )
      }),
    )
  })
})

describe('förslaget på kolumnpar', () => {
  const namnet = (frame: Frame, id: string) => frame.columns.find((c) => c.id === id)!.name

  it('väljer paret som ger flest träffar, inte det första', () => {
    // Rubrikerna säger ingenting här — inga lika namn och inga synonymer. Då
    // är siffrorna det enda som finns, och första kolumnen i vardera filen
    // (som förut blev valet) matchar ingenting.
    const v = frameOf('v', ['Xa', 'Xb'], [
      ['1', 'a@x.se'],
      ['2', 'b@x.se'],
      ['3', 'c@x.se'],
    ])
    const h = frameOf('h', ['Ya', 'Yb'], [
      ['ORD-1', 'a@x.se'],
      ['ORD-2', 'B@X.SE'],
    ])
    const f = foreslaPar(v, h)
    expect(f.skal).toBe('flest')
    expect(namnet(v, f.par[0]!.vansterColId)).toBe('Xb')
    expect(namnet(h, f.par[0]!.hogerColId)).toBe('Yb')
    expect(f.betyg?.traffar).toBe(2)
  })

  it('låter rubriknamnen vinna när de pekar på ett lika bra par', () => {
    const v = frameOf('v', ['Namn', 'Ort'], [['Anna', 'Lund'], ['Bo', 'Lund']])
    const h = frameOf('h', ['Namn', 'Ort'], [['Anna', 'Lund'], ['Bo', 'Lund']])
    const f = foreslaPar(v, h)
    expect(f.skal).toBe('namn')
    expect(namnet(v, f.par[0]!.vansterColId)).toBe('Namn')
  })

  it('väljer bort en kolumn där ett värde matchar hela filen', () => {
    /*
     * Status ↔ Status ger 100 % träffar och är ändå värdelöst som nyckel:
     * varje Aktiv möter varenda Aktiv. Personnr matchar bara två av tre rader,
     * men entydigt — och det är den som ska vinna.
     */
    const v = frameOf('v', ['Personnr', 'Status'], [
      ['111', 'Aktiv'],
      ['222', 'Aktiv'],
      ['333', 'Aktiv'],
    ])
    const h = frameOf('h', ['Personnr', 'Status'], [
      ['111', 'Aktiv'],
      ['222', 'Aktiv'],
      ['999', 'Aktiv'],
    ])
    const f = foreslaPar(v, h)
    expect(namnet(v, f.par[0]!.vansterColId)).toBe('Personnr')
    expect(f.betyg?.traffar).toBe(2)
  })

  it('räknar poängen per entydig partner', () => {
    const v = frameOf('v', ['A'], [['x'], ['y']])
    const h = frameOf('h', ['A'], [['x'], ['x'], ['y']])
    const betyg = provaKolumnpar(v, h)!
    // x möter två rader och räknas som en halv, y möter en och räknas som hel.
    expect(betyg[0]!.traffar).toBe(2)
    expect(betyg[0]!.flertraffar).toBe(1)
    expect(betyg[0]!.poang).toBeCloseTo(1.5)
    // Värdena har inga prickar, så den lösare jämförelsen ger samma poäng —
    // och då ska den strängaste stå först.
    expect(betyg[0]!.par.typ).toBe('oberoende')
  })

  it('hittar ett par som bara matchar på siffror', () => {
    /*
     * Organisationsnumren är samma siffror skrivna på två sätt, med och utan
     * bindestreck. Med den vanliga jämförelsen matchar ingenting alls, och ett
     * förslag som bara provade den hade sagt att filerna inte hör ihop.
     */
    const v = frameOf('v', ['Xa'], [['556677-8899'], ['991122-3344']])
    const h = frameOf('h', ['Ya'], [['5566778899'], ['9911223344']])
    const f = foreslaPar(v, h)
    expect(f.skal).toBe('flest')
    expect(f.par[0]!.typ).toBe('siffror')
    expect(f.betyg?.traffar).toBe(2)
  })

  it('väljer den strängaste jämförelsen när den hittar lika mycket', () => {
    // Öberg matchar öberg utan att prickarna behöver strykas. Att ändå välja
    // ”utan å ä ö” hade slagit ihop För och For utan att någon bett om det.
    const v = frameOf('v', ['Namn'], [['Öberg'], ['Ängström']])
    const h = frameOf('h', ['Namn'], [['öberg'], ['ängström']])
    expect(foreslaPar(v, h).par[0]!.typ).toBe('oberoende')
  })

  it('struntar i tomma nycklar, precis som hashjoinen', () => {
    const v = frameOf('v', ['Xa'], [[''], ['']])
    const h = frameOf('h', ['Ya'], [[''], ['']])
    const f = foreslaPar(v, h)
    expect(f.skal).toBe('ingen-traff')
    expect(f.par).toEqual([])
  })

  it('ser inte dolda kolumner', () => {
    const v = frameOf('v', ['Hemlig', 'Namn'], [['x', 'Anna']])
    const h = frameOf('h', ['Hemlig', 'Namn'], [['x', 'Anna']])
    v.columns[0]!.hidden = true
    h.columns[0]!.hidden = true
    const betyg = provaKolumnpar(v, h)!
    for (const b of betyg) {
      expect(namnet(v, b.par.vansterColId)).toBe('Namn')
      expect(namnet(h, b.par.hogerColId)).toBe('Namn')
    }
  })

  it('föreslår ingenting alls när inget par matchar en enda rad', () => {
    /*
     * Förut föll det här tillbaka på namnparet och sa att det ”också är
     * paret som matchar bäst”. Det är osant när ingenting matchar, och gav
     * användaren ett kolumnpar med noll träffar som såg ut som ett förslag.
     */
    const v = frameOf('v', ['Namn'], [['Anna']])
    const h = frameOf('h', ['Namn'], [['Bo']])
    const f = foreslaPar(v, h)
    expect(f.skal).toBe('ingen-traff')
    expect(f.par).toEqual([])
    expect(f.alla).toEqual([])
  })

  it('listar alla par som ger träffar, bäst först', () => {
    const v = frameOf('v', ['Xa', 'Xb'], [['1', 'a'], ['2', 'b']])
    const h = frameOf('h', ['Ya', 'Yb'], [['1', 'a'], ['2', 'q']])
    const f = foreslaPar(v, h)
    // Xa ↔ Ya matchar båda raderna, Xb ↔ Yb bara den ena.
    expect(namnet(v, f.alla[0]!.par.vansterColId)).toBe('Xa')
    expect(f.alla.length).toBeGreaterThan(1)
    // Och listan är sorterad: poängen faller aldrig uppåt.
    for (let i = 1; i < f.alla.length; i++) {
      expect(f.alla[i - 1]!.poang).toBeGreaterThanOrEqual(f.alla[i]!.poang)
    }
  })
})
