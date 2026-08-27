import { describe, expect, it } from 'vitest'
import { createColumn, codeCounts, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import { cell } from '../../src/state/selection.js'
import { redo, undo, type Tab } from '../../src/state/store.js'
import { tillampaForhandsvisning } from '../../src/state/edits.js'
import {
  ANDRAD,
  PROBLEM,
  beraknaForhandsvisning,
  forCell,
} from '../../src/state/preview.js'
import { computeView } from '../../src/state/view.js'
import { datumTransform, inventera, tolkaDatum } from '../../src/core/ops/dates.js'
import { epostTransform } from '../../src/core/ops/email.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

function tabOf(headers: string[], rows: string[][]): Tab {
  const frame = frameOf(headers, rows)
  return {
    id: 't1',
    frame,
    history: [],
    cursor: 0,
    dataRevision: 0,
    activeColumnId: frame.columns[0]?.id ?? null,
    smutsig: false,
    viewSpec: {},
    kolumnerMedTraff: 0,
    markering: cell(0, 0),
    redigerar: null,
    forhandsvisning: null,
  }
}

const versaler = { etikett: 'Versaler', kind: 'test', fn: (v: string) => v.toUpperCase() }

describe('beraknaForhandsvisning', () => {
  it('raknar celler och inte unika varden', () => {
    const frame = frameOf(['ort'], [['lund'], ['lund'], ['lund'], ['LUND'], ['']])
    const forh = beraknaForhandsvisning(frame.columns[0]!, versaler)
    expect(forh.andrade).toBe(3)
    expect(forh.ifyllda).toBe(4)
  })

  it('lamnar tomma celler utanfor bade transform och rakning', () => {
    const frame = frameOf(['ort'], [[''], [''], ['lund']])
    const forh = beraknaForhandsvisning(frame.columns[0]!, {
      ...versaler,
      fn: (v) => (v === '' ? 'SKULLE ALDRIG HANDA' : v.toUpperCase()),
    })
    expect(forh.ifyllda).toBe(1)
    expect(forh.andrade).toBe(1)
    expect(forh.nya[0]).toBe('')
  })

  it('markerar problem pa originalvardet aven nar vardet lamnas ororat', () => {
    // Precis fallet "lat sta": inget andras, men raden ar den som behover ses over.
    const frame = frameOf(['datum'], [['2026-08-27'], ['i gar'], ['i gar']])
    const inst = { dagForst: true, excelSerie: false, mal: 'datum' as const, onError: 'behall' as const }
    const forh = beraknaForhandsvisning(frame.columns[0]!, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform(inst),
      arProblem: (v) => tolkaDatum(v, inst).datum === null,
    })
    expect(forh.andrade).toBe(0)
    expect(forh.problem).toBe(2)
  })

  it('en cell kan vara bade andrad och problem', () => {
    const frame = frameOf(['datum'], [['i gar']])
    const inst = { dagForst: true, excelSerie: false, mal: 'datum' as const, onError: 'tom' as const }
    const forh = beraknaForhandsvisning(frame.columns[0]!, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform(inst),
      arProblem: (v) => tolkaDatum(v, inst).datum === null,
    })
    const kod = frame.columns[0]!.codes[0]!
    expect(forh.status[kod]! & ANDRAD).toBeTruthy()
    expect(forh.status[kod]! & PROBLEM).toBeTruthy()
  })

  it('forCell svarar bara for sin egen kolumn', () => {
    const frame = frameOf(['a', 'b'], [['lund', 'lund']])
    const forh = beraknaForhandsvisning(frame.columns[0]!, versaler)
    expect(forCell(forh, frame.columns[0]!, 0)?.efter).toBe('LUND')
    expect(forCell(forh, frame.columns[1]!, 0)).toBeNull()
    expect(forCell(null, frame.columns[0]!, 0)).toBeNull()
  })
})

describe('visaBara', () => {
  const bygg = () => {
    const frame = frameOf(
      ['datum'],
      [['2026-08-27'], ['27/08/2026'], ['i gar'], ['2026-01-05'], ['']],
    )
    const inst = { dagForst: true, excelSerie: false, mal: 'datum' as const, onError: 'behall' as const }
    const forh = beraknaForhandsvisning(frame.columns[0]!, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform(inst),
      arProblem: (v) => tolkaDatum(v, inst).datum === null,
    })
    return { frame, forh }
  }

  it('utan begransning visas allt', () => {
    const { frame, forh } = bygg()
    expect(computeView(frame, {}, forh).view.length).toBe(5)
  })

  it('bara andrade ger raderna som skrivs om', () => {
    const { frame, forh } = bygg()
    const vy = computeView(frame, { visaBara: 'andrade' }, forh).view
    expect(Array.from(vy)).toEqual([1])
  })

  it('bara problem ger raderna som inte gar att tolka', () => {
    const { frame, forh } = bygg()
    const vy = computeView(frame, { visaBara: 'problem' }, forh).view
    expect(Array.from(vy)).toEqual([2])
  })

  it('komponerar med sokning i stallet for att ersatta den', () => {
    const frame = frameOf(
      ['namn', 'datum'],
      [
        ['Anna', '27/08/2026'],
        ['Bertil', '27/08/2026'],
        ['Anna', '2026-08-27'],
      ],
    )
    const inst = { dagForst: true, excelSerie: false, mal: 'datum' as const, onError: 'behall' as const }
    const forh = beraknaForhandsvisning(frame.columns[1]!, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform(inst),
    })
    const vy = computeView(frame, { search: 'anna', visaBara: 'andrade' }, forh).view
    expect(Array.from(vy)).toEqual([0])
  })

  it('utan forhandsvisning ar begransningen verkningslos i stallet for tom', () => {
    const { frame } = bygg()
    expect(computeView(frame, { visaBara: 'andrade' }, null).view.length).toBe(5)
  })
})

