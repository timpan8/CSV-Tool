import { describe, expect, it } from 'vitest'
import { createColumn, intern, resetColumnIds } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import {
  ADDITIVA,
  arAdditiv,
  foreslagenPlan,
  KOLUMNLOVTAK,
  PIVOTBERAKNINGAR,
  pivotberakningar,
  pivotera,
  pivotnamn,
  pivotTillFrame,
  type Pivotplan,
  type Pivotresultat,
} from '../../src/core/ops/pivot.js'
import { TOMT_FILTER } from '../../src/core/ops/filter.js'
import type { Berakning } from '../../src/core/ops/gruppera.js'
import type { Frame } from '../../src/core/types.js'

const STRUNTA = { skiftlage: false, blanksteg: true, diakriter: false }
const TEXTER = { totalt: 'Totalt', tomt: '(tomt)', ovriga: 'Övriga' }

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
    kolumntak: 25,
    format: 'komma',
    decimaler: null,
    ...over,
  }
}

/** Kolumnlövens vägar som text: `Aktiv/Sverige`. Övriga-lövet blir tomt. */
const vagar = (res: Pivotresultat) =>
  res.kolumner.map((l) => l.nivaer.map((n) => n.etikett).join('/'))

/** Cellen som text, med Totalt-raden på index `res.rader.length`. */
function cell(res: Pivotresultat, rad: number, kolumn: number, matvarde = 0, antalMat = 1): string {
  return res.text[(rad * res.bredd + kolumn) * antalMat + matvarde] ?? ''
}

/** Hela matrisen som textrader, Totalt-raden sist. */
function matris(res: Pivotresultat, antalMat = 1): string[][] {
  const ut: string[][] = []
  for (let r = 0; r < res.hojd; r++) {
    const rad: string[] = []
    for (let k = 0; k < res.bredd; k++) {
      for (let m = 0; m < antalMat; m++) rad.push(cell(res, r, k, m, antalMat))
    }
    ut.push(rad)
  }
  return ut
}

const ORTER = frameOf(
  ['Ort', 'Status', 'Belopp', 'Kund'],
  [
    ['Malmö', 'Aktiv', '100', 'A'],
    ['Malmö', 'Aktiv', '300', 'B'],
    ['Malmö', 'Avslutad', '50', 'A'],
    ['Lund', 'Aktiv', '200', 'C'],
    ['Lund', 'Avslutad', '10', 'A'],
    ['Kiruna', 'Aktiv', '40', 'C'],
  ],
)

