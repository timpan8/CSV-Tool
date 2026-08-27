import { beforeEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createColumn, intern, setCell } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import { nyTab, tabs, type Tab } from '../../src/state/store.js'
import { infogaRader, klistraIn, planeraInklistring, taBortRader } from '../../src/state/edits.js'
import { cell } from '../../src/state/selection.js'
import type { Matchningspar, Sammanslagning } from '../../src/core/ops/match.js'
import { findColumn } from '../../src/core/frame/frame.js'
import {
  avvisaForslag,
  arAvvisat,
  flikarna,
  fullmatchning,
  grundmatchning,
  korRunda,
  laggExtrapar,
  oppnaVerkstad,
  restlistor,
  saknadeKolumner,
  skrivAv,
  stangVerkstad,
  synkaVerkstad,
  verkstad,
} from '../../src/state/matchning.js'

function frameOf(namn: string, headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame(namn, columns, rows.length)
}

const SAMMANSLAGNING: Sammanslagning = { hogerKolumner: [], flertraff: 'forsta', prefix: '' }

/** Kunder och order där Bo och Dan är samma person, men skriven olika. */
function bygg(): { v: Tab; h: Tab; par: Matchningspar[] } {
  const vanster = frameOf(
    'kunder',
    ['Namn', 'Ort'],
    [['Anna', 'Lund'], ['Bo', 'Kiruna'], ['Cia', 'Umeå']],
  )
  const hoger = frameOf(
    'order',
    ['Kund', 'Stad'],
    [['Anna', 'Lund'], ['Dan', 'Kiruna'], ['Eva', 'Boden']],
  )
  const v = nyTab(vanster)
  const h = nyTab(hoger)
  tabs.value = [v, h]
  return {
    v,
    h,
    par: [{ vansterColId: vanster.columns[0]!.id, hogerColId: hoger.columns[0]!.id, typ: 'oberoende' }],
  }
}

function oppna() {
  const { v, h, par } = bygg()
  oppnaVerkstad(v, h, par, SAMMANSLAGNING)
  return { v, h, par }
}

/** Restlistorna som verkstaden visar just nu. */
function rest() {
  const f = flikarna()!
  const s = verkstad.value!
  return restlistor(s, fullmatchning(f, s, grundmatchning(f, s)))
}

beforeEach(() => {
  stangVerkstad()
  tabs.value = []
})

describe('restlistorna', () => {
  it('innehåller precis de rader som saknar par', () => {
    oppna()
    expect(rest()).toEqual({ vanster: [1, 2], hoger: [1, 2] })
  })

  it('ett handgjort par tar bort raden ur båda listorna', () => {
    oppna()
    laggExtrapar(1, 1, 'hand', 'för hand')
    expect(rest()).toEqual({ vanster: [2], hoger: [2] })
  })

  it('samma par två gånger lägger bara till ett', () => {
    oppna()
    laggExtrapar(1, 1, 'hand', 'för hand')
    laggExtrapar(1, 1, 'hand', 'för hand')
    expect(verkstad.value!.extra).toHaveLength(1)
  })
})

describe('avskriven och avvisad hålls isär', () => {
  it('att skriva av tar bort raden ur listan', () => {
    oppna()
    skrivAv('hoger', 2)
    expect(rest().hoger).toEqual([1])
    // Men paren är oförändrade: avskrivning ändrar ingenting i resultatet.
    expect(verkstad.value!.extra).toHaveLength(0)
  })

  it('att avvisa ett förslag lämnar raden kvar', () => {
    oppna()
    avvisaForslag(1, 1)
    expect(rest()).toEqual({ vanster: [1, 2], hoger: [1, 2] })
    expect(arAvvisat(verkstad.value!, 1, 1)).toBe(true)
    expect(arAvvisat(verkstad.value!, 1, 2)).toBe(false)
  })
})

describe('rundor', () => {
  it('matchar om restraderna på ett annat kolumnpar', () => {
    const { v, h } = oppna()
    const traffar = korRunda([
      {
        vansterColId: v.frame.columns[1]!.id,
        hogerColId: h.frame.columns[1]!.id,
        typ: 'oberoende',
      },
    ])
    // Bo och Dan bor båda i Kiruna. Cia och Eva gör inte det.
    expect(traffar).toBe(1)
    expect(verkstad.value!.extra).toEqual([{ v: 1, h: 1, kalla: 'runda', notis: 'runda 1' }])
    expect(rest()).toEqual({ vanster: [2], hoger: [2] })
  })

  it('en runda rör aldrig rader som redan har par', () => {
    const { v, h } = oppna()
    // Ort mot Stad skulle matcha Anna–Anna igen, men Anna är redan parad.
    korRunda([
      {
        vansterColId: v.frame.columns[1]!.id,
        hogerColId: h.frame.columns[1]!.id,
        typ: 'oberoende',
      },
    ])
    expect(verkstad.value!.extra.some((p) => p.v === 0)).toBe(false)
  })
})

