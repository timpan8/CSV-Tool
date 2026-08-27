import { describe, expect, it } from 'vitest'
import {
  inferType,
  isExcelError,
  looksLikeDate,
  looksLikeEmail,
  looksNumeric,
  parseNumber,
  violatesType,
} from '../../src/core/infer.js'
import { normalizeAlways, sortCollator, stripDiacritics } from '../../src/core/locale/sv.js'
import { createColumn, intern } from '../../src/core/frame/column.js'
import type { Column } from '../../src/core/types.js'

function columnOf(values: string[]): Column {
  const col = createColumn('test', values.length)
  for (let i = 0; i < values.length; i++) col.codes[i] = intern(col, values[i]!)
  return col
}

describe('taligenkänning', () => {
  it('godtar svenska tal med decimalkomma och tusentalsavgränsare', () => {
    expect(looksNumeric('1 240,50')).toBe(true)
    expect(parseNumber('1 240,50')).toBe(1240.5)
    expect(parseNumber('1 240,50')).toBe(1240.5)
    expect(parseNumber('-980,00')).toBe(-980)
  })

  it('vägrar tolka postnummer som tal', () => {
    // Ledande nolla betyder identifierare. Att typa den som tal är precis så
    // andra verktyg gör 01234 till 1234.
    expect(looksNumeric('01234')).toBe(false)
    expect(looksNumeric('00700')).toBe(false)
    expect(looksNumeric('1234')).toBe(true)
  })

  it('vägrar tolka telefon- och organisationsnummer som tal', () => {
    expect(looksNumeric('0730123456')).toBe(false)
    expect(looksNumeric('123456789012345678')).toBe(false)
  })
})

describe('datumigenkänning', () => {
  it('känner igen de format som faktiskt förekommer', () => {
    for (const value of [
      '2026-08-27',
      '2026-08-27 12:55',
      '2026-08-27T12:55:00Z',
      '27/08/2026',
      '27.8.2026',
      '20260827',
      '27 aug 2026',
      'den 27 augusti 2026',
      'Aug 27, 2026',
    ]) {
      expect(looksLikeDate(value), value).toBe(true)
    }
  })

  it('känner inte igen text som råkar innehålla siffror', () => {
    for (const value of ['i går', 'okänt', '1234', 'Kund 27']) {
      expect(looksLikeDate(value), value).toBe(false)
    }
  })
})

describe('e-postigenkänning', () => {
  it('godtar vanliga adresser och avvisar skräp', () => {
    expect(looksLikeEmail('anna.karlsson@foretag.se')).toBe(true)
    expect(looksLikeEmail('a.b-c@sub.foretag.co.uk')).toBe(true)
    expect(looksLikeEmail('saknar-snabel')).toBe(false)
    expect(looksLikeEmail('a@b')).toBe(false)
  })
})

describe('inferType', () => {
  it('typar en e-postkolumn', () => {
    expect(inferType(columnOf(['anna@ex.se', 'bo@ex.se', 'cia@ex.se'])).type).toBe('email')
  })

  it('typar en datumkolumn även med enstaka skräpvärden', () => {
    const values = Array.from({ length: 20 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
    values.push('i går')
    expect(inferType(columnOf(values)).type).toBe('date')
  })

  it('låter en blandad kolumn förbli text', () => {
    expect(inferType(columnOf(['Anna', '2026-08-27', '1234', 'bo@ex.se'])).type).toBe('text')
  })

  it('typar en postnummerkolumn som text, inte tal', () => {
    expect(inferType(columnOf(['01234', '00700', '11122', '09876'])).type).toBe('text')
  })

  it('låter ett enda postnummer med ledande nolla veta hela kolumnen', () => {
    // Femton av sexton värden är sifferformade utan ledande nolla. En ren
    // andelsberäkning skulle typa kolumnen som tal och sedan flagga just det
    // värde som avslöjar vad kolumnen faktiskt är.
    const postnr = ['21120', '22350', '98139', '35236', '41103', '11122', '72212',
      '58330', '90325', '75236', '85230', '65224', '70362', '93131', '11455']
    expect(inferType(columnOf(postnr)).type).toBe('number')
    expect(inferType(columnOf([...postnr, '01234'])).type).toBe('text')
  })

  it('låter ett telefonnummer veta taltypen på samma sätt', () => {
    const belopp = ['1240', '980', '12000', '412', '7450', '315', '1890']
    expect(inferType(columnOf(belopp)).type).toBe('number')
    expect(inferType(columnOf([...belopp, '0730123456'])).type).toBe('text')
  })

  it('låter fritext inte veta taltypen', () => {
    // Bara sifferformade värden diskvalificerar kolumnen. "saknas" är text
    // och ska bara räknas som ett värde som inte är ett tal.
    const värden = Array.from({ length: 30 }, (_, i) => String(100 + i))
    expect(inferType(columnOf([...värden, 'saknas'])).type).toBe('number')
  })

  it('typar en tom kolumn som tom', () => {
    expect(inferType(columnOf(['', '', ''])).type).toBe('empty')
  })
})

describe('violatesType', () => {
  it('flaggar värden som inte passar kolumnens typ', () => {
    expect(violatesType('i går', 'date')).toBe(true)
    expect(violatesType('2026-08-27', 'date')).toBe(false)
    // Tomma celler är inte fel, bara tomma.
    expect(violatesType('', 'date')).toBe(false)
  })
})

describe('Excel-felsträngar', () => {
  it('känner igen både svenska och engelska varianter', () => {
    for (const value of ['#SAKNAS!', '#N/A', '#VÄRDEFEL!', '#DIVISION/0!', '#REFERENS!', '#NAMN?']) {
      expect(isExcelError(value), value).toBe(true)
    }
    expect(isExcelError('Anna')).toBe(false)
  })
})

describe('svensk sortering', () => {
  it('sorterar å ä ö efter z', () => {
    const names = ['Öberg', 'Åkesson', 'Zetterberg', 'Ängström', 'Bengtsson']
    expect(names.slice().sort(sortCollator.compare)).toEqual([
      'Bengtsson', 'Zetterberg', 'Åkesson', 'Ängström', 'Öberg',
    ])
  })

  it('sorterar tal i text naturligt', () => {
    expect(['Kund 10', 'Kund 2', 'Kund 1'].sort(sortCollator.compare)).toEqual([
      'Kund 1', 'Kund 2', 'Kund 10',
    ])
  })
})

describe('normalisering', () => {
  it('gör dekomponerat å från macOS lika med komponerat', () => {
    const decomposed = 'Åkesson'
    expect(decomposed).not.toBe('Åkesson')
    expect(normalizeAlways(decomposed)).toBe('Åkesson')
  })

  it('tar bort osynliga tecken som annars bryter varje matchning', () => {
    expect(normalizeAlways('Anna​Karlsson')).toBe('AnnaKarlsson')
    expect(normalizeAlways('Anna Karlsson')).toBe('Anna Karlsson')
  })

  it('tar bort diakriter bara när man uttryckligen ber om det', () => {
    expect(stripDiacritics('Åsa Öberg')).toBe('Asa Oberg')
  })
})
