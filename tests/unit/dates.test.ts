import { describe, expect, it } from 'vitest'
import {
  FORMATNAMN,
  MALFORMAT,
  OGILTIGT,
  datumTransform,
  inventera,
  skrivDatum,
  tolkaDatum,
  type Formatnyckel,
  type Malformat,
} from '../../src/core/ops/dates.js'

/**
 * Datumtabellen.
 *
 * Varje rad är `[indata, dagFörst, förväntat]` där förväntat är resultatet av
 * en omskrivning till ÅÅÅÅ-MM-DD, eller `null` när värdet inte går att tolka.
 *
 * Sommartidsdygnen finns med av ett skäl: en oavsiktlig omväg via ett
 * `Date`-objekt i lokal tid ger fel dag just den natt då dygnet är 23 eller
 * 25 timmar långt, och bara då. Ett test som bara provar mitten av juli
 * skulle aldrig se felet.
 */
const TABELL: [string, boolean, string | null][] = [
  // ISO — det format som ska passera oförändrat
  ['2026-08-27', true, '2026-08-27'],
  ['2026-08-27', false, '2026-08-27'],
  ['2026-1-5', true, '2026-01-05'],
  ['1999-12-31', true, '1999-12-31'],
  ['2000-01-01', true, '2000-01-01'],
  ['  2026-08-27  ', true, '2026-08-27'],

  // ISO med klockslag — tiden faller bort, dagen står kvar
  ['2026-08-27 12:55', true, '2026-08-27'],
  ['2026-08-27T12:55', true, '2026-08-27'],
  ['2026-08-27T12:55:30', true, '2026-08-27'],
  ['2026-08-27T12:55:30.123', true, '2026-08-27'],
  ['2026-08-27T12:55:30,123', true, '2026-08-27'],
  ['2026-08-27 00:00:00', true, '2026-08-27'],
  ['2026-08-27 23:59:59', true, '2026-08-27'],

  // Tidszonssuffix ignoreras: det skrivna datumet är det som gäller
  ['2026-08-27T23:30:00Z', true, '2026-08-27'],
  ['2026-08-27T00:30:00Z', true, '2026-08-27'],
  ['2026-08-27T23:30:00+02:00', true, '2026-08-27'],
  ['2026-08-27T01:00:00-05:00', true, '2026-08-27'],
  ['2026-08-27T01:00:00+0200', true, '2026-08-27'],

  // Sommartidens gränsdygn i svensk tid
  ['2026-03-29', true, '2026-03-29'],
  ['2026-03-29 02:30', true, '2026-03-29'],
  ['2026-03-29T00:00:00', true, '2026-03-29'],
  ['2026-03-28T23:59:59', true, '2026-03-28'],
  ['2026-10-25', true, '2026-10-25'],
  ['2026-10-25 02:30', true, '2026-10-25'],
  ['2026-10-25T00:00:00', true, '2026-10-25'],
  ['29/03/2026', true, '2026-03-29'],
  ['25/10/2026', true, '2026-10-25'],

  // Skottdagar
  ['2024-02-29', true, '2024-02-29'],
  ['2000-02-29', true, '2000-02-29'],
  ['2026-02-29', true, null],
  ['1900-02-29', true, null],

  // Kompakt
  ['20260827', true, '2026-08-27'],
  ['19991231', true, '1999-12-31'],
  ['20261332', true, null],

  // Snedstreck och punkt
  ['27/08/2026', true, '2026-08-27'],
  ['27.08.2026', true, '2026-08-27'],
  ['27-08-2026', true, '2026-08-27'],
  ['27/8/2026', true, '2026-08-27'],
  ['7/8/2026', true, '2026-08-07'],
  ['7/8/2026', false, '2026-07-08'],
  ['03/04/2026', true, '2026-04-03'],
  ['03/04/2026', false, '2026-03-04'],
  ['12/12/2026', true, '2026-12-12'],
  ['12/12/2026', false, '2026-12-12'],

  // Ett tal över 12 avgör ordningen oavsett vad man valt
  ['27/08/2026', false, '2026-08-27'],
  ['08/27/2026', true, '2026-08-27'],
  ['31/12/2026', false, '2026-12-31'],

  // Tvåsiffrigt årtal
  ['27/08/26', true, '2026-08-27'],
  ['27/08/99', true, '1999-08-27'],
  ['27/08/69', true, '2069-08-27'],
  ['27/08/70', true, '1970-08-27'],

  // Med klockslag
  ['27/08/2026 12:55', true, '2026-08-27'],
  ['27.08.2026 12:55:30', true, '2026-08-27'],

  // Månadsnamn
  ['27 augusti 2026', true, '2026-08-27'],
  ['27 aug 2026', true, '2026-08-27'],
  ['27 aug. 2026', true, '2026-08-27'],
  ['den 27 augusti 2026', true, '2026-08-27'],
  ['1 maj 2026', true, '2026-05-01'],
  ['31 december 1999', true, '1999-12-31'],
  ['27 AUGUSTI 2026', true, '2026-08-27'],
  ['27 augustus 2026', true, null],
  ['31 februari 2026', true, null],

  // Månadsnamn först
  ['augusti 27, 2026', true, '2026-08-27'],
  ['August 27, 2026', true, '2026-08-27'],
  ['Aug 27 2026', true, '2026-08-27'],
  ['August 27th, 2026', true, '2026-08-27'],
  ['January 1, 2000', true, '2000-01-01'],

  // Orimliga datum
  ['2026-02-30', true, null],
  ['2026-13-01', true, null],
  ['2026-00-10', true, null],
  ['2026-08-00', true, null],
  ['32/01/2026', true, null],
  ['13/13/2026', true, null],

  // Sådant som inte är datum
  ['i gar', true, null],
  ['okant', true, null],
  ['-', true, null],
  ['2026', true, null],
  ['augusti', true, null],
  ['abc-de-fgh', true, null],
  ['2026-08-27 eller senare', true, null],
]