describe('pivotera', () => {
  it('lägger grupperna i en matris med rubriker åt båda håll', () => {
    const res = pivotera(ORTER, plan(ORTER))
    expect(vagar(res)).toEqual(['Aktiv', 'Avslutad'])
    expect(res.rader.map((r) => r.etiketter[0])).toEqual(['Kiruna', 'Lund', 'Malmö'])
    // Rubrikordningen är kolumnens egen — svensk bokstavsordning för text.
    expect(matris(res)).toEqual([
      ['1', '', '1'],
      ['1', '1', '2'],
      ['2', '1', '3'],
      ['4', '2', '6'],
    ])
  })

  it('räknar Totalt ur raderna, inte ur cellerna', () => {
    // Snittet i Malmö är 200 och i Kiruna 40, men snittet av alla sex beloppen
    // är 700/6 ≈ 116,67 — inte medelvärdet av kolumnens snitt.
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        kolumner: [],
        matvarden: [matvarde({ typ: 'snitt', colId: kol(ORTER, 'Belopp') })],
      }),
    )
    const totalrad = res.rader.length
    expect(res.tal[totalrad * res.bredd]).toBeCloseTo(700 / 6, 6)
    expect(cell(res, 2, 0)).toBe('150') // Malmö: (100+300+50)/3
    // Snittet av ortssnitten vore (40 + 105 + 150) / 3 ≈ 98,33 — ett annat tal.
    expect(res.tal[totalrad * res.bredd]).not.toBeCloseTo(295 / 3, 6)
    // Texten bär full precision, eftersom den går vidare till en flik. Vyn
    // rundar av när den ritar.
    expect(cell(res, totalrad, 0)).toBe('116,66666666666667')
  })

  it('unika kunder i två orter är en kund, inte två', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        kolumner: [kol(ORTER, 'Status')],
        matvarden: [matvarde({ typ: 'unika', colId: kol(ORTER, 'Kund') })],
      }),
    )
    // Kund A finns i Malmö (Aktiv + Avslutad) och i Lund (Avslutad).
    const malmo = res.rader.findIndex((r) => r.etiketter[0] === 'Malmö')
    expect(cell(res, malmo, 0)).toBe('2') // A och B under Aktiv
    expect(cell(res, malmo, 1)).toBe('1') // A under Avslutad
    expect(cell(res, malmo, 2)).toBe('2') // ändå bara A och B i hela Malmö
    // Hela filen har tre kunder, fast kolumnernas siffror lägger ihop till fem.
    expect(cell(res, res.rader.length, 2)).toBe('3')
  })

  it('en cell utan läsbara tal är tom, aldrig noll', () => {
    const f = frameOf(
      ['Ort', 'Status', 'Belopp'],
      [
        ['Malmö', 'Aktiv', '100'],
        ['Malmö', 'Avslutad', 'okänt'],
      ],
    )
    const res = pivotera(
      f,
      plan(f, { matvarden: [matvarde({ typ: 'summa', colId: kol(f, 'Belopp') })] }),
    )
    expect(cell(res, 0, 0)).toBe('100')
    expect(res.text[(0 * res.bredd + 1) * 1]).toBeNull()
    // Cellen räknades inte, men raden vet att den tittade på ett värde.
    expect(res.lasbarhet[0]).toEqual({ id: 'm1', lasta: 1, ifyllda: 2 })
  })

  it('radsummorna stämmer med cellerna för det som går att lägga ihop', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, { matvarden: [matvarde({ typ: 'summa', colId: kol(ORTER, 'Belopp') })] }),
    )
    for (let r = 0; r < res.hojd; r++) {
      let summa = 0
      for (let k = 0; k < res.bredd - 1; k++) {
        const v = res.tal[r * res.bredd + k]!
        if (!Number.isNaN(v)) summa += v
      }
      expect(res.tal[r * res.bredd + (res.bredd - 1)]).toBeCloseTo(summa, 6)
    }
  })

  it('kapar breda dimensioner och lägger resten i Övriga', () => {
    const rader = [
      ['A', 'x'],
      ['A', 'x'],
      ['A', 'x'],
      ['B', 'x'],
      ['B', 'x'],
      ['C', 'x'],
      ['D', 'x'],
    ]
    const f = frameOf(['Kod', 'Allt'], rader)
    const res = pivotera(f, plan(f, { rader: [kol(f, 'Allt')], kolumner: [kol(f, 'Kod')], kolumntak: 2 }))
    expect(vagar(res)).toEqual(['A', 'B', ''])
    // Värdet föll bort i sin dimension, inte som kombination: det är
    // rubriken som är Övriga, inte lövet.
    expect(res.kolumner[2]!.nivaer[0]!.ovriga).toBe(true)
    expect(res.kolumner[2]!.nivaer[0]!.varden).toBe(2) // C och D
    expect(res.doldaKolumnvarden).toBe(2)
    // Övriga bär två rader, så radsumman är fortfarande sju.
    expect(matris(res)).toEqual([
      ['3', '2', '2', '7'],
      ['3', '2', '2', '7'],
    ])
  })

  it('räknar på hela filen som förval och på vyn när man ber om det', () => {
    const filtrerad: Frame = { ...ORTER, view: Uint32Array.from([0, 1]) }
    const hela = pivotera(filtrerad, plan(filtrerad, { kolumner: [] }))
    const vyn = pivotera(filtrerad, plan(filtrerad, { kolumner: [], underlag: 'vyn' }))
    expect(hela.antalKallrader).toBe(6)
    expect(vyn.antalKallrader).toBe(2)
    expect(vyn.rader.map((r) => r.etiketter[0])).toEqual(['Malmö'])
  })

  it('lämnar rader utan värde utanför, om man inte ber om en egen rubrik', () => {
    const f = frameOf(
      ['Ort', 'Status'],
      [
        ['Malmö', 'Aktiv'],
        ['', 'Aktiv'],
      ],
    )
    const utan = pivotera(f, plan(f))
    expect(utan.utanNyckel).toBe(1)
    expect(utan.rader).toHaveLength(1)

    const med = pivotera(f, plan(f, { tommaMed: true }))
    expect(med.utanNyckel).toBe(0)
    expect(med.rader).toHaveLength(2)
    expect(med.rader[1]!.tom).toBe(true)
  })

  it('slår ihop stavningar bara när man struntat i skillnaden', () => {
    const f = frameOf(
      ['Ort', 'Status'],
      [
        ['Malmö', 'Aktiv'],
        ['malmö', 'Aktiv'],
      ],
    )
    expect(pivotera(f, plan(f)).rader).toHaveLength(2)
    const ihop = pivotera(f, plan(f, { strunta: { ...STRUNTA, skiftlage: true } }))
    expect(ihop.rader).toHaveLength(1)
    // Etiketten är stavningen som kom först i filen, inte den normaliserade.
    expect(ihop.rader[0]!.etiketter[0]).toBe('Malmö')
  })

  it('ger delsummor på varje nivå, och de stämmer med barnen', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        rader: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')],
        kolumner: [],
        matvarden: [matvarde({ typ: 'summa', colId: kol(ORTER, 'Belopp') })],
      }),
    )
    const nivaer = res.rader.map((r) => `${' '.repeat(r.niva)}${r.etiketter[r.niva]}`)
    expect(nivaer).toEqual([
      'Aktiv',
      ' Kiruna',
      ' Lund',
      ' Malmö',
      'Avslutad',
      ' Lund',
      ' Malmö',
    ])
    const varde = (i: number) => res.tal[i * res.bredd]!
    expect(varde(0)).toBe(40 + 200 + 400) // Aktiv
    expect(varde(1) + varde(2) + varde(3)).toBe(varde(0))
    expect(varde(4)).toBe(10 + 50) // Avslutad
    expect(res.tal[res.rader.length * res.bredd]).toBe(700)
  })

  it('lägger flera mätvärden sida vid sida under varje kolumnvärde', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        matvarden: [
          matvarde({ id: 'a' }),
          matvarde({ id: 'b', typ: 'summa', colId: kol(ORTER, 'Belopp') }),
        ],
      }),
    )
    const malmo = res.rader.findIndex((r) => r.etiketter[0] === 'Malmö')
    expect(cell(res, malmo, 0, 0, 2)).toBe('2') // antal under Aktiv
    expect(cell(res, malmo, 0, 1, 2)).toBe('400') // summa under Aktiv
    expect(cell(res, malmo, 2, 1, 2)).toBe('450') // summa i hela Malmö
  })

  it('minsta och största följer kolumnens egen ordning', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        kolumner: [],
        matvarden: [
          matvarde({ id: 'a', typ: 'minsta', colId: kol(ORTER, 'Belopp') }),
          matvarde({ id: 'b', typ: 'storsta', colId: kol(ORTER, 'Belopp') }),
        ],
      }),
    )
    const malmo = res.rader.findIndex((r) => r.etiketter[0] === 'Malmö')
    expect(cell(res, malmo, 0, 0, 2)).toBe('50')
    expect(cell(res, malmo, 0, 1, 2)).toBe('300')
    expect(cell(res, res.rader.length, 0, 0, 2)).toBe('10')
    expect(cell(res, res.rader.length, 0, 1, 2)).toBe('300')
  })

  it('en pivot utan dimensioner är ett enda tal', () => {
    const res = pivotera(ORTER, plan(ORTER, { rader: [], kolumner: [] }))
    expect(res.rader).toHaveLength(0)
    expect(res.bredd).toBe(1)
    expect(cell(res, 0, 0)).toBe('6')
  })

  it('ett mätvärde vars kolumn tagits bort ger tomma celler i stället för att kasta', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, { matvarden: [matvarde({ typ: 'summa', colId: 'borta' })] }),
    )
    expect(res.text.every((t) => t === null)).toBe(true)
  })
})

