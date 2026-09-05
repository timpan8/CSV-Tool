import { beforeEach, describe, expect, it } from 'vitest'
import {
  TAK,
  anvandeMall,
  glomMallar,
  mallar,
  mallarAvSort,
  tolkaMallar,
  type Sparadmall,
} from '../../src/state/mallar.js'

const mall = (text: string, over: Partial<Sparadmall> = {}): Sparadmall => ({
  sort: 'mall',
  text,
  ...over,
})

const texter = () => mallar.value.map((m) => m.text)

describe('listan över senast använda', () => {
  beforeEach(() => glomMallar())

  it('lägger den senaste först', () => {
    anvandeMall(mall('a'))
    anvandeMall(mall('b'))
    anvandeMall(mall('c'))
    expect(texter()).toEqual(['c', 'b', 'a'])
  })

  it('flyttar upp en mall som körs igen i stället för att dubblera den', () => {
    anvandeMall(mall('a'))
    anvandeMall(mall('b'))
    anvandeMall(mall('a'))
    expect(texter()).toEqual(['a', 'b'])
  })

  it('räknar samma text med olika undantag som två mallar', () => {
    // De ger olika kolumner, och att låta den ena tränga undan den andra hade
    // tappat just den man var på väg att återanvända.
    anvandeMall(mall("('{Namn}'),"))
    anvandeMall(mall("('{Namn}'),", { sista: "('{Namn}')" }))
    expect(mallar.value).toHaveLength(2)
  })

  it('skiljer på mall och mönster fast texten är densamma', () => {
    anvandeMall(mall('{A} {B}'))
    anvandeMall(mall('{A} {B}', { sort: 'monster' }))
    expect(mallar.value).toHaveLength(2)
    expect(mallarAvSort('mall')).toHaveLength(1)
    expect(mallarAvSort('monster')).toHaveLength(1)
  })

  it('minns bara de senaste åtta', () => {
    for (let i = 0; i < TAK + 4; i++) anvandeMall(mall(`m${i}`))
    expect(mallar.value).toHaveLength(TAK)
    expect(texter()[0]).toBe(`m${TAK + 3}`)
    expect(texter()).not.toContain('m0')
  })

  it('sparar inte en tom mall', () => {
    anvandeMall(mall(''))
    anvandeMall(mall('   '))
    expect(mallar.value).toEqual([])
  })

  it('ger sorterna var för sig, senast först', () => {
    anvandeMall(mall('m1'))
    anvandeMall(mall('p1', { sort: 'monster' }))
    anvandeMall(mall('m2'))
    expect(mallarAvSort('mall').map((m) => m.text)).toEqual(['m2', 'm1'])
    expect(mallarAvSort('monster').map((m) => m.text)).toEqual(['p1'])
  })
})

describe('tolkaMallar', () => {
  it('läser en lista som den skrevs', () => {
    const lista: Sparadmall[] = [
      { sort: 'mall', text: "('{Namn}'),", sista: "('{Namn}')", stadaLuckor: true },
      { sort: 'monster', text: '{Namn} <{E-post}>' },
    ]
    expect(tolkaMallar(JSON.stringify(lista))).toEqual(lista)
  })

  it('ger null för något som inte är JSON eller inte är en lista', () => {
    expect(tolkaMallar('inte json')).toBeNull()
    expect(tolkaMallar('{"sort":"mall"}')).toBeNull()
    expect(tolkaMallar('null')).toBeNull()
  })

  it('hoppar över poster som inte går att lita på', () => {
    // En mall som tyst blivit tom ser ut som ett fel i verktyget, så en trasig
    // post släpps hellre än fylls i.
    const rått = JSON.stringify([
      { sort: 'mall', text: 'bra' },
      { sort: 'nonsens', text: 'fel sort' },
      { sort: 'mall' },
      { sort: 'mall', text: 42 },
      { sort: 'mall', text: '' },
      null,
      'inte ens ett objekt',
      { sort: 'monster', text: 'också bra' },
    ])
    expect(tolkaMallar(rått)).toEqual([
      { sort: 'mall', text: 'bra' },
      { sort: 'monster', text: 'också bra' },
    ])
  })

  it('släpper fält med fel typ i stället för att ta med dem', () => {
    const rått = JSON.stringify([{ sort: 'mall', text: 'a', sista: 5, stadaLuckor: 'ja' }])
    expect(tolkaMallar(rått)).toEqual([{ sort: 'mall', text: 'a' }])
  })

  it('kapar en lagrad lista som vuxit förbi taket', () => {
    const lang = Array.from({ length: TAK + 5 }, (_, i) => ({ sort: 'mall', text: `m${i}` }))
    expect(tolkaMallar(JSON.stringify(lang))).toHaveLength(TAK)
  })
})
