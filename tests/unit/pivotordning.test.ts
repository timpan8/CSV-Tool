import { describe, expect, it } from 'vitest'
import { dold, ordnaRader, type Sortering } from '../../src/ui/pivotordning.js'
import type { Pivotresultat, Pivotrad } from '../../src/core/ops/pivot.js'

/**
 * Ordningen testas mot ett handbyggt resultat i stället för mot en riktig
 * pivot: det som ska granskas är trädlogiken, och den blir tydligast när
 * stigarna och talen står uppradade i klartext.
 */
function rad(stig: string, etikett: string): Pivotrad {
  return {
    etiketter: [etikett],
    niva: stig.split('/').length - 1,
    stig,
    antal: 1,
    ovriga: false,
    tom: false,
    // Banden spelar ingen roll för ordningen; de prövas i pivot.test.ts.
    start: 0,
    slut: 1,
  }
}

/** Ett resultat med en kolumn plus Totalt, ett mätvärde, och givna tal. */
function resultatMed(rader: Pivotrad[], tal: (number | null)[]): Pivotresultat {
  const bredd = 2
  const celler = new Float64Array((rader.length + 1) * bredd)
  const text: (string | null)[] = []
  celler.fill(Number.NaN)
  rader.forEach((_, i) => {
    const v = tal[i]
    celler[i * bredd] = v === null || v === undefined ? Number.NaN : v
  })
  for (let i = 0; i < celler.length; i++) {
    text.push(Number.isNaN(celler[i]!) ? null : String(celler[i]))
  }
  return {
    kolumner: [
      {
        stig: [0],
        nivaer: [{ etikett: 'A', rader: 1, ovriga: false, tom: false, varden: 0 }],
        rader: 1,
        ovriga: false,
      },
    ],
    kolumnnivaer: 1,
    rader,
    bredd,
    hojd: rader.length + 1,
    text,
    tal: celler,
    kallrader: Uint32Array.from(rader.map((_, i) => i)),
    kolumnband: null,
    antalKallrader: rader.length,
    utanNyckel: 0,
    doldaRadvarden: 0,
    doldaKolumnvarden: 0,
    doldaKolumnlov: 0,
    kapat: false,
    lasbarhet: [],
  }
}

const ned: Sortering = { kol: 0, m: 0, ned: true }
const upp: Sortering = { kol: 0, m: 0, ned: false }

describe('ordnaRader', () => {
  it('utan sortering står raderna i den ordning kärnan gav dem', () => {
    const res = resultatMed(
      [rad('0', 'Kiruna'), rad('1', 'Lund'), rad('2', 'Malmö')],
      [1, 5, 3],
    )
    expect(ordnaRader(res, null, 1)).toEqual([0, 1, 2])
  })

  it('sorterar på kolumnens tal åt båda hållen', () => {
    const res = resultatMed(
      [rad('0', 'Kiruna'), rad('1', 'Lund'), rad('2', 'Malmö')],
      [1, 5, 3],
    )
    expect(ordnaRader(res, ned, 1)).toEqual([1, 2, 0])
    expect(ordnaRader(res, upp, 1)).toEqual([0, 2, 1])
  })

  it('sorterar syskon inom sin förälder och håller ihop trädet', () => {
    /*
     * Aktiv rymmer Lund (1) och Malmö (9); Avslutad rymmer Boden (7).
     * Sorterat fallande ska Malmö gå före Lund — men aldrig hoppa upp
     * ovanför sin egen förälder, och aldrig hamna under Avslutad.
     */
    const rader = [
      rad('0', 'Aktiv'),
      rad('0/0', 'Lund'),
      rad('0/1', 'Malmö'),
      rad('1', 'Avslutad'),
      rad('1/0', 'Boden'),
    ]
    const res = resultatMed(rader, [10, 1, 9, 7, 7])
    expect(ordnaRader(res, ned, 1)).toEqual([0, 2, 1, 3, 4])
    // Föräldrarna sinsemellan sorteras också: Aktiv 10 före Avslutad 7.
    expect(ordnaRader(res, upp, 1).slice(0, 1)).toEqual([3])
  })

  it('lägger tomma celler sist åt båda hållen', () => {
    // En tom cell är okänd, och det okända hör inte hemma i toppen bara för
    // att man vände på pilen.
    const res = resultatMed(
      [rad('0', 'Kiruna'), rad('1', 'Lund'), rad('2', 'Malmö')],
      [3, null, 8],
    )
    expect(ordnaRader(res, ned, 1)).toEqual([2, 0, 1])
    expect(ordnaRader(res, upp, 1)).toEqual([0, 2, 1])
  })

  it('faller tillbaka på texten när två celler båda är tomma', () => {
    const res = resultatMed([rad('0', 'Ö'), rad('1', 'A')], [null, null])
    // Svensk bokstavsordning: A före Ö. Texten kommer ur cellen, som är tom
    // för båda, så ordningen blir den kärnan gav — men den ska vara stabil.
    expect(ordnaRader(res, ned, 1)).toEqual([0, 1])
  })

  it('pekar på rätt cell när mätvärdena är flera', () => {
    /*
     * Två mätvärden i samma kolumn: antal och summa. De ordnar raderna åt
     * olika håll, så ett `steg` eller `m` som räknas fel syns direkt.
     * Cellindex är (rad * bredd + kol) * steg + m, med bredd 2 och steg 2.
     */
    const rader = [rad('0', 'A'), rad('1', 'B')]
    const celler = new Float64Array(3 * 2 * 2).fill(Number.NaN)
    celler[0] = 1 // rad A, kolumn 0, mätvärde 0
    celler[1] = 90 // rad A, kolumn 0, mätvärde 1
    celler[4] = 7 // rad B, kolumn 0, mätvärde 0
    celler[5] = 20 // rad B, kolumn 0, mätvärde 1
    const res: Pivotresultat = {
      ...resultatMed(rader, []),
      tal: celler,
      text: [...celler].map((v) => (Number.isNaN(v) ? null : String(v))),
    }

    expect(ordnaRader(res, { kol: 0, m: 0, ned: true }, 2)).toEqual([1, 0])
    expect(ordnaRader(res, { kol: 0, m: 1, ned: true }, 2)).toEqual([0, 1])
  })
})

describe('dold', () => {
  const hopfallda = new Set(['0', '2/1'])

  it('döljer barn till en hopfälld nod', () => {
    expect(dold('0/0', hopfallda)).toBe(true)
    expect(dold('0/3/1', hopfallda)).toBe(true)
    expect(dold('2/1/0', hopfallda)).toBe(true)
  })

  it('döljer aldrig noden själv', () => {
    // Annars fanns ingen kvar att klicka på för att fälla ut den igen.
    expect(dold('0', hopfallda)).toBe(false)
    expect(dold('2/1', hopfallda)).toBe(false)
  })

  it('rör inte grenar som inte är hopfällda', () => {
    expect(dold('1', hopfallda)).toBe(false)
    expect(dold('2/0/5', hopfallda)).toBe(false)
  })
})
