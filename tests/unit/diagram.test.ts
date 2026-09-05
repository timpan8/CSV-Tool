import { describe, expect, it } from 'vitest'
import { createColumn, intern, resetColumnIds } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { pivotera, type Pivotplan } from '../../src/core/ops/pivot.js'
import { TOMT_FILTER } from '../../src/core/ops/filter.js'
import type { Berakning } from '../../src/core/ops/gruppera.js'
import {
  diagramdata,
  KATEGORITAK,
  linjeArTveksam,
  SERIETAK,
  type Diagramplan,
} from '../../src/core/ops/diagram.js'
import type { Frame } from '../../src/core/types.js'

const STRUNTA = { skiftlage: false, blanksteg: true, diakriter: false }

function frameOf(headers: string[], rows: string[][]): Frame {
  resetColumnIds()
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('fil.csv', columns, rows.length)
}

const kol = (frame: Frame, namn: string) => frame.columns.find((c) => c.name === namn)!.id

function matvarde(over: Partial<Berakning> = {}): Berakning {
  return { id: 'm1', typ: 'antal', colId: null, namn: '', ...over }
}

function plan(frame: Frame, over: Partial<Pivotplan> = {}): Pivotplan {
  return {
    rader: [frame.columns[0]!.id],
    kolumner: frame.columns[1] ? [frame.columns[1].id] : [],
    matvarden: [matvarde()],
    filter: TOMT_FILTER,
    strunta: STRUNTA,
    tommaMed: false,
    underlag: 'hela',
    radtak: 200,
    kolumntak: 50,
    format: 'komma',
    decimaler: null,
    ...over,
  }
}

function dplan(over: Partial<Diagramplan> = {}): Diagramplan {
  return { typ: 'staplar', stapellage: 'grupperade', matvarde: 0, ...over }
}

/** Kör pivoten och ge diagrammet dess rader i kärnans egen ordning. */
function rita(
  frame: Frame,
  p: Pivotplan,
  d: Diagramplan,
  visning?: 'tal' | 'andelRad' | 'andelKolumn',
  texter?: { tomt: string; ovriga: string },
) {
  const res = pivotera(frame, p)
  const ordning = res.rader.map((_, i) => i)
  return diagramdata(res, p, d, ordning, visning, texter)
}

const ORTER = frameOf(
  ['Ort', 'Status', 'Belopp'],
  [
    ['Malmö', 'Aktiv', '100'],
    ['Malmö', 'Aktiv', '300'],
    ['Malmö', 'Avslutad', '50'],
    ['Lund', 'Aktiv', '200'],
    ['Lund', 'Avslutad', '10'],
    ['Kiruna', 'Aktiv', '40'],
  ],
)

