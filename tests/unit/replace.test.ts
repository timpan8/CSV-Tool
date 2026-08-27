import { describe, expect, it } from 'vitest'
import { TOM_ERSATTNING, byggErsattare, raknaTraffar, type Ersattning } from '../../src/core/ops/replace.js'

const kor = (inst: Partial<Ersattning>, value: string) => {
  const { fn, fel } = byggErsattare({ ...TOM_ERSATTNING, ...inst })
  expect(fel).toBeNull()
  return fn!(value)
}

describe('bokstavlig sökning', () => {
  it('ersätter alla förekomster', () => {
    expect(kor({ sok: 'AB', ersatt: 'CD' }, 'AB-AB')).toBe('CD-CD')
  })

  it('behandlar punkt som punkt och inte som vilket tecken som helst', () => {
    expect(kor({ sok: '1.5', ersatt: 'X' }, '125')).toBe('125')
    expect(kor({ sok: '1.5', ersatt: 'X' }, '1.5')).toBe('X')
  })

  it('escapar alla regexmetatecken', () => {
    for (const tecken of ['.', '*', '+', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\']) {
      expect(kor({ sok: tecken, ersatt: '_' }, `a${tecken}b`)).toBe('a_b')
    }
  })

  it('låter dollartecken i ersättningen vara ett dollartecken', () => {
    expect(kor({ sok: 'kr', ersatt: '$' }, '100 kr')).toBe('100 $')
    expect(kor({ sok: 'kr', ersatt: '$&' }, '100 kr')).toBe('100 $&')
  })

  it('är okänslig för versaler som standard', () => {
    expect(kor({ sok: 'anna', ersatt: 'X' }, 'Anna ANNA')).toBe('X X')
  })

  it('kan göras versalkänslig', () => {
    expect(kor({ sok: 'anna', ersatt: 'X', versalkanslig: true }, 'Anna anna')).toBe('Anna X')
  })

  it('kan kräva att hela cellen matchar', () => {
    expect(kor({ sok: 'Aktiv', ersatt: 'A', helaCellen: true }, 'Aktiv')).toBe('A')
    expect(kor({ sok: 'Aktiv', ersatt: 'A', helaCellen: true }, 'Inte Aktiv')).toBe('Inte Aktiv')
  })

  it('hela cellen ankrar även när söksträngen har metatecken', () => {
    expect(kor({ sok: 'a|b', ersatt: 'X', helaCellen: true }, 'a')).toBe('a')
    expect(kor({ sok: 'a|b', ersatt: 'X', helaCellen: true }, 'a|b')).toBe('X')
  })
})

describe('reguljära uttryck', () => {
  it('tolkar mönstret', () => {
    expect(kor({ sok: '\\d+', ersatt: '#', regex: true }, 'a12b345')).toBe('a#b#')
  })

  it('stöder grupphänvisningar', () => {
    expect(
      kor({ sok: '(\\w+)@(\\w+)', ersatt: '$2/$1', regex: true }, 'anna@nordbygg'),
    ).toBe('nordbygg/anna')
  })

  it('rapporterar ett trasigt uttryck i stället för att kasta', () => {
    const { fn, fel } = byggErsattare({ ...TOM_ERSATTNING, sok: '([a-z', regex: true })
    expect(fn).toBeNull()
    expect(fel).toContain('går inte att tolka')
  })

  it('nollställer lastIndex mellan värden', () => {
    // Ett globalt regex som återanvänds missar varannat värde om lastIndex
    // ligger kvar. Två identiska anrop måste ge identiskt svar.
    const { fn } = byggErsattare({ ...TOM_ERSATTNING, sok: 'a', ersatt: 'b', regex: true })
    expect(fn!('aaa')).toBe('bbb')
    expect(fn!('aaa')).toBe('bbb')
    expect(fn!('xa')).toBe('xb')
    expect(fn!('xa')).toBe('xb')
  })
})

describe('accentokänslig ersättning', () => {
  it('hittar Öberg från oberg', () => {
    expect(kor({ sok: 'oberg', ersatt: 'Öberg', accentokanslig: true, helaCellen: true }, 'Öberg')).toBe(
      'Öberg',
    )
    expect(kor({ sok: 'oberg', ersatt: 'X', accentokanslig: true, helaCellen: true }, 'Oberg')).toBe('X')
  })

  it('vägrar i delsträngsläge i stället för att flytta tecken fel', () => {
    const { fn, fel } = byggErsattare({ ...TOM_ERSATTNING, sok: 'o', accentokanslig: true })
    expect(fn).toBeNull()
    expect(fel).toContain('hela cellen')
  })
})

describe('tom sökning', () => {
  it('ger varken funktion eller fel', () => {
    const { fn, fel } = byggErsattare(TOM_ERSATTNING)
    expect(fn).toBeNull()
    expect(fel).toBeNull()
  })
})

describe('raknaTraffar', () => {
  const { fn } = byggErsattare({ ...TOM_ERSATTNING, sok: 'Aktiv', ersatt: 'Ja' })

  it('räknar bara värden som faktiskt ändras', () => {
    expect(raknaTraffar(['Aktiv', 'Vilande', 'Aktiv', ''], fn!)).toBe(2)
  })

  it('räknar celler när vikter skickas in', () => {
    expect(raknaTraffar(['Aktiv', 'Vilande'], fn!, [9, 4])).toBe(9)
  })
})
