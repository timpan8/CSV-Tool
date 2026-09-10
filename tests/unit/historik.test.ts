import { describe, expect, it } from 'vitest'
import { createColumn, columnBytes, intern, snapshotColumn } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import {
  HISTORIKTAK,
  canRedo,
  canUndo,
  historikvikt,
  nyTab,
  redo,
  runStep,
  undo,
  type Tab,
} from '../../src/state/store.js'
import { stadaKolumner } from '../../src/state/edits.js'
import { stadningarEfterId } from '../../src/core/ops/clean.js'

/**
 * Vakten över historikens minnestak.
 *
 * Ångra kostar minne: ett steg som skriver om en kolumn håller kvar kolumnen
 * som den såg ut innan. Utan tak växer det tills webbläsaren dödar fliken,
 * och en kraschad flik är den enda återkoppling verktyget annars aldrig ger.
 *
 * Testerna väger stegen med `vikt` i stället för att faktiskt allokera
 * hundratals megabyte. Det är samma väg koden går — vikten är ett tal som
 * den som skapar steget uppger — och det är den logiken som ska prövas, inte
 * V8:s minnesräkning.
 */

function tomTab(): Tab {
  return nyTab(createFrame('test', [createColumn('A', 3)], 3))
}

/** Ett steg som inte gör något, men påstår sig väga `vikt`. */
function tungtSteg(tab: Tab, label: string, vikt: number): void {
  runStep(tab, { label, kind: 'test', vikt, apply: () => {}, revert: () => {} })
}

describe('columnBytes', () => {
  it('räknar koderna och flaggorna', () => {
    const col = createColumn('A', 1000)
    // 1000 koder à fyra byte och 1000 flaggor à en, plus tomma strängen.
    expect(columnBytes(col)).toBeGreaterThanOrEqual(5000)
    expect(columnBytes(col)).toBeLessThan(5100)
  })

  it('räknar ordboken, som ofta väger mest', () => {
    const smal = createColumn('A', 100)
    const bred = createColumn('B', 100)
    for (let i = 0; i < 100; i++) {
      intern(smal, i % 2 === 0 ? 'ja' : 'nej')
      intern(bred, `ett ganska långt unikt värde nummer ${i}`)
    }
    // Samma antal rader, men den ena har hundra unika värden i ordboken.
    expect(columnBytes(bred)).toBeGreaterThan(columnBytes(smal) * 3)
  })

  it('väger en ögonblicksbild som kolumnen den togs av', () => {
    const col = createColumn('A', 500)
    for (let i = 0; i < 500; i++) intern(col, `värde ${i}`)
    expect(columnBytes(snapshotColumn(col))).toBe(columnBytes(col))
  })
})

describe('minnestaket', () => {
  it('rör inte en historik som väger lite', () => {
    const tab = tomTab()
    for (let i = 0; i < 50; i++) tungtSteg(tab, `steg ${i}`, 1024)
    expect(tab.history).toHaveLength(50)
    expect(tab.bortglomda).toBe(0)
    expect(historikvikt(tab)).toBe(50 * 1024)
  })

  it('kastar de äldsta stegen när taket sprängs', () => {
    const tab = tomTab()
    const vikt = HISTORIKTAK / 4
    for (let i = 0; i < 6; i++) tungtSteg(tab, `steg ${i}`, vikt)

    // Fyra får plats under taket; de två första är borta.
    expect(tab.history).toHaveLength(4)
    expect(tab.bortglomda).toBe(2)
    expect(historikvikt(tab)).toBeLessThanOrEqual(HISTORIKTAK)
    expect(tab.history[0]!.label).toBe('steg 2')
  })

  it('behåller markören i takt med listan', () => {
    const tab = tomTab()
    const vikt = HISTORIKTAK / 4
    for (let i = 0; i < 6; i++) tungtSteg(tab, `steg ${i}`, vikt)

    // Markören ska fortfarande stå sist: allt i listan är tillämpat.
    expect(tab.cursor).toBe(tab.history.length)
    expect(canUndo(tab)).toBe(true)
    expect(canRedo(tab)).toBe(false)
  })

  it('behåller det sist tillagda steget, hur tungt det än är', () => {
    const tab = tomTab()
    tungtSteg(tab, 'lätt', 1024)
    tungtSteg(tab, 'ensam jätte', HISTORIKTAK * 3)

    // Att ångra det man just gjorde är den viktigaste ångringen av alla.
    expect(tab.history).toHaveLength(1)
    expect(tab.history[0]!.label).toBe('ensam jätte')
    expect(tab.bortglomda).toBe(1)
    expect(canUndo(tab)).toBe(true)
  })

  it('låter ångra och gör om fungera på det som är kvar', () => {
    const tab = tomTab()
    const spar: string[] = []
    const vikt = HISTORIKTAK / 2
    for (let i = 0; i < 4; i++) {
      runStep(tab, {
        label: `steg ${i}`,
        kind: 'test',
        vikt,
        apply: () => spar.push(`gör ${i}`),
        revert: () => spar.push(`ångra ${i}`),
      })
    }
    expect(tab.history.map((s) => s.label)).toEqual(['steg 2', 'steg 3'])

    undo(tab)
    undo(tab)
    expect(spar.slice(-2)).toEqual(['ångra 3', 'ångra 2'])
    expect(canUndo(tab)).toBe(false)

    redo(tab)
    expect(spar.at(-1)).toBe('gör 2')
    expect(tab.cursor).toBe(1)
  })

  it('räknar bortglömda steg vidare över flera städningar', () => {
    const tab = tomTab()
    for (let i = 0; i < 12; i++) tungtSteg(tab, `steg ${i}`, HISTORIKTAK / 2)
    // Två får plats åt gången, så tio har fallit bort.
    expect(tab.history).toHaveLength(2)
    expect(tab.bortglomda).toBe(10)
    // Numreringen i steglistan bygger på summan och ska peka på steg 11 och 12.
    expect(tab.bortglomda + tab.history.length).toBe(12)
  })

  it('väger ett verkligt verktygssteg efter kolumnerna det rörde', () => {
    const col = createColumn('Ort', 2000)
    for (let i = 0; i < 2000; i++) col.codes[i] = intern(col, `Ort nummer ${i}`)
    const tab = nyTab(createFrame('test', [col], 2000))

    stadaKolumner(tab, [col], stadningarEfterId('upper')!)

    // Steget håller kvar kolumnen som den såg ut innan, och vikten ska säga
    // det. Utan kopplingen hit vore taket ovan en mekanism utan verkan.
    expect(tab.history).toHaveLength(1)
    expect(tab.history[0]!.vikt).toBeGreaterThan(columnBytes(col) * 0.8)
  })

  it('kastar ingenting när stegen saknar vikt', () => {
    const tab = tomTab()
    for (let i = 0; i < 200; i++) {
      runStep(tab, { label: `steg ${i}`, kind: 'test', apply: () => {}, revert: () => {} })
    }
    // Utelämnad vikt betyder noll — ett lätt steg ska aldrig kunna korta
    // historiken bara för att någon glömt väga det.
    expect(tab.history).toHaveLength(200)
    expect(tab.bortglomda).toBe(0)
  })
})