describe('tillampaForhandsvisning', () => {
  it('skriver om kolumnen och gar att angra', () => {
    const tab = tabOf(['datum'], [['27/08/2026'], ['i gar'], ['2026-01-05']])
    const col = tab.frame.columns[0]!
    const inst = { dagForst: true, excelSerie: false, mal: 'datum' as const, onError: 'behall' as const }
    const forh = beraknaForhandsvisning(col, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform(inst),
      nyTyp: 'date',
    })

    expect(tillampaForhandsvisning(tab, forh)).toBe(1)
    expect(getCell(col, 0)).toBe('2026-08-27')
    expect(getCell(col, 1)).toBe('i gar')
    expect(col.type).toBe('date')

    undo(tab)
    expect(getCell(col, 0)).toBe('27/08/2026')
    expect(getCell(col, 1)).toBe('i gar')
    expect(col.type).not.toBe('date')
  })

  it('ror inte en last typ', () => {
    const tab = tabOf(['datum'], [['27/08/2026']])
    const col = tab.frame.columns[0]!
    col.type = 'text'
    col.typeLocked = true
    const forh = beraknaForhandsvisning(col, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform({ dagForst: true, excelSerie: false, mal: 'datum', onError: 'behall' }),
      nyTyp: 'date',
    })
    tillampaForhandsvisning(tab, forh)
    expect(col.type).toBe('text')
  })

  it('slar ihop varden som blir lika efter omskrivningen', () => {
    const tab = tabOf(['datum'], [['27/08/2026'], ['2026-08-27'], ['27 augusti 2026']])
    const col = tab.frame.columns[0]!
    const forh = beraknaForhandsvisning(col, {
      etikett: 'Datum',
      kind: 'dates',
      fn: datumTransform({ dagForst: true, excelSerie: false, mal: 'datum', onError: 'behall' }),
    })
    expect(tillampaForhandsvisning(tab, forh)).toBe(2)
    expect([0, 1, 2].map((r) => getCell(col, r))).toEqual([
      '2026-08-27',
      '2026-08-27',
      '2026-08-27',
    ])
    // Alla tre raderna delar nu en enda ordbokspost.
    expect(new Set([0, 1, 2].map((r) => col.codes[r])).size).toBe(1)
  })
})

describe('ny kolumn i stallet for omskrivning', () => {
  const epostForh = (col: Parameters<typeof beraknaForhandsvisning>[0]) =>
    beraknaForhandsvisning(col, {
      etikett: 'Fornamn ur E-post',
      kind: 'email',
      fn: epostTransform('fornamn'),
      arProblem: (v) => epostTransform('fornamn')(v) === '',
      nyKolumn: 'Fornamn',
    })

  it('raknar allt som ger ett varde som en andring', () => {
    // Det finns inget att jamfora med i en kolumn som inte finns an.
    const frame = frameOf(['epost'], [['anna.karlsson@a.se'], ['info@a.se'], ['']])
    const forh = epostForh(frame.columns[0]!)
    expect(forh.nyKolumn).toBe('Fornamn')
    expect(forh.andrade).toBe(1)
    expect(forh.problem).toBe(1)
  })

  it('ritas inte som fore-efter i kallkolumnen', () => {
    const frame = frameOf(['epost'], [['anna.karlsson@a.se']])
    const forh = epostForh(frame.columns[0]!)
    expect(forCell(forh, frame.columns[0]!, 0)).toBeNull()
  })

  it('skapar kolumnen intill kallan och gar att angra', () => {
    const tab = tabOf(
      ['kundnr', 'epost', 'ort'],
      [
        ['1', 'anna.karlsson@a.se', 'Lund'],
        ['2', 'info@a.se', 'Malmo'],
      ],
    )
    const kall = tab.frame.columns[1]!
    const forh = epostForh(kall)

    expect(tillampaForhandsvisning(tab, forh)).toBe(1)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['kundnr', 'epost', 'Fornamn', 'ort'])
    const ny = tab.frame.columns[2]!
    expect(getCell(ny, 0)).toBe('Anna')
    expect(getCell(ny, 1)).toBe('')

    undo(tab)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['kundnr', 'epost', 'ort'])

    redo(tab)
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['kundnr', 'epost', 'Fornamn', 'ort'])
    expect(getCell(tab.frame.columns[2]!, 0)).toBe('Anna')
  })

  it('krockar inte med ett namn som redan finns', () => {
    const tab = tabOf(['epost', 'Fornamn'], [['anna.karlsson@a.se', 'Anna']])
    tillampaForhandsvisning(tab, epostForh(tab.frame.columns[0]!))
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['epost', 'Fornamn (2)', 'Fornamn'])
  })
})

describe('inventering pa en ordbok med vikter', () => {
  it('ger samma antal som om varje cell raknats var for sig', () => {
    const rader = [
      ['2026-08-27'],
      ['2026-08-27'],
      ['2026-08-27'],
      ['27/08/2026'],
      ['i gar'],
      [''],
    ]
    const frame = frameOf(['datum'], rader)
    const col = frame.columns[0]!

    const perCell = inventera(rader.map((r) => r[0]!))
    const perOrdbok = inventera(col.dict, undefined, Array.from(codeCounts(col)))

    expect(perOrdbok.tolkade).toBe(perCell.tolkade)
    expect(perOrdbok.otolkade).toBe(perCell.otolkade)
    expect(perOrdbok.poster.find((p) => p.format === 'iso')?.antal).toBe(3)
    expect(perOrdbok.bevis).toBe(perCell.bevis)
  })
})