describe('synkaVerkstad', () => {
  it('en skriven cell numrerar inte om raderna', () => {
    const { v } = oppna()
    laggExtrapar(1, 1, 'hand', 'för hand')
    setCell(v.frame.columns[0]!, 1, 'Bosse')
    expect(synkaVerkstad()).toBe('ok')
    expect(verkstad.value!.extra).toHaveLength(1)
  })

  it('en borttagen rad kastar arbetet i stället för att peka fel', () => {
    const { v } = oppna()
    laggExtrapar(1, 1, 'hand', 'för hand')
    skrivAv('hoger', 2)
    taBortRader(v, [0])
    expect(synkaVerkstad()).toBe('omnumrerad')
    expect(verkstad.value!.extra).toHaveLength(0)
    expect(verkstad.value!.avskrivnaHoger.size).toBe(0)
    // Ankaret sätts om, så nästa kontroll är lugn igen.
    expect(synkaVerkstad()).toBe('ok')
  })

  it('en omnumrering utan arbete att kasta är inget att berätta om', () => {
    const { v } = oppna()
    taBortRader(v, [0])
    expect(synkaVerkstad()).toBe('ok')
  })

  it('ta bort en rad och infoga en ny ger samma radantal men inte samma rader', () => {
    const { v } = oppna()
    laggExtrapar(1, 1, 'hand', 'för hand')
    taBortRader(v, [0])
    infogaRader(v, 0, 1, false)
    expect(v.frame.rowCount).toBe(3)
    // Radantalet är tillbaka på tre, men rad 1 är inte längre Bo.
    expect(synkaVerkstad()).toBe('omnumrerad')
  })

  it('en utbytt array med samma innehåll är ingen omnumrering', () => {
    const { v } = oppna()
    laggExtrapar(1, 1, 'hand', 'för hand')
    // Ångra en inklistring som inte utökade tabellen: `sourceRow` ersätts av
    // en kopia med exakt samma innehåll.
    const sel = cell(0, 0)
    const plan = planeraInklistring(v, sel, [['Annika']])
    klistraIn(v, sel, plan, false)
    const fore = v.frame.sourceRow
    v.frame.sourceRow = fore.slice()
    expect(v.frame.sourceRow).not.toBe(fore)
    expect(synkaVerkstad()).toBe('ok')
    expect(verkstad.value!.extra).toHaveLength(1)
  })

  it('en stängd flik stänger verkstaden', () => {
    const { v } = oppna()
    tabs.value = tabs.value.filter((t) => t.id !== v.id)
    expect(synkaVerkstad()).toBe('stangd')
    expect(verkstad.value).toBeNull()
  })

  it('utan session händer ingenting', () => {
    expect(synkaVerkstad()).toBe('ingen')
  })
})

describe('invarianten', () => {
  it('en rad i restlistan har aldrig ett par, och tvärtom', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(2), fc.nat(2)), { maxLength: 10 }), (handpar) => {
        stangVerkstad()
        tabs.value = []
        oppna()
        const f = flikarna()!
        for (const [a, b] of handpar) {
          // Bara par mellan rader som faktiskt ligger i restlistorna, precis
          // som verkstaden bara låter en välja bland dem.
          const r = rest()
          if (r.vanster.includes(a) && r.hoger.includes(b)) laggExtrapar(a, b, 'hand', '')
        }
        const s = verkstad.value!
        const full = fullmatchning(f, s, grundmatchning(f, s))
        const parade = new Set(full.par.map((p) => p.v))
        for (const r of full.vansterUtan) expect(parade.has(r)).toBe(false)
        // Handparen är alltid 1:1 — ingen rad förekommer två gånger.
        expect(new Set(s.extra.map((p) => p.v)).size).toBe(s.extra.length)
        expect(new Set(s.extra.map((p) => p.h)).size).toBe(s.extra.length)
      }),
      { numRuns: 100 },
    )
  })
})

describe('saknade nyckelkolumner', () => {
  it('upptäcker att nyckeln tagits bort i stället för att låta allt bli restrader', () => {
    const { h } = oppna()
    const f = flikarna()!
    const s = verkstad.value!
    expect(saknadeKolumner(f, s)).toEqual([])

    const nyckel = h.frame.columns[0]!.id
    h.frame.columns = h.frame.columns.filter((c) => c.id !== nyckel)
    expect(findColumn(h.frame, nyckel)).toBeUndefined()
    expect(saknadeKolumner(f, verkstad.value!)).toEqual([nyckel])
    // Utan kontrollen hade det här sett ut som en misslyckad matchning.
    expect(rest().vanster).toEqual([0, 1, 2])
  })
})
