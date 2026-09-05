import { describe, expect, it } from 'vitest'
import { createColumn, intern } from '../../src/core/frame/column.js'
import { createFrame } from '../../src/core/frame/frame.js'
import type { Frame } from '../../src/core/types.js'
import {
  STANDARDDELNING,
  byggDelare,
  delaVarde,
  inventeraDelning,
  inventeraMonster,
  monsterfel,
  monsterkolumner,
  delaMall,
  korMall,
  korMallar,
  tolkaMall,
  valjMall,
  type Delning,
  type Mallar,
} from '../../src/core/ops/columns.js'

function frameOf(headers: string[], rows: string[][]): Frame {
  const columns = headers.map((name) => createColumn(name, rows.length))
  rows.forEach((row, r) => {
    columns.forEach((col, c) => {
      col.codes[r] = intern(col, row[c] ?? '')
    })
  })
  return createFrame('test', columns, rows.length)
}

const dela = (value: string, inst: Partial<Delning> = {}) =>
  delaVarde(value, { ...STANDARDDELNING, ...inst })

describe('dela vid första', () => {
  it('delar namn i förnamn och resten', () => {
    expect(dela('Anna Karlsson')).toEqual(['Anna', 'Karlsson'])
    expect(dela('Anna Maria Karlsson')).toEqual(['Anna', 'Maria Karlsson'])
  })

  it('ger tom andra kolumn när avgränsaren saknas', () => {
    expect(dela('Anna')).toEqual(['Anna', ''])
  })
})

describe('dela vid sista', () => {
  it('lägger mellannamnen hos förnamnet', () => {
    expect(dela('Anna Maria Karlsson', { satt: 'sista' })).toEqual(['Anna Maria', 'Karlsson'])
    expect(dela('Anna Karlsson', { satt: 'sista' })).toEqual(['Anna', 'Karlsson'])
  })
})

describe('dela vid varje', () => {
  it('fördelar på så många kolumner som begärts', () => {
    expect(dela('a;b;c', { satt: 'avgransare', avgransare: ';', antal: 3 })).toEqual(['a', 'b', 'c'])
  })

  it('lägger överskottet i sista kolumnen i stället för att kasta det', () => {
    // Det som inte får plats får inte försvinna i tysthet.
    expect(dela('a;b;c;d', { satt: 'avgransare', avgransare: ';', antal: 2 })).toEqual([
      'a',
      'b;c;d',
    ])
  })

  it('fyller ut med tomma när värdet har färre delar', () => {
    expect(dela('a', { satt: 'avgransare', avgransare: ';', antal: 3 })).toEqual(['a', '', ''])
  })
})

describe('dela på position', () => {
  it('klipper på ett fast tecken', () => {
    expect(dela('12345', { satt: 'position', position: 3 })).toEqual(['123', '45'])
    expect(dela('12', { satt: 'position', position: 3 })).toEqual(['12', ''])
  })

  it('sätter inte ihop delarna igen med avgränsaren', () => {
    expect(dela('abcdef', { satt: 'position', position: 2, antal: 2 })).toEqual(['ab', 'cdef'])
  })
})

describe('trimning', () => {
  it('trimmar varje del som standard', () => {
    expect(dela('Anna ; Karlsson', { satt: 'avgransare', avgransare: ';' })).toEqual([
      'Anna',
      'Karlsson',
    ])
  })

  it('kan lämnas av', () => {
    expect(
      dela('Anna ; Karlsson', { satt: 'avgransare', avgransare: ';', trimma: false }),
    ).toEqual(['Anna ', ' Karlsson'])
  })
})

describe('tomma värden', () => {
  it('ger tomma delar och inte skräp', () => {
    expect(dela('')).toEqual(['', ''])
    expect(dela('   ')).toEqual(['', ''])
  })
})

describe('inventeraDelning', () => {
  it('räknar flest delar och värden utan avgränsare', () => {
    const inv = inventeraDelning(
      ['Anna Karlsson', 'Anna Maria Karlsson', 'Cher', ''],
      { ...STANDARDDELNING, satt: 'avgransare' },
    )
    expect(inv.flest).toBe(3)
    expect(inv.utanAvgransare).toBe(1)
    expect(inv.exempel?.fore).toBe('Anna Karlsson')
  })

  it('räknar celler när vikter skickas in', () => {
    const inv = inventeraDelning(['Cher', 'Anna Karlsson'], STANDARDDELNING, [6, 2])
    expect(inv.utanAvgransare).toBe(6)
  })
})

