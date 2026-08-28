import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { parseCsvBytes, parseCsvText } from '../../src/core/csv/parse.js'
import { decodeBytes } from '../../src/core/csv/decode.js'
import { cp1252EncodeString } from '../../src/core/csv/cp1252.js'
import { getCell } from '../../src/core/frame/column.js'
import { Flag, type Frame } from '../../src/core/types.js'
import {
  encodeExport,
  EXCEL_FRIENDLY,
  guardFormula,
  stringifyCsv,
} from '../../src/core/csv/stringify.js'

const utf8 = (text: string) => new TextEncoder().encode(text)

function parse(text: string, overrides = {}) {
  return parseCsvText(text, decodeBytes(utf8(text)), overrides).frame
}

/** Läser hela ramen som strängmatris, för jämförelser i tester. */
function rows(frame: Frame): string[][] {
  const out: string[][] = []
  for (let r = 0; r < frame.rowCount; r++) {
    out.push(frame.columns.map((c) => getCell(c, r)))
  }
  return out
}

const headers = (frame: Frame) => frame.columns.map((c) => c.name)

describe('avgränsare', () => {
  it('väljer semikolon för en svensk export med decimalkomma', () => {
    const frame = parse('Namn;Belopp\nAnna;1,50\nBo;2,75\n')
    expect(headers(frame)).toEqual(['Namn', 'Belopp'])
    expect(rows(frame)[0]).toEqual(['Anna', '1,50'])
  })

  it('väljer komma när det är den avgränsare som faktiskt används', () => {
    const frame = parse('Name,City\nAnna,Lund\nBo,Boden\n')
    expect(headers(frame)).toEqual(['Name', 'City'])
  })

  it('väljer tabb för en tabbseparerad fil', () => {
    const frame = parse('Namn\tOrt\nAnna\tLund\n')
    expect(headers(frame)).toEqual(['Namn', 'Ort'])
  })

  it('delar inte upp en genuin enkolumnsfil', () => {
    const frame = parse('E-post\nanna@ex.se\nbo@ex.se\n')
    expect(headers(frame)).toEqual(['E-post'])
    expect(frame.columns).toHaveLength(1)
  })

  it('konsumerar Excels sep=-rad i stället för att göra den till rubrik', () => {
    const frame = parse('sep=;\nNamn;Ort\nAnna;Lund\n')
    expect(headers(frame)).toEqual(['Namn', 'Ort'])
    expect(frame.meta.parse?.hadSepDirective).toBe(true)
    expect(frame.rowCount).toBe(1)
  })

  it('hittar rubrikraden när filen inleds med en förklarande text', () => {
    const frame = parse('Export 2026-08-27\n\nNamn;Ort;Belopp\nAnna;Lund;10\nBo;Boden;20\n')
    expect(headers(frame)).toEqual(['Namn', 'Ort', 'Belopp'])
    expect(frame.rowCount).toBe(2)
  })
})

describe('rubriker', () => {
  it('gör dubbletta rubriker unika och varnar om det', () => {
    const frame = parse('Namn;Namn;Namn\na;b;c\n')
    expect(headers(frame)).toEqual(['Namn', 'Namn (2)', 'Namn (3)'])
    expect(frame.meta.warnings.some((w) => w.kind === 'duplicate-header')).toBe(true)
  })

  it('namnger tomma rubriker efter position', () => {
    const frame = parse('Namn;;Ort\na;b;c\n')
    expect(headers(frame)).toEqual(['Namn', 'Kolumn 2', 'Ort'])
    expect(frame.meta.warnings.some((w) => w.kind === 'empty-header')).toBe(true)
  })
})

