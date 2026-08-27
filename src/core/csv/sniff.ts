import type { Delimiter } from '../types.js'

export const DELIMITERS: readonly Delimiter[] = [';', ',', '\t', '|']

export const DELIMITER_NAMES: Record<Delimiter, string> = {
  ';': 'Semikolon',
  ',': 'Komma',
  '\t': 'Tabb',
  '|': 'Lodstreck',
}

export interface SniffResult {
  delimiter: Delimiter
  /** Sant när avgränsaren kom från en `sep=;`-rad och inte från gissning. */
  fromSepDirective: boolean
  /** Antal tecken att hoppa över i början av texten (`sep=;`-raden). */
  sepDirectiveLength: number
  /** 0-baserad rad med rubrikerna, räknat efter `sep=`-raden. */
  headerRow: number
  /** Antal fält som de flesta rader har. */
  fieldCount: number
  /** Hur säker gissningen är. Låg säkerhet lyfts fram i importdialogen. */
  confident: boolean
}

/**
 * Delar en rad på en avgränsare men respekterar citattecken, så att ett
 * semikolon inuti `"Storgatan 1; Box 4"` inte räknas som fältgräns.
 */
function countFields(line: string, delimiter: string): number {
  let fields = 1
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      fields += 1
    }
  }
  return fields
}

/**
 * Delar text i logiska rader: en radbrytning inuti ett citerat fält bryter
 * inte raden. Tomma rader behålls, eftersom rubrikradens index måste räknas
 * mot samma radnumrering som parsern använder.
 *
 * Måste göras före avgränsargissningen — annars räknas en adress med
 * radbrytning som två trasiga rader och sabbar samstämmighetsmätningen.
 */
function splitLogicalLines(text: string, limit: number): string[] {
  const lines: string[] = []
  let start = 0
  let inQuotes = false
  for (let i = 0; i < text.length && lines.length < limit; i++) {
    const ch = text[i]!
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') i += 1
      else inQuotes = !inQuotes
    } else if (ch === '\n' && !inQuotes) {
      let end = i
      if (end > start && text[end - 1] === '\r') end -= 1
      lines.push(text.slice(start, end))
      start = i + 1
    }
  }
  if (lines.length < limit && start < text.length) lines.push(text.slice(start))
  return lines
}

/** Excel skriver ibland `sep=;` som första rad, och läser den alltid själv. */
function readSepDirective(text: string): { delimiter: Delimiter; length: number } | null {
  const match = /^sep=(.)(\r?\n)/.exec(text)
  if (!match) return null
  const ch = match[1]!
  if (!(DELIMITERS as readonly string[]).includes(ch)) return null
  return { delimiter: ch as Delimiter, length: match[0].length }
}

interface Score {
  delimiter: Delimiter
  modeCount: number
  /** Andel rader som har det vanligaste fältantalet. */
  agreement: number
}

function scoreDelimiter(lines: string[], delimiter: Delimiter): Score {
  const counts = new Map<number, number>()
  for (const line of lines) {
    const n = countFields(line, delimiter)
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  let modeCount = 1
  let modeFreq = 0
  for (const [n, freq] of counts) {
    if (freq > modeFreq || (freq === modeFreq && n > modeCount)) {
      modeCount = n
      modeFreq = freq
    }
  }
  return { delimiter, modeCount, agreement: lines.length === 0 ? 0 : modeFreq / lines.length }
}

/**
 * Gissar rubrikrad genom att hitta första raden som har samma fältantal som
 * de flesta rader. Filer med en förklarande text före tabellen ("Export
 * 2026-08-27", tom rad, sedan rubrikerna) hanteras därmed automatiskt.
 */
function findHeaderRow(lines: string[], delimiter: Delimiter, fieldCount: number): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '') continue
    if (countFields(line, delimiter) === fieldCount) return i
  }
  // Ingen rad hade det vanligaste fältantalet: ta första icke-tomma raden.
  const firstNonEmpty = lines.findIndex((l) => l.trim() !== '')
  return firstNonEmpty === -1 ? 0 : firstNonEmpty
}

const SAMPLE_LINES = 60

export function sniff(text: string): SniffResult {
  const directive = readSepDirective(text)
  const body = directive ? text.slice(directive.length) : text
  const lines = splitLogicalLines(body, SAMPLE_LINES)
  // Poängsättningen ska inte straffas av tomma rader, men rubrikradens
  // index måste räknas mot den fullständiga radnumreringen.
  const dataLines = lines.filter((l) => l.trim() !== '')

  if (dataLines.length === 0) {
    return {
      delimiter: directive?.delimiter ?? ';',
      fromSepDirective: directive !== null,
      sepDirectiveLength: directive?.length ?? 0,
      headerRow: 0,
      fieldCount: 1,
      confident: directive !== null,
    }
  }

  if (directive) {
    const score = scoreDelimiter(dataLines, directive.delimiter)
    return {
      delimiter: directive.delimiter,
      fromSepDirective: true,
      sepDirectiveLength: directive.length,
      headerRow: findHeaderRow(lines, directive.delimiter, score.modeCount),
      fieldCount: score.modeCount,
      confident: true,
    }
  }

  const scores = DELIMITERS.map((d) => scoreDelimiter(dataLines, d))
  // En kandidat som aldrig delar raden är ingen kandidat.
  const usable = scores.filter((s) => s.modeCount > 1)

  if (usable.length === 0) {
    // Genuint enkolumnsfil. Att välja en avgränsare här skulle dela upp
    // värden som hör ihop — hellre en kolumn än fel kolumner.
    return {
      delimiter: ';',
      fromSepDirective: false,
      sepDirectiveLength: 0,
      headerRow: findHeaderRow(lines, ';', 1),
      fieldCount: 1,
      confident: true,
    }
  }

  usable.sort((a, b) => {
    // Samstämmighet först: rätt avgränsare ger samma fältantal på varje rad.
    if (Math.abs(a.agreement - b.agreement) > 0.05) return b.agreement - a.agreement
    return b.modeCount - a.modeCount
  })
  const best = usable[0]!
  const runnerUp = usable[1]
  const confident =
    best.agreement >= 0.9 &&
    (runnerUp === undefined || best.agreement - runnerUp.agreement > 0.05 || best.modeCount > runnerUp.modeCount)

  return {
    delimiter: best.delimiter,
    fromSepDirective: false,
    sepDirectiveLength: 0,
    headerRow: findHeaderRow(lines, best.delimiter, best.modeCount),
    fieldCount: best.modeCount,
    confident,
  }
}