describe('tolkaMall', () => {
  const frame = frameOf(['Förnamn', 'Efternamn'], [['Anna', 'Karlsson']])

  it('delar upp text och platshållare', () => {
    const t = tolkaMall('{Förnamn} {Efternamn}', frame)
    expect(t.delar).toEqual([
      { typ: 'kolumn', namn: 'Förnamn' },
      { typ: 'text', varde: ' ' },
      { typ: 'kolumn', namn: 'Efternamn' },
    ])
    expect(t.anvanda).toEqual(['Förnamn', 'Efternamn'])
    expect(t.okanda).toEqual([])
  })

  it('rapporterar namn som inte finns i filen', () => {
    const t = tolkaMall('{Fornamn} {Efternamn}', frame)
    expect(t.okanda).toEqual(['Fornamn'])
    expect(t.anvanda).toEqual(['Efternamn'])
  })

  it('klarar text före och efter', () => {
    const t = tolkaMall('Hej {Förnamn}!', frame)
    expect(t.delar).toEqual([
      { typ: 'text', varde: 'Hej ' },
      { typ: 'kolumn', namn: 'Förnamn' },
      { typ: 'text', varde: '!' },
    ])
  })

  it('klarar en mall helt utan platshållare', () => {
    expect(tolkaMall('bara text', frame).delar).toEqual([{ typ: 'text', varde: 'bara text' }])
  })

  it('nollställer sig mellan anrop', () => {
    // Ett globalt regex som återanvänds hoppar över varannan mall.
    expect(tolkaMall('{Förnamn}', frame).anvanda).toEqual(['Förnamn'])
    expect(tolkaMall('{Förnamn}', frame).anvanda).toEqual(['Förnamn'])
  })
})

describe('korMall', () => {
  const frame = frameOf(
    ['Förnamn', 'Efternamn', 'Ort'],
    [
      ['Anna', 'Karlsson', 'Lund'],
      ['Cher', '', 'Malmö'],
    ],
  )

  it('sätter ihop värdena', () => {
    const { delar } = tolkaMall('{Förnamn} {Efternamn}, {Ort}', frame)
    expect(korMall(frame, 0, delar)).toBe('Anna Karlsson, Lund')
  })

  it('städar bort luckan efter ett tomt värde', () => {
    // "Cher , Malmö" med dubbelt mellanslag förstör varje senare matchning.
    const { delar } = tolkaMall('{Förnamn} {Efternamn}', frame)
    expect(korMall(frame, 1, delar)).toBe('Cher')
  })

  it('kan lämna luckorna kvar när man vill det', () => {
    const { delar } = tolkaMall('{Förnamn} {Efternamn}', frame)
    expect(korMall(frame, 1, delar, { stadaLuckor: false })).toBe('Cher ')
  })

  it('ger tomt för ett kolumnnamn som inte finns', () => {
    const { delar } = tolkaMall('{Saknas}', frame)
    expect(korMall(frame, 0, delar)).toBe('')
  })
})

describe('delaMall', () => {
  it('delar utan att bry sig om vilka kolumner som finns', () => {
    expect(delaMall('{Namn} <{E-post}>')).toEqual([
      { typ: 'kolumn', namn: 'Namn' },
      { typ: 'text', varde: ' <' },
      { typ: 'kolumn', namn: 'E-post' },
      { typ: 'text', varde: '>' },
    ])
  })

  it('ger en enda textdel för en mall utan platshållare', () => {
    expect(delaMall('bara text')).toEqual([{ typ: 'text', varde: 'bara text' }])
  })

  it('trimmar namnet i platshållaren', () => {
    expect(delaMall('{ Namn }')).toEqual([{ typ: 'kolumn', namn: 'Namn' }])
  })
})

describe('mallar med undantag för första och sista raden', () => {
  const frame = frameOf(
    ['Användarnamn'],
    [['anna'], ['bosse'], ['cesar'], ['david']],
  )

  const mallar = (mall: string, forsta: string | null, sista: string | null): Mallar => ({
    delar: tolkaMall(mall, frame).delar,
    forsta: forsta === null ? null : tolkaMall(forsta, frame).delar,
    sista: sista === null ? null : tolkaMall(sista, frame).delar,
  })

  const sql = () => mallar("('{Användarnamn}'),", null, "('{Användarnamn}')")

  it('utelämnar kommatecknet på sista raden', () => {
    const m = sql()
    expect(korMallar(frame, 0, m)).toBe("('anna'),")
    expect(korMallar(frame, 2, m)).toBe("('cesar'),")
    expect(korMallar(frame, 3, m)).toBe("('david')")
  })

  it('följer vyns ordning och inte filens', () => {
    // Vänd ordningen: nu är rad 0 den sista raden man ser, och det är den
    // raden som hamnar sist när markeringen kopieras.
    const vand = { ...frame, view: Uint32Array.from([3, 2, 1, 0]) }
    const m = sql()
    expect(korMallar(vand, 0, m)).toBe("('anna')")
    expect(korMallar(vand, 3, m)).toBe("('david'),")
  })

  it('lämnar en bortfiltrerad rad åt huvudmallen', () => {
    const filtrerad = { ...frame, view: Uint32Array.from([0, 1]) }
    const m = sql()
    expect(korMallar(filtrerad, 1, m)).toBe("('bosse')")
    // Rad 3 ligger inte i vyn alls och är därför varken första eller sista.
    expect(korMallar(filtrerad, 3, m)).toBe("('david'),")
  })

  it('låter sista vinna när vyn är en enda rad', () => {
    const en = { ...frame, view: Uint32Array.from([0]) }
    const m = mallar('mitten', 'först', 'sist')
    expect(korMallar(en, 0, m)).toBe('sist')
  })

  it('väljer huvudmallen när inga undantag är satta', () => {
    const m = mallar('{Användarnamn}', null, null)
    expect(valjMall(frame, 0, m)).toBe(m.delar)
    expect(valjMall(frame, 3, m)).toBe(m.delar)
  })

  it('rör inte raderna emellan när bara första raden har undantag', () => {
    const m = mallar('- {Användarnamn}', '{Användarnamn}:', null)
    expect(korMallar(frame, 0, m)).toBe('anna:')
    expect(korMallar(frame, 1, m)).toBe('- bosse')
    expect(korMallar(frame, 3, m)).toBe('- david')
  })
})