describe('diagramdata', () => {
  it('gör kolumndimensionens värden till serier och raderna till kategorier', () => {
    const d = rita(ORTER, plan(ORTER), dplan())
    expect(d.kategorier).toEqual(['Kiruna', 'Lund', 'Malmö'])
    expect(d.serier.map((s) => s.etikett)).toEqual(['Aktiv', 'Avslutad'])
    expect(d.serier[0]!.varden).toEqual([1, 1, 2])
    // Kiruna har ingen avslutad rad: tom cell, inte en nolla.
    expect(d.serier[1]!.varden).toEqual([null, 1, 1])
  })

  it('en serie per kolumnlöv, namngiven med hela vägen', () => {
    const d = rita(
      ORTER,
      plan(ORTER, { rader: [kol(ORTER, 'Belopp')], kolumner: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')] }),
      dplan(),
      'tal',
      { tomt: '(tomt)', ovriga: 'Övriga' },
    )
    expect(d.serier.map((s) => s.etikett)).toEqual([
      'Aktiv · Kiruna',
      'Aktiv · Lund',
      'Aktiv · Malmö',
      'Avslutad · Lund',
      'Avslutad · Malmö',
    ])
  })

  it('utan kolumndimension finns en enda serie', () => {
    const d = rita(ORTER, plan(ORTER, { kolumner: [] }), dplan())
    expect(d.serier).toHaveLength(1)
    expect(d.serier[0]!.varden).toEqual([1, 2, 3])
  })

  it('ritar ett mätvärde i taget, och skalan räknas bara på det', () => {
    /*
     * Antal går till 3, summa till 450. En bild med båda hade krävt två
     * y-axlar, och då kan samma tal fås att korsa varandra var som helst.
     */
    const p = plan(ORTER, {
      kolumner: [],
      matvarden: [
        matvarde({ id: 'a' }),
        matvarde({ id: 'b', typ: 'summa', colId: kol(ORTER, 'Belopp') }),
      ],
    })
    expect(rita(ORTER, p, dplan({ matvarde: 0 })).max).toBe(3)
    expect(rita(ORTER, p, dplan({ matvarde: 1 })).max).toBe(450)
  })

  it('ritar bara lövrader, aldrig delsummorna ovanför dem', () => {
    // Delsumman är summan av sina barn. Ritas båda räknas varje källrad två
    // gånger, och stapeln blir dubbelt så hög som sina egna delar.
    const p = plan(ORTER, {
      rader: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')],
      kolumner: [],
    })
    const res = pivotera(ORTER, p)
    expect(res.rader.length).toBe(7) // 2 delsummor + 5 löv
    const d = diagramdata(res, p, dplan(), res.rader.map((_, i) => i))
    expect(d.kategorier).toHaveLength(5)
    expect(d.serier[0]!.varden.reduce((a, b) => a! + b!, 0)).toBe(6)
  })

  it('följer tabellens ordning, även när den är sorterad', () => {
    const p = plan(ORTER, { kolumner: [] })
    const res = pivotera(ORTER, p)
    // Baklänges, som om man klickat sig till fallande ordning.
    const bakvant = res.rader.map((_, i) => res.rader.length - 1 - i)
    const d = diagramdata(res, p, dplan(), bakvant)
    expect(d.kategorier).toEqual(['Malmö', 'Lund', 'Kiruna'])
  })
})

describe('taken', () => {
  const brett = frameOf(
    ['Rad', 'Kol'],
    Array.from({ length: 40 }, (_, i) => ['A', `k${String(i).padStart(2, '0')}`]),
  )

  it('kapar serierna vid åtta och räknar resten', () => {
    const d = rita(brett, plan(brett), dplan())
    expect(SERIETAK).toBe(8)
    expect(d.serier).toHaveLength(8)
    expect(d.utelamnadeSerier).toBe(32)
  })

  const hogt = frameOf(
    ['Rad', 'Kol'],
    Array.from({ length: 40 }, (_, i) => [`r${String(i).padStart(2, '0')}`, 'A']),
  )

  it('kapar kategorierna vid trettio och räknar resten', () => {
    const d = rita(hogt, plan(hogt), dplan())
    expect(KATEGORITAK).toBe(30)
    expect(d.kategorier).toHaveLength(30)
    expect(d.utelamnadeKategorier).toBe(10)
  })

  it('lägger aldrig till en nionde färg', () => {
    const d = rita(brett, plan(brett), dplan())
    expect(Math.max(...d.serier.map((s) => s.slot))).toBeLessThan(8)
  })
})

describe('färgerna', () => {
  it('följer serien och inte dess rang', () => {
    /*
     * Slotten delas ut i kolumndimensionens ordning, inte i storleksordning.
     * Blir en serie större än en annan ska ingen av dem byta färg — annars
     * hade läsaren fått lära om vad blått betyder mitt i en jämförelse.
     */
    const f = frameOf(
      ['Ort', 'Status'],
      [
        ['Malmö', 'Aktiv'],
        ['Malmö', 'Vilande'],
        ['Malmö', 'Vilande'],
        ['Lund', 'Aktiv'],
      ],
    )
    const d = rita(f, plan(f), dplan())
    const slotFor = (etikett: string) => d.serier.find((s) => s.etikett === etikett)!.slot
    // Vilande har fler rader än Aktiv, men Aktiv står först i bokstavsordning
    // och behåller därmed slot 0.
    expect(slotFor('Aktiv')).toBe(0)
    expect(slotFor('Vilande')).toBe(1)
  })
})

describe('skalan', () => {
  it('täcker allt som ritas och hoppar över tomma celler', () => {
    const d = rita(ORTER, plan(ORTER), dplan())
    // Största cellen är Malmö/Aktiv med 2. Tomma celler drar inte ned min
    // till noll — de finns inte på skalan alls.
    expect(d.max).toBe(2)
    expect(d.min).toBe(1)
  })

  it('mäter staplade staplar på summan per kategori', () => {
    const grupperade = rita(ORTER, plan(ORTER), dplan({ stapellage: 'grupperade' }))
    const staplade = rita(ORTER, plan(ORTER), dplan({ stapellage: 'staplade' }))
    expect(grupperade.max).toBe(2) // största enskilda stapeln
    expect(staplade.max).toBe(3) // Malmö: 2 aktiva + 1 avslutad
  })

  it('är noll i båda ändar när det inte finns något tal alls', () => {
    const tom = frameOf(['Ort', 'Belopp'], [['Malmö', 'x']])
    const d = rita(
      tom,
      plan(tom, {
        kolumner: [],
        matvarden: [matvarde({ typ: 'summa', colId: kol(tom, 'Belopp') })],
      }),
      dplan(),
    )
    expect(d.max).toBe(0)
    expect(d.min).toBe(0)
    expect(d.serier[0]!.varden).toEqual([null])
  })
})

describe('andelar', () => {
  it('ger serier som summerar till ett per kategori', () => {
    const d = rita(ORTER, plan(ORTER), dplan(), 'andelRad')
    d.kategorier.forEach((_, i) => {
      const summa = d.serier.reduce((s, serie) => s + (serie.varden[i] ?? 0), 0)
      expect(summa).toBeCloseTo(1, 6)
    })
  })
})

describe('hinder', () => {
  it('släpper fram cirkeln när den har en helhet att dela upp', () => {
    const d = rita(ORTER, plan(ORTER, { kolumner: [] }), dplan({ typ: 'cirkel' }))
    expect(d.hinder.cirkel).toBeUndefined()
  })

  it('stoppar cirkeln när serierna är flera', () => {
    const d = rita(ORTER, plan(ORTER), dplan({ typ: 'cirkel' }))
    expect(d.hinder.cirkel).toContain('en serie i taget')
  })

  it('stoppar cirkeln när mätvärdet inte går att lägga ihop', () => {
    const d = rita(
      ORTER,
      plan(ORTER, {
        kolumner: [],
        matvarden: [matvarde({ typ: 'snitt', colId: kol(ORTER, 'Belopp') })],
      }),
      dplan({ typ: 'cirkel' }),
    )
    expect(d.hinder.cirkel).toContain('lägga ihop')
  })

  it('stoppar cirkeln när tårtbitarna blir för många', () => {
    const manga = frameOf(
      ['Ort', 'Kol'],
      Array.from({ length: 7 }, (_, i) => [`ort${i}`, 'A']),
    )
    const d = rita(manga, plan(manga, { kolumner: [] }), dplan({ typ: 'cirkel' }))
    expect(d.hinder.cirkel).toContain('sex')
  })

  it('stoppar cirkeln när det bara finns en del', () => {
    const en = frameOf(['Ort', 'Kol'], [['Malmö', 'A']])
    const d = rita(en, plan(en, { kolumner: [] }), dplan({ typ: 'cirkel' }))
    expect(d.hinder.cirkel).toContain('ingen helhet')
  })

  it('hindrar aldrig staplar eller linje', () => {
    const d = rita(ORTER, plan(ORTER), dplan())
    expect(d.hinder.staplar).toBeUndefined()
    expect(d.hinder.liggande).toBeUndefined()
    expect(d.hinder.linje).toBeUndefined()
  })
})

describe('linjeArTveksam', () => {
  it('är sann för en kategorikolumn', () => {
    // En linje mellan Malmö och Lund antyder ett värde däremellan.
    expect(linjeArTveksam(ORTER, plan(ORTER))).toBe(true)
  })

  it('är falsk för tal och datum', () => {
    const f = frameOf(
      ['År', 'Kol'],
      [
        ['2024', 'A'],
        ['2025', 'A'],
      ],
    )
    // `frameOf` typar inte kolumnerna åt oss — det är kolumntypen frågan
    // gäller, så den sätts uttryckligen här.
    f.columns[0]!.type = 'number'
    expect(linjeArTveksam(f, plan(f))).toBe(false)
    f.columns[0]!.type = 'date'
    expect(linjeArTveksam(f, plan(f))).toBe(false)
  })

  it('är falsk när det inte finns någon raddimension', () => {
    expect(linjeArTveksam(ORTER, plan(ORTER, { rader: [] }))).toBe(false)
  })
})