describe('flera kolumnfält', () => {
  it('ger ett löv per kombination som finns i datat, i nästlad ordning', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, { rader: [kol(ORTER, 'Kund')], kolumner: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')] }),
    )
    // Sex kombinationer finns, inte de tolv den kartesiska produkten ger:
    // Kiruna har ingen avslutad rad, Lund ingen … och så vidare.
    expect(vagar(res)).toEqual([
      'Aktiv/Kiruna',
      'Aktiv/Lund',
      'Aktiv/Malmö',
      'Avslutad/Lund',
      'Avslutad/Malmö',
    ])
    // Yttersta fältet först: alla Aktiv står före alla Avslutad. Det är
    // ordningen rubrikvåningarna behöver för att kunna slås ihop till löpor.
    expect(res.kolumner.map((l) => l.stig[0])).toEqual([0, 0, 0, 1, 1])
    expect(res.kolumnnivaer).toBe(2)
  })

  it('räknar Totalt över alla löv, aldrig som en summa av dem', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        rader: [kol(ORTER, 'Kund')],
        kolumner: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')],
        matvarden: [matvarde({ typ: 'unika', colId: kol(ORTER, 'Kund') })],
      }),
    )
    // Kund A står i tre löv men är en kund. Summan av lövens ettor vore tre.
    const a = res.rader.findIndex((r) => r.etiketter[0] === 'A')
    expect(cell(res, a, res.bredd - 1)).toBe('1')
    expect(cell(res, res.rader.length, res.bredd - 1)).toBe('3') // A, B, C
  })

  it('lövens radantal summerar till källraderna', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, { rader: [kol(ORTER, 'Kund')], kolumner: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')] }),
    )
    expect(res.kolumner.reduce((s, l) => s + l.rader, 0)).toBe(res.antalKallrader)
  })

  it('viker in kombinationerna som inte fick plats i ett enda Övriga-löv', () => {
    // Sju gånger sju värden ger fyrtionio kombinationer där båda
    // dimensionerna ryms var för sig. Taket sitter alltså på produkten, och
    // det är det som gör en kapad korstabell möjlig att läsa.
    const rader: string[][] = []
    for (let a = 0; a < 7; a++) {
      for (let b = 0; b < 7; b++) rader.push([`A${a}`, `B${b}`, 'x'])
    }
    const f = frameOf(['A', 'B', 'Allt'], rader)
    const res = pivotera(
      f,
      plan(f, { rader: [kol(f, 'Allt')], kolumner: [kol(f, 'A'), kol(f, 'B')] }),
    )

    expect(res.kolumner.length).toBe(KOLUMNLOVTAK + 1)
    expect(res.doldaKolumnlov).toBe(49 - KOLUMNLOVTAK)
    const sista = res.kolumner.at(-1)!
    expect(sista.ovriga).toBe(true)
    // Övriga-lövet är många stigar, inte en. Vyn ritar det över alla våningar.
    expect(sista.nivaer).toEqual([])
    expect(sista.rader).toBe(49 - KOLUMNLOVTAK)
    // Totalt står kvar: Övriga bär raderna som inte fick egen spalt.
    expect(cell(res, res.rader.length, res.bredd - 1)).toBe('49')
    expect(res.kolumner.reduce((s, l) => s + l.rader, 0)).toBe(49)
  })
})

