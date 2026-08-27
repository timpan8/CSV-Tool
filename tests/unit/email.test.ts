import { describe, expect, it } from 'vitest'
import {
  EPOSTFALT,
  delaEpost,
  epostTransform,
  inventeraEpost,
  lasFalt,
  type Epostfalt,
} from '../../src/core/ops/email.js'

const del = (adress: string, efternamnForst = false) =>
  delaEpost(adress, { efternamnForst })

describe('namndelning', () => {
  const fall: [string, string, string][] = [
    ['anna.karlsson@nordbygg.se', 'Anna', 'Karlsson'],
    ['erik.oberg@nordbygg.se', 'Erik', 'Oberg'],
    ['anna_karlsson@nordbygg.se', 'Anna', 'Karlsson'],
    ['anna-karlsson@nordbygg.se', 'Anna', 'Karlsson'],
    ['ANNA.KARLSSON@NORDBYGG.SE', 'Anna', 'Karlsson'],
    ['  anna.karlsson@nordbygg.se  ', 'Anna', 'Karlsson'],
    ['anna.karlsson2@nordbygg.se', 'Anna', 'Karlsson'],
    ['anna.karlsson.2@nordbygg.se', 'Anna', 'Karlsson'],
    ['anna.maria.karlsson@nordbygg.se', 'Anna Maria', 'Karlsson'],
    ['anna-lena.svensson@nordbygg.se', 'Anna-Lena', 'Svensson'],
    ["o'brien.sean@acme.ie", "O'Brien", 'Sean'],
  ]
  for (const [adress, fornamn, efternamn] of fall) {
    it(`${adress} → ${fornamn} / ${efternamn}`, () => {
      const d = del(adress)
      expect(d?.fornamn).toBe(fornamn)
      expect(d?.efternamn).toBe(efternamn)
    })
  }

  it('delar bara på bindestreck när inget annat avgränsar', () => {
    // c-j.nilsson är Carl-Johans initialer, inte tre namndelar.
    const d = del('c-j.nilsson@acme.se')
    expect(d?.fornamn).toBe('C-J')
    expect(d?.efternamn).toBe('Nilsson')
  })

  it('kan läsa efternamnet först när kolumnen är skriven så', () => {
    const d = del('karlsson.anna@nordbygg.se', true)
    expect(d?.fornamn).toBe('Anna')
    expect(d?.efternamn).toBe('Karlsson')
  })

  it('ger inget namn när adressen saknar avgränsare', () => {
    const d = del('annakarlsson@nordbygg.se')
    expect(d?.fornamn).toBe('')
    expect(d?.efternamn).toBe('')
  })

  it('gör inte ett rollkonto till en person', () => {
    for (const adress of ['info@angstrom.se', 'no-reply@acme.se', 'kundtjanst@acme.se']) {
      const d = del(adress)
      expect(d?.rollkonto).toBe(true)
      expect(d?.fornamn).toBe('')
      expect(d?.efternamn).toBe('')
    }
  })

  it('å ä ö kommer inte tillbaka, och det ska synas i resultatet', () => {
    // Adressen bär inte informationen. Att gissa vore att skriva fel namn.
    expect(del('asa.ohman@vydata.se')?.fornamn).toBe('Asa')
    expect(del('bjorn.akesson@vydata.se')?.fornamn).toBe('Bjorn')
  })
})

describe('domändelning', () => {
  const fall: [string, string, string, string][] = [
    ['a.b@nordbygg.se', 'nordbygg.se', 'nordbygg', 'se'],
    ['a.b@mail.nordbygg.se', 'mail.nordbygg.se', 'nordbygg', 'se'],
    ['a.b@firma.co.uk', 'firma.co.uk', 'firma', 'co.uk'],
    ['a.b@firma.com.au', 'firma.com.au', 'firma', 'com.au'],
    ['a.b@example.com', 'example.com', 'example', 'com'],
  ]
  for (const [adress, doman, huvud, topp] of fall) {
    it(`${adress} → ${doman} / ${huvud} / ${topp}`, () => {
      const d = del(adress)
      expect(d?.doman).toBe(doman)
      expect(d?.huvuddoman).toBe(huvud)
      expect(d?.toppdoman).toBe(topp)
    })
  }

  it('känner igen privatadresser', () => {
    expect(del('anna.karlsson@gmail.com')?.privat).toBe(true)
    expect(del('anna.karlsson@telia.com')?.privat).toBe(true)
    expect(del('anna.karlsson@nordbygg.se')?.privat).toBe(false)
  })
})

describe('värden som inte är adresser', () => {
  for (const v of ['', '   ', 'Anna Karlsson', 'anna.karlsson', '@nordbygg.se', 'a@b', 'a b@c.se']) {
    it(`${JSON.stringify(v)} ger null`, () => {
      expect(del(v)).toBeNull()
    })
  }
})

describe('epostTransform', () => {
  const adress = 'anna.karlsson@nordbygg.se'
  const forvantat: Record<Epostfalt, string> = {
    fornamn: 'Anna',
    efternamn: 'Karlsson',
    'helt-namn': 'Anna Karlsson',
    lokal: 'anna.karlsson',
    doman: 'nordbygg.se',
    huvuddoman: 'nordbygg',
    toppdoman: 'se',
  }
  for (const falt of Object.keys(forvantat) as Epostfalt[]) {
    it(`${falt} → ${forvantat[falt]}`, () => {
      expect(epostTransform(falt)(adress)).toBe(forvantat[falt])
    })
  }

  it('varje fält i listan har ett exempel som stämmer med sin egen utläsning', () => {
    const d = del(adress)!
    for (const f of EPOSTFALT) {
      expect(lasFalt(d, f.varde)).toBe(f.exempel)
    }
  })

  it('ger tomt i stället för skräp när adressen inte går att tolka', () => {
    expect(epostTransform('fornamn')('Anna Karlsson')).toBe('')
    expect(epostTransform('doman')('')).toBe('')
    expect(epostTransform('helt-namn')('info@acme.se')).toBe('')
  })
})

describe('inventeraEpost', () => {
  const varden = [
    'anna.karlsson@nordbygg.se',
    'erik.oberg@nordbygg.se',
    'info@angstrom.se',
    'privat@gmail.com',
    'annakarlsson@acme.se',
    'inte en adress',
    '',
  ]

  it('räknar utfallen', () => {
    const inv = inventeraEpost(varden)
    expect(inv.adresser).toBe(5)
    expect(inv.ejAdress).toBe(1)
    expect(inv.medNamn).toBe(2)
    expect(inv.rollkonton).toBe(1)
    expect(inv.privata).toBe(1)
  })

  it('listar domänerna med störst först', () => {
    const inv = inventeraEpost(varden)
    expect(inv.domaner[0]).toEqual({ doman: 'nordbygg.se', antal: 2 })
    expect(inv.domaner).toHaveLength(4)
  })

  it('visar exempel ur den egna filen för båda utfallen', () => {
    const inv = inventeraEpost(varden)
    expect(inv.exempelNamn).toEqual({
      adress: 'anna.karlsson@nordbygg.se',
      fornamn: 'Anna',
      efternamn: 'Karlsson',
    })
    expect(inv.exempelUtanNamn).toBe('info@angstrom.se')
  })

  it('räknar celler när vikter skickas in', () => {
    const inv = inventeraEpost(['anna.karlsson@nordbygg.se', 'info@acme.se'], undefined, [10, 3])
    expect(inv.adresser).toBe(13)
    expect(inv.medNamn).toBe(10)
    expect(inv.rollkonton).toBe(3)
  })
})
