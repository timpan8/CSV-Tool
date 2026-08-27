import type { Column, ColumnType, Frame } from '../core/types.js'
import type { Forhandsvisning } from '../state/preview.js'
import { DateTool } from './DateTool.jsx'
import { EmailTool } from './EmailTool.jsx'
import { NumberTool } from './NumberTool.jsx'
import { PhoneTool } from './PhoneTool.jsx'
import { ReplaceTool } from './ReplaceTool.jsx'
import { SplitTool } from './SplitTool.jsx'
import { MergeTool } from './MergeTool.jsx'

/**
 * Städverktygen.
 *
 * Listan finns på ett ställe och används av både kolumnmenyn, inspektören och
 * panelvalet. Ett verktyg som läggs till här dyker upp överallt det hör
 * hemma, i stället för att glömmas på ett av ställena.
 */
export type Verktygsnamn = 'datum' | 'tal' | 'telefon' | 'epost' | 'dela' | 'slaihop' | 'ersatt'

export interface Verktygspost {
  namn: Verktygsnamn
  etikett: string
  /** Kolumntyper där verktyget är det troliga nästa steget. */
  foreslasFor: ColumnType[]
}

export const VERKTYG: Verktygspost[] = [
  { namn: 'datum', etikett: 'Datum…', foreslasFor: ['date'] },
  { namn: 'tal', etikett: 'Tal…', foreslasFor: ['number'] },
  { namn: 'telefon', etikett: 'Telefon…', foreslasFor: [] },
  { namn: 'epost', etikett: 'E-post → namn…', foreslasFor: ['email'] },
  { namn: 'dela', etikett: 'Dela kolumnen…', foreslasFor: [] },
  { namn: 'slaihop', etikett: 'Slå ihop kolumner…', foreslasFor: [] },
  { namn: 'ersatt', etikett: 'Sök och ersätt…', foreslasFor: [] },
]

export interface VerktygProps {
  namn: Verktygsnamn
  col: Column
  frame: Frame
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}

/**
 * Väljer panel.
 *
 * Alla verktyg har samma gränssnitt mot appen — en kolumn in, en
 * förhandsvisning ut — så valet är en rad och inte en förgrening genom resten
 * av koden.
 */
export function Verktyg({ namn, frame, ...rest }: VerktygProps) {
  switch (namn) {
    case 'datum':
      return <DateTool {...rest} />
    case 'tal':
      return <NumberTool {...rest} />
    case 'telefon':
      return <PhoneTool {...rest} />
    case 'epost':
      return <EmailTool {...rest} />
    case 'dela':
      return <SplitTool {...rest} />
    case 'slaihop':
      return <MergeTool {...rest} frame={frame} />
    case 'ersatt':
      return <ReplaceTool {...rest} />
  }
}
