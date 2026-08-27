import { describe, expect, it } from 'vitest'
import { createColumn, intern, resetColumnIds } from '../../src/core/frame/column.js'
import { createFrame, identityView } from '../../src/core/frame/frame.js'
import {
  BERAKNINGAR,
  berakningsnamn,
  forslagsnamn,
  gruppera,
  LISTTAK,
  type Berakning,
  type Grupperingsplan,
} from '../../src/core/ops/gruppera.js'
import type { Frame } from '../../src/core/types.js'

const STRUNTA = { skiftlage: true, blanksteg: true, diakriter: false }

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

/** Bygger en plan med rimliga standardval, så testerna bara nämner det de bryr sig om. */
function plan(frame: Frame, over: Partial<Grupperingsplan> = {}): Grupperingsplan {
  return {
    nycklar: [frame.columns[0]!.id],
    berakningar: [],
    strunta: STRUNTA,
    tommaMed: false,
    namn: '',
    format: 'komma',
    decimaler: null,
    ...over,
  }
}

const ber = (typ: Berakning['typ'], colId: string | null, id: string = typ): Berakning => ({
  id,
  typ,
  colId,
  namn: '',
})

/** Resultatet som rader av strängar, för lättlästa förväntningar. */
const dump = (frame: Frame): string[][] =>
  Array.from({ length: frame.rowCount }, (_, r) =>
    frame.columns.map((c) => c.dict[c.codes[r]!] ?? ''),
  )

const SALJ = () =>
  frameOf(
    ['Ort', 'Belopp', 'Kund'],
    [
      ['Malmö', '100', 'Anna'],
      ['Lund', '250,50', 'Bo'],
      ['Malmö', '50', 'Anna'],
      ['Boden', '', 'Cia'],
      ['malmö', '25', 'Dan'],
    ],
  )