describe('tolkaDatum via datumTransform', () => {
  const skriv = (dagForst: boolean) =>
    datumTransform({ dagForst, excelSerie: false, mal: 'datum', onError: 'markera' })

  for (const [indata, dagForst, forvantat] of TABELL) {
    const riktning = dagForst ? 'dag forst' : 'manad forst'
    it(`${JSON.stringify(indata)} (${riktning}) -> ${forvantat ?? 'OGILTIGT'}`, () => {
      expect(skriv(dagForst)(indata)).toBe(forvantat ?? OGILTIGT)
    })
  }
})

describe('tomma varden', () => {
  it('lamnas ororda oavsett felhantering', () => {
    for (const onError of ['behall', 'tom', 'markera'] as const) {
      const f = datumTransform({ dagForst: true, excelSerie: false, mal: 'datum', onError })
      expect(f('')).toBe('')
      expect(f('   ')).toBe('   ')
    }
  })
})

describe('felhantering', () => {
  const inst = { dagForst: true, excelSerie: false, mal: 'datum' as Malformat }

  it('behall lamnar vardet exakt som det stod', () => {
    const f = datumTransform({ ...inst, onError: 'behall' })
    expect(f('i gar')).toBe('i gar')
    expect(f('  strul  ')).toBe('  strul  ')
  })

  it('tom raderar vardet', () => {
    expect(datumTransform({ ...inst, onError: 'tom' })('i gar')).toBe('')
  })

  it('markera skriver OGILTIGT', () => {
    expect(datumTransform({ ...inst, onError: 'markera' })('i gar')).toBe(OGILTIGT)
  })
})

describe('malformat', () => {
  const varden: [string, Malformat, string][] = [
    ['2026-08-27 12:55', 'datum', '2026-08-27'],
    ['2026-08-27 12:55', 'datum-tid', '2026-08-27 12:55'],
    ['2026-08-27 12:55', 'ar-manad', '2026-08'],
    ['2026-08-27 12:55', 'ar', '2026'],
    ['2026-08-27', 'datum-tid', '2026-08-27 00:00'],
    ['2026-08-27T09:05:00', 'datum-tid', '2026-08-27 09:05'],
    ['27/08/2026 07:00', 'datum-tid', '2026-08-27 07:00'],
    ['2026-01-05', 'ar-manad', '2026-01'],
  ]
  for (const [indata, mal, forvantat] of varden) {
    it(`${indata} -> ${mal} -> ${forvantat}`, () => {
      const f = datumTransform({ dagForst: true, excelSerie: false, mal, onError: 'behall' })
      expect(f(indata)).toBe(forvantat)
    })
  }

  it('varje malformat har ett exempel som stammer med sin egen utskrift', () => {
    const t = tolkaDatum('2026-08-27 12:55')
    expect(t.datum).not.toBeNull()
    for (const m of MALFORMAT) {
      expect(skrivDatum(t.datum!, m.varde)).toBe(m.exempel)
    }
  })

  it('tvasiffriga delar nollutfylls', () => {
    const t = tolkaDatum('2026-01-05T03:07:00')
    expect(skrivDatum(t.datum!, 'datum-tid')).toBe('2026-01-05 03:07')
  })
})

describe('formatnycklar', () => {
  const varden: [string, Formatnyckel][] = [
    ['2026-08-27', 'iso'],
    ['2026-08-27 12:55', 'iso-tid'],
    ['2026-08-27T12:55:00Z', 'iso-tid'],
    ['20260827', 'kompakt'],
    ['27/08/2026', 'punkt-eller-snedstreck'],
    ['27.08.2026', 'punkt-eller-snedstreck'],
    ['27 augusti 2026', 'manadsnamn'],
    ['augusti 27, 2026', 'manadsnamn-forst'],
    ['i gar', 'okant'],
    ['', 'okant'],
  ]
  for (const [indata, format] of varden) {
    it(`${JSON.stringify(indata)} kanns igen som ${format}`, () => {
      expect(tolkaDatum(indata).format).toBe(format)
    })
  }

  it('varje nyckel har ett namn att visa', () => {
    for (const [, format] of varden) {
      expect(FORMATNAMN[format]).toBeTruthy()
    }
  })
})

