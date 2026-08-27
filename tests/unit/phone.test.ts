import { describe, expect, it } from 'vitest'
import {
  TELEFONFORMAT,
  inventeraTelefon,
  skrivTelefon,
  telefonTransform,
  tolkaTelefon,
} from '../../src/core/ops/phone.js'

const e164 = telefonTransform({ landsnummer: 46, format: 'e164', onError: 'markera' })
const nationell = telefonTransform({ landsnummer: 46, format: 'nationell', onError: 'markera' })

describe('svenska nummer till E.164', () => {
  const fall: [string, string][] = [
    ['0701234567', '+46701234567'],
    ['070-123 45 67', '+46701234567'],
    ['070 123 45 67', '+46701234567'],
    ['(070) 123 45 67', '+46701234567'],
    ['070.123.45.67', '+46701234567'],
    // Riktnumrets 8 hör till numret; det är bara utslagsnollan som faller bort.
    ['08-123 456 78', '+46812345678'],
    ['+46701234567', '+46701234567'],
    ['+46 70 123 45 67', '+46701234567'],
    ['0046701234567', '+46701234567'],
    ['00 46 70 123 45 67', '+46701234567'],
    ['  0701234567  ', '+46701234567'],
  ]
  for (const [indata, forvantat] of fall) {
    it(`${JSON.stringify(indata)} → ${forvantat}`, () => {
      expect(e164(indata)).toBe(forvantat)
    })
  }
})

describe('nationell form', () => {
  it('skriver tillbaka nollan', () => {
    expect(nationell('+46701234567')).toBe('0701234567')
    expect(nationell('070-123 45 67')).toBe('0701234567')
  })

  it('låter utländska nummer behålla sin landskod', () => {
    // 0047… går inte att ringa från Sverige.
    expect(nationell('+4712345678')).toBe('+4712345678')
  })

  it('varje format har ett exempel som stämmer med sin egen utskrift', () => {
    const t = tolkaTelefon('070-123 45 67')
    for (const f of TELEFONFORMAT) {
      expect(skrivTelefon(t, f.varde, { landsnummer: 46 })).toBe(f.exempel)
    }
  })
})

describe('värden som inte är telefonnummer', () => {
  for (const v of [
    'Ring Anna 070-1234567',
    'anna@exempel.se',
    '1234',
    '701234567',
    'abc',
    '-',
    '12345678901234567890',
  ]) {
    it(`${JSON.stringify(v)} underkänns`, () => {
      expect(tolkaTelefon(v).siffror).toBeNull()
      expect(e164(v)).toBe('OGILTIGT')
    })
  }

  it('lämnar tomma celler ifred', () => {
    expect(e164('')).toBe('')
    expect(e164('   ')).toBe('   ')
  })
})

describe('flaggor', () => {
  it('säger om numret redan hade landskod', () => {
    expect(tolkaTelefon('+46701234567').hadeLandskod).toBe(true)
    expect(tolkaTelefon('0046701234567').hadeLandskod).toBe(true)
    expect(tolkaTelefon('070-1234567').hadeLandskod).toBe(false)
  })

  it('känner igen utländska nummer', () => {
    expect(tolkaTelefon('+4712345678').utlandskt).toBe(true)
    expect(tolkaTelefon('+46701234567').utlandskt).toBe(false)
    expect(tolkaTelefon('070-1234567').utlandskt).toBe(false)
  })

  it('följer valt landsnummer', () => {
    const norge = { landsnummer: 47 }
    expect(tolkaTelefon('012345678', norge).siffror).toBe('4712345678')
    expect(tolkaTelefon('+46701234567', norge).utlandskt).toBe(true)
  })
})

describe('felhantering', () => {
  const bas = { landsnummer: 46, format: 'e164' as const }
  it('följer valet', () => {
    expect(telefonTransform({ ...bas, onError: 'behall' })('abc')).toBe('abc')
    expect(telefonTransform({ ...bas, onError: 'tom' })('abc')).toBe('')
    expect(telefonTransform({ ...bas, onError: 'markera' })('abc')).toBe('OGILTIGT')
  })

  it('är stabil när den körs två gånger', () => {
    const f = telefonTransform({ ...bas, onError: 'behall' })
    for (const v of ['070-123 45 67', '+46701234567', 'abc', '']) {
      expect(f(f(v))).toBe(f(v))
    }
  })
})

describe('inventeraTelefon', () => {
  const inst = { landsnummer: 46, format: 'e164' as const, onError: 'behall' as const }

  it('räknar utfallen', () => {
    const inv = inventeraTelefon(
      ['070-123 45 67', '+46701234568', '+4712345678', 'ring mig', ''],
      inst,
    )
    expect(inv.nummer).toBe(3)
    expect(inv.ejNummer).toBe(1)
    expect(inv.medLandskod).toBe(2)
    expect(inv.utlandska).toBe(1)
    expect(inv.exempel).toEqual({ fore: '070-123 45 67', efter: '+46701234567' })
    expect(inv.exempelOgiltigt).toBe('ring mig')
  })

  it('räknar celler när vikter skickas in', () => {
    const inv = inventeraTelefon(['070-1234567', 'abc'], inst, [8, 5])
    expect(inv.nummer).toBe(8)
    expect(inv.ejNummer).toBe(5)
  })
})
