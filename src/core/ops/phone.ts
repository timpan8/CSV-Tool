import { normalizeAlways } from '../locale/sv.js'

/**
 * Telefonnummer.
 *
 * Verktyget gör en sak och gör den entydigt: skalar av allt som inte är
 * siffror och skriver om numret till ett format som går att jämföra. Det är
 * hela poängen — två nummer som `070-123 45 67` och `+46701234567` är samma
 * nummer, men matchar aldrig varandra i en sammanslagning förrän de skrivits
 * på samma sätt.
 *
 * **Ingen snygg gruppering.** `+46 70 123 45 67` kräver att man vet hur långt
 * riktnumret är, och det varierar mellan två och fyra siffror. En gissning
 * som blir fel ser fortfarande rimlig ut, och ett telefonnummer som ser
 * rimligt ut men är fel är värre än ett som ser tråkigt ut och är rätt.
 */

export interface Telefonval {
  /** Landsnummer för nummer utan landskod. 46 för Sverige. */
  landsnummer: number
}

export const STANDARDVAL: Telefonval = { landsnummer: 46 }

export interface Telefontolkning {
  /** Bara siffror, med landsnummer, utan `+`. Null när värdet inte är ett nummer. */
  siffror: string | null
  /** Numret bar redan en landskod. */
  hadeLandskod: boolean
  /** Landskoden är en annan än den valda. */
  utlandskt: boolean
}

/** Rimliga längder för ett nummer inklusive landsnummer. */
const MIN_SIFFROR = 8
const MAX_SIFFROR = 15

/** Tecken som får förekomma runt siffrorna utan att numret underkänns. */
const TILLATET_SKRAP = /^[\d\s+()./-]+$/

export function tolkaTelefon(rawValue: string, val: Telefonval = STANDARDVAL): Telefontolkning {
  const value = normalizeAlways(rawValue).trim()
  const tomt: Telefontolkning = { siffror: null, hadeLandskod: false, utlandskt: false }
  if (value === '') return tomt

  // Ett värde med bokstäver i är inte ett telefonnummer. Att plocka ut
  // siffrorna ur "Ring Anna 070-1234567" och kalla det ett nummer vore att
  // hitta på data.
  if (!TILLATET_SKRAP.test(value)) return tomt

  // Ett internt anknytningsnummer efter numret ("070-123 45 67 ankn 12")
  // fångas av bokstavsregeln ovan; här återstår bara skiljetecken.
  let rent = value.replace(/[\s()./-]/g, '')

  let hadeLandskod = false
  if (rent.startsWith('+')) {
    hadeLandskod = true
    rent = rent.slice(1)
  } else if (rent.startsWith('00')) {
    hadeLandskod = true
    rent = rent.slice(2)
  }
  if (!/^\d+$/.test(rent)) return tomt

  let siffror: string
  if (hadeLandskod) {
    siffror = rent
  } else if (rent.startsWith('0')) {
    // Nationell form: nollan är en utslagssiffra och ingår inte i numret.
    siffror = `${val.landsnummer}${rent.slice(1)}`
  } else {
    // Utan både landskod och inledande nolla går det inte att veta vad
    // numret är. Det underkänns hellre än tolkas fel.
    return tomt
  }

  if (siffror.length < MIN_SIFFROR || siffror.length > MAX_SIFFROR) return tomt

  return {
    siffror,
    hadeLandskod,
    utlandskt: !siffror.startsWith(String(val.landsnummer)),
  }
}

export type Telefonformat = 'e164' | 'nationell'

export const TELEFONFORMAT: { varde: Telefonformat; etikett: string; exempel: string }[] = [
  { varde: 'e164', etikett: '+46701234567', exempel: '+46701234567' },
  { varde: 'nationell', etikett: '0701234567', exempel: '0701234567' },
]

export function skrivTelefon(
  t: Telefontolkning,
  format: Telefonformat,
  val: Telefonval = STANDARDVAL,
): string {
  if (t.siffror === null) return ''
  if (format === 'e164') return `+${t.siffror}`
  // Nationell form finns bara för det egna landet. Ett utländskt nummer utan
  // landskod går inte att ringa, så det behåller sin.
  if (t.utlandskt) return `+${t.siffror}`
  return `0${t.siffror.slice(String(val.landsnummer).length)}`
}

export interface Telefoninstallning extends Telefonval {
  format: Telefonformat
  onError: 'behall' | 'tom' | 'markera'
}

export const OGILTIGT = 'OGILTIGT'

export function telefonTransform(inst: Telefoninstallning): (value: string) => string {
  return (value: string) => {
    if (value.trim() === '') return value
    const t = tolkaTelefon(value, inst)
    if (t.siffror === null) {
      if (inst.onError === 'tom') return ''
      if (inst.onError === 'markera') return OGILTIGT
      return value
    }
    return skrivTelefon(t, inst.format, inst)
  }
}

export interface Telefoninventering {
  nummer: number
  ejNummer: number
  medLandskod: number
  utlandska: number
  exempel: { fore: string; efter: string } | null
  exempelOgiltigt: string | null
}

export function inventeraTelefon(
  varden: readonly string[],
  inst: Telefoninstallning,
  vikter?: readonly number[],
): Telefoninventering {
  let nummer = 0
  let ejNummer = 0
  let medLandskod = 0
  let utlandska = 0
  let exempel: Telefoninventering['exempel'] = null
  let exempelOgiltigt: string | null = null

  for (let i = 0; i < varden.length; i++) {
    const value = varden[i]!.trim()
    if (value === '') continue
    const vikt = vikter ? (vikter[i] ?? 0) : 1
    if (vikt === 0) continue

    const t = tolkaTelefon(value, inst)
    if (t.siffror === null) {
      ejNummer += vikt
      exempelOgiltigt ??= value
      continue
    }
    nummer += vikt
    if (t.hadeLandskod) medLandskod += vikt
    if (t.utlandskt) utlandska += vikt
    exempel ??= { fore: value, efter: skrivTelefon(t, inst.format, inst) }
  }

  return { nummer, ejNummer, medLandskod, utlandska, exempel, exempelOgiltigt }
}
