import { zipSync, strToU8 } from 'fflate'
import type { Column, Frame } from '../types.js'
import { getCell } from '../frame/column.js'
import { parseNumber } from '../infer.js'
import { selectForExport, type ExportOptions } from '../csv/stringify.js'

/**
 * Skriver `.xlsx`.
 *
 * Poängen med Excel-export är inte att den ser finare ut — det är att den är
 * det enda formatet som både bevarar `01234` som `01234` och låter `SUMMA`
 * fungera på beloppskolumnen. CSV kan aldrig göra båda: allt Excel läser ur
 * en CSV typas om av Excel självt.
 *
 * Därför följer celltypningen kolumnens typ. Talkolumner skrivs som
 * numeriska celler, datumkolumner som datumceller, och allt annat som text.
 * Ett värde som inte går att tolka skrivs som text — hellre en textcell än
 * ett fel tal.
 */

/** Tecken som inte får förekomma i XML 1.0. Excel vägrar öppna filen annars. */
const OGILTIGA_XML_TECKEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

function xml(text: string): string {
  return text
    .replace(OGILTIGA_XML_TECKEN, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 0 → A, 25 → Z, 26 → AA. */
export function kolumnBokstav(index: number): string {
  let n = index
  let ut = ''
  do {
    ut = String.fromCharCode(65 + (n % 26)) + ut
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return ut
}

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/
/** Excels nollpunkt. 1899-12-30 absorberar det påhittade skottdygnet 1900-02-29. */
const EXCEL_EPOK = Date.UTC(1899, 11, 30)

/** ÅÅÅÅ-MM-DD → Excel-serienummer, eller null om värdet inte är ett rent datum. */
export function datumTillSerie(value: string): number | null {
  const m = ISO_DATUM.exec(value.trim())
  if (!m) return null
  const [y, mm, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mm < 1 || mm > 12 || d < 1 || d > 31) return null
  const tid = Date.UTC(y, mm - 1, d)
  // Fånga orimliga datum som 2026-02-31, som Date.UTC annars rullar vidare.
  const kontroll = new Date(tid)
  if (kontroll.getUTCMonth() !== mm - 1 || kontroll.getUTCDate() !== d) return null
  return Math.round((tid - EXCEL_EPOK) / 86_400_000)
}

// Stil 0 är standard och skrivs aldrig ut — en cell utan s-attribut får den.
const STIL_DATUM = 1
const STIL_RUBRIK = 2

function cellXml(ref: string, col: Column, value: string): string {
  if (value === '') return ''

  if (col.type === 'number') {
    const n = parseNumber(value)
    if (n !== null) return `<c r="${ref}"><v>${n}</v></c>`
  }
  if (col.type === 'date') {
    const serie = datumTillSerie(value)
    if (serie !== null) return `<c r="${ref}" s="${STIL_DATUM}"><v>${serie}</v></c>`
  }
  // Textceller behåller ledande nollor, långa siffersträngar och allt annat
  // Excel annars skulle typa om åt oss.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}

function sheetXml(columns: Column[], rows: Uint32Array, includeHeader: boolean): string {
  const delar: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
  ]

  let radnr = 1
  if (includeHeader) {
    const celler = columns
      .map(
        (c, i) =>
          `<c r="${kolumnBokstav(i)}1" s="${STIL_RUBRIK}" t="inlineStr"><is><t xml:space="preserve">${xml(c.name)}</t></is></c>`,
      )
      .join('')
    delar.push(`<row r="1">${celler}</row>`)
    radnr = 2
  }

  for (let i = 0; i < rows.length; i++) {
    const rad = rows[i]!
    let celler = ''
    for (let c = 0; c < columns.length; c++) {
      celler += cellXml(`${kolumnBokstav(c)}${radnr}`, columns[c]!, getCell(columns[c]!, rad))
    }
    delar.push(`<row r="${radnr}">${celler}</row>`)
    radnr += 1
  }

  delar.push('</sheetData></worksheet>')
  return delar.join('')
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

const ROT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const ARBETSBOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

/**
 * Formatet `yyyy\-mm\-dd` är hårdkodat i stället för Excels inbyggda
 * datumformat, som följer datorns nationella inställningar. En svensk fil som
 * öppnas på en amerikansk dator ska inte plötsligt visa månad först.
 */
const STILAR = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`

function arbetsbokXml(bladnamn: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xml(bladnamn)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
}

/** Bladnamn får inte innehålla : \\ / ? * [ ] och max 31 tecken. */
export function rensaBladnamn(namn: string): string {
  const rensat = namn.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31)
  return rensat === '' ? 'Blad1' : rensat
}

const ZIP_EPOK = Date.UTC(1980, 0, 1)

export function exportXlsx(frame: Frame, options: ExportOptions): Uint8Array {
  const { columns, rows } = selectForExport(frame, options)
  const bladnamn = rensaBladnamn(frame.name.replace(/\.(csv|txt|tsv|xlsx)$/i, ''))

  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROT_RELS),
      'xl/workbook.xml': strToU8(arbetsbokXml(bladnamn)),
      'xl/_rels/workbook.xml.rels': strToU8(ARBETSBOK_RELS),
      'xl/styles.xml': strToU8(STILAR),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml(columns, rows, options.includeHeader)),
    },
    // Fast tidsstämpel i stället för klockan just nu: samma innehåll ger
    // samma fil, och exporten bär inte med sig uppgift om exakt när
    // användaren gjorde den. ZIP-formatet klarar bara 1980 och framåt.
    { level: 6, mtime: ZIP_EPOK },
  )
}
