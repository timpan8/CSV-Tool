import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { FARGMASK, Flag } from '../../src/core/types.js'
import {
  ANTAL_FARGER,
  FARGER,
  cellfarg,
  fargToken,
  harCellfarg,
  medFarg,
} from '../../src/core/frame/farg.js'
import { createColumn, getCell, intern, mapColumnValues, setCell } from '../../src/core/frame/column.js'
import {
  createFrame,
  deleteRows,
  duplicateColumn,
  duplicateRows,
  insertRows,
  restoreRows,
} from '../../src/core/frame/frame.js'
import { deserializeFrame, serializeFrame } from '../../src/core/frame/serialize.js'
import { canRedo, canUndo, nyTab, redo, undo } from '../../src/state/store.js'
import { fargaCeller, fargaPerRad, raknaFarg, sattKolumnfarg } from '../../src/state/farg.js'

/**
 * Färgen bor i flaggbytens tre översta bitar. Det är hela poängen: den
 * följer med genom varje kodväg som redan bär flaggorna, utan ny kod. Så
 * testerna här handlar mindre om färgen och mer om att ingenting annat
 * tappar den eller skriver över den.
 */

function kolumn(varden: string[]) {
  const col = createColumn('A', varden.length)
  varden.forEach((v, i) => (col.codes[i] = intern(col, v)))
  return col
}

describe('färgbitarna', () => {
  it('lämnar de fem flaggbitarna orörda, för varje byte och varje färg', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 7 }), (byte, farg) => {
        const ny = medFarg(byte, farg)
        expect(ny & ~FARGMASK).toBe(byte & ~FARGMASK)
        expect(cellfarg(ny)).toBe(farg)
        expect(ny).toBeLessThanOrEqual(255)
      }),
    )
  })

  it('har sju färger, alla med en token och en Excel-nyans', () => {
    expect(ANTAL_FARGER).toBe(7)
    expect(FARGER.map((f) => f.farg)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const f of FARGER) expect(f.excel).toMatch(/^FF[0-9A-F]{6}$/)
    expect(fargToken(3)).toBe('var(--serie-3)')
    expect(fargToken(0)).toBe('transparent')
  })

  it('samsas med redigeringsflaggan', () => {
    const col = kolumn(['a', 'b'])
    col.flags[0] = medFarg(col.flags[0]!, 4)
    setCell(col, 0, 'c')
    expect(cellfarg(col.flags[0]!)).toBe(4)
    expect((col.flags[0]! & Flag.UserEdited) !== 0).toBe(true)
    expect(harCellfarg(col.flags)).toBe(true)
    expect(harCellfarg(kolumn(['x']).flags)).toBe(false)
  })
})

describe('färgen följer med genom radoperationerna', () => {
  function ram() {
    const a = kolumn(['a', 'b', 'c', 'd'])
    const b = kolumn(['1', '2', '3', '4'])
    a.flags[1] = medFarg(a.flags[1]!, 2)
    b.flags[3] = medFarg(b.flags[3]!, 7)
    return createFrame('t', [a, b], 4)
  }

  it('ta bort och lägg tillbaka rader', () => {
    const f = ram()
    const sparade = deleteRows(f, [1])
    expect(cellfarg(f.columns[1]!.flags[2]!)).toBe(7)
    restoreRows(f, sparade)
    expect(cellfarg(f.columns[0]!.flags[1]!)).toBe(2)
    expect(cellfarg(f.columns[1]!.flags[3]!)).toBe(7)
  })

  it('dubblera och infoga rader', () => {
    const f = ram()
    duplicateRows(f, [1])
    expect(cellfarg(f.columns[0]!.flags[1]!)).toBe(2)
    expect(cellfarg(f.columns[0]!.flags[2]!)).toBe(2)
    insertRows(f, 0, 1)
    expect(cellfarg(f.columns[0]!.flags[0]!)).toBe(0)
    expect(cellfarg(f.columns[0]!.flags[2]!)).toBe(2)
  })

  it('duplicera kolumn, inklusive kolumnfärgen', () => {
    const f = ram()
    f.columns[0]!.farg = 5
    const kopia = duplicateColumn(f, f.columns[0]!.id)!
    expect(cellfarg(kopia.flags[1]!)).toBe(2)
    expect(kopia.farg).toBe(5)
  })

  it('serialisering', () => {
    const f = ram()
    f.columns[1]!.farg = 3
    const tillbaka = deserializeFrame(serializeFrame(f).frame)
    expect(cellfarg(tillbaka.columns[0]!.flags[1]!)).toBe(2)
    expect(tillbaka.columns[1]!.farg).toBe(3)
    expect(tillbaka.columns[0]!.farg).toBeUndefined()
  })

  it('en omskrivning av värdena rör inte flaggorna', () => {
    const f = ram()
    mapColumnValues(f.columns[0]!, (v) => v.toUpperCase())
    expect(getCell(f.columns[0]!, 1)).toBe('B')
    expect(cellfarg(f.columns[0]!.flags[1]!)).toBe(2)
  })
})