describe('trasiga rader', () => {
  it('fyller ut för korta rader och markerar cellerna', () => {
    const frame = parse('a;b;c\n1;2;3\n4;5\n')
    expect(rows(frame)[1]).toEqual(['4', '5', ''])
    const c = frame.columns[2]!
    expect((c.flags[1]! & Flag.Padded) !== 0).toBe(true)
    const warning = frame.meta.warnings.find((w) => w.kind === 'ragged-row')
    expect(warning?.count).toBe(1)
  })

  it('lägger extra fält i nya kolumner i stället för att kasta dem', () => {
    const frame = parse('a;b\n1;2\n3;4;5\n')
    expect(frame.columns).toHaveLength(3)
    expect(rows(frame)[1]).toEqual(['3', '4', '5'])
    // Raden före den breda raden ska vara tom i extrakolumnen, inte odefinierad.
    expect(rows(frame)[0]).toEqual(['1', '2', ''])
  })

  it('hoppar över Excels spökrader som bara är avgränsare', () => {
    const frame = parse('a;b;c\n1;2;3\n;;\n;;\n4;5;6\n')
    expect(frame.rowCount).toBe(2)
    const warning = frame.meta.warnings.find((w) => w.kind === 'ghost-rows')
    expect(warning?.count).toBe(2)
  })
})

describe('värden', () => {
  it('behåller ledande nollor i postnummer', () => {
    const frame = parse('Postnr;Ort\n01234;Boden\n00700;Test\n')
    expect(rows(frame).map((r) => r[0])).toEqual(['01234', '00700'])
  })

  it('behåller radbrytningar inuti citerade fält', () => {
    const frame = parse('Namn;Adress\nAnna;"Storgatan 1\nBox 4"\n')
    expect(frame.rowCount).toBe(1)
    expect(rows(frame)[0]![1]).toBe('Storgatan 1\nBox 4')
  })

  it('avkodar dubbla citattecken till ett', () => {
    const frame = parse('Namn;Citat\nAnna;"Hon sa ""hej"" igen"\n')
    expect(rows(frame)[0]![1]).toBe('Hon sa "hej" igen')
  })

  it('behåller semikolon inuti ett citerat fält', () => {
    const frame = parse('Namn;Adress\nAnna;"Storgatan 1; Box 4"\n')
    expect(frame.columns).toHaveLength(2)
    expect(rows(frame)[0]![1]).toBe('Storgatan 1; Box 4')
  })

  it('numrerar ursprungliga radnummer så "rad 47" går att hitta igen', () => {
    const frame = parse('a;b\n1;2\n;;\n3;4\n')
    // Rad 1 är rubriken, rad 3 är spökraden som hoppades över.
    expect(Array.from(frame.sourceRow)).toEqual([2, 4])
  })
})

describe('svensk Excel-export', () => {
  it('läser semikolon, CP1252 och CRLF i ett svep', () => {
    const text = 'Namn;Ort;Belopp\r\nÅsa Öberg;Malmö;1 240,50\r\nBjörn Åkesson;Växjö;980,00\r\n'
    const frame = parseCsvBytes(cp1252EncodeString(text)!).frame
    expect(frame.meta.parse?.encoding).toBe('windows-1252')
    expect(frame.meta.parse?.delimiter).toBe(';')
    expect(frame.meta.parse?.newline).toBe('\r\n')
    expect(headers(frame)).toEqual(['Namn', 'Ort', 'Belopp'])
    expect(rows(frame)[0]).toEqual(['Åsa Öberg', 'Malmö', '1 240,50'])
  })
})

