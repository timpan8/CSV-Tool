import { describe, expect, it } from 'vitest'
import {
  createColumn,
  intern,
  mapColumnValues,
  resetColumnIds,
  setCell,
} from '../../src/core/frame/column.js'
import { innehallsprofil, type Verktygsnamn } from '../../src/core/frame/innehall.js'
import type { Column } from '../../src/core/types.js'

function kolumn(namn: string, varden: string[], typ: Column['type'] = 'text'): Column {
  resetColumnIds()
  const col = createColumn(namn, varden.length, typ)
  varden.forEach((v, r) => {
    col.codes[r] = intern(col, v)
  })
  return col
}

const namnen = (col: Column): Verktygsnamn[] =>
  innehallsprofil(col).forslag.map((f) => f.verktyg)

describe('vad kolumnen ser ut att innehålla', () => {
  it('föreslår e-postverktyget för adresser, och inte datumverktyget', () => {
    const col = kolumn('E-post', [
      'anna.karlsson@nordbygg.se',
      'erik.oberg@nordbygg.se',
      'asa.ohman@vydata.se',
    ])
    const forslag = namnen(col)
    expect(forslag[0]).toBe('epost')
    expect(forslag).not.toContain('datum')
    expect(forslag).not.toContain('tal')
  })

  it('föreslår telefonverktyget trots att typen är text', () => {
    const col = kolumn('Telefon', ['070-123 45 67', '+46 8 555 12 34', '0730001122'])
    expect(col.type).toBe('text')
    expect(namnen(col)[0]).toBe('telefon')
  })

  it('tar inte ett kundnummer för ett telefonnummer', () => {
    // tolkaTelefon kräver landskod eller inledande nolla — ett rent
    // löpnummer uppfyller ingetdera.
    const col = kolumn('Kundnr', ['10021', '10022', '10023', '10024'], 'number')
    expect(namnen(col)).not.toContain('telefon')
    expect(namnen(col)).toContain('tal')
  })

  it('föreslår inte delning när det inte finns något att dela vid', () => {
    const col = kolumn('Ort', ['Malmö', 'Lund', 'Kiruna', 'Boden'])
    expect(namnen(col)).not.toContain('dela')
  })

  it('föreslår delning för ett namn med förnamn och efternamn', () => {
    const col = kolumn('Namn', ['Anna Karlsson', 'Erik Öberg', 'Åsa Öhman'])
    expect(namnen(col)).toContain('dela')
  })

  it('räknar datum och nämner antalet format', () => {
    const col = kolumn('Registrerad', ['2026-08-27', '27/08/2026', '2026-08-26', 'i går'])
    const profil = innehallsprofil(col)
    const datum = profil.forslag.find((f) => f.verktyg === 'datum')
    expect(datum).toBeDefined()
    expect(datum!.andel).toBeCloseTo(3 / 4)
    expect(datum!.skal).toContain('3 av 4')
    expect(datum!.skal).toContain('format')
  })

  it('lämnar en tom kolumn utan förslag', () => {
    const col = kolumn('Tom', ['', '', ''])
    const profil = innehallsprofil(col)
    expect(profil.forslag).toEqual([])
    expect(profil.ifyllda).toBe(0)
    expect(profil.unika).toBe(0)
  })

  it('räknar andelen per cell och inte per unikt värde', () => {
    // Nio adresser av samma sort och en enda skräprad: förslaget ska vara
    // starkt, inte 1/2 som en räkning på ordboken hade gett.
    const varden = Array.from({ length: 9 }, () => 'anna.karlsson@nordbygg.se')
    varden.push('saknas')
    const col = kolumn('E-post', varden)
    const profil = innehallsprofil(col)
    expect(profil.ifyllda).toBe(10)
    expect(profil.unika).toBe(2)
    expect(profil.forslag.find((f) => f.verktyg === 'epost')!.andel).toBeCloseTo(0.9)
  })

  it('räknar ogiltiga celler enligt kolumnens typ', () => {
    const col = kolumn('Belopp', ['1 240,50', 'okänt', '980,00'], 'number')
    expect(innehallsprofil(col).ogiltiga).toBe(1)
  })
})

describe('cachen', () => {
  it('ger samma objekt tillbaka när ingenting ändrats', () => {
    const col = kolumn('Ort', ['Malmö', 'Lund'])
    expect(innehallsprofil(col)).toBe(innehallsprofil(col))
  })

  it('räknas om när ordboken växer med intern', () => {
    const col = kolumn('E-post', ['anna@a.se', 'erik@a.se', 'asa@a.se', 'x', 'y'])
    // 3 av 5 är adresser: verktyget föreslås.
    expect(innehallsprofil(col).forslag.map((f) => f.verktyg)).toContain('epost')
    // setCell interneras i samma ordbok — identiteten står kvar och bara
    // längden växer. Nu är 2 av 5 adresser, och förslaget ska falla bort.
    setCell(col, 2, 'inte en adress')
    expect(innehallsprofil(col).forslag.map((f) => f.verktyg)).not.toContain('epost')
  })

  it('räknas om när mapColumnValues byter ut ordboken', () => {
    const col = kolumn('E-post', ['anna@a.se', 'erik@a.se'])
    expect(innehallsprofil(col).forslag[0]!.verktyg).toBe('epost')
    mapColumnValues(col, (v) => v.replace('@', ' hos '))
    expect(innehallsprofil(col).forslag.map((f) => f.verktyg)).not.toContain('epost')
  })

  it('räknas om när typen byts, eftersom ogiltiga byter innebörd', () => {
    const col = kolumn('Belopp', ['1 240,50', 'okänt'])
    expect(innehallsprofil(col).ogiltiga).toBe(0)
    col.type = 'number'
    expect(innehallsprofil(col).ogiltiga).toBe(1)
  })
})

describe('signalerna är strängare än verktygen själva', () => {
  it('tar inte ett datum för ett tal', () => {
    // tolkaTal skalar bort allt som inte är siffror och läser gärna
    // 2026-08-27 12:55 som 202608271255. Som signal duger det inte.
    const col = kolumn('Registrerad', [
      '2026-08-27 12:55',
      '2026-08-26',
      '27/08/2026',
      'den 27 augusti 2026',
    ])
    const forslag = namnen(col)
    expect(forslag[0]).toBe('datum')
    expect(forslag).not.toContain('tal')
  })

  it('läser ändå ett belopp med enhet som tal', () => {
    const col = kolumn('Belopp', ['1 240,50 kr', '980,00 kr', '(1 234)', '12 %'])
    const tal = innehallsprofil(col).forslag.find((f) => f.verktyg === 'tal')
    expect(tal).toBeDefined()
    expect(tal!.skal).toContain('kr')
  })

  it('föreslår inte delning av belopp med tusentalsmellanslag', () => {
    const col = kolumn('Belopp', ['1 240,50', '12 000,00', '7 450,00'])
    expect(namnen(col)).not.toContain('dela')
  })

  it('föreslår delning bara när båda delarna har bokstäver', () => {
    expect(namnen(kolumn('Namn', ['Anna Karlsson', 'Erik Öberg']))).toContain('dela')
    expect(namnen(kolumn('Kod', ['A1 2', 'B3 4']))).not.toContain('dela')
  })
})
