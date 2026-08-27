/**
 * Windows-1252 skiljer sig från Latin-1 endast i intervallet 0x80–0x9F, där
 * den har typografiska tecken i stället för styrkoder. Svenska Excel-exporter
 * innehåller regelmässigt 0x92 (’) och 0x96 (–), så skillnaden är inte
 * akademisk.
 */
const HIGH: ReadonlyArray<number | null> = [
  0x20ac, null, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, null, 0x017d, null,
  null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, null, 0x017e, 0x0178,
]

const TO_BYTE = new Map<number, number>()
for (let i = 0; i < HIGH.length; i++) {
  const cp = HIGH[i]
  if (cp !== null && cp !== undefined) TO_BYTE.set(cp, 0x80 + i)
}

/**
 * Kodpunkt → Windows-1252-byte, eller null om tecknet inte finns i CP1252.
 *
 * Används vid mojibake-reparation. `TextEncoder` kan bara producera UTF-8 och
 * duger alltså inte — den skulle förvärra skadan i stället för att laga den.
 */
export function cp1252Encode(codePoint: number): number | null {
  if (codePoint <= 0x7f) return codePoint
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint
  return TO_BYTE.get(codePoint) ?? null
}

/** Kodar en sträng till CP1252-bytes, eller null om något tecken saknas där. */
export function cp1252EncodeString(text: string): Uint8Array | null {
  const out = new Uint8Array(text.length * 2)
  let n = 0
  for (const ch of text) {
    const byte = cp1252Encode(ch.codePointAt(0)!)
    if (byte === null) return null
    out[n++] = byte
  }
  return out.subarray(0, n)
}

/** Tecken som inte får plats i CP1252 och alltså skulle gå förlorade vid export. */
export function unencodableInCp1252(text: string): string[] {
  const lost: string[] = []
  for (const ch of text) {
    if (cp1252Encode(ch.codePointAt(0)!) === null && !lost.includes(ch)) lost.push(ch)
  }
  return lost
}