describe('export', () => {
  it('skriver Excel-vänlig CSV med BOM och semikolon', () => {
    const frame = parse('Namn;Ort\nÅsa;Malmö\n')
    // Samma komposition som ExportDialog: strängen först, sedan byten.
    const { bytes } = encodeExport(stringifyCsv(frame, EXCEL_FRIENDLY), EXCEL_FRIENDLY)
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes.subarray(3))
    expect(text).toBe('Namn;Ort\r\nÅsa;Malmö\r\n')
  })

  it('rapporterar tecken som går förlorade vid CP1252-export', () => {
    const frame = parse('Namn;Not\nAnna;✓ klart\n')
    const val = { ...EXCEL_FRIENDLY, encoding: 'windows-1252' as const, bom: false }
    const result = encodeExport(stringifyCsv(frame, val), val)
    expect(result.lostCharacters).toEqual(['✓'])
    expect(new TextDecoder('windows-1252').decode(result.bytes)).toContain('? klart')
  })

  it('exporterar bara den filtrerade vyn när vyn är begränsad', () => {
    const frame = parse('Namn;Ort\nAnna;Lund\nBo;Boden\nCia;Kiruna\n')
    frame.view = Uint32Array.from([2, 0])
    const text = stringifyCsv(frame, EXCEL_FRIENDLY)
    expect(text).toBe('Namn;Ort\r\nCia;Kiruna\r\nAnna;Lund\r\n')
  })

  it('utelämnar dolda kolumner', () => {
    const frame = parse('Namn;Internt;Ort\nAnna;x;Lund\n')
    frame.columns[1]!.hidden = true
    expect(stringifyCsv(frame, EXCEL_FRIENDLY)).toBe('Namn;Ort\r\nAnna;Lund\r\n')
  })
})

describe('formelskydd', () => {
  it('skyddar celler som Excel annars kör som formel', () => {
    expect(guardFormula('=SUMMA(A1:A9)')).toBe("'=SUMMA(A1:A9)")
    expect(guardFormula('@import')).toBe("'@import")
  })

  it('rör inte negativa tal — apostrofen vore i sig en tyst dataändring', () => {
    expect(guardFormula('-5')).toBe('-5')
    expect(guardFormula('-1 240,50')).toBe('-1 240,50')
    expect(guardFormula('+46701234567')).toBe('+46701234567')
  })

  it('skyddar text som bara ser ut att börja som ett tal', () => {
    expect(guardFormula('-cmd|calc')).toBe("'-cmd|calc")
  })
})

describe('rundgång', () => {
  const fixtures = [
    'Namn;Ort\nAnna;Lund\nBo;Boden\n',
    'Namn;Adress\nAnna;"Storgatan 1; Box 4"\n',
    'Namn;Citat\nAnna;"Hon sa ""hej"" igen"\n',
    'Namn;Adress\nAnna;"Rad 1\nRad 2"\n',
    'Postnr;Ort\n01234;Boden\n',
    'Namn;Ort;Belopp\nÅsa Öberg;Malmö;1 240,50\n',
  ]

  for (const [i, fixture] of fixtures.entries()) {
    it(`läs(skriv(läs(x))) är samma som läs(x) för fixtur ${i + 1}`, () => {
      const once = parse(fixture)
      const written = stringifyCsv(once, { ...EXCEL_FRIENDLY, protectFormulas: false })
      const twice = parse(written)
      expect(headers(twice)).toEqual(headers(once))
      expect(rows(twice)).toEqual(rows(once))
    })
  }

  it('överlever slumpade fält med citattecken, avgränsare och radbrytningar', () => {
    // Det här testet hittar citatbuggar som ingen handskriven fixtur gör.
    const field = fc.stringMatching(/^[a-zåäöA-ZÅÄÖ0-9 ;,"\n\r.-]{0,12}$/)
    fc.assert(
      fc.property(
        fc.array(fc.array(field, { minLength: 3, maxLength: 3 }), { minLength: 1, maxLength: 8 }),
        (data) => {
          const frame = parse('a;b;c\n')
          // Bygg en ram direkt ur datat i stället för att gå via text, så att
          // vi testar skriv→läs och inte läs→skriv→läs.
          const built = parse(
            'a;b;c\n' +
              data
                .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';'))
                .join('\n') +
              '\n',
          )
          expect(headers(built)).toEqual(headers(frame))
          const written = stringifyCsv(built, { ...EXCEL_FRIENDLY, protectFormulas: false })
          const reread = parse(written)
          expect(rows(reread)).toEqual(rows(built))
        },
      ),
      { numRuns: 200 },
    )
  })
})