describe('fargaCeller', () => {
  it('färgar, ångrar och gör om som ett steg', () => {
    const tab = nyTab(createFrame('t', [kolumn(['a', 'b', 'c']), kolumn(['1', '2', '3'])], 3))
    expect(fargaCeller(tab, tab.frame.columns, [0, 2], 3)).toBe(4)
    expect(tab.history).toHaveLength(1)
    expect(tab.history[0]!.vikt).toBe(2 * 3 * 2)
    expect(raknaFarg(tab.frame.columns[0]!, 3)).toBe(2)
    // Data ändrades inte — bara flaggorna.
    expect(getCell(tab.frame.columns[0]!, 0)).toBe('a')

    undo(tab)
    expect(raknaFarg(tab.frame.columns[0]!, 0)).toBe(0)
    expect(canRedo(tab)).toBe(true)
    redo(tab)
    expect(raknaFarg(tab.frame.columns[1]!, 3)).toBe(2)
    expect(canUndo(tab)).toBe(true)
  })

  it('ger inget steg när ingenting ändras', () => {
    const tab = nyTab(createFrame('t', [kolumn(['a'])], 1))
    expect(fargaCeller(tab, tab.frame.columns, [0], 0)).toBe(0)
    expect(tab.history).toHaveLength(0)
  })

  it('räknar bara de celler som faktiskt byter färg', () => {
    const tab = nyTab(createFrame('t', [kolumn(['a', 'b'])], 2))
    fargaCeller(tab, tab.frame.columns, [0], 1)
    expect(fargaCeller(tab, tab.frame.columns, [0, 1], 1)).toBe(1)
  })
})

describe('fargaPerRad', () => {
  it('lämnar cellen orörd vid null och färgar resten i ett steg', () => {
    const tab = nyTab(createFrame('t', [kolumn(['a', 'b', 'c']), kolumn(['1', '2', '3'])], 3))
    const [a, b] = tab.frame.columns as [ReturnType<typeof kolumn>, ReturnType<typeof kolumn>]
    a.flags[0] = medFarg(a.flags[0]!, 6)
    const n = fargaPerRad(tab, 'test', [
      { col: a, farg: (r) => (r === 0 ? null : 2) },
      { col: b, farg: (r) => (r === 2 ? 7 : null) },
    ])
    expect(n).toBe(3)
    expect(tab.history).toHaveLength(1)
    expect(cellfarg(a.flags[0]!)).toBe(6)
    expect(cellfarg(a.flags[1]!)).toBe(2)
    expect(cellfarg(b.flags[2]!)).toBe(7)
    undo(tab)
    expect(cellfarg(a.flags[1]!)).toBe(0)
    expect(cellfarg(a.flags[0]!)).toBe(6)
  })
})

describe('sattKolumnfarg', () => {
  it('är utseende: utanför historiken, men räknas för sparningen', () => {
    const tab = nyTab(createFrame('t', [kolumn(['a'])], 1))
    sattKolumnfarg(tab, tab.frame.columns[0]!, 4)
    expect(tab.frame.columns[0]!.farg).toBe(4)
    expect(tab.history).toHaveLength(0)
    expect(tab.utseendeRevision).toBe(1)
    sattKolumnfarg(tab, tab.frame.columns[0]!, 0)
    expect(tab.frame.columns[0]!.farg).toBeUndefined()
    expect(tab.utseendeRevision).toBe(2)
  })
})
