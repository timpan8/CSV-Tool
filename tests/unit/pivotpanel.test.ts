import { describe, expect, it } from 'vitest'
import { createColumn, intern, resetColumnIds } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import { tomPlan, type Pivotplan } from '../../src/core/ops/pivot.js'
import { flytta, taBort } from '../../src/ui/Pivotpanel.js'
import type { Frame } from '../../src/core/types.js'

/*
 * Panelens flyttlogik, utan DOM.
 *
 * `flytta` är en ren funktion från plan till plan, och det är avsiktligt: det
 * som avgör om ett drag är tillåtet ska gå att pröva utan en webbläsare, och
 * menyn och dragningen ska ge samma svar eftersom de frågar samma funktion.
 */

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

const F = frameOf(
  ['Ort', 'Status', 'Belopp'],
  [
    ['Malmö', 'Aktiv', '100'],
    ['Lund', 'Avslutad', '20'],
  ],
)
F.columns[2]!.type = 'number'
const kol = (namn: string) => F.columns.find((c) => c.name === namn)!.id

function med(over: Partial<Pivotplan>): Pivotplan {
  return { ...tomPlan(), ...over }
}

function plan(svar: ReturnType<typeof flytta>, bas: Pivotplan): Pivotplan {
  expect('plan' in svar, JSON.stringify(svar)).toBe(true)
  return { ...bas, ...('plan' in svar ? svar.plan : {}) }
}

describe('tomPlan', () => {
  it('är fyra tomma rutor', () => {
    const p = tomPlan()
    expect(p.rader).toEqual([])
    expect(p.kolumner).toEqual([])
    expect(p.matvarden).toEqual([])
    expect(p.filter.regler).toEqual([])
  })
})

