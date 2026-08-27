import { describe, expect, it } from 'vitest'
import { decodeBytes, repairMojibake } from '../../src/core/csv/decode.js'
import { cp1252EncodeString, unencodableInCp1252 } from '../../src/core/csv/cp1252.js'

const utf8 = (text: string) => new TextEncoder().encode(text)

/** Kodar text som Windows-1252, som en svensk Excel-export gör. */
function cp1252(text: string): Uint8Array {
  const bytes = cp1252EncodeString(text)
  if (!bytes) throw new Error('kan inte kodas som CP1252')
  return bytes
}

/** Skapar mojibake på samma sätt som verkligheten: UTF-8-bytes lästa som CP1252. */
function mojibake(text: string): string {
  return new TextDecoder('windows-1252').decode(utf8(text))
}

describe('decodeBytes', () => {
  it('läser UTF-8 med svenska tecken och bekräftar att de ser rätt ut', () => {
    const r = decodeBytes(utf8('Namn;Ort\nÅsa Öberg;Malmö\n'))
    expect(r.encoding).toBe('utf-8')
    expect(r.text).toContain('Åsa Öberg')
    expect(r.check.state).toBe('ok')
  })

  it('strippar UTF-8-BOM så den inte hamnar i första rubriken', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Namn;Ort\nAnna;Lund\n')])
    const r = decodeBytes(withBom)
    expect(r.hadBom).toBe(true)
    expect(r.text.startsWith('Namn')).toBe(true)
  })

  it('faller tillbaka till Windows-1252 för en svensk Excel-export', () => {
    const r = decodeBytes(cp1252('Namn;Ort\nÅsa Öberg;Malmö\nBjörn Åkesson;Växjö\n'))
    expect(r.encoding).toBe('windows-1252')
    expect(r.text).toContain('Åsa Öberg')
    expect(r.text).toContain('Växjö')
    expect(r.check.state).toBe('ok')
  })

  it('läser UTF-16LE med BOM (Excels "Spara som Unicode-text")', () => {
    const text = 'Namn\tOrt\r\nÅsa\tMalmö\r\n'
    const body = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      body[i * 2] = code & 0xff
      body[i * 2 + 1] = code >> 8
    }
    const r = decodeBytes(new Uint8Array([0xff, 0xfe, ...body]))
    expect(r.encoding).toBe('utf-16le')
    expect(r.text).toContain('Malmö')
  })

  it('fäller inte hela filen till CP1252 för en enstaka trasig byte', () => {
    // 5 000 korrekta Å ger 10 000 icke-ASCII-bytes. En ensam ogiltig byte får
    // inte offra dem alla.
    const good = utf8('Åkesson;Malmö\n'.repeat(5000))
    const withGlitch = new Uint8Array(good.length + 1)
    withGlitch.set(good.subarray(0, 100))
    withGlitch[100] = 0xff
    withGlitch.set(good.subarray(100), 101)

    const r = decodeBytes(withGlitch)
    expect(r.encoding).toBe('utf-8')
    expect(r.invalidSequences).toBe(1)
    expect(r.text).toContain('Åkesson')
  })

  it('upptäcker mojibake i en dubbelkodad fil och kan laga den', () => {
    // Så här ser skadan ut i verkligheten: någon läste en UTF-8-fil som
    // CP1252 och sparade om den som UTF-8. Nu står det bokstavligen "Ã…sa"
    // i filen, och ingen omval av teckenkodning kan laga det.
    const broken = mojibake('Namn;Ort\nÅsa Öberg;Malmö\n')
    const r = decodeBytes(utf8(broken))
    expect(r.encoding).toBe('utf-8')
    expect(r.check.state).toBe('mojibake')
    if (r.check.state !== 'mojibake') throw new Error('förväntade mojibake')
    expect(r.check.repairable).toBe(true)
    expect(repairMojibake(r.text)).toContain('Åsa Öberg')
  })

  it('löser upp mojibake av sig självt när filen är UTF-8 läst som CP1252', () => {
    // Om filen på disk är korrekt UTF-8 men någon *visat* den som CP1252 är
    // byten redan rätt. Att välja UTF-8 ger korrekt text utan reparation.
    const broken = mojibake('Åsa Öberg;Malmö')
    const r = decodeBytes(cp1252(broken))
    expect(r.text).toContain('Åsa Öberg')
    expect(r.check.state).toBe('ok')
  })

  it('säger "kan inte avgöras" när filen bara innehåller ASCII', () => {
    // Ingen grön bock utan bevis: en ASCII-fil ger inget stöd för att
    // kodningen är rätt vald.
    const r = decodeBytes(utf8('Name;City\nAnna;Lund\nBob;Boden\n'))
    expect(r.check.state).toBe('unknown')
  })

  it('upptäcker CRLF respektive LF som dominerande radslut', () => {
    expect(decodeBytes(utf8('a;b\r\nc;d\r\n')).newline).toBe('\r\n')
    expect(decodeBytes(utf8('a;b\nc;d\n')).newline).toBe('\n')
  })
})

describe('repairMojibake', () => {
  it('rör inte text som inte är mojibake', () => {
    expect(repairMojibake('Åsa Öberg bor i Malmö')).toBeNull()
  })

  it('är inversen av den skada som faktiskt uppstår', () => {
    const original = 'Björn Åkesson, Växjö — 1 240,50 kr'
    expect(repairMojibake(mojibake(original))).toBe(original)
  })
})

describe('cp1252', () => {
  it('kodar typografiska tecken som svenska Excel-filer innehåller', () => {
    expect(cp1252EncodeString('’')![0]).toBe(0x92)
    expect(cp1252EncodeString('–')![0]).toBe(0x96)
  })

  it('rapporterar tecken som skulle gå förlorade vid CP1252-export', () => {
    expect(unencodableInCp1252('Åsa köpte ✓ och ☕')).toEqual(['✓', '☕'])
    expect(unencodableInCp1252('Åsa Öberg')).toEqual([])
  })
})
