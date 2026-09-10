import { describe, expect, it } from 'vitest'
import { minnesbehov, varnarForStorlek } from '../../src/ui/ImportDialog.js'

const MB = 1024 * 1024

/**
 * Vakten över varningen för en fil som troligen inte får plats.
 *
 * Siffrorna är mätta, inte gissade: en CSV på 34 MB med en halv miljon rader
 * lämnar en ram på ungefär 72 MB, och toppen under importen är högre än så
 * eftersom filens byte, den avkodade texten och parserns mellanrader finns
 * samtidigt. Samma data vägde 16 MB som `.xlsx` mot 34 MB som CSV, alltså
 * expanderar en arbetsbok ungefär dubbelt så mycket per byte.
 *
 * Testet låser inte fast siffrorna — de får justeras när någon mäter bättre —
 * utan de tre egenskaper som gör varningen begriplig: att den växer med
 * filen, att en arbetsbok bedöms hårdare, och att en vanlig fil är tyst.
 */
describe('minnesgissningen vid import', () => {
  it('växer i takt med filen', () => {
    expect(minnesbehov(100 * MB, false)).toBe(minnesbehov(50 * MB, false) * 2)
  })

  it('bedömer en arbetsbok hårdare än en CSV, eftersom den är komprimerad', () => {
    expect(minnesbehov(10 * MB, true)).toBeGreaterThan(minnesbehov(10 * MB, false))
  })

  it('räknar med mer än filens egen storlek', () => {
    // Ramen ensam väger drygt två gånger filen, och toppen under importen mer.
    expect(minnesbehov(10 * MB, false)).toBeGreaterThan(20 * MB)
  })

  it('säger ingenting om filerna folk faktiskt öppnar', () => {
    for (const mb of [0.05, 1, 12, 40]) {
      expect(varnarForStorlek(mb * MB, false)).toBe(false)
      expect(varnarForStorlek(mb * MB, true)).toBe(false)
    }
  })

  it('säger ifrån när filen är stor nog att kosta fliken', () => {
    expect(varnarForStorlek(400 * MB, false)).toBe(true)
    expect(varnarForStorlek(200 * MB, true)).toBe(true)
  })

  it('har en tröskel och inte en glidning — samma svar strax under och strax över', () => {
    const under = 100 * MB
    const over = 300 * MB
    expect(varnarForStorlek(under, false)).toBe(false)
    expect(varnarForStorlek(over, false)).toBe(true)
  })
})
