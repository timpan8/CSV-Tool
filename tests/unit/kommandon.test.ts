import { describe, expect, it } from 'vitest'
import { byggKommandon, sokKommandon, type Kommandohandlare } from '../../src/ui/kommandon.js'

/** Alla handtag som räknare, så att det går att se vad som faktiskt kördes. */
function handlare(): { h: Kommandohandlare; korda: string[] } {
  const korda: string[] = []
  const namn = [
    'oppnaFil', 'exportera', 'profiler', 'sok', 'sortera', 'filter', 'dubbletter',
    'slaIhop', 'kombinera', 'sammanfatta', 'visaAllaRader', 'dopOm', 'duplicera', 'vaxlaDold',
    'taBortKolumn', 'infogaKolumn', 'filtreraKolumn', 'visaOgiltiga', 'infogaRadOvan',
    'infogaRadUnder', 'dupliceraRader', 'taBortRader', 'tommaRader', 'tommaKolumner',
    'angra', 'goraOm', 'vaxlaTema',
  ] as const
  const h = Object.fromEntries([
    ...namn.map((n) => [n, () => korda.push(n)]),
    ['stada', (id: string) => korda.push(`stada:${id}`)],
    ['verktyg', (n: string) => korda.push(`verktyg:${n}`)],
  ]) as unknown as Kommandohandlare
  return { h, korda }
}

const LAGE = {
  harFil: true,
  kolumn: 'Ort',
  kolumnDold: false,
  harMarkering: true,
  kanAngra: true,
  kanGoraOm: false,
  begransadVy: false,
}

describe('byggKommandon', () => {
  it('utan öppen fil finns bara det som går att göra ändå', () => {
    const { h } = handlare()
    const lista = byggKommandon({ ...LAGE, harFil: false, kolumn: null }, h)
    // Att glömma det sparade hör hit: det går att göra även när ingen fil är
    // öppen, och är då kanske just det man vill.
    expect(lista.map((k) => k.id)).toEqual(['oppna', 'glomsparat', 'tema'])
  })

  it('kolumnkommandon dyker upp först när det finns en kolumn', () => {
    const { h } = handlare()
    const utan = byggKommandon({ ...LAGE, kolumn: null }, h)
    expect(utan.some((k) => k.grupp === 'Kolumn')).toBe(false)
    expect(byggKommandon(LAGE, h).some((k) => k.grupp === 'Kolumn')).toBe(true)
  })

  it('kolumnens namn står i etiketten, så att man ser vad man träffar', () => {
    const { h } = handlare()
    const lista = byggKommandon(LAGE, h)
    expect(lista.find((k) => k.id === 'tabortkol')!.etikett).toBe('Ta bort Ort')
    expect(lista.find((k) => k.id === 'dolj')!.etikett).toBe('Dölj Ort')
  })

  it('dölj blir visa när kolumnen redan är dold', () => {
    const { h } = handlare()
    const lista = byggKommandon({ ...LAGE, kolumnDold: true }, h)
    expect(lista.find((k) => k.id === 'dolj')!.etikett).toBe('Visa Ort')
  })

  it('gör om finns bara när det finns något att göra om', () => {
    const { h } = handlare()
    expect(byggKommandon(LAGE, h).some((k) => k.id === 'goraom')).toBe(false)
    expect(byggKommandon({ ...LAGE, kanGoraOm: true }, h).some((k) => k.id === 'goraom')).toBe(true)
  })

  it('kommandot kör sitt eget handtag', () => {
    const { h, korda } = handlare()
    const lista = byggKommandon(LAGE, h)
    lista.find((k) => k.id === 'stada:trim')!.kor()
    lista.find((k) => k.id === 'verktyg:datum')!.kor()
    expect(korda).toEqual(['stada:trim', 'verktyg:datum'])
  })

  it('varje kommando har ett eget id', () => {
    const { h } = handlare()
    const ider = byggKommandon(LAGE, h).map((k) => k.id)
    expect(new Set(ider).size).toBe(ider.length)
  })
})

describe('sokKommandon', () => {
  const { h } = handlare()
  const alla = byggKommandon(LAGE, h)
  const ider = (fraga: string) => sokKommandon(alla, fraga).map((k) => k.id)

  it('tom fråga ger allt', () => {
    expect(sokKommandon(alla, '   ')).toHaveLength(alla.length)
  })

  it('alla ord måste finnas, men inte i ordningen', () => {
    expect(ider('ta bort kol')).toContain('tabortkol')
    expect(ider('kol bort ta')).toContain('tabortkol')
  })

  it('struntar i skiftläge och prickar', () => {
    expect(ider('DOLJ ORT')).toContain('dolj')
    expect(ider('angra')).toContain('angra')
  })

  it('hittar på ord som inte står i etiketten', () => {
    // Den som söker "undo" eller "join" ska inte behöva kunna svenskan.
    expect(ider('undo')).toContain('angra')
    expect(ider('join')).toContain('slaihop')
    expect(ider('makro')).toContain('profiler')
  })

  it('ger inga träffar hellre än fel träffar', () => {
    // Bokstavlig sökning, precis som sök & ersätt. En palett som gissar kör
    // fel kommando, och det går inte att granska först.
    expect(ider('teleportera')).toEqual([])
  })
})
