import { describe, expect, it } from 'vitest'
import {
  TALFORMAT,
  inventeraTal,
  skrivTal,
  talTransform,
  tolkaTal,
  type Talval,
} from '../../src/core/ops/numbers.js'

const tal = (v: string, val?: Talval) => tolkaTal(v, val).tal

describe('tolkaTal', () => {
  const fall: [string, number | null][] = [
    ['1240', 1240],
    ['1240,5', 1240.5],
    ['1 240,50', 1240.5],
    ['1240.5', 1240.5],
    ['0', 0],
    ['0,0', 0],
    ['-45', -45],
    ['+45', 45],
    ['1 240,50 kr', 1240.5],
    ['1240,50 SEK', 1240.5],
    ['kr 1240', 1240],
    ['12 %', 12],
    ['€1 240,50', 1240.5],
    ['1,240.50', 1240.5],
    ['1.240,50', 1240.5],
    ['(1 240,50)', -1240.5],
    ['(1240)', -1240],
    ['1240-', -1240],
    ['1 240,50 kr-', -1240.5],
    ['', null],
    ['   ', null],
    ['kr', null],
    ['Aktiv', null],
    ['-', null],
    ['1,2,3', null],
  ]
  for (const [indata, forvantat] of fall) {
    it(`${JSON.stringify(indata)} → ${forvantat}`, () => {
      expect(tal(indata)).toBe(forvantat)
    })
  }

  it('plockar ut enheten i stället för att bara kasta den', () => {
    expect(tolkaTal('1 240,50 kr').enhet).toBe('kr')
    expect(tolkaTal('12 %').enhet).toBe('%')
    expect(tolkaTal('1240').enhet).toBe('')
  })

  it('markerar bokföringens negativa former', () => {
    expect(tolkaTal('(1240)').negativFormat).toBe(true)
    expect(tolkaTal('1240-').negativFormat).toBe(true)
    expect(tolkaTal('-1240').negativFormat).toBe(false)
  })

  it('hanterar hårt mellanslag som tusentalsavgränsare', () => {
    expect(tal('1 240,50')).toBe(1240.5)
    expect(tal('1 240,50')).toBe(1240.5)
  })
})

describe('punktens tvetydighet', () => {
  it('gissas inte — valet styr', () => {
    expect(tal('1.234')).toBe(1.234)
    expect(tal('1.234', { punktArTusental: true })).toBe(1234)
  })

  it('påverkar inte värden där punkten är entydig', () => {
    // Fyra siffror efter punkten kan inte vara tusental.
    expect(tal('1.2345', { punktArTusental: true })).toBe(1.2345)
    expect(tal('1.5', { punktArTusental: true })).toBe(1.5)
  })

  it('komma som tusental följer samma val', () => {
    expect(tal('1,234')).toBe(1234)
    expect(tal('1,234', { punktArTusental: true })).toBe(1.234)
  })
})

describe('skrivTal', () => {
  it('skriver utan tusentalsavgränsare', () => {
    expect(skrivTal(1240.5, 'komma', null)).toBe('1240,5')
    expect(skrivTal(1240.5, 'punkt', null)).toBe('1240.5')
  })

  it('kan låsa antalet decimaler', () => {
    expect(skrivTal(1240.5, 'komma', 2)).toBe('1240,50')
    expect(skrivTal(1240, 'komma', 2)).toBe('1240,00')
    expect(skrivTal(1240.567, 'komma', 1)).toBe('1240,6')
  })

  it('varje format har ett exempel som stämmer med sin egen utskrift', () => {
    for (const f of TALFORMAT) {
      expect(skrivTal(1240.5, f.varde, null)).toBe(f.exempel)
    }
  })
})

describe('talTransform', () => {
  const inst = { punktArTusental: false, format: 'komma' as const, decimaler: 2 }

  it('städar hela vägen', () => {
    const f = talTransform({ ...inst, onError: 'behall' })
    expect(f('1 240,50 kr')).toBe('1240,50')
    expect(f('(1 240,50)')).toBe('-1240,50')
    expect(f('12 %')).toBe('12,00')
  })

  it('lämnar tomma celler ifred', () => {
    expect(talTransform({ ...inst, onError: 'tom' })('')).toBe('')
  })

  it('följer felvalet', () => {
    expect(talTransform({ ...inst, onError: 'behall' })('Aktiv')).toBe('Aktiv')
    expect(talTransform({ ...inst, onError: 'tom' })('Aktiv')).toBe('')
    expect(talTransform({ ...inst, onError: 'markera' })('Aktiv')).toBe('OGILTIGT')
  })

  it('är stabil när den körs två gånger', () => {
    const f = talTransform({ ...inst, onError: 'behall' })
    for (const v of ['1 240,50 kr', '(1240)', '12 %', 'Aktiv', '']) {
      expect(f(f(v))).toBe(f(v))
    }
  })
})

describe('inventeraTal', () => {
  it('räknar tal, enheter och negativa former', () => {
    const inv = inventeraTal(['1 240,50 kr', '980,00 kr', '12 %', '(45)', 'Aktiv', ''])
    expect(inv.tal).toBe(4)
    expect(inv.ejTal).toBe(1)
    expect(inv.enheter[0]).toEqual({ enhet: 'kr', antal: 2 })
    expect(inv.negativaFormat).toBe(1)
  })

  it('rapporterar tvetydighet när inget värde avgör punkten', () => {
    const inv = inventeraTal(['1.234', '5.678'])
    expect(inv.tvetydig).toBe(true)
    expect(inv.bevis).toBeNull()
  })

  it('låter ett värde med både punkt och komma avgöra', () => {
    const inv = inventeraTal(['1.234', '9.876,50'])
    expect(inv.tvetydig).toBe(false)
    expect(inv.bevis).toBe('9.876,50')
    expect(inv.bevisSagerTusental).toBe(true)
  })

  it('låter en punkt med två decimaler avgöra åt andra hållet', () => {
    const inv = inventeraTal(['1.234', '9.50'])
    expect(inv.tvetydig).toBe(false)
    expect(inv.bevis).toBe('9.50')
    expect(inv.bevisSagerTusental).toBe(false)
  })

  it('hittar största antalet decimaler', () => {
    expect(inventeraTal(['1,5', '2,25', '3']).storstaAntalDecimaler).toBe(2)
  })

  it('räknar celler när vikter skickas in', () => {
    expect(inventeraTal(['1240', 'Aktiv'], undefined, [7, 2]).tal).toBe(7)
  })
})
