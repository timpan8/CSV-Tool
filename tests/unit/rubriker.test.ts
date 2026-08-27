import { describe, expect, it } from 'vitest'
import { createColumn, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { ColumnId, Frame } from '../../src/core/types.js'
import { hittaAlias, rubriknyckel, sammaRubrik, synonymgrupp } from '../../src/core/ops/rubriker.js'

function frameOf(headers: string[]): Frame {
  const columns = headers.map((name) => createColumn(name, 1))
  columns.forEach((col) => {
    col.codes[0] = intern(col, 'x')
  })
  return createFrame('f', columns, 1)
}

describe('rubriknyckel', () => {
  it('struntar i skiftläge, prickar och skiljetecken', () => {
    expect(rubriknyckel('E-post')).toBe('epost')
    expect(rubriknyckel('  E POST  ')).toBe('epost')
    expect(rubriknyckel('Ört')).toBe('ort')
  })

  it('tömmer en rubrik som bara är skiljetecken', () => {
    expect(rubriknyckel('—')).toBe('')
  })
})

describe('synonymer', () => {
  it('binder svenska och engelska rubriker som betyder samma sak', () => {
    expect(sammaRubrik('Namn', 'Name')).toBe(true)
    expect(sammaRubrik('E-post', 'mail')).toBe(true)
    expect(sammaRubrik('Ort', 'City')).toBe(true)
  })

  it('binder inte rubriker som bara ser lika ut', () => {
    expect(sammaRubrik('Namn', 'Nummer')).toBe(false)
    expect(synonymgrupp('leveransdatum')).toBe(-1)
  })

  it('två tomma rubriker är inte samma rubrik', () => {
    expect(sammaRubrik('', '')).toBe(false)
  })
})

describe('hittaAlias', () => {
  const tomt = new Set<ColumnId>()

  it('exakt namn går före synonym', () => {
    // Filen har både Namn och Kundnamn; Namn ska vinna.
    const f = frameOf(['Kundnamn', 'Namn'])
    expect(hittaAlias(f, 'Namn', tomt)).toBe(f.columns[1]!.id)
  })

  it('faller tillbaka på synonymgruppen', () => {
    const f = frameOf(['Order', 'mail'])
    expect(hittaAlias(f, 'E-post', tomt)).toBe(f.columns[1]!.id)
  })

  it('ger null när ingenting passar', () => {
    expect(hittaAlias(frameOf(['Order', 'Summa']), 'Ort', tomt)).toBeNull()
  })

  it('en kolumn som redan bundits tas aldrig en gång till', () => {
    // Annars hamnar samma värden i två målkolumner utan att någon ser det.
    const f = frameOf(['E-post', 'mail'])
    const tagna = new Set<ColumnId>([f.columns[0]!.id])
    expect(hittaAlias(f, 'E-post', tagna)).toBe(f.columns[1]!.id)
    expect(hittaAlias(f, 'E-post', new Set([f.columns[0]!.id, f.columns[1]!.id]))).toBeNull()
  })

  it('ett påhängt tal gör rubriken till en annan rubrik', () => {
    // epost2 är inte E-post. Att binda dem vore en gissning, och den sortens
    // gissning märks först när fel kolumn står i resultatet.
    expect(hittaAlias(frameOf(['epost2']), 'E-post', tomt)).toBeNull()
  })

  it('dolda kolumner räknas inte', () => {
    const f = frameOf(['Namn'])
    f.columns[0]!.hidden = true
    expect(hittaAlias(f, 'Namn', tomt)).toBeNull()
  })
})