describe('flytta', () => {
  it('lägger ett fält ur listan sist i Rader', () => {
    const p = plan(flytta(med({ rader: [kol('Ort')] }), F, { kalla: 'falt', colId: kol('Status') }, 'rader', 1), tomPlan())
    expect(p.rader).toEqual([kol('Ort'), kol('Status')])
  })

  it('flyttar ett fält från Rader till Kolumner — det ligger aldrig i båda', () => {
    const bas = med({ rader: [kol('Ort'), kol('Status')] })
    const p = plan(flytta(bas, F, { kalla: 'rader', index: 0 }, 'kolumner', 0), bas)
    expect(p.rader).toEqual([kol('Status')])
    expect(p.kolumner).toEqual([kol('Ort')])
  })

  it('ett fält ur listan som redan ligger i Rader flyttar till Kolumner, som i Excel', () => {
    const bas = med({ rader: [kol('Ort')] })
    const p = plan(flytta(bas, F, { kalla: 'falt', colId: kol('Ort') }, 'kolumner', 0), bas)
    expect(p.rader).toEqual([])
    expect(p.kolumner).toEqual([kol('Ort')])
  })

  it('säger nej med skäl när fältet redan ligger i målrutan', () => {
    const bas = med({ rader: [kol('Ort')] })
    expect(flytta(bas, F, { kalla: 'falt', colId: kol('Ort') }, 'rader', 1)).toEqual({
      fel: 'finnsRedan',
      ruta: 'rader',
    })
    const filtrerad = plan(flytta(bas, F, { kalla: 'falt', colId: kol('Ort') }, 'filter', 0), bas)
    expect(flytta(filtrerad, F, { kalla: 'falt', colId: kol('Ort') }, 'filter', 1)).toEqual({
      fel: 'finnsRedan',
      ruta: 'filter',
    })
  })

  it('Värden tar samma fält flera gånger', () => {
    const en = plan(flytta(tomPlan(), F, { kalla: 'falt', colId: kol('Belopp') }, 'varden', 0), tomPlan())
    const tva = plan(flytta(en, F, { kalla: 'falt', colId: kol('Belopp') }, 'varden', 1), en)
    expect(tva.matvarden).toHaveLength(2)
    // Ett tal summeras, en text räknas.
    expect(tva.matvarden[0]!.typ).toBe('summa')
    const text = plan(flytta(tva, F, { kalla: 'falt', colId: kol('Ort') }, 'varden', 2), tva)
    expect(text.matvarden[2]!.typ).toBe('ifyllda')
  })

  it('ordnar om inom en ruta, och målplatsen glider när källan plockats bort framför den', () => {
    const bas = med({ rader: [kol('Ort'), kol('Status'), kol('Belopp')] })
    // Dra Ort och släpp *före* Belopp (index 2): Ort hamnar mellan.
    const p = plan(flytta(bas, F, { kalla: 'rader', index: 0 }, 'rader', 2), bas)
    expect(p.rader).toEqual([kol('Status'), kol('Ort'), kol('Belopp')])
    // Släpp *efter* sista: index 3.
    const sist = plan(flytta(bas, F, { kalla: 'rader', index: 0 }, 'rader', 3), bas)
    expect(sist.rader).toEqual([kol('Status'), kol('Belopp'), kol('Ort')])
    // Släpp på sig själv: oförändrad.
    const samma = plan(flytta(bas, F, { kalla: 'rader', index: 1 }, 'rader', 1), bas)
    expect(samma.rader).toEqual(bas.rader)
  })

  it('Antal rader går att ordna om men inte att göra till dimension', () => {
    const antal = { id: 'a', typ: 'antal' as const, colId: null, namn: '' }
    const summa = { id: 'b', typ: 'summa' as const, colId: kol('Belopp'), namn: '' }
    const bas = med({ matvarden: [antal, summa] })
    const p = plan(flytta(bas, F, { kalla: 'varden', index: 0 }, 'varden', 2), bas)
    expect(p.matvarden.map((m) => m.id)).toEqual(['b', 'a'])
    expect(flytta(bas, F, { kalla: 'varden', index: 0 }, 'rader', 0)).toEqual({ fel: 'saknarKolumn' })
    expect(flytta(bas, F, { kalla: 'varden', index: 0 }, 'filter', 0)).toEqual({ fel: 'saknarKolumn' })
  })

  it('ett mätvärde blir en dimension på sin kolumn, och lämnar Värden', () => {
    const summa = { id: 'b', typ: 'summa' as const, colId: kol('Belopp'), namn: '' }
    const bas = med({ matvarden: [summa] })
    const p = plan(flytta(bas, F, { kalla: 'varden', index: 0 }, 'rader', 0), bas)
    expect(p.matvarden).toEqual([])
    expect(p.rader).toEqual([kol('Belopp')])
  })

  it('ett filterfält är en regel med *är något av* och inga valda värden', () => {
    const p = plan(flytta(tomPlan(), F, { kalla: 'falt', colId: kol('Status') }, 'filter', 0), tomPlan())
    expect(p.filter.regler).toHaveLength(1)
    expect(p.filter.regler[0]!.operator).toBe('iLista')
    expect(p.filter.regler[0]!.varden).toEqual([])
    // Skiftlägeskänslig, som pivotens gruppering är som förval.
    expect(p.filter.regler[0]!.versalkanslig).toBe(true)
  })

  it('en kolumn som inte finns i filen går inte att flytta, men att ta bort', () => {
    const bas = med({ rader: ['saknas'] })
    expect(flytta(bas, F, { kalla: 'rader', index: 0 }, 'kolumner', 0)).toEqual({ fel: 'borttagen' })
    expect(taBort(bas, 'rader', 0)).toEqual({ rader: [] })
  })
})

describe('taBort', () => {
  it('tar bort på rätt plats i varje ruta', () => {
    const summa = { id: 'b', typ: 'summa' as const, colId: kol('Belopp'), namn: '' }
    const bas = med({ rader: [kol('Ort')], kolumner: [kol('Status')], matvarden: [summa] })
    expect(taBort(bas, 'rader', 0)).toEqual({ rader: [] })
    expect(taBort(bas, 'kolumner', 0)).toEqual({ kolumner: [] })
    expect(taBort(bas, 'varden', 0)).toEqual({ matvarden: [] })
  })
})