describe('pivotens filter', () => {
  it('en regel minskar underlaget utan att röra vyn', () => {
    const res = pivotera(
      ORTER,
      plan(ORTER, {
        kolumner: [],
        filter: {
          ...TOMT_FILTER,
          regler: [
            {
              id: 'r1',
              colId: kol(ORTER, 'Status'),
              operator: 'iLista',
              varde: '',
              varden: ['Aktiv'],
              av: false,
            },
          ],
        },
      }),
    )
    expect(res.antalKallrader).toBe(4)
    expect(res.rader.map((r) => r.etiketter[0])).toEqual(['Kiruna', 'Lund', 'Malmö'])
    expect(cell(res, res.rader.length, 0)).toBe('4')
    // Filen är orörd — pivoten har en egen radkälla och skriver aldrig i vyn.
    expect(ORTER.view.length).toBe(6)
  })

  it('två regler gallrar tillsammans', () => {
    const tva = pivotera(
      ORTER,
      plan(ORTER, {
        kolumner: [],
        filter: {
          ...TOMT_FILTER,
          regler: [
            {
              id: 'r1',
              colId: kol(ORTER, 'Status'),
              operator: 'iLista',
              varde: '',
              varden: ['Aktiv'],
              av: false,
            },
            {
              id: 'r2',
              colId: kol(ORTER, 'Ort'),
              operator: 'iLista',
              varde: '',
              varden: ['Malmö', 'Lund'],
              av: false,
            },
          ],
        },
      }),
    )
    expect(tva.antalKallrader).toBe(3)
    expect(tva.rader.map((r) => r.etiketter[0])).toEqual(['Lund', 'Malmö'])
  })

  it('ett tomt filter kostar ingenting och ändrar ingenting', () => {
    const utan = pivotera(ORTER, plan(ORTER))
    const med = pivotera(ORTER, plan(ORTER, { filter: { ...TOMT_FILTER, regler: [] } }))
    expect(matris(med)).toEqual(matris(utan))
  })
})

