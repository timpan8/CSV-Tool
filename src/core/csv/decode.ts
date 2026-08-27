import type { Encoding } from '../types.js'
import { cp1252EncodeString } from './cp1252.js'

export interface DecodeResult {
  text: string
  encoding: Encoding
  hadBom: boolean
  /** Antal ogiltiga byte-sekvenser som ersattes när UTF-8 ändå valdes. */
  invalidSequences: number
  /** Radslut som dominerar i källan. Styr export-förval. */
  newline: '\r\n' | '\n'
  check: EncodingCheck
}

/**
 * Självkontrollen har tre lägen, inte två.
 *
 * En fil vars första tusen rader bara innehåller ASCII ger inget *bevis* för
 * att kodningen är rätt. Att visa en grön bock där är att ljuga med hög
 * konfidens — därför finns `unknown`.
 */
export type EncodingCheck =
  | { state: 'ok'; sample: string[] }
  | { state: 'mojibake'; sample: string[]; repairable: boolean }
  | { state: 'unknown' }

const BOM_UTF8 = [0xef, 0xbb, 0xbf]
const BOM_UTF16LE = [0xff, 0xfe]
const BOM_UTF16BE = [0xfe, 0xff]

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false
  return true
}

/**
 * Gissar UTF-16 utan BOM. Excels "Spara som Unicode-text" ger UTF-16LE där
 * varannan byte är 0x00 för latinsk text — kör man avgränsardetektering på
 * råbytes i det läget ger varje kandidat brus.
 */
function looksLikeUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(bytes.length, 2048)
  if (n < 16) return null
  let zerosOdd = 0
  let zerosEven = 0
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) zerosEven += 1
      else zerosOdd += 1
    }
  }
  const half = n / 2
  if (zerosOdd > half * 0.6 && zerosEven < half * 0.1) return 'utf-16le'
  if (zerosEven > half * 0.6 && zerosOdd < half * 0.1) return 'utf-16be'
  return null
}

/** Räknar U+FFFD, dvs. sekvenser som avkodaren inte kunde tolka. */
function countReplacements(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xfffd) n += 1
  return n
}

function countNonAscii(bytes: Uint8Array): number {
  let n = 0
  for (let i = 0; i < bytes.length; i++) if (bytes[i]! > 0x7f) n += 1
  return n
}

/**
 * Tecknen som byte 0x80–0xBF ger när de avkodas som CP1252.
 *
 * När UTF-8-kodad svensk text felaktigt avkodas som CP1252 blir `å` (C3 A5)
 * till `Ã` följt av CP1252-tolkningen av 0xA5. Andra byten hamnar därför
 * alltid i det här intervallet — det är signaturen vi letar efter.
 */
const CONTINUATION_CHARS = (() => {
  const decoder = new TextDecoder('windows-1252')
  const bytes = new Uint8Array(0x40)
  for (let i = 0; i < 0x40; i++) bytes[i] = 0x80 + i
  return decoder.decode(bytes).replace(/�/g, '')
})()

function escapeForClass(text: string): string {
  return text.replace(/[\\\]^-]/g, (ch) => `\\${ch}`)
}

const MOJIBAKE = new RegExp(`[\\u00C3\\u00C2][${escapeForClass(CONTINUATION_CHARS)}]`)
const NON_ASCII = /[^\u0000-\u007F]/

function sampleMatches(text: string, re: RegExp, limit = 5): string[] {
  const out: string[] = []
  const global = new RegExp(re.source, 'g')
  let m: RegExpExecArray | null
  while ((m = global.exec(text)) !== null && out.length < limit) {
    const start = Math.max(0, m.index - 12)
    out.push(text.slice(start, m.index + 14).replace(/[\r\n]+/g, ' ').trim())
    if (global.lastIndex === m.index) global.lastIndex += 1
  }
  return out
}