describe('gruppera', () => {
  it('summerar per grupp och lägger grupperna i den ordning de dyker upp', () => {
    const frame = SALJ()
    const belopp = frame.columns[1]!.id
    const r = gruppera(frame, plan(frame, { berakningar: [ber('summa', belopp)] }))

    expect(r.frame.columns.map((c) => c.name)).toEqual(['Ort', 'Summa Belopp'])
    expect(dump(r.frame)).toEqual([
      ['Malmö', '175'],
      ['Lund', '250,5'],
      ['Boden', ''],
    ])
    expect(r.antalGrupper).toBe(3)
    expect(r.storsta).toBe(3)
  })

  it('slår ihop stavningar som normaliseringen gör lika, och visar den första', () => {
    const frame = SALJ()
    const r = gruppera(frame, plan(frame, { berakningar: [ber('antal', null)] }))
    // Malmö och malmö är samma ort; ”Malmö” kom först och är det som skrivs.
    expect(dump(r.frame)).toEqual([
      ['Malmö', '3'],
      ['Lund', '1'],
      ['Boden', '1'],
    ])
  })

  it('håller isär stavningarna när man inte struntar i skiftläget', () => {
    const frame = SALJ()
    const r = gruppera(
      frame,
      plan(frame, {
        berakningar: [ber('antal', null)],
        strunta: { skiftlage: false, blanksteg: true, diakriter: false },
      }),
    )
    expect(dump(r.frame)).toEqual([
      ['Malmö', '2'],
      ['Lund', '1'],
      ['Boden', '1'],
      ['malmö', '1'],
    ])
  })

  it('en tom summa blir tom cell, aldrig noll', () => {
    const frame = SALJ()
    const belopp = frame.columns[1]!.id
    const r = gruppera(frame, plan(frame, { berakningar: [ber('summa', belopp)] }))
    // Boden har en rad, men ingen siffra. En nolla där vore en uppgift som
    // inte finns i filen.
    expect(dump(r.frame)[2]).toEqual(['Boden', ''])
  })

  it('snitt delar med antalet läsbara värden, inte med antalet rader', () => {
    const frame = frameOf(
      ['Ort', 'Belopp'],
      [['Lund', '10'], ['Lund', ''], ['Lund', 'saknas'], ['Lund', '20']],
    )
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('snitt', frame.columns[1]!.id)] }),
    )
    expect(dump(r.frame)).toEqual([['Lund', '15']])
    expect(r.lasbarhet[0]).toEqual({ id: 'snitt', lasta: 2, ifyllda: 3 })
  })

  it('räknar rader, ifyllda och unika var för sig', () => {
    const frame = frameOf(
      ['Ort', 'Kund'],
      [['Lund', 'Anna'], ['Lund', ''], ['Lund', 'Anna'], ['Lund', 'Bo']],
    )
    const kund = frame.columns[1]!.id
    const r = gruppera(
      frame,
      plan(frame, {
        berakningar: [ber('antal', null), ber('ifyllda', kund), ber('unika', kund)],
      }),
    )
    expect(dump(r.frame)).toEqual([['Lund', '4', '3', '2']])
  })

  it('minsta och största följer kolumnens egen ordning och ger värdet som det står', () => {
    const frame = frameOf(
      ['Projekt', 'Datum'],
      [
        ['A', '2024-03-05'],
        ['A', '2024-01-31'],
        ['A', '2024-11-02'],
      ],
    )
    frame.columns[1]!.type = 'date'
    frame.columns[1]!.typeLocked = true
    const datum = frame.columns[1]!.id
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('minsta', datum), ber('storsta', datum)] }),
    )
    // Datum jämförs som datum, inte som text, och skrivs tillbaka oförändrade.
    expect(dump(r.frame)).toEqual([['A', '2024-01-31', '2024-11-02']])
  })

  it('minsta på en talkolumn jämför som tal och inte som text', () => {
    const frame = frameOf(['Ort', 'Antal'], [['Lund', '9'], ['Lund', '100'], ['Lund', '25']])
    frame.columns[1]!.type = 'number'
    frame.columns[1]!.typeLocked = true
    const antal = frame.columns[1]!.id
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('minsta', antal), ber('storsta', antal)] }),
    )
    expect(dump(r.frame)).toEqual([['Lund', '9', '100']])
  })

  it('första och sista hoppar över tomma celler', () => {
    const frame = frameOf(
      ['Ort', 'Not'],
      [['Lund', ''], ['Lund', 'mitten'], ['Lund', 'slut'], ['Lund', '']],
    )
    const not = frame.columns[1]!.id
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('forsta', not), ber('sista', not)] }),
    )
    expect(dump(r.frame)).toEqual([['Lund', 'mitten', 'slut']])
  })

  it('lista radar upp de unika värdena i den ordning de kommer', () => {
    const frame = frameOf(
      ['Ort', 'Kund'],
      [['Lund', 'Bo'], ['Lund', 'Anna'], ['Lund', 'Bo'], ['Lund', '']],
    )
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('lista', frame.columns[1]!.id)] }),
    )
    expect(dump(r.frame)).toEqual([['Lund', 'Bo, Anna']])
  })

  it('lista säger hur många den kapade i stället för att se komplett ut', () => {
    const rader = Array.from({ length: LISTTAK + 7 }, (_, i) => ['Lund', `v${i}`])
    const frame = frameOf(['Ort', 'Kund'], rader)
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('lista', frame.columns[1]!.id)] }),
    )
    const varde = dump(r.frame)[0]![1]!
    expect(varde.endsWith('… (+7 till)')).toBe(true)
    expect(varde.split(', ').length).toBe(LISTTAK)
  })

  it('grupperar på flera kolumner samtidigt', () => {
    const frame = frameOf(
      ['Ort', 'År', 'Belopp'],
      [
        ['Lund', '2024', '10'],
        ['Lund', '2025', '20'],
        ['Lund', '2024', '5'],
        ['Malmö', '2024', '7'],
      ],
    )
    const r = gruppera(
      frame,
      plan(frame, {
        nycklar: [frame.columns[0]!.id, frame.columns[1]!.id],
        berakningar: [ber('summa', frame.columns[2]!.id)],
      }),
    )
    expect(dump(r.frame)).toEqual([
      ['Lund', '2024', '15'],
      ['Lund', '2025', '20'],
      ['Malmö', '2024', '7'],
    ])
  })

  it('lämnar rader utan nyckel utanför, och säger hur många', () => {
    const frame = frameOf(['Ort', 'Belopp'], [['Lund', '10'], ['', '99'], ['', '1']])
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('summa', frame.columns[1]!.id)] }),
    )
    expect(dump(r.frame)).toEqual([['Lund', '10']])
    expect(r.utanNyckel).toBe(2)
    expect(r.radermed).toBe(1)
  })

  it('tar med dem som en egen grupp när man ber om det', () => {
    const frame = frameOf(['Ort', 'Belopp'], [['Lund', '10'], ['', '99'], ['', '1']])
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('summa', frame.columns[1]!.id)], tommaMed: true }),
    )
    expect(dump(r.frame)).toEqual([
      ['Lund', '10'],
      ['', '100'],
    ])
    expect(r.utanNyckel).toBe(0)
  })

  it('utan nyckelkolumner blir hela filen en enda rad', () => {
    const frame = SALJ()
    const r = gruppera(
      frame,
      plan(frame, {
        nycklar: [],
        berakningar: [ber('antal', null), ber('summa', frame.columns[1]!.id)],
      }),
    )
    expect(dump(r.frame)).toEqual([['5', '425,5']])
  })

  it('räknar bara de rader vyn visar', () => {
    const frame = SALJ()
    // Ett filter som bara släpper igenom Malmöraderna.
    frame.view = Uint32Array.from([0, 2])
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('antal', null), ber('summa', frame.columns[1]!.id)] }),
    )
    expect(dump(r.frame)).toEqual([['Malmö', '2', '150']])
  })

  it('första och sista följer vyns ordning, inte filens', () => {
    const frame = frameOf(
      ['Ort', 'Not'],
      [['Lund', 'a'], ['Lund', 'b'], ['Lund', 'c']],
    )
    frame.view = Uint32Array.from([2, 0, 1])
    const not = frame.columns[1]!.id
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('forsta', not), ber('sista', not)] }),
    )
    expect(dump(r.frame)).toEqual([['Lund', 'c', 'b']])
  })

  it('formatet gäller de tal beräkningen skriver', () => {
    const frame = frameOf(['Ort', 'Belopp'], [['Lund', '1,5'], ['Lund', '1,25']])
    const r = gruppera(
      frame,
      plan(frame, {
        berakningar: [ber('summa', frame.columns[1]!.id)],
        format: 'punkt',
        decimaler: 2,
      }),
    )
    expect(dump(r.frame)).toEqual([['Lund', '2.75']])
  })

  it('en beräkning på en borttagen kolumn ger tom kolumn i stället för att kasta', () => {
    const frame = SALJ()
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('summa', 'finns-inte')] }),
    )
    expect(r.frame.columns.map((c) => c.name)).toEqual(['Ort', 'Summa ?'])
    expect(dump(r.frame).every((rad) => rad[1] === '')).toBe(true)
  })

  it('en tom fil ger ett tomt resultat och inget kast', () => {
    const frame = frameOf(['Ort', 'Belopp'], [])
    const r = gruppera(frame, plan(frame, { berakningar: [ber('summa', frame.columns[1]!.id)] }))
    expect(r.antalGrupper).toBe(0)
    expect(r.frame.rowCount).toBe(0)
  })

  it('två beräkningar med samma automatiska namn får skilda rubriker', () => {
    const frame = SALJ()
    const belopp = frame.columns[1]!.id
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('summa', belopp, 'a'), ber('summa', belopp, 'b')] }),
    )
    expect(r.frame.columns.map((c) => c.name)).toEqual(['Ort', 'Summa Belopp', 'Summa Belopp (2)'])
  })

  it('räknekolumner låses som tal så att de sorteras som tal', () => {
    const frame = frameOf(['Ort', 'X'], [['Lund', '1'], ['Malmö', '0']])
    const r = gruppera(frame, plan(frame, { berakningar: [ber('antal', null)] }))
    // Ettor och nollor skulle annars kunna tolkas som ja/nej.
    const antal = r.frame.columns[1]!
    expect(antal.type).toBe('number')
    expect(antal.typeLocked).toBe(true)
  })

  it('resultatets rader har radnummer 0 — de fanns inte i filen', () => {
    const frame = SALJ()
    const r = gruppera(frame, plan(frame, { berakningar: [ber('antal', null)] }))
    expect(Array.from(r.frame.sourceRow)).toEqual([0, 0, 0])
  })
})

