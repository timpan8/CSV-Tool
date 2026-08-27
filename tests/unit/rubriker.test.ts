import { describe, expect, it } from 'vitest'
import { createColumn, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { ColumnId, Frame } from '../../src/core/types.js'
import { hittaAlias, rubriknyckel, synonymgrupp } from '../../src/core/ops/rubriker.js'

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
  const grupp = (namn: string) => synonymgrupp(rubriknyckel(namn))

  it('binder svenska och engelska rubriker som betyder samma sak', () => {
    expect(grupp('Namn')).toBe(grupp('Name'))
    expect(grupp('E-post')).toBe(grupp('mail'))
    expect(grupp('Ort')).toBe(grupp('City'))
  })

  it('kundnamn är också ett namn', () => {
    expect(grupp('Kundnamn')).toBe(grupp('Namn'))
  })

  it('men efternamn är det inte', () => {
    // En ändelseregel hade bundit Efternamn, Förnamn och Filnamn till Namn.
    // Listan är kort och uttrycklig just därför.
    expect(grupp('Efternamn')).toBe(-1)
    expect(grupp('Förnamn')).toBe(-1)
  })

  it('ett ensamt id är ingen synonym för kundnummer', () => {
    // Fil 1:s Kundnr och fil 2:s ID, som är ett ordernummer, skulle annars
    // hamna i samma spalt utan att någon ser det.
    expect(grupp('ID')).toBe(-1)
    expect(grupp('Kundnr')).not.toBe(-1)
  })

  it('binder inte rubriker som bara ser lika ut', () => {
    expect(grupp('leveransdatum')).toBe(-1)
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
