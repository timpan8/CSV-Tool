import { beforeEach, describe, expect, it } from 'vitest'
import { createColumn, getCell, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import { beskrivSteg, stegetsKolumner, type Profilsteg } from '../../src/core/ops/profil.js'
import { nyTab, tabs, type Tab } from '../../src/state/store.js'
import {
  historikensSteg,
  korProfil,
  korSteg,
  laggTillProfiler,
  nollstallProfiler,
  profiler,
  profilfilstext,
  saknadeKolumnerFor,
  sparaProfil,
  taBortProfil,
  tolkaProfilfil,
} from '../../src/state/profiler.js'
import { stadaKolumner } from '../../src/state/edits.js'
import { STADNINGAR } from '../../src/core/ops/clean.js'

function frameOf(namn: string, headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame(namn, columns, rows.length)
}

function tabOf(frame: Frame): Tab {
  const tab = nyTab(frame)
  tabs.value = [tab]
  return tab
}

const kolumn = (tab: Tab, namn: string) => tab.frame.columns.find((c) => c.name === namn)!
const varden = (tab: Tab, namn: string) =>
  Array.from({ length: tab.frame.rowCount }, (_, r) => getCell(kolumn(tab, namn), r))

beforeEach(() => {
  nollstallProfiler()
  tabs.value = []
})

describe('beskrivSteg', () => {
  it('bygger etiketten ur beskrivningen, inte ur ett sparat namn', () => {
    // Ett sparat label skulle nämna kolumner och antal ur den gamla filen.
    expect(beskrivSteg({ typ: 'stada', kolumner: ['Namn'], stadning: 'trim' })).toBe(
      'Trimma blanksteg i Namn',
    )
    expect(beskrivSteg({ typ: 'tommaRader' })).toBe('Ta bort helt tomma rader')
    expect(beskrivSteg({ typ: 'dopOm', kolumn: 'Namn', till: 'Kund' })).toBe(
      'Döp om Namn till Kund',
    )
  })

  it('pekar ut vilka kolumner steget behöver', () => {
    expect(stegetsKolumner({ typ: 'stada', kolumner: ['A', 'B'], stadning: 'trim' })).toEqual([
      'A',
      'B',
    ])
    expect(stegetsKolumner({ typ: 'tommaKolumner' })).toEqual([])
  })
})

describe('profilfilen', () => {
  it('går att skriva och läsa tillbaka', () => {
    const steg: Profilsteg[] = [{ typ: 'stada', kolumner: ['Namn'], stadning: 'trim' }]
    sparaProfil('Månadsfilen', steg, '2026-08-27')
    const tillbaka = tolkaProfilfil(profilfilstext(profiler.value))
    expect(tillbaka).toHaveLength(1)
    expect(tillbaka![0]!.namn).toBe('Månadsfilen')
    expect(tillbaka![0]!.steg).toEqual(steg)
  })

  it('vägrar något som inte är en profilfil', () => {
    expect(tolkaProfilfil('inte json')).toBeNull()
    expect(tolkaProfilfil('{"format":"annat"}')).toBeNull()
    expect(tolkaProfilfil('[]')).toBeNull()
  })

  it('släpper inte igenom steg av okänd sort', () => {
    // Ett steg från en nyare version skulle annars hoppas över tyst mitt i
    // en körning, och användaren skulle tro att profilen kördes hel.
    const fil = JSON.stringify({
      format: 'csv-verkstan-profil',
      version: 99,
      profiler: [
        { id: 'x', namn: 'Framtid', skapad: '', steg: [{ typ: 'teleportera', kolumn: 'A' }] },
      ],
    })
    expect(tolkaProfilfil(fil)).toEqual([])
  })

  it('profiler går att lägga till och ta bort', () => {
    const p = sparaProfil('A', [{ typ: 'tommaRader' }], '')
    expect(profiler.value).toHaveLength(1)
    laggTillProfiler([{ id: 'gammalt', namn: 'B', steg: [{ typ: 'tommaRader' }], skapad: '' }])
    expect(profiler.value).toHaveLength(2)
    // Importerade profiler får nya id, så de kan inte kollidera.
    expect(profiler.value[1]!.id).not.toBe('gammalt')
    taBortProfil(p.id)
    expect(profiler.value.map((x) => x.namn)).toEqual(['B'])
  })
})

describe('historikensSteg', () => {
  it('tar med det som går att köra om och pekar ut resten', () => {
    const tab = tabOf(frameOf('f', ['Namn'], [[' Anna ']]))
    stadaKolumner(tab, [kolumn(tab, 'Namn')], STADNINGAR[0]!)
    const poster = historikensSteg(tab)
    expect(poster).toHaveLength(1)
    expect(poster[0]!.steg).toEqual({ typ: 'stada', kolumner: ['Namn'], stadning: 'trim' })
  })

  it('ångrade steg räknas inte med', () => {
    const tab = tabOf(frameOf('f', ['Namn'], [[' Anna ']]))
    stadaKolumner(tab, [kolumn(tab, 'Namn')], STADNINGAR[0]!)
    tab.cursor = 0
    expect(historikensSteg(tab)).toHaveLength(0)
  })
})

describe('uppspelning', () => {
  it('städar samma kolumn i en annan fil', () => {
    const tab = tabOf(frameOf('ny', ['Namn'], [[' Anna '], ['Bo  ']]))
    const res = korSteg(tab, { typ: 'stada', kolumner: ['Namn'], stadning: 'trim' })
    expect(res.utfall).toBe('kord')
    expect(varden(tab, 'Namn')).toEqual(['Anna', 'Bo'])
  })

  it('hittar kolumnen även när rubriken är skriven annorlunda', () => {
    // E-post, e post och EPOST är samma rubrik.
    const tab = tabOf(frameOf('ny', ['E POST'], [[' a@x.se ']]))
    const res = korSteg(tab, { typ: 'stada', kolumner: ['E-post'], stadning: 'trim' })
    expect(res.utfall).toBe('kord')
  })

  it('säger till när kolumnen inte finns i stället för att välja en granne', () => {
    // Aliaskartan i Kombinera får gissa, eftersom gissningen syns i en tabell
    // innan något körs. Här skulle en gissning tyst skriva om fel kolumn.
    const tab = tabOf(frameOf('ny', ['Kundnamn'], [['Anna']]))
    const res = korSteg(tab, { typ: 'stada', kolumner: ['Namn'], stadning: 'upper' })
    expect(res.utfall).toBe('kolumnSaknas')
    expect(res.saknad).toBe('Namn')
    expect(varden(tab, 'Kundnamn')).toEqual(['Anna'])
  })

  it('skriver om datum', () => {
    const tab = tabOf(frameOf('ny', ['Datum'], [['27/08/2026']]))
    const res = korSteg(tab, {
      typ: 'datum',
      kolumn: 'Datum',
      inst: { dagForst: true, excelSerie: false, mal: 'datum', onError: 'behall' },
    })
    expect(res.utfall).toBe('kord')
    expect(varden(tab, 'Datum')).toEqual(['2026-08-27'])
    expect(kolumn(tab, 'Datum').type).toBe('date')
  })

  it('delar en kolumn och skapar de nya kolumnerna', () => {
    const tab = tabOf(frameOf('ny', ['Namn'], [['Anna Karlsson']]))
    const res = korSteg(tab, {
      typ: 'dela',
      kolumn: 'Namn',
      delning: { satt: 'sista', avgransare: ' ', position: 3, antal: 2, trimma: true },
      namn: ['Förnamn', 'Efternamn'],
    })
    expect(res.utfall).toBe('kord')
    expect(varden(tab, 'Förnamn')).toEqual(['Anna'])
    expect(varden(tab, 'Efternamn')).toEqual(['Karlsson'])
  })

  it('döper om, tar bort och sätter typ', () => {
    const tab = tabOf(frameOf('ny', ['Namn', 'Skräp'], [['Anna', 'x']]))
    expect(korSteg(tab, { typ: 'dopOm', kolumn: 'Namn', till: 'Kund' }).utfall).toBe('kord')
    expect(korSteg(tab, { typ: 'taBortKolumn', kolumn: 'Skräp' }).utfall).toBe('kord')
    expect(korSteg(tab, { typ: 'sattTyp', kolumn: 'Kund', kolumntyp: 'text' }).utfall).toBe('kord')
    expect(tab.frame.columns.map((c) => c.name)).toEqual(['Kund'])
    expect(kolumn(tab, 'Kund').typeLocked).toBe(true)
  })

  it('ett steg som inte ändrar något rapporteras som sådant', () => {
    const tab = tabOf(frameOf('ny', ['Namn'], [['Anna']]))
    const res = korSteg(tab, { typ: 'stada', kolumner: ['Namn'], stadning: 'trim' })
    expect(res.utfall).toBe('ingenAndring')
    expect(res.andrade).toBe(0)
  })

  it('varje steg blir ett eget ångringsbart steg', () => {
    const tab = tabOf(frameOf('ny', ['Namn'], [[' anna ']]))
    korProfil(tab, {
      id: 'p',
      namn: 'P',
      skapad: '',
      steg: [
        { typ: 'stada', kolumner: ['Namn'], stadning: 'trim' },
        { typ: 'stada', kolumner: ['Namn'], stadning: 'title' },
      ],
    })
    expect(varden(tab, 'Namn')).toEqual(['Anna'])
    expect(tab.history).toHaveLength(2)
    expect(tab.cursor).toBe(2)
  })

  it('en hel arbetsgång går att spela upp på nästa månads fil', () => {
    // Filen har samma rubriker men annan stavning, annan ordning och skräp.
    const tab = tabOf(
      frameOf(
        'september',
        ['namn', 'Telefon', 'Belopp'],
        [
          [' anna karlsson ', '070-123 45 67', '1 240,50 kr'],
          ['BO EK', '+46 70 765 43 21', '98,00 kr'],
        ],
      ),
    )
    const resultat = korProfil(tab, {
      id: 'p',
      namn: 'Månadsfilen',
      skapad: '',
      steg: [
        { typ: 'stada', kolumner: ['Namn'], stadning: 'trim' },
        { typ: 'stada', kolumner: ['Namn'], stadning: 'title' },
        {
          typ: 'telefon',
          kolumn: 'Telefon',
          inst: { landsnummer: 46, format: 'e164', onError: 'behall' },
        },
        {
          typ: 'tal',
          kolumn: 'Belopp',
          inst: { punktArTusental: false, format: 'punkt', decimaler: 2, onError: 'behall' },
        },
        { typ: 'stada', kolumner: ['Ort'], stadning: 'trim' },
      ],
    })

    expect(varden(tab, 'namn')).toEqual(['Anna Karlsson', 'Bo Ek'])
    expect(varden(tab, 'Telefon')).toEqual(['+46701234567', '+46707654321'])
    expect(varden(tab, 'Belopp')).toEqual(['1240.50', '98.00'])
    // Sista steget hittar ingen Ort-kolumn, och det ska synas i rapporten.
    expect(resultat.map((r) => r.utfall)).toEqual([
      'kord',
      'kord',
      'kord',
      'kord',
      'kolumnSaknas',
    ])
  })

  it('saknade kolumner går att räkna fram före körningen', () => {
    const frame = frameOf('ny', ['Namn'], [['Anna']])
    expect(
      saknadeKolumnerFor(frame, [
        { typ: 'stada', kolumner: ['Namn', 'Ort'], stadning: 'trim' },
        { typ: 'dopOm', kolumn: 'Land', till: 'X' },
      ]),
    ).toEqual(['Ort', 'Land'])
  })
})