describe('namn', () => {
  it('den automatiska rubriken nämner kolumnen', () => {
    const frame = SALJ()
    const belopp = frame.columns[1]!.id
    expect(berakningsnamn(ber('summa', belopp), frame)).toBe('Summa Belopp')
    expect(berakningsnamn(ber('antal', null), frame)).toBe('Antal rader')
  })

  it('ett eget namn vinner över det automatiska', () => {
    const frame = SALJ()
    const egen = { ...ber('summa', frame.columns[1]!.id), namn: '  Omsättning  ' }
    expect(berakningsnamn(egen, frame)).toBe('Omsättning')
  })

  it('flikens förslagsnamn säger vad grupperingen gick på', () => {
    const frame = SALJ()
    expect(forslagsnamn(frame, [frame.columns[0]!.id])).toBe('fil.csv per Ort')
    expect(forslagsnamn(frame, [])).toBe('fil.csv – sammanfattning')
  })

  it('varje beräkningstyp har en post med hjälptext', () => {
    for (const post of BERAKNINGAR) {
      expect(post.etikett.length).toBeGreaterThan(0)
      expect(post.hjalp.length).toBeGreaterThan(0)
    }
  })
})

describe('stora grupper', () => {
  it('summerar 50 000 rader över 1 000 grupper', () => {
    const rader = Array.from({ length: 50_000 }, (_, i) => [`g${i % 1000}`, '2'])
    const frame = frameOf(['Grupp', 'Tal'], rader)
    frame.view = identityView(frame.rowCount)
    const r = gruppera(
      frame,
      plan(frame, { berakningar: [ber('antal', null), ber('summa', frame.columns[1]!.id)] }),
    )
    expect(r.antalGrupper).toBe(1000)
    expect(dump(r.frame)[0]).toEqual(['g0', '50', '100'])
  })
})
