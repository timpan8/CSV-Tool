import { describe, expect, it } from 'vitest'
import { createColumn, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { ColumnType, Frame } from '../../src/core/types.js'
import {
  cellvarde,
  dagnummer,
  formelTransform,
  raknaFormel,
  tolkaFormel,
} from '../../src/core/ops/formel.js'

function frameOf(headers: string[], rows: string[][], typer: ColumnType[] = []): Frame {
  const columns = headers.map((name, i) => createColumn(name, rows.length, typer[i] ?? 'text'))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const FIL = frameOf(
  ['Antal', 'Pris', 'Start', 'Slut', 'Text'],
  [
    ['3', '1 240,50', '2026-01-01', '2026-03-01', 'abc'],
    ['0', '10', '2026-02-28', '2026-03-01', ''],
    ['', '5', '', '2026-03-01', 'x'],
  ],
  ['number', 'number', 'date', 'date', 'text'],
)

const rakna = (formel: string, rad = 0): string | null => {
  const t = tolkaFormel(formel, FIL)
  if (!t.rot) return null
  return formelTransform(t.rot, (n) => String(n))(FIL, rad)
}

describe('tolkning', () => {
  it('läser tal som de skrivs i filerna', () => {
    expect(rakna('1 240,50 + 0,5')).toBe('1241')
    expect(rakna('1240.5 * 2')).toBe('2481')
  })

  it('följer räkneordningen och parenteser', () => {
    expect(rakna('2 + 3 * 4')).toBe('14')
    expect(rakna('(2 + 3) * 4')).toBe('20')
    expect(rakna('-3 + 10')).toBe('7')
  })

  it('läser kolumner', () => {
    expect(rakna('{Antal} * {Pris}')).toBe('3721.5')
  })

  it('rapporterar en kolumn som inte finns', () => {
    const t = tolkaFormel('{Belopp} * 2', FIL)
    expect(t.rot).toBeNull()
    expect(t.fel).toContain('Belopp')
    expect(t.okanda).toEqual(['Belopp'])
  })

  it('rapporterar syntaxfel i klartext', () => {
    expect(tolkaFormel('2 +', FIL).fel).toContain('slutar mitt i')
    expect(tolkaFormel('(2 + 3', FIL).fel).toContain('stängdes aldrig')
    expect(tolkaFormel('2 3', FIL).fel).toContain('fortsätter')
    expect(tolkaFormel('{Antal', FIL).fel).toContain('}')
    expect(tolkaFormel('2 § 3', FIL).fel).toContain('§')
  })

  it('föreslår kolumnsyntaxen när ett namn skrivits utan klamrar', () => {
    expect(tolkaFormel('Antal * 2', FIL).fel).toContain('{Antal}')
  })

  it('en tom formel är inget fel', () => {
    const t = tolkaFormel('   ', FIL)
    expect(t.rot).toBeNull()
    expect(t.fel).toBeNull()
  })

  it('listar kolumnerna formeln använder, utan dubbletter', () => {
    expect(tolkaFormel('{Antal} * {Pris} + {Antal}', FIL).anvanda).toEqual(['Antal', 'Pris'])
  })
})

describe('funktioner', () => {
  it('RUNDA, ABS, MIN och MAX', () => {
    expect(rakna('RUNDA(1 240,50 * 1,25; 2)')).toBe('1550.63')
    expect(rakna('ABS(0 - 7)')).toBe('7')
    expect(rakna('MIN(3; 9)')).toBe('3')
    expect(rakna('MAX(3; 9)')).toBe('9')
  })

  it('säger till när antalet värden är fel', () => {
    expect(tolkaFormel('RUNDA(2)', FIL).fel).toContain('2 värden')
    expect(tolkaFormel('ABS(2; 3)', FIL).fel).toContain('1 värde')
  })

  it('okänd funktion pekar mot kolumnsyntaxen', () => {
    expect(tolkaFormel('SUMMA(2; 3)', FIL).fel).toContain('ingen funktion')
  })
})

describe('datum blir dagar', () => {
  it('dagnummer räknas utan Date, så ingen tidszon kan förskjuta dygnet', () => {
    expect(dagnummer({ ar: 1970, manad: 1, dag: 1, timme: 0, minut: 0, sekund: 0, harTid: false }))
      .toBe(0)
    expect(dagnummer({ ar: 2026, manad: 3, dag: 1, timme: 0, minut: 0, sekund: 0, harTid: false }))
      .toBe(
        dagnummer({ ar: 2026, manad: 2, dag: 28, timme: 0, minut: 0, sekund: 0, harTid: false }) + 1,
      )
  })

  it('två datum subtraherade ger antal dagar', () => {
    // 2026 är inget skottår: januari 31 + februari 28 = 59 dagar.
    expect(rakna('{Slut} - {Start}', 0)).toBe('59')
    expect(rakna('{Slut} - {Start}', 1)).toBe('1')
  })

  it('en datumkolumn läses som dagnummer, en talkolumn som tal', () => {
    expect(cellvarde(FIL.columns[0]!, 0)).toBe(3)
    expect(cellvarde(FIL.columns[2]!, 0)).toBe(dagnummer({
      ar: 2026, manad: 1, dag: 1, timme: 0, minut: 0, sekund: 0, harTid: false,
    }))
  })
})

describe('det som inte går att räkna blir tomt', () => {
  it('en tom cell smittar hela uttrycket', () => {
    // Rad 2 saknar Antal. Tomt är okänt, inte noll.
    expect(rakna('{Antal} * {Pris}', 2)).toBe('')
    expect(rakna('{Slut} - {Start}', 2)).toBe('')
  })

  it('text som inte är ett tal ger tomt', () => {
    expect(rakna('{Text} + 1', 0)).toBe('')
  })

  it('division med noll ger tomt i stället för oändligt', () => {
    expect(rakna('{Pris} / {Antal}', 1)).toBe('')
  })

  it('raknaFormel svarar null för det som inte går att räkna', () => {
    const t = tolkaFormel('{Antal} / 0', FIL)
    expect(raknaFormel(t.rot!, () => 5)).toBeNull()
  })
})