describe('mätvärdena en pivot tar', () => {
  it('utelämnar de tre som beror på radernas ordning', () => {
    expect(PIVOTBERAKNINGAR).not.toContain('forsta')
    expect(PIVOTBERAKNINGAR).not.toContain('sista')
    expect(PIVOTBERAKNINGAR).not.toContain('lista')
    expect(pivotberakningar().map((b) => b.typ)).toEqual([...PIVOTBERAKNINGAR])
  })

  it('säger vilka som går att visa som andel', () => {
    expect(arAdditiv(matvarde({ typ: 'summa' }))).toBe(true)
    expect(arAdditiv(matvarde({ typ: 'snitt' }))).toBe(false)
    expect(arAdditiv(matvarde({ typ: 'unika' }))).toBe(false)
    expect([...ADDITIVA]).toEqual(['antal', 'summa', 'ifyllda'])
  })
})

describe('foreslagenPlan', () => {
  it('väljer kategorikolumner så att vyn säger något direkt', () => {
    const p = foreslagenPlan(ORTER)
    // Status har två värden, Ort tre — den kortare blir rader.
    expect(p.rader).toEqual([kol(ORTER, 'Status')])
    expect(p.kolumner).toEqual([kol(ORTER, 'Ort')])
    expect(p.matvarden[0]!.typ).toBe('antal')
  })

  it('börjar på kolumnen man kom från', () => {
    const p = foreslagenPlan(ORTER, kol(ORTER, 'Ort'))
    expect(p.rader).toEqual([kol(ORTER, 'Ort')])
    expect(p.kolumner).not.toContain(kol(ORTER, 'Ort'))
  })

  it('klarar en fil där ingen kolumn är en kategori', () => {
    const f = frameOf(['Nr'], [['1'], ['2']])
    const p = foreslagenPlan(f)
    expect(p.rader).toEqual([kol(f, 'Nr')])
    expect(p.kolumner).toEqual([])
  })

  it('föreslår aldrig en talkolumn som dimension', () => {
    // Fjorton beloppsrubriker i sidled är ingen överblick, och kolumnen gör
    // mer nytta som mätvärde.
    const f = frameOf(
      ['Belopp', 'Status'],
      [
        ['100', 'Aktiv'],
        ['200', 'Aktiv'],
        ['300', 'Avslutad'],
        ['400', 'Avslutad'],
      ],
    )
    const p = foreslagenPlan(f)
    expect(p.rader).toEqual([kol(f, 'Status')])
    expect(p.kolumner).toEqual([])
  })

  it('väljer inte en kolumn där nästan varje rad har sitt eget värde', () => {
    const f = frameOf(
      ['Ort', 'Status'],
      [
        ['Malmö', 'Aktiv'],
        ['Lund', 'Aktiv'],
        ['Kiruna', 'Avslutad'],
        ['Boden', 'Avslutad'],
      ],
    )
    const p = foreslagenPlan(f)
    expect(p.rader).toEqual([kol(f, 'Status')])
    expect(p.kolumner).toEqual([])
  })
})