describe('plocka ut med mönster', () => {
  const monster = (m: string, trimma = true): Delning => ({
    ...STANDARDDELNING,
    satt: 'monster',
    monster: m,
    trimma,
  })
  const plocka = (varde: string, m: string, trimma = true) =>
    byggDelare(monster(m, trimma))(varde)

  it('plockar isär en Outlook-adress och städar bort klamrarna', () => {
    expect(plocka('last1 first1 <last1.first1@exempel.com>', '{Namn} <{E-post}>')).toEqual([
      'last1 first1',
      'last1.first1@exempel.com',
    ])
  })

  it('ger null när avgränsaren saknas i värdet', () => {
    expect(plocka('bara ett namn', '{Namn} <{E-post}>')).toBeNull()
  })

  it('ger null när den avslutande texten inte sitter sist', () => {
    // `>` mitt i värdet får inte kapa uttaget — då hade E-post blivit fel.
    expect(plocka('a <b@c> efterhängande', '{Namn} <{E-post}>')).toBeNull()
  })

  it('kräver att den inledande texten sitter först', () => {
    expect(plocka('Namn: Anna', 'Namn: {Namn}')).toEqual(['Anna'])
    expect(plocka('Anna', 'Namn: {Namn}')).toBeNull()
  })

  it('låter sista klammern ta resten när inget står efter den', () => {
    expect(plocka('a - b - c', '{Ett} - {Resten}')).toEqual(['a', 'b - c'])
  })

  it('söker avgränsaren från vänster, som Vid första', () => {
    expect(plocka('Anna Maria Karlsson <a@b.se>', '{Förnamn} {Resten} <{E-post}>')).toEqual([
      'Anna',
      'Maria Karlsson',
      'a@b.se',
    ])
  })

  it('kan lämna blanksteg kvar', () => {
    expect(plocka('a ; b', '{Ett};{Tva}', false)).toEqual(['a ', ' b'])
    expect(plocka('a ; b', '{Ett};{Tva}', true)).toEqual(['a', 'b'])
  })

  it('ger null för ett tomt värde mot ett mönster med text', () => {
    expect(plocka('', '{Namn} <{E-post}>')).toBeNull()
  })

  it('namnger kolumnerna efter klamrarna', () => {
    expect(monsterkolumner(delaMall('{Namn} <{E-post}>'))).toEqual(['Namn', 'E-post'])
  })

  it('säger ifrån om mönster som inte går att köra', () => {
    expect(monsterfel(delaMall('{A}{B}'))).toContain('Två klamrar i rad')
    expect(monsterfel(delaMall('bara text'))).toContain('ingen klammer')
    expect(monsterfel(delaMall('{} <{E-post}>'))).toContain('saknar namn')
    expect(monsterfel(delaMall('{Namn} <{E-post}>'))).toBeNull()
  })

  it('räknar träffar och missar före körningen', () => {
    const inv = inventeraMonster(
      ['', 'a <x@y>', 'b <z@w>', 'utan klamrar'],
      monster('{Namn} <{E-post}>'),
    )
    expect(inv.traffar).toBe(2)
    expect(inv.omatchade).toBe(1)
    expect(inv.exempel).toEqual({ fore: 'a <x@y>', efter: ['a', 'x@y'] })
  })

  it('väger träffarna med hur många rader varje värde har', () => {
    const inv = inventeraMonster(
      ['a <x@y>', 'trasig'],
      monster('{Namn} <{E-post}>'),
      [5, 3],
    )
    expect(inv.traffar).toBe(5)
    expect(inv.omatchade).toBe(3)
  })

  it('lämnar de gamla lägena orörda', () => {
    expect(byggDelare({ ...STANDARDDELNING, satt: 'forsta' })('Anna Karlsson')).toEqual([
      'Anna',
      'Karlsson',
    ])
  })
})