describe('osynliga tecken', () => {
  it('hart mellanslag och nollbreddstecken stoppar inte tolkningen', () => {
    const f = datumTransform({
      dagForst: true,
      excelSerie: false,
      mal: 'datum',
      onError: 'markera',
    })
    expect(f('2026-08-27​')).toBe('2026-08-27')
    expect(f('27 augusti 2026')).toBe('2026-08-27')
    expect(f('﻿2026-08-27')).toBe('2026-08-27')
  })
})

describe('Excel-serienummer', () => {
  const pa = (mal: Malformat = 'datum') =>
    datumTransform({ dagForst: true, excelSerie: true, mal, onError: 'markera' })
  const av = datumTransform({
    dagForst: true,
    excelSerie: false,
    mal: 'datum',
    onError: 'behall',
  })

  it('tolkas bara nar valet ar pa', () => {
    expect(pa()('46261')).toBe('2026-08-27')
    expect(av('46261')).toBe('46261')
  })

  it('folger Excels nollpunkt over skottdygnet 1900', () => {
    expect(pa()('45351')).toBe('2024-02-29')
    expect(pa()('46110')).toBe('2026-03-29')
    expect(pa()('46320')).toBe('2026-10-25')
  })

  it('decimaldelen ar klockslag', () => {
    expect(pa('datum-tid')('46261,5')).toBe('2026-08-27 12:00')
    expect(pa('datum-tid')('46261.5')).toBe('2026-08-27 12:00')
    expect(pa()('46261,75')).toBe('2026-08-27')
  })

  it('tal utanfor rimlighetsfonstret rors inte', () => {
    expect(pa()('1')).toBe(OGILTIGT)
    expect(pa()('2026')).toBe(OGILTIGT)
    expect(pa()('999999')).toBe(OGILTIGT)
  })

  it('kompakt datum vinner over serienummer', () => {
    // 20260827 ligger utanfor fonstret, men gransen ska vara mot kompakt
    // formatet och inte mot ett godtyckligt tal.
    expect(pa()('20260827')).toBe('2026-08-27')
  })
})

describe('inventera', () => {
  it('raknar format med exempel ur den egna filen', () => {
    const inv = inventera(['2026-08-27', '2026-01-05', '27/08/2026', 'i gar', '', '  '])
    expect(inv.tolkade).toBe(3)
    expect(inv.otolkade).toBe(1)
    const iso = inv.poster.find((p) => p.format === 'iso')
    expect(iso?.antal).toBe(2)
    expect(iso?.exempel).toEqual(['2026-08-27', '2026-01-05'])
    expect(inv.poster[0]?.format).toBe('iso')
  })

  it('samlar hogst tre exempel och upprepar inte samma varde', () => {
    const inv = inventera(['2026-08-27', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'])
    const iso = inv.poster.find((p) => p.format === 'iso')
    expect(iso?.antal).toBe(5)
    expect(iso?.exempel).toEqual(['2026-08-27', '2026-08-28', '2026-08-29'])
  })

  it('rapporterar tvetydighet nar inget varde i kolumnen avgor saken', () => {
    const inv = inventera(['03/04/2026', '05/06/2026', '01/02/2026'])
    expect(inv.tvetydig).toBe(true)
    expect(inv.bevis).toBeNull()
  })

  it('later ett enda bevis avgora hela kolumnen', () => {
    const inv = inventera(['03/04/2026', '27/08/2026', '05/06/2026'])
    expect(inv.tvetydig).toBe(false)
    expect(inv.bevis).toBe('27/08/2026')
    expect(inv.bevisSagerDagForst).toBe(true)
  })

  it('kanner igen bevis at andra hallet ocksa', () => {
    const inv = inventera(['03/04/2026', '08/27/2026'])
    expect(inv.tvetydig).toBe(false)
    expect(inv.bevis).toBe('08/27/2026')
    expect(inv.bevisSagerDagForst).toBe(false)
  })

  it('ISO-kolumner ar aldrig tvetydiga', () => {
    const inv = inventera(['2026-03-04', '2026-05-06'])
    expect(inv.tvetydig).toBe(false)
  })

  it('raknar mojliga serienummer aven nar tolkningen ar avslagen', () => {
    const inv = inventera(['46261', '46262', '2026-08-27', '5'])
    expect(inv.mojligaExcelSerier).toBe(2)
    expect(inv.poster.find((p) => p.format === 'excel-serie')).toBeUndefined()
  })

  it('en tom kolumn ger inga poster och ingen tvetydighet', () => {
    const inv = inventera(['', '   ', ''])
    expect(inv.poster).toEqual([])
    expect(inv.tolkade).toBe(0)
    expect(inv.otolkade).toBe(0)
    expect(inv.tvetydig).toBe(false)
  })
})

describe('omskrivning ar stabil', () => {
  it('att kora transformen tva ganger ger samma resultat', () => {
    const f = datumTransform({
      dagForst: true,
      excelSerie: false,
      mal: 'datum',
      onError: 'behall',
    })
    for (const [indata] of TABELL) {
      const en = f(indata)
      expect(f(en)).toBe(en)
    }
  })
})