describe('pivotTillFrame', () => {
  it('tar med lövraderna, kolumnvärdena och Totalt', () => {
    const p = plan(ORTER)
    const res = pivotera(ORTER, p)
    const ut = pivotTillFrame(res, p, ORTER, 'pivot.csv', TEXTER)
    expect(ut.columns.map((c) => c.name)).toEqual(['Ort', 'Aktiv', 'Avslutad', 'Totalt'])
    expect(ut.rowCount).toBe(3)
    expect(ut.name).toBe('pivot.csv')
    // Ingen Totalt-rad: en summarad i en datatabell sorterar in sig i mitten.
    expect(ut.rowCount).toBe(res.rader.length)
  })

  it('namnger kolumnerna med mätvärdet när de är flera', () => {
    const p = plan(ORTER, {
      matvarden: [
        matvarde({ id: 'a' }),
        matvarde({ id: 'b', typ: 'summa', colId: kol(ORTER, 'Belopp') }),
      ],
    })
    const ut = pivotTillFrame(pivotera(ORTER, p), p, ORTER, 'x', TEXTER)
    expect(ut.columns.map((c) => c.name)).toEqual([
      'Ort',
      'Aktiv · Antal rader',
      'Aktiv · Summa Belopp',
      'Avslutad · Antal rader',
      'Avslutad · Summa Belopp',
      'Totalt · Antal rader',
      'Totalt · Summa Belopp',
    ])
  })

  it('namnger en nästlad kolumn med hela vägen', () => {
    const p = plan(ORTER, {
      rader: [kol(ORTER, 'Kund')],
      kolumner: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')],
    })
    const ut = pivotTillFrame(pivotera(ORTER, p), p, ORTER, 'x', TEXTER)
    // `Lund` ensamt vore tvetydigt: samma ort står under både Aktiv och
    // Avslutad, och två spalter med samma namn är ingen tabell.
    expect(ut.columns.map((c) => c.name)).toEqual([
      'Kund',
      'Aktiv · Kiruna',
      'Aktiv · Lund',
      'Aktiv · Malmö',
      'Avslutad · Lund',
      'Avslutad · Malmö',
      'Totalt',
    ])
  })

  it('tål ett kolumnvärde som heter samma sak som totalkolumnen', () => {
    const f = frameOf(
      ['Ort', 'Status'],
      [
        ['Malmö', 'Totalt'],
        ['Lund', 'Aktiv'],
      ],
    )
    const p = plan(f)
    const ut = pivotTillFrame(pivotera(f, p), p, f, 'x', TEXTER)
    expect(ut.columns.map((c) => c.name)).toEqual(['Ort', 'Aktiv', 'Totalt', 'Totalt (2)'])
  })

  it('tar bara med lövraderna när nivåerna är flera', () => {
    const p = plan(ORTER, {
      rader: [kol(ORTER, 'Status'), kol(ORTER, 'Ort')],
      kolumner: [],
    })
    const res = pivotera(ORTER, p)
    const ut = pivotTillFrame(res, p, ORTER, 'x', TEXTER)
    expect(res.rader).toHaveLength(7) // 2 delsummor + 5 löv
    expect(ut.rowCount).toBe(5)
    expect(ut.columns.map((c) => c.name)).toEqual(['Status', 'Ort', 'Totalt'])
  })
})

describe('pivotnamn', () => {
  it('säger vad pivoten delar upp på', () => {
    expect(pivotnamn(ORTER, plan(ORTER))).toBe('fil.csv per Ort × Status')
    expect(pivotnamn(ORTER, plan(ORTER, { kolumner: [] }))).toBe('fil.csv per Ort')
    expect(pivotnamn(ORTER, plan(ORTER, { rader: [], kolumner: [] }))).toBe('fil.csv – pivot')
  })
})