/**
 * Lagar mojibake åt rätt håll.
 *
 * Skadan uppstod när UTF-8-bytes avkodades som CP1252. Reparationen måste
 * alltså koda tecknen tillbaka till CP1252-bytes och avkoda den byteföljden
 * som UTF-8. Gör man tvärtom — kodar till UTF-8 och avkodar som CP1252 —
 * upprepar man skadan i stället för att laga den.
 *
 * `fatal: true` ger validering på köpet: kastar avkodningen var texten inte
 * mojibake, och då ska ingenting ändras.
 */
export function repairMojibake(text: string): string | null {
  const bytes = cp1252EncodeString(text)
  if (!bytes) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function runCheck(text: string): EncodingCheck {
  const mojibakeSamples = sampleMatches(text, MOJIBAKE)
  if (mojibakeSamples.length > 0) {
    return {
      state: 'mojibake',
      sample: mojibakeSamples,
      repairable: repairMojibake(text) !== null,
    }
  }
  // Bara ASCII i hela den kontrollerade texten: det finns ingenting att verifiera.
  const nonAscii = sampleMatches(text, NON_ASCII)
  if (nonAscii.length === 0) return { state: 'unknown' }
  return { state: 'ok', sample: nonAscii }
}

function detectNewline(text: string): '\r\n' | '\n' {
  let crlf = 0
  let lf = 0
  const limit = Math.min(text.length, 200_000)
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) {
      if (i > 0 && text.charCodeAt(i - 1) === 13) crlf += 1
      else lf += 1
    }
  }
  return crlf >= lf ? '\r\n' : '\n'
}

/**
 * Tröskeln för att behålla UTF-8 trots ogiltiga sekvenser.
 *
 * En enstaka trasig byte i en stor fil får aldrig fälla hela filen till
 * CP1252 — det skulle förstöra varje korrekt å ä ö i den. Vi behåller UTF-8
 * och rapporterar antalet i stället.
 */
const MAX_INVALID_ABSOLUTE = 8
const MAX_INVALID_RATE = 0.0005

export function decodeBytes(bytes: Uint8Array, forced?: Encoding): DecodeResult {
  let body = bytes
  let hadBom = false
  let bomEncoding: Encoding | null = null

  if (startsWith(bytes, BOM_UTF8)) {
    body = bytes.subarray(3)
    hadBom = true
    bomEncoding = 'utf-8'
  } else if (startsWith(bytes, BOM_UTF16LE)) {
    body = bytes.subarray(2)
    hadBom = true
    bomEncoding = 'utf-16le'
  } else if (startsWith(bytes, BOM_UTF16BE)) {
    body = bytes.subarray(2)
    hadBom = true
    bomEncoding = 'utf-16be'
  }

  const finish = (encoding: Encoding, text: string, invalid: number): DecodeResult => ({
    text,
    encoding,
    hadBom,
    invalidSequences: invalid,
    newline: detectNewline(text),
    check: runCheck(text),
  })

  if (forced) {
    const text = new TextDecoder(forced).decode(body)
    return finish(forced, text, countReplacements(text))
  }
  if (bomEncoding) {
    const text = new TextDecoder(bomEncoding).decode(body)
    return finish(bomEncoding, text, countReplacements(text))
  }

  const utf16 = looksLikeUtf16(body)
  if (utf16) {
    const text = new TextDecoder(utf16).decode(body)
    return finish(utf16, text, countReplacements(text))
  }

  const utf8 = new TextDecoder('utf-8').decode(body)
  const invalid = countReplacements(utf8)
  if (invalid === 0) return finish('utf-8', utf8, 0)

  const nonAscii = countNonAscii(body)
  const rate = nonAscii === 0 ? 1 : invalid / nonAscii
  if (invalid <= MAX_INVALID_ABSOLUTE && rate <= MAX_INVALID_RATE) {
    // Nästan allt är giltig UTF-8. Att byta kodning nu vore att offra tusentals
    // korrekta tecken för en handfull trasiga bytes.
    return finish('utf-8', utf8, invalid)
  }
  const cp = new TextDecoder('windows-1252').decode(body)
  return finish('windows-1252', cp, 0)
}
